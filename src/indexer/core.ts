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


export class SolanaIndexer {
    private connection: Connection;
    private programId: PublicKey;
    private coder: BorshInstructionCoder;

    private lastSignature: string | undefined = undefined;

    constructor(rpcUrl: string, programIdStr: string, idl: Idl) {
        this.connection = new Connection(rpcUrl, "confirmed");
        this.programId = new PublicKey(programIdStr);

        this.coder = new BorshInstructionCoder(idl);
    };

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
                                    if (value && value.type === "Buffer") return value.data; // If this buffer
                                    if (value && value.toNumber) return value.toString(); // Convert objects BN into strings
                                    if (value && value.toBase58) return value.toBase58(); // If have PublicKey
                                    return value;
                                })
                            );

                            // Get singer
                            const signerAccount = tx.transaction.message.accountKeys.find(acc => acc.signer);
                            const signerAddress = signerAccount ? signerAccount.pubkey.toBase58() : "UNKNOWN";

                            // Format object
                            const dbRecordData = {
                                signature: signature,
                                slot: tx.slot,
                                signer: signerAddress,
                                instruction_name: decoded.name,
                                decoded_data: safeJsonData,
                                timestamp: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
                            };
                            await this.writeToDB(dbRecordData)
                        }
                    } catch (e) {
                        console.error(`[Indexer] Error parse instruction ${signature}`);
                    };
                };
            };
        };
    };

    private async writeToDB(data: DbRecord): Promise<boolean> {
        // Format data
        const transaction: typeof transactions.$inferInsert = data;

        // Write
        try {
            await db.insert(transactions).values(transaction);
            return true;
        } catch (error) {
            console.error("[Indexer] Error write data into db");
            return false;
        }

    }
};