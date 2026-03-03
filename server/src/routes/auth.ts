import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Signup
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Insert user
    const newUser = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, passwordHash]
    );
    
    res.status(201).json(newUser.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") {
       res.status(400).json({ error: "Email already exists" });
       return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1d" });
    
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Protected route example
router.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const userResult = await pool.query("SELECT id, email, created_at FROM users WHERE id = $1", [userId]);
    res.json(userResult.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
