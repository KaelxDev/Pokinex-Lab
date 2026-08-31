import { useEffect, useState } from "react";
import "./MobileSidebar.css";

export default function MobileSidebar({ children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    const handleResize = () => {
      if (window.innerWidth > 520) setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const shouldLock = open && window.innerWidth <= 520;
    const previousOverflow = document.body.style.overflow;

    if (shouldLock) document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function dispatchInternalClick(selector) {
    const target = document.querySelector(selector);
    if (!target) return false;
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    return true;
  }

  function openProfileFromMobile(event) {
    event.preventDefault();
    event.stopPropagation();
    dispatchInternalClick(".profile-summary");
    setOpen(false);
  }

  function clearHistoryFromMobile(event) {
    event.preventDefault();
    event.stopPropagation();
    dispatchInternalClick(".sidebar .logout");
  }

  return (
    <div className={`mobile-sidebar-shell${open ? " mobile-sidebar-open" : ""}`}>
      <button
        className="mobile-sidebar-toggle"
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <button
          className="mobile-sidebar-overlay"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <>
          <button
            className="mobile-profile-hit-target"
            type="button"
            aria-label="Abrir perfil"
            onClick={openProfileFromMobile}
          />
          <button
            className="mobile-history-hit-target"
            type="button"
            aria-label="Limpar histórico local"
            onClick={clearHistoryFromMobile}
          >
            🗑️ Limpar histórico local
          </button>
        </>
      )}

      {children}
    </div>
  );
}
