export type MessageId = string | number;
export type ReplyTo = MessageId;

export interface MessagePayload {
  type: "message";
  message: string;
  messageId: MessageId | null;
  replyTo?: ReplyTo | null;
}

export interface DirectMessagePayload {
  type: "direct_message";
  message: string;
  messageId: MessageId | null;
  recipientId: number;
  replyTo: ReplyTo | null;
}

export interface DeliveryFailedEvent {
  type: "delivery_failed";
  messageId: MessageId;
  message: string;
  replyTo: ReplyTo | null;
}

export type OutgoingMessagePayload = MessagePayload | DirectMessagePayload;

export interface DeliveryTrackerOptions {
  onFailed?: (event: DeliveryFailedEvent) => void;
  timeoutMs?: number;
}
