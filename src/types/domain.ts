/** GREEN-API connection credentials entered by the user on the login screen. */
export interface Credentials {
  /** `idInstance` from the GREEN-API console, e.g. `1101000000`. */
  idInstance: string
  /** `apiTokenInstance` from the GREEN-API console. */
  apiTokenInstance: string
  /** Optional base URL override; falls back to `VITE_GREEN_API_BASE_URL`. */
  apiBaseUrl?: string
}

export type MessageDirection = 'incoming' | 'outgoing'

/**
 * `pending`  — optimistic bubble shown before the API confirms the send.
 * `sent`     — the API accepted the message.
 * `failed`   — the send attempt failed (offers a retry).
 */
export type MessageStatus = 'pending' | 'sent' | 'failed'

/** A single chat message as rendered in the UI. */
export interface ChatMessage {
  /** `idMessage` when known, otherwise a locally generated id. */
  id: string
  /** GREEN-API chat id, e.g. `79991234567@c.us`. */
  chatId: string
  direction: MessageDirection
  /** Message text (`textMessageData.textMessage`). */
  text: string
  /** Unix timestamp in seconds. */
  timestamp: number
  /** Phone number / id of the counterparty. */
  sender: string
  /** Display name of the sender when the API provides one. */
  senderName?: string
  status: MessageStatus
  /** Error text for a failed outgoing message. */
  error?: string
}

/** One conversation (always a one-to-one chat in this app). */
export interface Conversation {
  chatId: string
  /** Digits extracted from `chatId` (without the `@c.us` suffix). */
  phone: string
  /** Name shown in the sidebar; defaults to the formatted phone number. */
  displayName: string
  messages: ChatMessage[]
  updatedAt: number
  unreadCount: number
}
