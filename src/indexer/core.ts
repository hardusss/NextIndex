import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import { BorshInstructionCoder, Idl } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { transactions } from "../db/schema";
import { db } from "../db";

type DbRecord = {
    signature: string;
    slot: number;
    signer: string;
    instruction_name: string;
    decoded_data: Record<string, unknown>;
    timestamp: Date;
};

/**
 * Indexes transactions of a specific Solana program by polling the RPC node,
 * decoding instruction data via Anchor's BorshInstructionCoder, and persisting
 * the results to a MySQL database.
 *
 * Tracks the last seen signature in memory to avoid re-processing already
 * indexed transactions on each polling cycle.
 */
export class SolanaIndexer {
    private connection: Connection;
    private programId: PublicKey;
    private coder: BorshInstructionCoder;

    private lastSignature: string | undefined = undefined;

    /**
     * @param rpcUrl - Solana RPC endpoint URL
     * @param programIdStr - Base58-encoded public key of the program to index
     * @param idl - Anchor IDL used to decode instruction data
     */
    constructor(rpcUrl: string, programIdStr: string, idl: Idl) {
        this.connection = new Connection(rpcUrl, "confirmed");
        this.programId = new PublicKey(programIdStr);
        this.coder = new BorshInstructionCoder(idl);
    };

    /**
     * Fetches and processes new transactions since the last polling cycle.
     *
     * Uses `getSignaturesForAddress` with `until: lastSignature` to paginate
     * only new signatures. After fetching, updates `lastSignature` to the most
     * recent one so the next call starts from where this one left off.
     *
     * A 150ms delay between individual transaction fetches is intentional —
     * it prevents hitting public RPC rate limits (429 errors).
     */
    public async fetchNewTransactions() {
        try {
            const options: any = { limit: 50 };
            if (this.lastSignature) {
                options.until = this.lastSignature;
            };

            const signaturesInfo = await this.connection.getSignaturesForAddress(
                this.programId,
                options
            );

            if (signaturesInfo.length == 0) {
                console.log("[Indexer] New transactions not found");
                return;
            };

            console.log(`[Indexer] Found ${signaturesInfo.length} new transactions! Working...`);

            this.lastSignature = signaturesInfo[0].signature;

            const signatures = signaturesInfo.map((info) => info.signature);

            for (const signature of signatures) {
                try {
                    const tx = await this.connection.getParsedTransaction(signature, {
                        maxSupportedTransactionVersion: 0,
                    });

                    if (tx) {
                        await this.decodeTransaction(tx);
                    };
                    await new Promise(res => setTimeout(res, 150));

                } catch (err) {
                    console.error(`[Indexer] Error download transaction ${signature}:`, err);
                }
            }

        } catch (error) {
            console.error("[Indexer] Polling error", error);
        };
    };

    /**
     * Decodes a single parsed transaction and writes matching instructions to the DB.
     *
     * Iterates over all instructions in the transaction message. Only processes
     * instructions that belong to the indexed program and contain raw `data` field
     * (as opposed to parsed instructions returned by the RPC for known programs).
     *
     * Anchor encodes instruction data as base58. The first 8 bytes are a discriminator
     * that identifies which instruction it is — `BorshInstructionCoder.decode()` handles
     * this automatically using the IDL.
     *
     * Non-JSON-serializable values (BN numbers, PublicKeys, Buffers) are normalized
     * via a custom JSON replacer before being stored.
     *
     * @param tx - Full parsed transaction with metadata from the RPC
     */
    private async decodeTransaction(tx: ParsedTransactionWithMeta) {
        const signature = tx.transaction.signatures[0];
        const message = tx.transaction.message;

        for (const ix of message.instructions) {
            if (ix.programId.toBase58() === this.programId.toBase58()) {
                if ("data" in ix) {
                    try {
                        const buffer = Buffer.from(bs58.decode(ix.data));
                        const decoded = this.coder.decode(buffer, "base58");

                        if (decoded) {
                            console.log(`\n✅ Success decode transaction ${signature}`);
                            console.log(`Instruction name: ${decoded.name}`);
                            console.log(`Data:`, decoded.data);

                            const safeJsonData = JSON.parse(
                                JSON.stringify(decoded.data, (key, value) => {
                                    if (value && value.type === "Buffer") return value.data;
                                    if (value && value.toNumber) return value.toString();
                                    if (value && value.toBase58) return value.toBase58();
                                    return value;
                                })
                            );

                            const signerAccount = tx.transaction.message.accountKeys.find(acc => acc.signer);
                            const signerAddress = signerAccount ? signerAccount.pubkey.toBase58() : "UNKNOWN";

                            const dbRecordData = {
                                signature: signature,
                                slot: tx.slot,
                                signer: signerAddress,
                                instruction_name: decoded.name,
                                decoded_data: safeJsonData,
                                timestamp: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
                            };
                            await this.writeToDB(dbRecordData);
                        }
                    } catch (e) {
                        console.error(`[Indexer] Error parse instruction ${signature}`);
                    };
                };
            };
        };
    };

    /**
     * Persists a decoded transaction record to the database.
     *
     * Uses Drizzle's `$inferInsert` to ensure the shape matches the schema exactly.
     * Duplicate signatures are silently ignored at the DB level via the primary key constraint.
     *
     * @param data - Normalized transaction record ready for insertion
     * @returns `true` if the write succeeded, `false` otherwise
     */
    private async writeToDB(data: DbRecord): Promise<boolean> {
        const transaction: typeof transactions.$inferInsert = data;

        try {
            await db.insert(transactions).values(transaction);
            return true;
        } catch (error) {
            console.error("[Indexer] Error write data into db");
            return false;
        }
    }
};