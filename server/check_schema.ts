import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function checkSchema() {
  try {
    const res = await pool.query("SELECT * FROM information_schema.columns WHERE table_name = 'users'");
    console.log(res.rows.map(r => ({ column: r.column_name, type: r.data_type })));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchema();
