export const DM_EVENT = "pokinex:direct-message";

const listeners = new Set();
const readListeners = new Set();

export function notifyDirectMessage(message) {
  listeners.forEach((listener) => listener(message));
  window.dispatchEvent(new CustomEvent(DM_EVENT, { detail: message }));
}

export function onDirectMessage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markDirectMessageRead(userId) {
  readListeners.forEach((listener) => listener({ userId }));
  window.dispatchEvent(new CustomEvent("pokinex:direct-message-read", { detail: { userId } }));
}

export function onDirectMessageRead(listener) {
  readListeners.add(listener);
  return () => readListeners.delete(listener);
}
