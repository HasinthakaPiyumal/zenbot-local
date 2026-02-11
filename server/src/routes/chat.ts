import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { AgentService } from "../ai/agentService.js";
import { getMessages as dbGetMessages, addMessage, archiveSession, type StoredMessage } from "../db/sqlite.js";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";

const router = Router();
const agentService = new AgentService();

const COOKIE_NAME = "chat_session";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT_API = 50;
const HISTORY_LIMIT_MODEL = 24;

export type { StoredMessage };

function nextId(): string {
  return `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function getOrCreateSessionId(req: Request, res: Response): string {
  let id = req.cookies?.[COOKIE_NAME];
  if (!id) {
    id = randomUUID();
    res.cookie(COOKIE_NAME, id, {
      path: "/",
      maxAge: COOKIE_MAX_AGE_MS,
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return id;
}

// ---------------------------------------------------------------------------
// GET /api/chat — fetch message history
// ---------------------------------------------------------------------------
router.get("/", (req: Request, res: Response) => {
  const sessionId = getOrCreateSessionId(req, res);
  const messages = dbGetMessages(sessionId, HISTORY_LIMIT_API);
  res.json({ messages });
});

// ---------------------------------------------------------------------------
// DELETE /api/chat/history — clear session history (cookie)
// ---------------------------------------------------------------------------
router.delete("/history", (req: Request, res: Response) => {
  const sessionId = req.cookies?.[COOKIE_NAME];
  console.log("[chat] DELETE /history called. SessionId from cookie:", sessionId);
  if (sessionId) {
    archiveSession(sessionId);
    console.log("[chat] Session archived:", sessionId);
  } else {
    console.warn("[chat] No session ID found in cookies during clear history request.");
  }
  // We do NOT clear the cookie, so the session ID persists but history is empty.
  res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/chat — generate a reply (non-streaming)
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "Missing or empty content" });
    return;
  }

  const sessionId = getOrCreateSessionId(req, res);
  const userMsg: StoredMessage = {
    id: nextId(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
  addMessage(sessionId, userMsg);

  try {
    // Build History (DB)
    const history = dbGetMessages(sessionId, HISTORY_LIMIT_MODEL);
    const langchainHistory = history.map(m => m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content));

    // Run Agent (Blocking) - we use a dummy callback for now or collect text
    // But this route is POST / (non-stream). 
    // We'll just collect the stream text.
    let fullReply = "";
    await agentService.runAgentStream(content, langchainHistory, (token) => {
      fullReply += token;
    });

    const assistantMsg: StoredMessage = {
      id: nextId(),
      role: "assistant",
      content: fullReply,
      timestamp: new Date().toISOString(),
    };
    addMessage(sessionId, assistantMsg);

    res.status(201).json({ messages: [userMsg, assistantMsg] });
  } catch (err) {
    console.error("[chat] generate error:", err);
    res.status(500).json({
      error: "AI generation failed",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/stream — generate a reply (SSE streaming)
// ---------------------------------------------------------------------------
function writeSSE(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/stream", async (req: Request, res: Response) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "Missing or empty content" });
    return;
  }

  const sessionId = getOrCreateSessionId(req, res);
  const userMsg: StoredMessage = {
    id: nextId(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
  addMessage(sessionId, userMsg);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSSE(res, { type: "user", message: userMsg });

  try {
    const history = dbGetMessages(sessionId, HISTORY_LIMIT_MODEL);
    const langchainHistory = history.map(m => m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content));
    const mode = req.body?.mode === "fast" ? "fast" : "thinking";

    let fullReply = "";
    console.log(`[chat/stream] Starting in ${mode} mode...`);

    const onToken = (token: string) => {
      fullReply += token;
      writeSSE(res, { type: "chunk", content: token });
      res.flushHeaders?.();
    };

    if (mode === "fast") {
      await agentService.runFastStream(content, langchainHistory, onToken);
    } else {
      await agentService.runAgentStream(content, langchainHistory, onToken);
    }

    const assistantMsg: StoredMessage = {
      id: nextId(),
      role: "assistant",
      content: fullReply,
      timestamp: new Date().toISOString(),
    };
    addMessage(sessionId, assistantMsg);
    writeSSE(res, { type: "done", message: assistantMsg });
  } catch (err) {
    console.error("[chat/stream] generate error:", err);
    writeSSE(res, {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    res.statusCode = 500;
  } finally {
    res.end();
  }
});

export default router;
