import { Router, Response } from "express";
import { pool } from "../db";
import { supabase } from "../supabase";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/share/:token
router.get("/:token", async (req, res: Response) => {
  try {
    const { token } = req.params;

    // 1. Find the share link
    const shareResult = await pool.query(
      `SELECT sl.*, f.storage_path, f.name as filename, f.size 
       FROM share_links sl 
       JOIN files f ON sl.file_id = f.id 
       WHERE sl.token = $1`,
      [token]
    );

    if (shareResult.rows.length === 0) {
      res.status(404).json({ error: "Share link not found" });
      return;
    }

    const share = shareResult.rows[0];

    // 2. Check expiry
    if (new Date() > new Date(share.expires_at)) {
      res.status(410).json({ error: "Share link has expired" });
      return;
    }

    // 3. Generate a temporary signed URL from Supabase
    const { data, error } = await supabase.storage
      .from("drivestack-files")
      .createSignedUrl(share.storage_path, 300); // 5 mins

    if (error) throw error;

    // Send user directly to the file to download or open
    res.redirect(data.signedUrl);
  } catch (err: any) {
    console.error("Public share error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
