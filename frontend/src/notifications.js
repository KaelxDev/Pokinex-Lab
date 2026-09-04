export const DIRECT_MESSAGE_EVENT = "pokinex:direct-message";
export const DIRECT_READ_EVENT = "pokinex:direct-read";

export function notifyDirectMessage(message) {
  window.dispatchEvent(new CustomEvent(DIRECT_MESSAGE_EVENT, { detail: message }));
}

export function onDirectMessage(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(DIRECT_MESSAGE_EVENT, handler);
  return () => window.removeEventListener(DIRECT_MESSAGE_EVENT, handler);
}

export function markDirectMessageRead(userId) {
  window.dispatchEvent(new CustomEvent(DIRECT_READ_EVENT, { detail: { userId } }));
}

export function onDirectMessageRead(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(DIRECT_READ_EVENT, handler);
  return () => window.removeEventListener(DIRECT_READ_EVENT, handler);
}
