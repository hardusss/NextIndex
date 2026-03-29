import { Elysia } from "elysia";
import { apiRoutes } from "./routes/api";
import { loadIDL } from "./idl/idl-loader";
import { SolanaIndexer } from "./indexer/core";

const app = new Elysia()
    .use(apiRoutes)
    .listen(3000);

console.log(`🦊 Elysia API Server is running at ${app.server?.hostname}:${app.server?.port}`);
console.log(`📖 Swagger documentation is available at http://${app.server?.hostname}:${app.server?.port}/api/swagger`);

/**
 * Initializes and starts the Solana indexer background worker.
 *
 * Loads the IDL (either from blockchain or local file), creates a SolanaIndexer instance,
 * runs an immediate first fetch, then schedules polling every 15 seconds.
 *
 * The indexer and API server run concurrently — the API serves already-indexed data
 * from the database while the indexer continuously fetches new transactions in the background.
 *
 * Falls back to Orca Whirlpool program if PROGRAM_ID is not set in .env.
 */
async function startIndexer() {
    console.log("🚀 Starting Solana Indexer background worker...");
    const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
    const programId = process.env.PROGRAM_ID || "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

    try {
        const idl = await loadIDL();
        const indexer = new SolanaIndexer(rpcUrl, programId, idl);

        setInterval(async () => {
            await indexer.fetchNewTransactions();
        }, 15000);

        await indexer.fetchNewTransactions();
    } catch (error) {
        console.error("❌ Failed to start Indexer:", error);
    }
}

startIndexer();