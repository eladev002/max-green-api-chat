/**
 * Wire types for the GREEN-API v3 HTTP interface.
 *
 * Only the fields this app actually reads are declared; the API returns more.
 * Docs: https://green-api.com/en/docs/api/
 */

/** Response of `GET /waInstance{id}/getSettings/{token}`. */
export interface GreenApiSettings {
  wid?: string
  countryInstance?: string
  typeAccount?: string
  webhookUrl?: string
  webhookUrlToken?: string
  delaySendMessagesMilliseconds?: number
  markIncomingMessagesReaded?: string
  outgoingWebhook?: string
  stateWebhook?: string
  incomingWebhook?: string
  deviceWebhook?: string
  statusInstanceWebhook?: string
  [key: string]: unknown
}

/** Request body of `POST /waInstance{id}/sendMessage/{token}`. */
export interface SendMessageRequest {
  chatId: string
  message: string
  /** Quote a previously received message by its `idMessage`. */
  quotedMessageId?: string
}

/** Response of `POST /waInstance{id}/sendMessage/{token}`. */
export interface SendMessageResponse {
  idMessage: string
}

/** Response of `GET /waInstance{id}/receiveNotification/{token}` (empty queue). */
export interface ReceiveNotificationResponse {
  receiptId: number
  body: GreenApiNotificationBody
}

export interface DeleteNotificationResponse {
  result: boolean
}

/* -------------------------------------------------------------------------- */
/* Notification bodies                                                        */
/* -------------------------------------------------------------------------- */

export interface SenderData {
  chatId?: string
  chatName?: string
  sender?: string
  senderName?: string
  senderContactName?: string
  [key: string]: unknown
}

export interface TextMessageData {
  textMessage?: string
  [key: string]: unknown
}

export interface MessageData {
  typeMessage?: string
  textMessageData?: TextMessageData
  extendedTextMessageData?: TextMessageData
  [key: string]: unknown
}

/** Fields shared by every notification body. */
export interface NotificationBodyBase {
  typeWebhook: string
  instanceData?: {
    idInstance?: number
    wid?: string
    typeInstance?: string
  }
  timestamp?: number
  idMessage?: string
  senderData?: SenderData
}

/** `incomingMessageReceived` / `outgoingMessageReceived` / `outgoingAPIMessageReceived`. */
export interface MessageNotificationBody extends NotificationBodyBase {
  typeWebhook:
    | 'incomingMessageReceived'
    | 'outgoingMessageReceived'
    | 'outgoingAPIMessageReceived'
  messageData?: MessageData
}

/** `outgoingMessageStatus` — delivery/read receipts for a sent message. */
export interface OutgoingMessageStatusBody extends NotificationBodyBase {
  typeWebhook: 'outgoingMessageStatus'
  status?: string
  description?: string
}

/** `stateInstanceChanged` — e.g. `authorized` / `notAuthorized`. */
export interface StateInstanceChangedBody extends NotificationBodyBase {
  typeWebhook: 'stateInstanceChanged'
  stateInstance?: string
}

/** `incomingCall` / `outgoingCall`. */
export interface IncomingCallBody extends NotificationBodyBase {
  typeWebhook: 'incomingCall' | 'outgoingCall'
  [key: string]: unknown
}

/**
 * Any other notification type (`deviceInfo`, `quotaExceeded`, …), kept opaque.
 *
 * `messageData` is declared as `undefined` so the discriminated union still
 * narrows correctly: an index signature here would swallow the narrowing and
 * make `'messageData' in body` checks useless to the compiler.
 */
export interface UnknownNotificationBody extends NotificationBodyBase {
  messageData?: undefined
}

export type GreenApiNotificationBody =
  | MessageNotificationBody
  | OutgoingMessageStatusBody
  | StateInstanceChangedBody
  | IncomingCallBody
  | UnknownNotificationBody

/** Shape of every error payload GREEN-API returns (HTTP 4xx/5xx). */
export interface GreenApiErrorPayload {
  code?: number
  message?: string
  description?: string
}
