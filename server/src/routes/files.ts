import { Router, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { pool } from "../db";
import { supabase } from "../supabase";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { createClerkClient } from "@clerk/backend";
import nodemailer from "nodemailer";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const router = Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB individual file limit
});

// GET /api/files/quota
router.get("/quota", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const quotaRes = await pool.query("SELECT used_storage, storage_limit FROM user_quotas WHERE user_id = $1", [userId]);
    
    if (quotaRes.rows.length === 0) {
      // Initialize if not exists
      const newQuota = await pool.query(
        "INSERT INTO user_quotas (user_id) VALUES ($1) RETURNING used_storage, storage_limit",
        [userId]
      );
      res.json(newQuota.rows[0]);
    } else {
      res.json(quotaRes.rows[0]);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/upload (Quota + Versioning)
router.post("/upload", authenticateToken, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const { folder_id } = req.body;
    const userId = req.user!.id;

    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    // 1. Quota Check
    const quotaRes = await pool.query("SELECT used_storage, storage_limit FROM user_quotas WHERE user_id = $1", [userId]);
    const currentUsed = quotaRes.rows.length > 0 ? BigInt(quotaRes.rows[0].used_storage) : BigInt(0);
    const limit = quotaRes.rows.length > 0 ? BigInt(quotaRes.rows[0].storage_limit) : BigInt(104857600); // 100MB

    if (currentUsed + BigInt(file.size) > limit) {
      res.status(403).json({ 
        error: "Storage limit exceeded", 
        message: "You have used up your free 100MB storage. Please delete files or upgrade." 
      });
      return;
    }

    // 2. Versioning Logic
    const existingFile = await pool.query(
      "SELECT id FROM files WHERE user_id = $1 AND name = $2 AND (folder_id = $3 OR (folder_id IS NULL AND $3 IS NULL)) AND deleted_at IS NULL",
      [userId, file.originalname, folder_id || null]
    );

    const isNewVersion = existingFile.rows.length > 0;
    const storagePath = `${userId}/${folder_id || "root"}/${Date.now()}_${file.originalname}`;

    // Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from("drivestack-files")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    let finalFile;
    if (isNewVersion) {
      const fileId = existingFile.rows[0].id;
      
      // Get next version number
      const versionRes = await pool.query("SELECT MAX(version_number) as max_v FROM file_versions WHERE file_id = $1", [fileId]);
      const nextVersion = (versionRes.rows[0].max_v || 1) + 1;

      // Add to versions table
      await pool.query(
        "INSERT INTO file_versions (file_id, storage_path, size, version_number) VALUES ($1, $2, $3, $4)",
        [fileId, storagePath, file.size, nextVersion]
      );

      // Update main file record to point to latest version
      const updateResult = await pool.query(
        "UPDATE files SET storage_path = $1, size = $2, created_at = NOW() WHERE id = $3 RETURNING *",
        [storagePath, file.size, fileId]
      );
      finalFile = updateResult.rows[0];
    } else {
      // Regular new file
      const dbResult = await pool.query(
        "INSERT INTO files (name, user_id, folder_id, storage_path, size) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [file.originalname, userId, folder_id || null, storagePath, file.size]
      );
      finalFile = dbResult.rows[0];

      // Initial version entry
      await pool.query(
        "INSERT INTO file_versions (file_id, storage_path, size, version_number) VALUES ($1, $2, $3, 1)",
        [finalFile.id, storagePath, file.size]
      );
    }

    // 3. Update Quota
    await pool.query(
      "INSERT INTO user_quotas (user_id, used_storage) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET used_storage = user_quotas.used_storage + $2",
      [userId, file.size]
    );

    res.status(201).json(finalFile);
  } catch (err: any) {
    if (err.code === "LIMIT_FILE_SIZE") {
       res.status(413).json({ error: "File too large (Limit: 10MB)" });
       return;
    }
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// GET /api/files/:id/versions
router.get("/:id/versions", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check ownership
    const fileCheck = await pool.query("SELECT id FROM files WHERE id = $1 AND user_id = $2", [id, userId]);
    if (fileCheck.rows.length === 0) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const versions = await pool.query(
      "SELECT id, version_number, size, created_at FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC",
      [id]
    );

    res.json(versions.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/versions/:versionId/restore
router.post("/versions/:versionId/restore", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { versionId } = req.params;
    const userId = req.user!.id;

    // 1. Get version details and verify ownership through join
    const versionRes = await pool.query(
      "SELECT fv.*, f.user_id FROM file_versions fv JOIN files f ON fv.file_id = f.id WHERE fv.id = $1 AND f.user_id = $2",
      [versionId, userId]
    );

    if (versionRes.rows.length === 0) {
      res.status(404).json({ error: "Version not found or unauthorized" });
      return;
    }

    const version = versionRes.rows[0];

    // 2. Update the main file record to this version's storage path
    const updatedFile = await pool.query(
      "UPDATE files SET storage_path = $1, size = $2 WHERE id = $3 RETURNING *",
      [version.storage_path, version.size, version.file_id]
    );

    res.json({ message: "File restored to version " + version.version_number, file: updatedFile.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/:id/permanent (Quota subtraction included)
router.delete("/:id/permanent", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 1. Get all versions for this file (to delete from storage and subtract size)
    const versions = await pool.query("SELECT storage_path, size FROM file_versions WHERE file_id = $1", [id]);
    const fileCheck = await pool.query("SELECT user_id FROM files WHERE id = $1 AND user_id = $2", [id, userId]);
    
    if (fileCheck.rows.length === 0) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (versions.rows.length > 0) {
      const paths = versions.rows.map(v => v.storage_path);
      const totalSize = versions.rows.reduce((sum, v) => sum + BigInt(v.size), BigInt(0));

      // Delete from Supabase
      const { error: storageError } = await supabase.storage
        .from("drivestack-files")
        .remove(paths);

      if (storageError) throw storageError;

      // Update Quota (subtract total size of all versions)
      await pool.query(
        "UPDATE user_quotas SET used_storage = GREATEST(0, used_storage - $1) WHERE user_id = $2",
        [totalSize, userId]
      );
    }

    // 2. Delete from DB (Cascades to file_versions)
    await pool.query("DELETE FROM files WHERE id = $1", [id]);

    res.json({ message: "File and all its versions permanently deleted", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Existing share & download routes with version awareness (uses current storage_path) ---

router.get("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    // Allow owner or shared user
    const fileResult = await pool.query(`
      SELECT f.* 
      FROM files f
      LEFT JOIN file_access fa ON f.id = fa.file_id AND fa.shared_with_user_id = $2
      WHERE f.id = $1 AND (f.user_id = $2 OR fa.shared_with_user_id = $2) AND f.deleted_at IS NULL
    `, [id, userId]);

    if (fileResult.rows.length === 0) return res.status(404).json({ error: "File not found or unauthorized" });
    const file = fileResult.rows[0];
    const { data, error } = await supabase.storage.from("drivestack-files").createSignedUrl(file.storage_path, 300); 
    if (error) throw error;
    res.json({ downloadUrl: data.signedUrl });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch file", details: err.message });
  }
});

router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const folderId = req.query.folder_id;
    let query = "SELECT * FROM files WHERE user_id = $1 AND deleted_at IS NULL";
    let params: any[] = [userId];
    if (folderId !== undefined) {
      if (folderId === "null") query += " AND folder_id IS NULL";
      else { query += " AND folder_id = $2"; params.push(folderId); }
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/trash", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query("SELECT * FROM files WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC", [userId]);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/:id/restore", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const restoredFile = await pool.query("UPDATE files SET deleted_at = NULL WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]);
    if (restoredFile.rows.length === 0) return res.status(404).json({ error: "File not found" });
    res.json(restoredFile.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const deletedFile = await pool.query("UPDATE files SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (deletedFile.rows.length === 0) return res.status(404).json({ error: "File not found" });
    res.json({ message: "File moved to trash", id: deletedFile.rows[0].id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/share", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const fileResult = await pool.query("SELECT id FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, userId]);
    if (fileResult.rows.length === 0) return res.status(404).json({ error: "File not found" });
    const shareToken = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const shareResult = await pool.query("INSERT INTO share_links (file_id, token, expires_at) VALUES ($1, $2, $3) RETURNING token", [id, shareToken, expiresAt]);
    const publicUrl = `${req.protocol}://${req.get('host')}/api/share/${shareToken}`;
    res.json({ shareLink: publicUrl, expiresAt });
  } catch (err: any) { res.status(500).json({ error: "Sharing failed", details: err.message }); }
});

router.post("/:id/share-email", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const userId = req.user!.id;

    // Check ownership
    const fileResult = await pool.query(
      "SELECT name FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [id, userId]
    );

    if (fileResult.rows.length === 0) {
      res.status(404).json({ error: "File not found or unauthorized" });
      return;
    }

    const fileName = fileResult.rows[0].name;

    // Check if the user exists in Clerk, so we can grant them access to "Shared with me" Dashboard
    let sharedWithUserId = null;
    try {
      const userList = await clerkClient.users.getUserList({ emailAddress: [email] });
      const users = Array.isArray(userList) ? userList : userList.data;
      if (users && users.length > 0) {
        sharedWithUserId = users[0].id;
      }
    } catch(err) {
      console.error("Clerk lookup failed", err);
    }

    if (sharedWithUserId && sharedWithUserId === userId) {
      res.status(400).json({ error: "Cannot share with yourself" });
      return;
    }

    // Insert or update access in Database
    if (sharedWithUserId) {
      await pool.query(
        `INSERT INTO file_access (file_id, shared_with_user_id, permission) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (file_id, shared_with_user_id) 
         DO UPDATE SET permission = EXCLUDED.permission`,
        [id, sharedWithUserId, "view"]
      );
    }

    // Generate a secure one-time link token
    const shareToken = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry
    
    await pool.query(
      "INSERT INTO share_links (file_id, token, expires_at) VALUES ($1, $2, $3)", 
      [id, shareToken, expiresAt]
    );

    const backendUrl = process.env.BACKEND_URL || "http://localhost:5555";
    const publicUrl = `${backendUrl}/api/share/${shareToken}`;

    // Use Real Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });

    const mailOptions = {
        from: '"DriveStack" <noreply@drivestack.com>',
        to: email,
        subject: `Someone shared a file with you: ${fileName}`,
        text: `You have been granted access to the file "${fileName}". You can download it securely using this link: ${publicUrl} (Expires in 7 days)`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>DriveStack Secure Share</h2>
            <p>You have been granted access to the file <strong>${fileName}</strong>.</p>
            <p>You can download it securely using the button below:</p>
            <a href="${publicUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Download ${fileName}</a>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">This link will expire in 7 days.</p>
          </div>
        `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log("------------------------------------------");
    console.log("📧 REAL EMAIL SENT to:", email);
    console.log("------------------------------------------");
    
    res.json({ 
      message: sharedWithUserId ? "Granted dashboard access & sent email" : "User not registered, sent invite email instead", 
      sharedWith: email 
    });
  } catch (err: any) {
    res.status(500).json({ error: "Sharing failed", details: err.message });
  }
});

export default router;
