import { useCallback, useEffect, useRef, useState } from "react";
import { createWebSocket } from "../services/websocket/client.ts";
import type { WebSocketClient, ServerEvent } from "../services/websocket/client.ts";
import type { DeliveryFailedEvent } from "../types/websocket";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
type ChatMessageEvent = ServerEvent | DeliveryFailedEvent;

export interface ChatConnectionCallbacks {
  onMessage?: (data: ChatMessageEvent) => void;
  onOpen?: (info: { reconnected: boolean }) => void;
  onAuthenticationRequired?: () => void;
}

export interface ChatConnectionState {
  socketRef: ReturnType<typeof useRef<WebSocketClient | null>>;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  reconnectSeconds: number;
  isConnected: () => boolean;
  getSocket: () => WebSocketClient | null;
}

export function useChatConnection(
  enabled: boolean,
  { onMessage, onOpen, onAuthenticationRequired }: ChatConnectionCallbacks = {},
): ChatConnectionState {
  const socketRef = useRef<WebSocketClient | null>(null);
  const connectedRef = useRef(false);
  const callbackRef = useRef<ChatConnectionCallbacks>({
    onMessage,
    onOpen,
    onAuthenticationRequired,
  });
  const generationRef = useRef(0);
  const activeRef = useRef(Boolean(enabled));
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    enabled ? "connecting" : "disconnected",
  );
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);

  const updateConnected = useCallback((value: boolean) => {
    connectedRef.current = value;
    setConnected(value);
  }, []);

  const isConnected = useCallback(() => connectedRef.current, []);
  const getSocket = useCallback(() => socketRef.current, []);

  useEffect(() => {
    callbackRef.current = { onMessage, onOpen, onAuthenticationRequired };
  }, [onMessage, onOpen, onAuthenticationRequired]);

  useEffect(() => {
    activeRef.current = Boolean(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      socketRef.current?.close();
      socketRef.current = null;
      updateConnected(false);
      setConnectionStatus("disconnected");
      setReconnectAttempt(0);
      setReconnectSeconds(0);
      return undefined;
    }

    const generation = ++generationRef.current;
    let disposed = false;
    socketRef.current?.close();
    updateConnected(false);
    setConnectionStatus("connecting");
    setReconnectAttempt(0);
    setReconnectSeconds(0);

    const socket = createWebSocket("", {
      onOpen(info) {
        if (disposed || generation !== generationRef.current) return;
        updateConnected(true);
        setConnectionStatus("connected");
        setReconnectAttempt(0);
        setReconnectSeconds(0);
        callbackRef.current.onOpen?.(info);
      },
      onMessage(data) {
        if (disposed || generation !== generationRef.current) return;
        callbackRef.current.onMessage?.(data);
      },
      onClose() {
        if (disposed || generation !== generationRef.current) return;
        updateConnected(false);
        setConnectionStatus(activeRef.current ? "reconnecting" : "disconnected");
        if (activeRef.current) setReconnectSeconds(0);
      },
      onReconnecting(delay, attempt) {
        if (disposed || generation !== generationRef.current || !activeRef.current) return;
        updateConnected(false);
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
        setReconnectSeconds(Math.max(1, Math.ceil(delay / 1000)));
      },
      onAuthenticationRequired() {
        if (disposed || generation !== generationRef.current) return;
        updateConnected(false);
        setConnectionStatus("disconnected");
        setReconnectAttempt(0);
        setReconnectSeconds(0);
        callbackRef.current.onAuthenticationRequired?.();
      },
      onError: (error) => console.error("Erro no WebSocket:", error),
    });

    socketRef.current = socket;

    return () => {
      disposed = true;
      ++generationRef.current;
      socket.close();
    };
  }, [enabled, updateConnected]);

  useEffect(() => {
    if (connectionStatus !== "reconnecting") return undefined;
    const id = window.setInterval(() => {
      setReconnectSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [connectionStatus]);

  return {
    socketRef,
    connected,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
    isConnected,
    getSocket,
  };
}
