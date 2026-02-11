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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Initialize database and vector store before starting server
Promise.all([initDb(), initLanceDB()])
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://127.0.0.1:${PORT}/`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize:", err);
    process.exit(1);
  });
