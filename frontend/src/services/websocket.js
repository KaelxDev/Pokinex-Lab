const WS_URL = "ws://127.0.0.1:8000/ws";

export function createWebSocket(
  username,
  {
    onMessage,
    onOpen,
    onClose,
    onError,
  } = {}
) {
  const socket = new WebSocket(
    `${WS_URL}?username=${encodeURIComponent(username)}`
  );

  socket.onopen = () => {
    console.log("WebSocket conectado.");
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
  };

  return {
    socket,

    sendMessage(message) {
      if (socket.readyState !== WebSocket.OPEN) {
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
      socket.close();
    },
  };
}
