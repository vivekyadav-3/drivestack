import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function check() {
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'files'");
  console.log(res.rows);
  const qres = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_quotas'");
  console.log(qres.rows);
  process.exit(0);
}

check();
