import { useEffect, useRef, useState } from "react";
import "./AutoMessageScroll.css";

const BOTTOM_THRESHOLD = 80;

export default function AutoMessageScroll({ children }) {
  const messagesRef = useRef(null);
  const nearBottomRef = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return undefined;

    const isNearBottom = () =>
      container.scrollHeight - container.scrollTop - container.clientHeight <= BOTTOM_THRESHOLD;

    const scrollToBottom = (smooth = false) => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      nearBottomRef.current = true;
      setHasNewMessages(false);
    };

    const handleScroll = () => {
      nearBottomRef.current = isNearBottom();
      if (nearBottomRef.current) setHasNewMessages(false);
    };

    nearBottomRef.current = isNearBottom();
    container.addEventListener("scroll", handleScroll, { passive: true });

    const observer = new MutationObserver((mutations) => {
      const addedMessage = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.classList.contains("message") || node.classList.contains("system-message")),
        ),
      );

      if (!addedMessage) return;

      if (nearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(false));
      } else {
        setHasNewMessages(true);
      }
    });

    observer.observe(container, { childList: true });

    requestAnimationFrame(() => {
      scrollToBottom(false);
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="auto-message-scroll-shell">
      <div className="auto-message-scroll-content" ref={(node) => {
        messagesRef.current = node?.querySelector(".messages") || null;
      }}>
        {children}
      </div>
      {hasNewMessages && (
        <button
          className="new-message-indicator"
          type="button"
          onClick={() => {
            const container = messagesRef.current;
            if (!container) return;
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
            nearBottomRef.current = true;
            setHasNewMessages(false);
          }}
        >
          ↓ Nova mensagem
        </button>
      )}
    </div>
  );
}
