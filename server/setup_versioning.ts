import { pool } from "./src/db";
import dotenv from "dotenv";
dotenv.config();

async function setupVersioning() {
  try {
    console.log("Setting up File Versioning system...");
    
    // 1. Create file_versions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        storage_path TEXT NOT NULL,
        size BIGINT NOT NULL,
        version_number INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Migrate existing files to have at least version 1 in the versions table
    // This ensures consistency
    await pool.query(`
      INSERT INTO file_versions (file_id, storage_path, size, version_number, created_at)
      SELECT id, storage_path, size, 1, created_at
      FROM files
      WHERE id NOT IN (SELECT file_id FROM file_versions);
    `);

    console.log("File Versioning system initialized successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to setup versioning:", err);
    process.exit(1);
  }
}

setupVersioning();
