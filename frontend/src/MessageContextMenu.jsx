import { useEffect, useRef, useState } from "react";

function getMessageElement(target) {
  return target instanceof Element ? target.closest(".message-bubble") : null;
}

function getMessageText(element) {
  if (!element) return "";
  return element.textContent?.trim() || "";
}

export default function MessageContextMenu() {
  const [menu, setMenu] = useState(null);
  const [copied, setCopied] = useState(false);
  const longPressRef = useRef(null);

  useEffect(() => {
    function closeMenu() {
      setMenu(null);
      setCopied(false);
    }

    function handleContextMenu(event) {
      const messageElement = getMessageElement(event.target);
      if (!messageElement) return;
      event.preventDefault();
      const text = getMessageText(messageElement);
      if (!text) return;
      setCopied(false);
      setMenu({ text, x: Math.min(event.clientX, window.innerWidth - 150), y: Math.min(event.clientY, window.innerHeight - 70) });
    }

    function handleTouchStart(event) {
      const messageElement = getMessageElement(event.target);
      if (!messageElement || event.touches.length !== 1) return;
      clearTimeout(longPressRef.current);
      longPressRef.current = window.setTimeout(() => {
        const touch = event.touches[0];
        const text = getMessageText(messageElement);
        if (!text) return;
        setCopied(false);
        setMenu({ text, x: Math.min(touch.clientX, window.innerWidth - 150), y: Math.min(touch.clientY, window.innerHeight - 70) });
        if (navigator.vibrate) navigator.vibrate(20);
      }, 550);
    }

    function cancelLongPress() {
      clearTimeout(longPressRef.current);
    }

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", cancelLongPress, { passive: true });
    document.addEventListener("touchmove", cancelLongPress, { passive: true });
    document.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    return () => {
      clearTimeout(longPressRef.current);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", cancelLongPress);
      document.removeEventListener("touchmove", cancelLongPress);
      document.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, []);

  async function copyMessage() {
    if (!menu?.text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(menu.text);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = menu.text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setMenu(null), 700);
    } catch (error) {
      console.error("Não foi possível copiar a mensagem:", error);
    }
  }

  if (!menu) return null;

  return (
    <>
      <button className="message-context-backdrop" aria-label="Fechar menu" onClick={() => setMenu(null)} />
      <div className="message-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        <button type="button" role="menuitem" onClick={copyMessage}>{copied ? "✓ Copiado" : "📋 Copiar"}</button>
      </div>
    </>
  );
}
