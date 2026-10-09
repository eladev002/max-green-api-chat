import type {
  GreenApiNotificationBody,
  MessageData,
  MessageNotificationBody,
} from '@/types/greenapi'

/**
 * Normalised result of interpreting one GREEN-API notification.
 * `null` means "not a text message we can display" (typing, delivery receipt,
 * call, state change, non-text message such as an image or a poll, …).
 */
export interface InboundTextMessage {
  idMessage: string
  chatId: string
  text: string
  timestamp: number
  sender: string
  senderName?: string
  direction: 'incoming' | 'outgoing'
}

/**
 * Message types GREEN-API can deliver that never carry displayable text.
 *
 * `extendedTextMessage` is deliberately NOT in this list: it is a text message
 * with a link preview or a quote, and its text arrives in
 * `extendedTextMessageData.textMessage`, which `extractText` reads.
 */
const NON_TEXT_MESSAGE_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'documentMessage',
  'audioMessage',
  'stickerMessage',
  'contactMessage',
  'contactsArrayMessage',
  'locationMessage',
  'templateMessage',
  'pollMessage',
  'pollUpdateMessage',
  'reactionMessage',
  'buttonsMessage',
  'listMessage',
  'groupInviteMessage',
  'orderMessage',
  'productMessage',
  'interactiveButtons',
  'interactiveButtonsReply',
])

/** Notification types that may carry a displayable text message. */
const MESSAGE_NOTIFICATION_TYPES = new Set([
  'incomingMessageReceived',
  // Sent from the user's phone: `idMessage` is brand new to us, so it can be
  // rendered without risking a duplicate of an optimistic bubble.
  'outgoingMessageReceived',
  // NOTE: `outgoingAPIMessageReceived` is intentionally NOT handled. It has no
  // documented guarantee that `idMessage` equals the value returned by
  // sendMessage, and the provider docs even state the notification is skipped
  // for non-existing accounts. Rendering it could therefore duplicate a
  // message this app already shows optimistically.
])

/** True for the three webhooks that carry `senderData` + `messageData`. */
function isMessageNotification(
  body: GreenApiNotificationBody,
): body is MessageNotificationBody {
  return MESSAGE_NOTIFICATION_TYPES.has(body.typeWebhook)
}

function extractText(body: MessageNotificationBody): string {
  const data: MessageData | undefined = body.messageData

  const direct = data?.textMessageData?.textMessage
  if (typeof direct === 'string' && direct.length > 0) return direct

  // Quoted/replied messages and link previews arrive as extended text.
  const extended = data?.extendedTextMessageData?.textMessage
  if (typeof extended === 'string' && extended.length > 0) return extended

  return ''
}

/**
 * Convert a raw notification body into a displayable text message.
 *
 * Outgoing messages are marked so the UI keeps them on the right-hand side.
 * `incomingMessageReceived` is the only type that can be a non-text message in
 * practice, but the `typeMessage` guard is applied to every message webhook.
 */
export function toInboundTextMessage(
  body: GreenApiNotificationBody,
): InboundTextMessage | null {
  if (!isMessageNotification(body)) return null

  const idMessage = body.idMessage
  if (!idMessage) return null

  const typeMessage = body.messageData?.typeMessage
  if (typeMessage && NON_TEXT_MESSAGE_TYPES.has(typeMessage)) return null

  const text = extractText(body)
  if (!text) return null

  const senderData = body.senderData
  const chatId = senderData?.chatId
  if (!chatId) return null

  const direction =
    body.typeWebhook === 'incomingMessageReceived' ? 'incoming' : 'outgoing'

  const sender = senderData?.sender ?? chatId.replace(/@[\w.]+$/, '')

  return {
    idMessage,
    chatId,
    text,
    timestamp: body.timestamp ?? Math.floor(Date.now() / 1000),
    sender,
    senderName: senderData?.senderName ?? senderData?.chatName,
    direction,
  }
}
