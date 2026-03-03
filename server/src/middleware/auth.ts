import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return;
  }

  try {
    const session = await verifyToken(token, { 
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
    // session.sub is the Clerk User ID
    req.user = {
      id: session.sub as string,
    };
    
    next();
  } catch (err) {
    console.error("Clerk Token Verification Error:", err);
    res.status(403).json({ error: "Invalid or expired token" });
  }
};
