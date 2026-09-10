import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const cols = await pool.query(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='product_images'
   order by ordinal_position`
);
console.log("product_images columns:", cols.rows.map((r) => r.column_name).join(", "));

for (const name of ["SequelizeMeta", "sequelize_meta"]) {
  try {
    const m = await pool.query(`select name from "${name}" order by name desc limit 15`);
    console.log(name + ":", m.rows.map((r) => r.name).join(", "));
  } catch (e) {
    console.log(name, ":", e.message);
  }
}

await pool.end();
