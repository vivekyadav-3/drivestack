import { Router, Response } from "express";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/search?q=query
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const query = req.query.q as string;

    if (!query) {
      res.json({ files: [], folders: [] });
      return;
    }

    const searchTerm = `%${query}%`;

    const folders = await pool.query(
      "SELECT *, 'folder' as type FROM folders WHERE user_id = $1 AND name ILIKE $2 AND deleted_at IS NULL",
      [userId, searchTerm]
    );

    const files = await pool.query(
      "SELECT *, 'file' as type FROM files WHERE user_id = $1 AND name ILIKE $2 AND deleted_at IS NULL",
      [userId, searchTerm]
    );

    res.json({
      folders: folders.rows,
      files: files.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
