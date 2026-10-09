import { useCallback, useState } from 'react'

import { GreenApiError } from '@/api/errors'
import type { GreenApiClient } from '@/api/greenApiClient'
import type { InboundTextMessage } from '@/api/normalizeNotification'
import { useConversations } from '@/hooks/useConversations'
import type { UseConversationsResult } from '@/hooks/useConversations'
import { useGreenApiPolling } from '@/hooks/useGreenApiPolling'
import type { PollingStatus } from '@/hooks/useGreenApiPolling'
import { isValidPhone, nowInSeconds, toChatId } from '@/utils/format'

export interface UseChatResult {
  conversations: UseConversationsResult
  polling: {
    status: PollingStatus
    processedCount: number
    lastError: string | null
    instanceState: string | null
  }
  sendError: string | null
  isSending: boolean
  clearSendError: () => void
  /** Creates (or focuses) a chat for a phone number. Returns an error text. */
  startChat: (rawPhone: string) => string | null
  /** Sends a text message to the active chat. */
  sendMessage: (text: string) => Promise<void>
  /** Re-sends a message that previously failed. */
  retryMessage: (messageId: string, text: string, chatId: string) => Promise<void>
}

/**
 * Application controller: wires the GREEN-API client to the chat store.
 *
 * Sending is optimistic — the bubble appears immediately as `pending` and is
 * reconciled with the provider's `idMessage`, or flagged as `failed` with a
 * retry possibility. Receiving runs as a continuous long-poll.
 */
export function useChat(client: GreenApiClient | null): UseChatResult {
  const conversations = useConversations()

  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // The store exposes stable callbacks, so these handlers never change
  // identity and therefore never restart the polling loop.
  const {
    addIncomingMessage,
    ensureConversation,
    addOutgoingMessage,
    confirmOutgoingMessage,
    failOutgoingMessage,
    removeMessage,
    selectConversation,
  } = conversations

  const handleIncoming = useCallback(
    (message: InboundTextMessage) => {
      addIncomingMessage(message)
    },
    [addIncomingMessage],
  )

  const polling = useGreenApiPolling({ client, onMessage: handleIncoming })

  const clearSendError = useCallback(() => setSendError(null), [])

  const startChat = useCallback(
    (rawPhone: string): string | null => {
      const trimmed = rawPhone.trim()
      if (!trimmed) return 'Введите номер телефона.'

      if (!/^[\d\s()+-]+$/.test(trimmed)) {
        return 'Номер может содержать только цифры, пробелы, «+», «-» и скобки.'
      }

      if (!isValidPhone(trimmed)) {
        return 'Похоже, номер введён не полностью. Укажите номер в формате +7 999 123-45-67.'
      }

      const chatId = toChatId(trimmed)
      ensureConversation(chatId)
      selectConversation(chatId)
      return null
    },
    [ensureConversation, selectConversation],
  )

  const sendTo = useCallback(
    async (chatId: string, text: string, options: { replaceId?: string } = {}) => {
      if (!client) return

      const trimmed = text.trim()
      if (!trimmed) return

      setSendError(null)
      setIsSending(true)
      if (options.replaceId) removeMessage(options.replaceId)

      const localId = addOutgoingMessage({ chatId, text: trimmed })

      try {
        const response = await client.sendMessage({ chatId, message: trimmed })
        confirmOutgoingMessage(localId, {
          idMessage: response.idMessage,
          timestamp: nowInSeconds(),
        })
      } catch (cause) {
        const message =
          cause instanceof GreenApiError
            ? cause.friendlyMessage
            : 'Не удалось отправить сообщение.'
        failOutgoingMessage(localId, message)
        setSendError(message)
      } finally {
        setIsSending(false)
      }
    },
    [
      client,
      addOutgoingMessage,
      confirmOutgoingMessage,
      failOutgoingMessage,
      removeMessage,
    ],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      const chatId = conversations.activeChatId
      if (!chatId) return
      await sendTo(chatId, text)
    },
    [conversations.activeChatId, sendTo],
  )

  const retryMessage = useCallback(
    async (messageId: string, text: string, chatId: string) => {
      await sendTo(chatId, text, { replaceId: messageId })
    },
    [sendTo],
  )

  return {
    conversations,
    polling,
    sendError,
    isSending,
    clearSendError,
    startChat,
    sendMessage,
    retryMessage,
  }
}
