import { useState, useEffect } from "react";
import { subscribeModelProgress, type ModelProgressEvent } from "./api";
import { ChatView } from "./components/ChatView";
import { KnowledgeBase } from "./components/KnowledgeBase";
import { AdminLogin } from "./components/AdminLogin";
import "./App.css";

type Page = "chat" | "knowledge";

function App() {
  const [modelReady, setModelReady] = useState(false);
  const [progress, setProgress] = useState<ModelProgressEvent>({});
  const [activePage, setActivePage] = useState<Page>("chat");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  useEffect(() => {
    // Check if we have a token (simple check, validation happens on API call)
    if (localStorage.getItem("zenbot_token")) {
      setIsAdminLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeModelProgress((data) => {
      setProgress(data);
      if (data.ready || data.error) {
        setModelReady(true);
      }
    });
    return unsubscribe;
  }, []);

  const loading = !modelReady && !progress.ready && !progress.error;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">ZenBot</h1>
        <nav className="app__nav">
          <button
            className={`app__nav-btn ${activePage === "chat" ? "active" : ""}`}
            onClick={() => setActivePage("chat")}
          >
            💬 Chat
          </button>
          <button
            className={`app__nav-btn ${activePage === "knowledge" ? "active" : ""}`}
            onClick={() => setActivePage("knowledge")}
          >
            📚 Knowledge Base
          </button>
        </nav>
        {loading && (
          <div className="app__loader">
            <span className="app__loader-spinner" />
            <span>
              {progress.status ?? "Connecting..."}
              {typeof progress.progress === "number" && ` — ${Math.round(Number(progress.progress))}%`}
              {(progress.file_name ?? progress.file) && ` (${progress.file_name ?? progress.file})`}
            </span>
          </div>
        )}
        {progress.error && (
          <div className="app__error">Model error: {progress.error}</div>
        )}
      </header>
      <main className="app__main">
        {loading && activePage === "chat" ? (
          <div className="app__loading-placeholder">
            Loading model… You can wait here or leave; the first load may take a few minutes.
          </div>
        ) : activePage === "chat" ? (
          <ChatView disabled={!modelReady || !!progress.error} />
        ) : !isAdminLoggedIn ? (
          <AdminLogin onLogin={() => setIsAdminLoggedIn(true)} />
        ) : (
          <KnowledgeBase />
        )}
      </main>
    </div>
  );
}

export default App;
