import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  ChatMessage,
  Conversation,
  MessageDirection,
  MessageStatus,
} from '@/types/domain'
import {
  chatIdToPhone,
  formatPhone,
  nowInSeconds,
  storage,
} from '@/utils/format'

/** Newest N messages kept per conversation to bound localStorage growth. */
const MAX_MESSAGES_PER_CHAT = 500

/** Debounce for persisting the whole conversation list. */
const PERSIST_DEBOUNCE_MS = 350

export interface IncomingMessageInput {
  idMessage: string
  chatId: string
  text: string
  timestamp: number
  sender: string
  senderName?: string
  direction: MessageDirection
}

export interface SendMessageInput {
  chatId: string
  text: string
  /** Locally generated id, returned so the caller can update status later. */
  localId: string
}

export interface UseConversationsResult {
  conversations: Conversation[]
  activeChatId: string | null
  activeConversation: Conversation | null
  totalUnread: number
  setActiveChatId: (chatId: string | null) => void
  ensureConversation: (chatId: string) => void
  /** Adds an incoming/outgoing message. Returns false if it was a duplicate. */
  addIncomingMessage: (input: IncomingMessageInput) => boolean
  /** Appends an optimistic outgoing bubble, returns its local id. */
  addOutgoingMessage: (input: { chatId: string; text: string }) => string
  /** Marks an optimistic message as accepted, adopting the server id. */
  confirmOutgoingMessage: (
    localId: string,
    server: { idMessage: string; timestamp: number },
  ) => void
  /** Marks an optimistic message as failed. */
  failOutgoingMessage: (localId: string, error: string) => void
  /** Drops a message (used before retrying a failed send). */
  removeMessage: (messageId: string) => void
  selectConversation: (chatId: string) => void
  clearAll: () => void
}

/** Sorts by timestamp, then keeps insertion order for equal timestamps. */
function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp)
}

function withMessages(
  conversation: Conversation,
  updater: (messages: ChatMessage[]) => ChatMessage[],
): Conversation {
  const messages = sortMessages(updater(conversation.messages)).slice(
    -MAX_MESSAGES_PER_CHAT,
  )
  const updatedAt = messages.length
    ? messages[messages.length - 1].timestamp
    : conversation.updatedAt

  return { ...conversation, messages, updatedAt }
}

/**
 * Owns the whole chat state: conversations, messages, unread counters and
 * persistence. Deliberately a plain hook (no Redux) so the data flow is easy
 * to follow during review.
 */
export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    storage.loadConversations(),
  )
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null)

  /** Latest value for callbacks that must not be re-created on every change. */
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations

  /* ---------------------------------------------------------------------- */
  /* persistence                                                            */
  /* ---------------------------------------------------------------------- */

  const persistTimer = useRef<number | null>(null)

  useEffect(() => {
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current)
    }
    persistTimer.current = window.setTimeout(() => {
      storage.saveConversations(conversations)
    }, PERSIST_DEBOUNCE_MS)

    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current)
      }
    }
  }, [conversations])

  // Flush pending writes when the tab closes so nothing is lost.
  useEffect(() => {
    const flush = () => storage.saveConversations(conversationsRef.current)
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  /* ---------------------------------------------------------------------- */
  /* mutations                                                              */
  /* ---------------------------------------------------------------------- */

  const setActiveChatId = useCallback((chatId: string | null) => {
    setActiveChatIdState(chatId)
    if (!chatId) return

    // Opening a chat clears its unread badge.
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.chatId === chatId && conversation.unreadCount > 0
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    )
  }, [])

  const ensureConversation = useCallback((chatId: string) => {
    setConversations((previous) => {
      if (previous.some((conversation) => conversation.chatId === chatId)) {
        return previous
      }
      const phone = chatIdToPhone(chatId)
      const now = nowInSeconds()
      return [
        {
          chatId,
          phone,
          displayName: formatPhone(phone),
          messages: [],
          updatedAt: now,
          unreadCount: 0,
        },
        ...previous,
      ]
    })
  }, [])

  const addIncomingMessage = useCallback(
    (input: IncomingMessageInput): boolean => {
      const exists = conversationsRef.current.some(
        (conversation) =>
          conversation.chatId === input.chatId &&
          conversation.messages.some((message) => message.id === input.idMessage),
      )
      if (exists) return false

      setConversations((previous) => {
        const phone = chatIdToPhone(input.chatId)
        const known = previous.find(
          (conversation) => conversation.chatId === input.chatId,
        )
        const base: Conversation =
          known ?? {
            chatId: input.chatId,
            phone,
            displayName: input.senderName?.trim() || formatPhone(phone),
            messages: [],
            updatedAt: input.timestamp,
            unreadCount: 0,
          }

        const isActive = input.chatId === activeChatId
        const shouldCountUnread =
          input.direction === 'incoming' && !isActive

        const message: ChatMessage = {
          id: input.idMessage,
          chatId: input.chatId,
          direction: input.direction,
          text: input.text,
          timestamp: input.timestamp,
          sender: input.sender,
          senderName: input.senderName,
          status: 'sent',
        }

        const next: Conversation = {
          ...withMessages(base, (messages) => [...messages, message]),
          // Adopt a nicer display name once the API tells us one.
          displayName:
            input.direction === 'incoming' && input.senderName?.trim()
              ? input.senderName.trim()
              : base.displayName,
          unreadCount: base.unreadCount + (shouldCountUnread ? 1 : 0),
        }

        const others = previous.filter(
          (conversation) => conversation.chatId !== input.chatId,
        )
        return [next, ...others]
      })

      return true
    },
    [activeChatId],
  )

  const addOutgoingMessage = useCallback(
    ({ chatId, text }: { chatId: string; text: string }): string => {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const timestamp = nowInSeconds()

      setConversations((previous) => {
        const phone = chatIdToPhone(chatId)
        const known = previous.find(
          (conversation) => conversation.chatId === chatId,
        )
        const base: Conversation =
          known ?? {
            chatId,
            phone,
            displayName: formatPhone(phone),
            messages: [],
            updatedAt: timestamp,
            unreadCount: 0,
          }

        const message: ChatMessage = {
          id: localId,
          chatId,
          direction: 'outgoing',
          text,
          timestamp,
          sender: 'me',
          status: 'pending',
        }

        const next: Conversation = withMessages(base, (messages) => [
          ...messages,
          message,
        ])

        return [next, ...previous.filter((item) => item.chatId !== chatId)]
      })

      return localId
    },
    [],
  )

  const confirmOutgoingMessage = useCallback(
    (localId: string, server: { idMessage: string; timestamp: number }) => {
      setConversations((previous) =>
        previous.map((conversation) => {
          if (!conversation.messages.some((message) => message.id === localId)) {
            return conversation
          }
          const messages = conversation.messages.map((message) =>
            message.id === localId
              ? {
                  ...message,
                  id: server.idMessage,
                  timestamp: server.timestamp || message.timestamp,
                  status: 'sent' as MessageStatus,
                  error: undefined,
                }
              : message,
          )
          return { ...conversation, messages: sortMessages(messages) }
        }),
      )
    },
    [],
  )

  const failOutgoingMessage = useCallback((localId: string, error: string) => {
    setConversations((previous) =>
      previous.map((conversation) => {
        if (!conversation.messages.some((message) => message.id === localId)) {
          return conversation
        }
        return {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === localId
              ? { ...message, status: 'failed' as MessageStatus, error }
              : message,
          ),
        }
      }),
    )
  }, [])

  const removeMessage = useCallback((messageId: string) => {
    setConversations((previous) =>
      previous.map((conversation) => {
        if (!conversation.messages.some((message) => message.id === messageId)) {
          return conversation
        }
        return {
          ...conversation,
          messages: conversation.messages.filter(
            (message) => message.id !== messageId,
          ),
        }
      }),
    )
  }, [])

  const selectConversation = useCallback(    (chatId: string) => setActiveChatId(chatId),
    [setActiveChatId],
  )

  const clearAll = useCallback(() => {
    setConversations([])
    setActiveChatIdState(null)
    storage.saveConversations([])
  }, [])

  /* ---------------------------------------------------------------------- */
  /* derived values                                                         */
  /* ---------------------------------------------------------------------- */

  const activeConversation = useMemo(
    () =>
      activeChatId
        ? (conversations.find(
            (conversation) => conversation.chatId === activeChatId,
          ) ?? null)
        : null,
    [conversations, activeChatId],
  )

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
    [conversations],
  )

  return {
    conversations,
    activeChatId,
    activeConversation,
    totalUnread,
    setActiveChatId,
    ensureConversation,
    addIncomingMessage,
    addOutgoingMessage,
    confirmOutgoingMessage,
    failOutgoingMessage,
    removeMessage,
    selectConversation,
    clearAll,
  }
}
