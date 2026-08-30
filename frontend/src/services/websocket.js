const WS_URL = "ws://127.0.0.1:8000/ws";

const RECONNECT_INTERVAL = 10000;

export function createWebSocket(
  username,
  {
    onMessage,
    onOpen,
    onClose,
    onError,
    onReconnecting,
  } = {}
) {
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manuallyClosed = false;

  function connect() {
    if (manuallyClosed) return;

    socket = new WebSocket(
      `${WS_URL}?username=${encodeURIComponent(username)}`
    );

    socket.onopen = () => {
      console.log("WebSocket conectado.");
      reconnectAttempt = 0;
      onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (error) {
        console.error("Erro ao interpretar mensagem:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("Erro no WebSocket:", error);
      onError?.(error);
    };

    socket.onclose = () => {
      console.log("WebSocket desconectado.");

      if (manuallyClosed) {
        onClose?.();
        return;
      }

      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer) return;

    reconnectAttempt += 1;

    console.log(
      `Tentativa de reconexão #${reconnectAttempt} em 10s...`
    );

    onReconnecting?.(RECONNECT_INTERVAL, reconnectAttempt);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_INTERVAL);
  }

  connect();

  return {
    get socket() {
      return socket;
    },

    sendMessage(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket ainda não está conectado.");
        return false;
      }

      socket.send(
        JSON.stringify({
          type: "message",
          message,
        })
      );

      return true;
    },

    close() {
      manuallyClosed = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      socket?.close();
    },
  };
}
