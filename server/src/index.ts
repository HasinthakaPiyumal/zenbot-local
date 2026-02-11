import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initDb } from "./db/sqlite.js";
import { initLanceDB } from "./ai/lanceClient.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import knowledgeRoutes from "./routes/knowledge.js";
import modelProgressRoutes from "./routes/modelProgress.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/model-progress", modelProgressRoutes);

// Helper to determine directory (ESM)
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files in production
if (process.env.NODE_ENV === "production" || process.env.SERVE_STATIC === "true") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));

  app.get("*", (req, res) => {
    // Skip API routes
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Initialize database and vector store before starting server
Promise.all([initDb(), initLanceDB()])
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://127.0.0.1:${PORT}/`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize:", err);
    process.exit(1);
  });
