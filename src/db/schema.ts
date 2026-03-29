import {
    varchar,
    bigint,
    json,
    datetime,
    index,
    mysqlTable,
    serial
} from "drizzle-orm/mysql-core";

export const transactions = mysqlTable("transactions", {
    id: serial("id").primaryKey(), 
    signature: varchar("signature", { length: 100 }).notNull(), 
    slot: bigint("slot", { mode: "number", unsigned: true }),
    signer: varchar("signer", { length: 100 }),
    instruction_name: varchar("instruction_name", { length: 255 }),
    decoded_data: json("decoded_data"),
    timestamp: datetime("timestamp")
}, (table) => ({
    signatureIdx: index("signature_idx").on(table.signature),
    signerIdx: index("signer_idx").on(table.signer),
    instructionIdx: index("instruction_idx").on(table.instruction_name),
}));