import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function initQuotas() {
  try {
    console.log("Setting up Storage Quota system...");
    
    // Create user_quotas table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_quotas (
        user_id TEXT PRIMARY KEY,
        used_storage BIGINT DEFAULT 0,
        storage_limit BIGINT DEFAULT 104857600, -- 100MB Default
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure all existing active users have a quota record
    // We can pull these from files users
    await pool.query(`
      INSERT INTO user_quotas (user_id, used_storage)
      SELECT user_id, SUM(size) as used_storage
      FROM files
      GROUP BY user_id
      ON CONFLICT (user_id) DO UPDATE 
      SET used_storage = EXCLUDED.used_storage;
    `);

    console.log("Storage Quota system initialized successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to initialize quotas:", err);
    process.exit(1);
  }
}

initQuotas();
