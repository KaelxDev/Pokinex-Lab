import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const connectionMocks = vi.hoisted(() => ({
  callbacks: null,
  close: vi.fn(),
  createWebSocket: vi.fn(),
}));

connectionMocks.createWebSocket.mockImplementation((_url, callbacks) => {
  connectionMocks.callbacks = callbacks;
  return {
    close: connectionMocks.close,
  };
});

vi.mock("../src/services/websocket/client.ts", () => ({
  createWebSocket: connectionMocks.createWebSocket,
}));

const historyMocks = vi.hoisted(() => ({
  getMessageHistory: vi.fn(),
}));

vi.mock("../src/services/auth.ts", () => ({
  getMessageHistory: historyMocks.getMessageHistory,
}));

import { useChatConnection } from "../src/hooks/useChatConnection";
import { useChatHistory } from "../src/hooks/useChatHistory";
import { useMessageMutations } from "../src/hooks/chat/useMessageMutations";

describe("useChatConnection", () => {
  it("tracks open and reconnecting states from the WebSocket client", () => {
    const onMessage = vi.fn();
    const onOpen = vi.fn();

    const { result } = renderHook(() =>
      useChatConnection(true, { onMessage, onOpen }),
    );

    expect(result.current.connectionStatus).toBe("connecting");
    expect(connectionMocks.callbacks).toBeTruthy();

    act(() => {
      connectionMocks.callbacks.onOpen({ reconnected: false });
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.connectionStatus).toBe("connected");
    expect(onOpen).toHaveBeenCalledWith({ reconnected: false });

    act(() => {
      connectionMocks.callbacks.onReconnecting(3500, 2);
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.connectionStatus).toBe("reconnecting");
    expect(result.current.reconnectAttempt).toBe(2);
    expect(result.current.reconnectSeconds).toBe(4);
  });

  it("closes the socket and becomes disconnected when disabled", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useChatConnection(enabled),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    expect(connectionMocks.close).toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
    expect(result.current.connectionStatus).toBe("disconnected");
  });
});

describe("useChatHistory", () => {
  it("loads server history on user activation and keeps the cursor state", async () => {
    historyMocks.getMessageHistory.mockResolvedValueOnce({
      messages: [
        { type: "message", messageId: "m-1", message: "Olá" },
      ],
      nextBefore: "cursor-2",
      hasMore: true,
    });

    const { result } = renderHook(() => useChatHistory("42"));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].messageId).toBe("m-1");
    expect(historyMocks.getMessageHistory).toHaveBeenCalledWith(50, null);
  });

  it("clears the current user's local history", async () => {
    historyMocks.getMessageHistory.mockResolvedValueOnce({
      messages: [{ type: "message", messageId: "m-1", message: "Olá" }],
      nextBefore: null,
      hasMore: false,
    });

    const { result } = renderHook(() => useChatHistory("7"));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      result.current.clearLocalHistory();
    });

    expect(result.current.messages).toEqual([]);
  });
});

describe("useMessageMutations", () => {
  it("queues an offline reply with the original reply target intact", () => {
    const setMessages = vi.fn();
    const setOfflineQueue = vi.fn();
    const setMessageInput = vi.fn();
    const setReplyingTo = vi.fn();
    const setContextMenu = vi.fn();
    const setReactionPickerMessageId = vi.fn();
    const setEditingId = vi.fn();
    const setEditingText = vi.fn();
    const setEditSaving = vi.fn();
    const setEditError = vi.fn();
    const userRef = {
      current: {
        id: "1",
        username: "kael",
        role: "member",
      },
    };
    const replyingTo = {
      messageId: "parent-1",
      username: "other",
      message: "mensagem original",
    };

    const { result } = renderHook(() =>
      useMessageMutations({
        userRef,
        messageInput: "resposta",
        setMessageInput,
        replyingTo,
        setReplyingTo,
        isConnected: () => false,
        getSocket: () => null,
        setOfflineQueue,
        setMessages,
        setContextMenu,
        setReactionPickerMessageId,
        editingId: null,
        setEditingId,
        editingText: "",
        setEditingText,
        editSaving: false,
        setEditSaving,
        setEditError,
      }),
    );

    act(() => {
      result.current.sendMessage({ preventDefault: vi.fn() });
    });

    const queueUpdater = setOfflineQueue.mock.calls[0][0];
    const queued = queueUpdater([])[0];

    expect(queued.replyTo.messageId).toBe("parent-1");
    expect(queued.message).toBe("resposta");
    expect(setReplyingTo).toHaveBeenCalledWith(null);
    expect(setMessageInput).toHaveBeenCalledWith("");
  });
});
