import { useEffect } from "react";

export default function DirectMessageNotificationBridge() {
  useEffect(() => {
    function openDirectMessage(event) {
      const userId = Number(event.detail?.senderId ?? event.detail?.userId);
      if (!Number.isFinite(userId)) return;

      const trigger = document.querySelector(`[data-dm-user-id="${userId}"]`);
      if (!trigger || trigger.disabled) return;

      trigger.click();
    }

    window.addEventListener("pokinex:open-dm", openDirectMessage);
    return () => window.removeEventListener("pokinex:open-dm", openDirectMessage);
  }, []);

  return null;
}
