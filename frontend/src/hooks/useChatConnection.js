import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "../services/websocket";

export function useChatConnection(
  enabled,
  { onMessage, onOpen, onAuthenticationRequired } = {},
) {
  const socketRef = useRef(null);
  const callbackRef = useRef({ onMessage, onOpen, onAuthenticationRequired });
  const generationRef = useRef(0);
  const activeRef = useRef(Boolean(enabled));
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(enabled ? "connecting" : "disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);

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
      setConnected(false);
      setConnectionStatus("disconnected");
      setReconnectAttempt(0);
      setReconnectSeconds(0);
      return undefined;
    }

    const generation = ++generationRef.current;
    let disposed = false;
    socketRef.current?.close();
    setConnected(false);
    setConnectionStatus("connecting");
    setReconnectAttempt(0);
    setReconnectSeconds(0);

    const socket = createWebSocket("", {
      onOpen(info) {
        if (disposed || generation !== generationRef.current) return;
        setConnected(true);
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
        setConnected(false);
        setConnectionStatus(activeRef.current ? "reconnecting" : "disconnected");
        if (activeRef.current) setReconnectSeconds(10);
      },
      onReconnecting(_delay, attempt) {
        if (disposed || generation !== generationRef.current || !activeRef.current) return;
        setConnected(false);
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
        setReconnectSeconds(10);
      },
      onAuthenticationRequired() {
        if (disposed || generation !== generationRef.current) return;
        setConnected(false);
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
  }, [enabled]);

  useEffect(() => {
    if (connectionStatus !== "reconnecting") return undefined;
    const id = window.setInterval(() => {
      setReconnectSeconds((value) => (value > 1 ? value - 1 : 10));
    }, 1000);
    return () => window.clearInterval(id);
  }, [connectionStatus]);

  return {
    socketRef,
    connected,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
  };
}
