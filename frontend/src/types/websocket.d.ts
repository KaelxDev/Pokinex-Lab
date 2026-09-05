export type MessageId = string | number;

export interface ReplyTo {
  messageId: MessageId;
  username?: string;
  displayName?: string;
}

export const WebSocketEventType: {
  readonly MESSAGE: "message";
  readonly DIRECT_MESSAGE: "direct_message";
  readonly DIRECT_MESSAGE_EDIT: "direct_message_edit";
  readonly DIRECT_MESSAGE_DELETE: "direct_message_delete";
  readonly DIRECT_MESSAGE_REACTION: "direct_message_reaction";
  readonly EDIT_MESSAGE: "edit_message";
  readonly DELETE_MESSAGE: "delete_message";
  readonly REACTION: "reaction";
};

export interface MessagePayload {
  type: "message";
  message: string;
  messageId: MessageId | null;
  replyTo?: ReplyTo;
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
