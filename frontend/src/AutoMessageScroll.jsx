import { useEffect, useRef, useState } from "react";
import "./AutoMessageScroll.css";

const BOTTOM_THRESHOLD = 80;

export default function AutoMessageScroll({ children }) {
  const messagesRef = useRef(null);
  const cleanupRef = useRef(null);
  const nearBottomRef = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  useEffect(() => {
    let bodyObserver = null;
    let messageObserver = null;

    const isNearBottom = (container) =>
      container.scrollHeight - container.scrollTop - container.clientHeight <= BOTTOM_THRESHOLD;

    const scrollToBottom = (container, smooth = false) => {
      if (!container) return;
      const top = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTo({
        top,
        behavior: smooth ? "smooth" : "auto",
      });
      nearBottomRef.current = true;
      setHasNewMessages(false);
    };

    const attachToMessages = () => {
      const container = document.querySelector(".messages");
      if (!container || messagesRef.current === container) return;

      cleanupRef.current?.();
      messagesRef.current = container;

      const handleScroll = () => {
        nearBottomRef.current = isNearBottom(container);
        if (nearBottomRef.current) setHasNewMessages(false);
      };

      const handleResize = () => {
        if (nearBottomRef.current) scrollToBottom(container);
      };

      container.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleResize);

      nearBottomRef.current = isNearBottom(container);
      requestAnimationFrame(() => scrollToBottom(container));

      messageObserver = new MutationObserver((mutations) => {
        const addedMessage = mutations.some((mutation) =>
          Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            const element = node;
            return element.classList.contains("message") || element.classList.contains("system-message");
          }),
        );

        if (!addedMessage) return;

        requestAnimationFrame(() => {
          if (nearBottomRef.current) {
            scrollToBottom(container, true);
          } else {
            setHasNewMessages(true);
          }
        });
      });

      messageObserver.observe(container, { childList: true });

      cleanupRef.current = () => {
        container.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
        messageObserver?.disconnect();
        messageObserver = null;
        if (messagesRef.current === container) messagesRef.current = null;
      };
    };

    attachToMessages();

    bodyObserver = new MutationObserver(attachToMessages);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      bodyObserver?.disconnect();
      cleanupRef.current?.();
      cleanupRef.current = null;
      messagesRef.current = null;
    };
  }, []);

  function goToLatestMessage() {
    const container = messagesRef.current || document.querySelector(".messages");
    if (!container) return;
    const top = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTo({ top, behavior: "smooth" });
    nearBottomRef.current = true;
    setHasNewMessages(false);
  }

  return (
    <div className="auto-message-scroll-shell">
      <div className="auto-message-scroll-content">
        {children}
      </div>
      {hasNewMessages && (
        <button
          className="new-message-indicator"
          type="button"
          onClick={goToLatestMessage}
        >
          ↓ Nova mensagem
        </button>
      )}
    </div>
  );
}
