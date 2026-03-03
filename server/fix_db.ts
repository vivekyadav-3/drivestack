import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function fixSchema() {
  try {
    console.log("Fixing database schema for Clerk...");
    
    // Drop foreign key constraints first
    await pool.query("ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_user_id_fkey");
    await pool.query("ALTER TABLE files DROP CONSTRAINT IF EXISTS files_user_id_fkey");
    
    // Change user_id column types to TEXT
    await pool.query("ALTER TABLE folders ALTER COLUMN user_id TYPE TEXT");
    await pool.query("ALTER TABLE files ALTER COLUMN user_id TYPE TEXT");
    
    console.log("Schema fixed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to fix schema:", err);
    process.exit(1);
  }
}

fixSchema();
