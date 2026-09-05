import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  MouseEvent,
  RefObject,
  SetStateAction,
  TouchEvent,
} from "react";
import { copyText } from "../../utils/chat";
import type { ChatMessage } from "../useChatHistory.ts";
import type { UserRecord, ContextMenuState } from "../useChatMessageEvents.ts";
import type { MessageId } from "../../types/websocket";

export interface MessageInteractionsState {
  contextMenu: ContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  reactionPickerMessageId: MessageId | null;
  setReactionPickerMessageId: Dispatch<SetStateAction<MessageId | null>>;
  toggleReactionPicker: (event: MouseEvent<HTMLElement>, messageId: MessageId) => void;
  openContextMenu: (event: MouseEvent<HTMLElement>, message: ChatMessage) => void;
  startLongPress: (event: TouchEvent<HTMLElement>, message: ChatMessage) => void;
  endLongPress: () => void;
  copyMessage: (message: ChatMessage) => Promise<void>;
}

interface MessageInteractionsOptions {
  user: UserRecord | null;
  userRef: RefObject<UserRecord | null>;
}

interface ContextPoint {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export function useMessageInteractions({ user, userRef }: MessageInteractionsOptions): MessageInteractionsState {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<MessageId | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleReactionPicker = useCallback((event: MouseEvent<HTMLElement>, messageId: MessageId) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setReactionPickerMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const openContextMenuAt = useCallback((event: ContextPoint, message: ChatMessage) => {
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

  const openContextMenu = useCallback((event: MouseEvent<HTMLElement>, message: ChatMessage) => {
    openContextMenuAt(event, message);
  }, [openContextMenuAt]);

  const startLongPress = useCallback((event: TouchEvent<HTMLElement>, message: ChatMessage) => {
    if (event.touches.length !== 1) return;
    if (longPressRef.current) clearTimeout(longPressRef.current);

    longPressRef.current = setTimeout(() => {
      const touch = event.touches[0];
      if (!touch) return;
      openContextMenuAt(
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
  }, [openContextMenuAt]);

  const endLongPress = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }, []);

  const copyMessage = useCallback(async (message: ChatMessage) => {
    if (message.deleted || typeof message.message !== "string") return;
    try {
      await copyText(message.message);
      setContextMenu(null);
    } catch (error) {
      console.error("Não foi possível copiar:", error);
    }
  }, []);

  useEffect(() => () => endLongPress(), [endLongPress]);

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
