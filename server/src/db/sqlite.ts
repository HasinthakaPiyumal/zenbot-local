import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_DIR = process.env.CHAT_DB_PATH ? dirname(process.env.CHAT_DB_PATH) : join(process.cwd(), "data");
const DB_PATH = process.env.CHAT_DB_PATH ?? join(DB_DIR, "chat.db");

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

type SqlJsDatabase = import("sql.js").Database;
let db: SqlJsDatabase | null = null;

export async function initDb(): Promise<void> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buf = readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);`);
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_bin (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      archived_at TEXT NOT NULL
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_chat_bin_session_id ON chat_bin(session_id);`);



  // Knowledge base configuration table
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Set default config if not exists
  const configStmt = db.prepare("SELECT COUNT(*) as count FROM knowledge_config");
  configStmt.step();
  const configCount = (configStmt.getAsObject() as { count: number }).count;
  configStmt.free();

  if (configCount === 0) {
    db.run("INSERT INTO knowledge_config (key, value) VALUES ('maxDocuments', '3')");
    db.run("INSERT INTO knowledge_config (key, value) VALUES ('similarityThreshold', '0.7')");
    db.run("INSERT INTO knowledge_config (key, value) VALUES ('maxContextLength', '2000')");
  }

  save();
}

function save(): void {
  if (!db) return;
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export function getMessages(sessionId: string, limit: number): StoredMessage[] {
  if (!db) return [];
  const stmt = db.prepare(
    `SELECT id, role, content, timestamp FROM messages
     WHERE session_id = ?
     ORDER BY timestamp DESC
     LIMIT ?`
  );
  stmt.bind([sessionId, limit]);
  const messages: StoredMessage[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, string>;
    messages.push({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      timestamp: row.timestamp,
    });
  }
  stmt.free();
  return messages.reverse();
}

export function addMessage(sessionId: string, msg: StoredMessage): void {
  if (!db) return;
  db.run(
    `INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [msg.id, sessionId, msg.role, msg.content, msg.timestamp]
  );
  save();
}

export function archiveSession(sessionId: string): void {
  if (!db) return;
  const archivedAt = new Date().toISOString();
  console.log(`[db] Archiving session ${sessionId}...`);

  // 1. Move messages to bin
  db.run(`
    INSERT INTO chat_bin (id, session_id, role, content, timestamp, archived_at)
    SELECT id, session_id, role, content, timestamp, ? 
    FROM messages 
    WHERE session_id = ?
  `, [archivedAt, sessionId]);

  // 2. Delete from active messages
  db.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
  console.log(`[db] Session ${sessionId} archived and deleted from messages.`);

  save();
}



// ============ Knowledge Config Functions ============

export interface KnowledgeConfig {
  maxDocuments: number;
  similarityThreshold: number;
  maxContextLength: number;
}

export function getKnowledgeConfig(): KnowledgeConfig {
  if (!db) {
    return {
      maxDocuments: 3,
      similarityThreshold: 0.2,
      maxContextLength: 2000,
    };
  }

  const stmt = db.prepare("SELECT key, value FROM knowledge_config");
  const config: Record<string, string> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { key: string; value: string };
    config[row.key] = row.value;
  }
  stmt.free();

  return {
    maxDocuments: parseInt(config.maxDocuments || "3", 10),
    similarityThreshold: parseFloat(config.similarityThreshold || "0.7"),
    maxContextLength: parseInt(config.maxContextLength || "2000", 10),
  };
}

export function updateKnowledgeConfig(config: Partial<KnowledgeConfig>): void {
  if (!db) return;

  if (config.maxDocuments !== undefined) {
    db.run(
      "INSERT OR REPLACE INTO knowledge_config (key, value) VALUES ('maxDocuments', ?)",
      [config.maxDocuments.toString()]
    );
  }

  if (config.similarityThreshold !== undefined) {
    db.run(
      "INSERT OR REPLACE INTO knowledge_config (key, value) VALUES ('similarityThreshold', ?)",
      [config.similarityThreshold.toString()]
    );
  }

  if (config.maxContextLength !== undefined) {
    db.run(
      "INSERT OR REPLACE INTO knowledge_config (key, value) VALUES ('maxContextLength', ?)",
      [config.maxContextLength.toString()]
    );
  }

  save();
}

