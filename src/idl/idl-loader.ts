import 'dotenv/config';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from "fs/promises";

/**
 * Loads the Anchor IDL from either the Solana blockchain or a local JSON file.
 *
 * Resolution order:
 * 1. If `IDL_ADDRESS` is set in `.env` — fetches the IDL from the on-chain account
 *    using `Program.fetchIdl()`. Anchor programs store their IDL in a derived PDA
 *    account, so no manual parsing is needed.
 * 2. If `IDL_ADDRESS` is not set, or the on-chain fetch fails — falls back to reading
 *    `./src/idl/program_idl.json` from the local filesystem.
 *
 * A dummy wallet is passed to `AnchorProvider` because `fetchIdl` is a read-only
 * operation and does not require signing any transactions.
 *
 * @returns Parsed Anchor IDL object ready to be passed into `BorshInstructionCoder`
 * @throws If neither the on-chain IDL nor the local file can be loaded
 */
export async function loadIDL(): Promise<Idl> {
    const idlAddress = process.env.IDL_ADDRESS;

    if (idlAddress) {
        const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
        const connection = new Connection(rpcUrl, "confirmed");
        const dammyWallet = {} as any;
        const provider = new AnchorProvider(connection, dammyWallet, { commitment: "confirmed" });
        try {
            const programId = new PublicKey(idlAddress);
            const fetchedIdl = await Program.fetchIdl(programId, provider);
            if (fetchedIdl) {
                console.log("[IDL Loader] IDL downloaded from blockchain successfully");
                return fetchedIdl as Idl;
            } else {
                console.warn("[IDL Loader] IDL not found in blockchain. Start work with local file");
            };
        } catch (error) {
            console.error("[IDL Loader] IDL error get in blockchain.", error)
        };
    };

    console.log("[IDL Loader] Read local file ./src/idl/program_idl.json ...");
    try {
        const idlRaw = await fs.readFile("./src/idl/program_idl.json", "utf-8");
        console.log("✅ [IDL Loader] Local IDL downloaded successfully!");
        return JSON.parse(idlRaw) as Idl;
    } catch (err) {
        console.error("❌ [IDL Loader] Critical error: local file not found!");
        throw err;
    };
};