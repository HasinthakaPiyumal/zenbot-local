import { useState, useEffect, useRef } from "react";
import type { Message } from "../api";
import { getMessages, sendMessageStream, clearChatHistory } from "../api";
import { MessageBubble } from "./MessageBubble";

const STREAMING_ID = "streaming";

type ChatMode = "fast" | "thinking";

interface ChatViewProps {
  disabled: boolean;
}

export function ChatView({ disabled }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("thinking");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMessages()
      .then(setMessages)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || disabled) return;
    setInput("");
    setSending(true);
    setError(null);

    const streamingPlaceholder: Message = {
      id: STREAMING_ID,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    sendMessageStream(text, {
      onUserMessage(userMsg) {
        setMessages((prev) => [...prev, userMsg, streamingPlaceholder]);
      },
      onChunk(chunk) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === STREAMING_ID ? { ...m, content: (m.content || "") + chunk } : m
          )
        );
      },
      onDone(assistantMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === STREAMING_ID ? assistantMsg : m))
        );
        setSending(false);
      },
      onError(err) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== STREAMING_ID).slice(0, -1)
        );
        setError(err);
        setSending(false);
      },
    }, mode);
  }

  const handleClearHistory = async () => {
    if (confirm("Are you sure you want to clear the chat history?")) {
      try {
        await clearChatHistory();
        window.location.reload();
      } catch (err) {
        alert("Failed to clear history");
        console.error(err);
      }
    }
  };

  return (
    <div className="chat-view">
      <div className="chat-view__header">
        <h2 className="chat-view__title">Chat</h2>
        <div className="chat-view__header-actions">
          <div className="chat-view__mode-toggle">
            <button
              className={`chat-view__mode-btn ${mode === "fast" ? "active" : ""}`}
              onClick={() => setMode("fast")}
              title="Fast mode: Direct answers, no thinking process"
            >
              ⚡ Fast
            </button>
            <button
              className={`chat-view__mode-btn ${mode === "thinking" ? "active" : ""}`}
              onClick={() => setMode("thinking")}
              title="Thinking mode: Shows reasoning process with tool calls"
            >
              🧠 Think
            </button>
          </div>
          <button 
            onClick={handleClearHistory} 
            className="chat-view__clear-btn" 
            title="Clear History"
            disabled={disabled}
          >
            Clear History
          </button>
        </div>
      </div>
      <div className="chat-view__list" ref={listRef}>
        {messages.length === 0 && !error && (
          <div className="chat-view__empty">Send a message to start the conversation.</div>
        )}
        {error && <div className="chat-view__error">{error}</div>}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      <form className="chat-view__form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-view__input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || sending}
          autoComplete="off"
        />
        <button
          type="submit"
          className="chat-view__send"
          disabled={disabled || sending || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
