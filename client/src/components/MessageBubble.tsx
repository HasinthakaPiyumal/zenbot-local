import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../api";
import { parseThinkContent } from "../utils/parseThink";

const POPOVER_HIDE_DELAY_MS = 150;

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [popoverVisible, setPopoverVisible] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopover = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setPopoverVisible(true);
  };

  const scheduleHide = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setPopoverVisible(false);
      hideTimeoutRef.current = null;
    }, POPOVER_HIDE_DELAY_MS);
  };

  useEffect(() => {
    if (!popoverVisible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        indicatorRef.current && !indicatorRef.current.contains(e.target as Node)
      ) {
        setPopoverVisible(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverVisible]);

  if (isUser) {
    return (
      <div className="message-bubble message-bubble--user">
        <div className="message-bubble__content">{message.content}</div>
        <div className="message-bubble__time">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  }

  const { response, thinkingParts, isInsideThink } = parseThinkContent(message.content);
  const hasThinkContent = thinkingParts.some((p) => p.trim().length > 0);
  const thinkingText = thinkingParts.join("\n\n").trim() || (isInsideThink ? "..." : "");
  const showThinkUI = isInsideThink || hasThinkContent;

  return (
    <div className="message-bubble message-bubble--assistant">
      <div className="message-bubble__content">
        {!message.content && message.role === "assistant" ? (
          <div className="message-bubble__thinking">
            Thinking<span>.</span><span>.</span><span>.</span>
          </div>
        ) : response ? (
          <div className="message-bubble__markdown">
            <ReactMarkdown>{response}</ReactMarkdown>
          </div>
        ) : null}
        {showThinkUI && isInsideThink && (
          <div className="message-bubble__think-wrap">
            <div
              ref={indicatorRef}
              className={`message-bubble__think-indicator ${isInsideThink ? "message-bubble__think-indicator--animated" : ""}`}
              onMouseEnter={showPopover}
              onMouseLeave={scheduleHide}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPopoverVisible((v) => !v);
                }
              }}
              aria-label="Show thinking"
            >
              {isInsideThink ? (
                <>
                  <span className="message-bubble__think-dot" />
                  <span className="message-bubble__think-dot" />
                  <span className="message-bubble__think-dot" />
                </>
              ) : (
                <span className="message-bubble__think-label">Thinking</span>
              )}
            </div>
            {popoverVisible && (
              <div
                ref={popoverRef}
                className="message-bubble__think-popover"
                onMouseEnter={showPopover}
                onMouseLeave={scheduleHide}
              >
                <div className="message-bubble__think-popover-content">
                  {thinkingText || "..."}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="message-bubble__time">
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
