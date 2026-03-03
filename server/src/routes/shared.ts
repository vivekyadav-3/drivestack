import { Router, Response } from "express";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/shared
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // Join file_access and files
    const result = await pool.query(
      `SELECT f.*, fa.permission, fa.created_at as shared_at 
       FROM file_access fa 
       JOIN files f ON fa.file_id = f.id 
       WHERE fa.shared_with_user_id = $1 AND f.deleted_at IS NULL
       ORDER BY fa.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
