const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface AISource {
  id: string;
  title?: string;
  similarity: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: AISource[];
}


export interface ModelProgressEvent {
  status?: string;
  progress?: number;
  file_name?: string;
  file?: string;
  ready?: boolean;
  error?: string;
}

// Authentication
let authToken: string | null = localStorage.getItem("zenbot_token");

export function setAuthToken(token: string) {
  authToken = token;
  localStorage.setItem("zenbot_token", token);
}

export function getAuthToken() {
  return authToken;
}

export async function login(password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Login failed");
  }

  const data = await res.json();
  if (data.token) {
    setAuthToken(data.token);
    return data.token;
  }
  throw new Error("No token received");
}

function authHeaders(): Record<string, string> {
  return authToken ? { "Authorization": `Bearer ${authToken}` } : {};
}

export async function getMessages(): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/chat`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch messages");
  const data = await res.json();
  return data.messages ?? [];
}

export async function sendMessage(content: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to send message");
  }
  const data = await res.json();
  return data.messages ?? [];
}

export interface SendMessageStreamCallbacks {
  onUserMessage: (msg: Message) => void;
  onChunk: (chunk: string) => void;
  onDone: (msg: Message) => void;
  onError: (err: string) => void;
}

export function sendMessageStream(
  content: string,
  callbacks: SendMessageStreamCallbacks,
  mode: "fast" | "thinking" = "thinking"
): void {
  const { onUserMessage, onChunk, onDone, onError } = callbacks;

  fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mode }),
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onError(err.details ?? err.error ?? "Failed to send message");
        return;
      }
      const body = res.body;
      if (!body) {
        onError("No response body");
        return;
      }
      const reader = body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try {
          const data = JSON.parse(line.slice(6)) as {
            type: string;
            message?: Message;
            content?: string;
            error?: string;
          };
          if (data.type === "user" && data.message) onUserMessage(data.message);
          else if (data.type === "chunk" && data.content !== undefined) onChunk(data.content);
          else if (data.type === "done" && data.message) onDone(data.message);
          else if (data.type === "error" && data.error) onError(data.error);
        } catch {
          // ignore parse errors
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (line) processLine(line);
        }
      }
      if (buffer) {
        const line = buffer.split("\n").find((l) => l.startsWith("data: "));
        if (line) processLine(line);
      }
    })
    .catch((e) => onError(e instanceof Error ? e.message : "Stream failed"));
}

export function subscribeModelProgress(
  onEvent: (data: ModelProgressEvent) => void
): () => void {
  const url = `${API_BASE}/api/model-progress`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as ModelProgressEvent;
      onEvent(data);
      if (data.ready || data.error) es.close();
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = () => {
    es.close();
  };

  return () => es.close();
}

// ============ Knowledge Base Functions ============

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeConfig {
  maxDocuments: number;
  similarityThreshold: number;
  maxContextLength: number;
}

export interface SearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export async function ingestDocument(data: {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/knowledge/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to ingest document");
  }
  return await res.json();
}

export async function getKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/documents`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to get documents");
  }
  const data = await res.json();
  return data.documents ?? [];
}

export async function getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument> {
  const res = await fetch(`${API_BASE}/api/knowledge/documents/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to get document");
  }
  return await res.json();
}

export async function updateKnowledgeDocument(
  id: string,
  data: {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/knowledge/documents/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to update document");
  }
  return await res.json();
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/knowledge/documents/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete document");
}

export async function clearChatHistory(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/history`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to clear history");
}

export async function searchKnowledgeDocuments(
  query: string,
  limit?: number
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (limit) params.append("limit", limit.toString());

  const res = await fetch(`${API_BASE}/api/knowledge/search?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to search documents");
  }
  const data = await res.json();
  return data.results ?? [];
}

export async function getKnowledgeConfig(): Promise<KnowledgeConfig> {
  const res = await fetch(`${API_BASE}/api/knowledge/config`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to get config");
  }
  return await res.json();
}

export async function updateKnowledgeConfig(
  config: Partial<KnowledgeConfig>
): Promise<{ config: KnowledgeConfig; message: string }> {
  const res = await fetch(`${API_BASE}/api/knowledge/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details ?? err.error ?? "Failed to update config");
  }
  return await res.json();
}
