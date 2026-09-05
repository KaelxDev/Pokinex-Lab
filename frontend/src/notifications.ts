export const DIRECT_MESSAGE_EVENT = "pokinex:direct-message";
export const DIRECT_READ_EVENT = "pokinex:direct-read";

export interface DirectMessageNotification {
  [key: string]: unknown;
}

export function notifyDirectMessage(message: DirectMessageNotification): void {
  window.dispatchEvent(new CustomEvent(DIRECT_MESSAGE_EVENT, { detail: message }));
}

export function onDirectMessage(callback: (message: DirectMessageNotification) => void): () => void {
  const handler = (event: Event) => callback((event as CustomEvent<DirectMessageNotification>).detail);
  window.addEventListener(DIRECT_MESSAGE_EVENT, handler);
  return () => window.removeEventListener(DIRECT_MESSAGE_EVENT, handler);
}

export function markDirectMessageRead(userId: string | number): void {
  window.dispatchEvent(new CustomEvent(DIRECT_READ_EVENT, { detail: { userId } }));
}

export function onDirectMessageRead(callback: (detail: { userId: string | number }) => void): () => void {
  const handler = (event: Event) => callback((event as CustomEvent<{ userId: string | number }>).detail);
  window.addEventListener(DIRECT_READ_EVENT, handler);
  return () => window.removeEventListener(DIRECT_READ_EVENT, handler);
}
