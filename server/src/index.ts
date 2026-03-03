import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import authRoutes from "./routes/auth";
import folderRoutes from "./routes/folders";
import filesRoutes from "./routes/files";
import shareRoutes from "./routes/share";
import trashRoutes from "./routes/trash";
import searchRoutes from "./routes/search";
import sharedRoutes from "./routes/shared";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5555;

// Strict CORS for production
const allowedOrigins = [
  "http://localhost:3200", 
  "http://localhost:3000",
  process.env.FRONTEND_URL || ""
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/shared", sharedRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send({ status: "ok", message: "DriveStack API is running" });
});

// Health check endpoint for Render/Railway
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: "Something went wrong!", 
    message: process.env.NODE_ENV === "development" ? err.message : undefined 
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
