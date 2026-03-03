import { Router, Response } from "express";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// Apply auth middleware to all folder routes
router.use((req, res, next) => authenticateToken(req as AuthRequest, res as Response, next));

// POST /api/folders
router.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, parent_id } = req.body;
    const userId = req.user!.id;
    
    if (!name) {
      res.status(400).json({ error: "Folder name is required" });
      return;
    }

    const newFolder = await pool.query(
      "INSERT INTO folders (name, user_id, parent_id) VALUES ($1, $2, $3) RETURNING *",
      [name, userId, parent_id || null]
    );

    res.status(201).json(newFolder.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders
router.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const parentId = req.query.parent_id;
    
    let query = "SELECT * FROM folders WHERE user_id = $1 AND deleted_at IS NULL";
    let params: any[] = [userId];

    if (parentId !== undefined) {
      if (parentId === "null") {
        query += " AND parent_id IS NULL";
      } else {
        query += " AND parent_id = $2";
        params.push(parentId);
      }
    }

    query += " ORDER BY created_at DESC";

    const folders = await pool.query(query, params);
    res.json(folders.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders/trash
router.get("/trash", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const deletedFolders = await pool.query(
      "SELECT * FROM folders WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [userId]
    );
    res.json(deletedFolders.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/folders/:id/restore
router.patch("/:id/restore", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const restoredFolder = await pool.query(
      "UPDATE folders SET deleted_at = NULL WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );

    if (restoredFolder.rows.length === 0) {
      res.status(404).json({ error: "Folder not found or unauthorized" });
      return;
    }

    res.json(restoredFolder.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/folders/:id
router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id } = req.body;
    const userId = req.user!.id;

    // Verify ownership
    const folderCheck = await pool.query("SELECT * FROM folders WHERE id = $1 AND user_id = $2", [id, userId]);
    if (folderCheck.rows.length === 0) {
      res.status(404).json({ error: "Folder not found or unauthorized" });
      return;
    }

    const updatedFolder = await pool.query(
      "UPDATE folders SET name = COALESCE($1, name), parent_id = COALESCE($2, parent_id) WHERE id = $3 AND user_id = $4 RETURNING *",
      [name, parent_id, id, userId]
    );

    res.json(updatedFolder.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/folders/:id (Soft Delete)
router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const deletedFolder = await pool.query(
      "UPDATE folders SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId]
    );

    if (deletedFolder.rows.length === 0) {
      res.status(404).json({ error: "Folder not found or unauthorized" });
      return;
    }

    res.json({ message: "Folder moved to trash", id: deletedFolder.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/folders/:id/permanent
router.delete("/:id/permanent", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const deletedFolder = await pool.query(
      "DELETE FROM folders WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId]
    );

    if (deletedFolder.rows.length === 0) {
      res.status(404).json({ error: "Folder not found or unauthorized" });
      return;
    }

    res.json({ message: "Folder permanently deleted", id: deletedFolder.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
