import { Router, Response } from "express";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

router.use((req, res, next) => authenticateToken(req as AuthRequest, res as Response, next));

// GET /api/trash
// Returns all deleted folders and files for the current user
router.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    
    const folders = await pool.query(
      "SELECT *, 'folder' as type FROM folders WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [userId]
    );

    const files = await pool.query(
      "SELECT *, 'file' as type FROM files WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [userId]
    );

    res.json({
      folders: folders.rows,
      files: files.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trash/empty
// Permanently deletes all items in the trash
router.delete("/empty", async (req: AuthRequest, res) => {
    // This would be a more complex implementation involving Supabase storage cleanup
    // For now, let's keep it simple or implement it if requested.
    res.status(501).json({ error: "Empty trash not implemented yet" });
});

export default router;
