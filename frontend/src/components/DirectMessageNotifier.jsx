import { useEffect, useState } from "react";
import { onDirectMessage } from "../notifications";
import { normalizeAvatarUrl, userInitial } from "../utils/chat";

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.015);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.19);
    oscillator.addEventListener("ended", () => context.close(), { once: true });
  } catch (error) {
    console.debug("Som de notificação indisponível:", error);
  }
}

function resolveNotificationAvatar(message, userId) {
  const candidate = String(message?.avatar || "").trim() || `/api/auth/avatar/${encodeURIComponent(userId)}`;
  return normalizeAvatarUrl(candidate, userId);
}

export default function DirectMessageNotifier() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    return onDirectMessage((message) => {
      const senderId = Number(message?.senderId ?? message?.userId);
      if (!Number.isFinite(senderId)) return;

      const displayName = message?.displayName || message?.username || "Usuário";
      const normalized = {
        ...message,
        senderId,
        userId: senderId,
        displayName,
        avatar: resolveNotificationAvatar(message, senderId),
      };

      setToast(normalized);
      playNotificationSound();

      if (document.visibilityState !== "visible") {
        const cleanTitle = document.title.replace(/^\(\d+\)\s*/, "") || "Pokinex";
        document.title = `(1) ${cleanTitle}`;
      }

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(normalized.displayName, {
            body: normalized.message || "Nova mensagem privada",
            icon: normalized.avatar || "/icone.png",
            tag: `pokinex-dm-${normalized.senderId}`,
          });
        } catch (error) {
          console.debug("Notificação do sistema indisponível:", error);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function resetTitle() {
      if (document.visibilityState !== "visible") return;
      const title = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = title || "Pokinex";
    }

    document.addEventListener("visibilitychange", resetTitle);
    window.addEventListener("focus", resetTitle);
    return () => {
      document.removeEventListener("visibilitychange", resetTitle);
      window.removeEventListener("focus", resetTitle);
    };
  }, []);

  if (!toast) return null;

  return (
    <button
      className="dm-notification-toast"
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("pokinex:open-dm", { detail: toast }));
        setToast(null);
      }}
      aria-label={`Abrir conversa com ${toast.displayName}`}
    >
      <span className="dm-notification-avatar">
        <span className="dm-notification-avatar-fallback" aria-hidden="true">
          {userInitial(toast)}
        </span>
        {toast.avatar ? (
          <img
            src={toast.avatar}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </span>
      <span className="dm-notification-copy">
        <small>MENSAGEM PRIVADA</small>
        <strong>{toast.displayName}</strong>
        <span>{toast.message || "Nova mensagem privada"}</span>
      </span>
      <span className="dm-notification-dot" aria-hidden="true" />
    </button>
  );
}
