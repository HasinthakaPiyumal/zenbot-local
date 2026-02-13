"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export default function Chat() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <main className="chat-container">
      <h1 className="chat-title">🤖 AI Chat</h1>
      <p className="chat-subtitle">Powered by Ollama · qwen2.5:0.5b</p>

      <div className="messages">
        {messages.length === 0 && (
          <p className="empty-state">Send a message to start chatting...</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message ${m.role === "user" ? "user" : "assistant"}`}
          >
            <span className="role">{m.role === "user" ? "You" : "AI"}</span>
            <div className="content">
              {m.parts?.map((part, i) =>
                part.type === "text" ? <p key={i}>{part.text}</p> : null
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="message assistant">
            <span className="role">AI</span>
            <p className="content thinking">Thinking...</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="chat-input"
          disabled={isLoading}
        />
        <button type="submit" className="send-button" disabled={isLoading}>
          Send
        </button>
      </form>
    </main>
  );
}
