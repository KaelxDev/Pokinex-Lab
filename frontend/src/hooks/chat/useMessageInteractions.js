import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../../utils/chat";

export function useMessageInteractions({ user, userRef }) {
  const [contextMenu, setContextMenu] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const longPressRef = useRef(null);

  const toggleReactionPicker = useCallback((event, messageId) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setReactionPickerMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const openContextMenu = useCallback((event, message) => {
    event.preventDefault();
    event.stopPropagation();
    setReactionPickerMessageId(null);
    const currentUser = userRef.current || user;
    const isMine = message.userId != null
      ? String(message.userId) === String(currentUser?.id)
      : String(message.username || "") === String(currentUser?.username || "");
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)),
      message,
      isMine,
    });
  }, [user, userRef]);

  const startLongPress = useCallback((event, message) => {
    if (event.touches.length !== 1) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const touch = event.touches[0];
      openContextMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        },
        message,
      );
      navigator.vibrate?.(20);
    }, 550);
  }, [openContextMenu]);

  const endLongPress = useCallback(() => clearTimeout(longPressRef.current), []);

  const copyMessage = useCallback(async (message) => {
    if (message.deleted) return;
    try {
      await copyText(message.message);
      setContextMenu(null);
    } catch (error) {
      console.error("Não foi possível copiar:", error);
    }
  }, []);

  useEffect(() => () => clearTimeout(longPressRef.current), []);

  return {
    contextMenu,
    setContextMenu,
    reactionPickerMessageId,
    setReactionPickerMessageId,
    toggleReactionPicker,
    openContextMenu,
    startLongPress,
    endLongPress,
    copyMessage,
  };
}
