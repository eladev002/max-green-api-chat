import { useCallback, useState } from 'react'

import { ChatView } from '@/components/ChatView'
import { LoginForm } from '@/components/LoginForm'
import { Sidebar } from '@/components/Sidebar'
import { API_BASE_URL, ENV_ID_INSTANCE, ENV_TOKEN_INSTANCE } from '@/config/constants'
import { useChat } from '@/hooks/useChat'
import { useSession } from '@/hooks/useSession'
import type { Credentials } from '@/types/domain'

/**
 * Root component.
 *
 * Two states only: the login screen while there is no verified instance, and
 * the two-pane chat once `getSettings` has accepted the credentials.
 */
export default function App() {
  const session = useSession()

  // The chat state must be owned by a component that only exists once a client
  // is available, so hooks stay unconditional and stable.
  if (session.status === 'checking') {
    return (
      <div className="splash">
        <span className="spinner" aria-hidden="true" />
        <span>Проверяем подключение к GREEN-API…</span>
      </div>
    )
  }

  if (session.status === 'anonymous' || !session.client) {
    return (
      <LoginForm
        onSubmit={(credentials: Credentials) => {
          void session.signIn(credentials).catch(() => {
            // The error is already surfaced by `session.error`.
          })
        }}
        isSubmitting={session.isSubmitting}
        error={session.error}
        initial={
          session.credentials ?? {
            idInstance: ENV_ID_INSTANCE,
            apiTokenInstance: ENV_TOKEN_INSTANCE,
            apiBaseUrl: API_BASE_URL,
          }
        }
      />
    )
  }

  return <ChatScreen session={session} />
}

type Session = ReturnType<typeof useSession>

/** The authenticated shell: sidebar + conversation. */
function ChatScreen({ session }: { session: Session }) {
  const chat = useChat(session.client)
  const [mobileListVisible, setMobileListVisible] = useState(false)

  const hasActiveChat = Boolean(chat.conversations.activeChatId)

  const handleSelect = useCallback(
    (chatId: string) => {
      chat.conversations.selectConversation(chatId)
      setMobileListVisible(false)
    },
    [chat.conversations],
  )

  const handleStartChat = useCallback(
    (phone: string) => {
      const problem = chat.startChat(phone)
      if (!problem) setMobileListVisible(false)
      return problem
    },
    [chat],
  )

  const handleSignOut = useCallback(() => {
    session.signOut()
  }, [session])

  return (
    <div
      className={`app${
        hasActiveChat && !mobileListVisible ? ' app--chat-open' : ' app--list'
      }`}
    >
      <Sidebar
        conversations={chat.conversations.conversations}
        activeChatId={chat.conversations.activeChatId}
        idInstance={session.credentials?.idInstance ?? ''}
        pollingStatus={chat.polling.status}
        processedCount={chat.polling.processedCount}
        pollingError={chat.polling.lastError}
        onSelect={handleSelect}
        onStartChat={handleStartChat}
        onSignOut={handleSignOut}
      />

      <ChatView
        chat={chat}
        onCloseChat={() => setMobileListVisible(true)}
        onRetry={(messageId, text, chatId) => {
          void chat.retryMessage(messageId, text, chatId)
        }}
      />
    </div>
  )
}
