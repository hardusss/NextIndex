import {
    varchar,
    bigint,
    json,
    datetime,
    index,
    mysqlTable,
} from "drizzle-orm/mysql-core";

export const trasactions = mysqlTable("trasactions", {
    signature: varchar({ length: 100 }).primaryKey(),
    slot: bigint("slot", { mode: "number", unsigned: true }),
    signer: varchar({ length: 100 }),
    instruction_name: varchar({ length: 255 }),
    decoded_data: json(),
    timestamp: datetime()
}, (table) => ({
    signerIdx: index("signer_idx").on(table.signer),
    instructionIdx: index("instruction_idx").on(table.instruction_name),
}));