import 'dotenv/config';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from "fs/promises";

export default async function loadIDL(): Promise<Idl> {
    const idlAddress = process.env.IDL_ADDRESS;

    // If .env have IDL_ADDRESS we start download from network 
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