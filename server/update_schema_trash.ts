import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function updateSchema() {
  try {
    console.log("Adding deleted_at columns for Trash/Restore functionality...");
    
    await pool.query("ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;");
    await pool.query("ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;");
    
    console.log("Schema updated successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to update schema:", err);
    process.exit(1);
  }
}

updateSchema();
