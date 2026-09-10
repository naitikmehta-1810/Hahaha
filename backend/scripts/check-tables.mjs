import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tables = await pool.query(
  `select table_name from information_schema.tables
   where table_schema='public' and (table_name like '%wish%' or table_name like '%collection%')`
);
console.log("tables", tables.rows);
await pool.end();
