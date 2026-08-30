const WS_URL = "ws://127.0.0.1:8000/ws";

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;

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
  let reconnectDelay = INITIAL_RECONNECT_DELAY;
  let manuallyClosed = false;

  function connect() {
    if (manuallyClosed) return;

    socket = new WebSocket(
      `${WS_URL}?username=${encodeURIComponent(username)}`
    );

    socket.onopen = () => {
      console.log("WebSocket conectado.");
      reconnectDelay = INITIAL_RECONNECT_DELAY;
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
      onClose?.();

      if (!manuallyClosed) {
        scheduleReconnect();
      }
    };
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer) return;

    console.log(
      `Tentando reconectar em ${reconnectDelay / 1000}s...`
    );
    onReconnecting?.(reconnectDelay);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
      reconnectDelay = Math.min(
        reconnectDelay * 2,
        MAX_RECONNECT_DELAY
      );
    }, reconnectDelay);
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
