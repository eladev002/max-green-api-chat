import { Composer } from '@/components/Composer'
import { BackIcon, ChatIcon } from '@/components/Icons'
import { MessageList } from '@/components/MessageList'
import type { UseChatResult } from '@/hooks/useChat'
import { formatPhone } from '@/utils/format'

interface ChatViewProps {
  chat: UseChatResult
  /** Called when the user goes back to the list on small screens. */
  onCloseChat: () => void
  onRetry: (messageId: string, text: string, chatId: string) => void
}

/** Header + message list + composer for the active conversation. */
export function ChatView({ chat, onCloseChat, onRetry }: ChatViewProps) {
  const conversation = chat.conversations.activeConversation

  if (!conversation) {
    return (
      <section className="chat">
        <div className="placeholder">
          <div className="placeholder__inner">
            <div className="placeholder__icon" aria-hidden="true">
              <ChatIcon size={34} />
            </div>
            <h2 className="placeholder__title">Выберите чат</h2>
            <p className="placeholder__text">
              Введите номер телефона получателя в поле слева — откроется новый
              чат. Сообщения приходят автоматически, отвечать можно сразу.
            </p>
          </div>
        </div>
      </section>
    )
  }

  const lastIncoming = [...conversation.messages]
    .reverse()
    .find((message) => message.direction === 'incoming')
  const lastSeen = lastIncoming
    ? `был(а) в сети ${new Date(lastIncoming.timestamp * 1000).toLocaleString(
        undefined,
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' },
      )}`
    : 'нет входящих сообщений'

  return (
    <section className="chat">
      <header className="chat__header">
        <button
          type="button"
          className="chat__back"
          onClick={onCloseChat}
          aria-label="К списку чатов"
        >
          <BackIcon />
        </button>

        <span className="chat__avatar" aria-hidden="true">
          {(conversation.displayName || conversation.phone)
            .slice(0, 2)
            .toUpperCase()}
        </span>

        <div className="chat__heading">
          <h2 className="chat__name">
            {conversation.displayName || formatPhone(conversation.phone)}
          </h2>
          <span className="chat__meta">
            {conversation.phone ? `+${conversation.phone} · ` : ''}
            {lastSeen}
          </span>
        </div>
      </header>

      <MessageList
        messages={conversation.messages}
        onRetry={(message) =>
          onRetry(message.id, message.text, conversation.chatId)
        }
      />

      <Composer
        onSend={(text) => void chat.sendMessage(text)}
        isSending={chat.isSending}
        error={chat.sendError}
        onDismissError={chat.clearSendError}
      />
    </section>
  )
}
