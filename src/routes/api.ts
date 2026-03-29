import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";

export const apiRoutes = new Elysia({ prefix: '/api' })
    .use(swagger({
        documentation: {
            info: {
                title: 'Solana Indexer API',
                version: '1.0.0',
                description: 'API for fetching indexed Solana transactions'
            }
        }
    }))

    /**
     * Fetch a single transaction by its Solana signature.
     * Signature is a unique transaction identifier, similar to a UUID.
     *
     * GET /api/transactions/:signature
     * @returns 404 if not found, otherwise the transaction object
     */
    .get('/transactions/:signature', async ({ params, set }) => {
        const result = await db.select()
            .from(transactions)
            .where(eq(transactions.signature, params.signature));

        if (result.length === 0) {
            set.status = 404;
            return { success: false, error: "Transaction not found" };
        }

        return { success: true, data: result[0] };
    }, {
        params: t.Object({
            signature: t.String()
        })
    })

    /**
     * Fetch a paginated list of transactions with optional filters.
     *
     * Filters are built dynamically — if a query param is not provided,
     * its condition is simply omitted from the WHERE clause.
     * This allows flexible filter combinations without extra branching.
     *
     * GET /api/transactions?instruction_name=mintNft&signer=ABC...&limit=50
     * @param instruction_name - Anchor instruction name (e.g. "mintNft")
     * @param signer - public key of the transaction signer
     * @param limit - max number of records to return (default: 20)
     */
    .get('/transactions', async ({ query }: {
        query: {
            instruction_name?: string;
            signer?: string;
            limit?: string;
        }
    }) => {
        const { instruction_name, signer, limit = "20" } = query;

        const conditions = [];
        if (instruction_name) conditions.push(eq(transactions.instruction_name, instruction_name));
        if (signer) conditions.push(eq(transactions.signer, signer));

        const result = await db.select()
            .from(transactions)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(transactions.timestamp))
            .limit(Number(limit));

        return {
            success: true,
            count: result.length,
            data: result
        };
    }, {
        query: t.Object({
            instruction_name: t.Optional(t.String()),
            signer: t.Optional(t.String()),
            limit: t.Optional(t.String())
        })
    });