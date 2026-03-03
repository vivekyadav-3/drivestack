import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function setupSharing() {
  try {
    console.log("Setting up Role-Based Sharing system...");
    
    // Create file_access table
    // user_id is TEXT for Clerk compatibility
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        shared_with_user_id TEXT NOT NULL,
        permission TEXT DEFAULT 'view', -- 'view' or 'edit'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_id, shared_with_user_id)
      );
    `);

    // Index for fast lookups (Shared With Me view)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_file_access_user ON file_access(shared_with_user_id);
    `);

    console.log("Sharing system initialized successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to setup sharing:", err);
    process.exit(1);
  }
}

setupSharing();
