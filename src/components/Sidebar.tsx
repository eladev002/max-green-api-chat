import { useState } from 'react'

import type { Conversation } from '@/types/domain'
import { formatConversationTime } from '@/utils/format'

import { LogoIcon } from './Icons'
import type { PollingStatus } from '@/hooks/useGreenApiPolling'

interface NewChatFormProps {
  onStart: (phone: string) => string | null
}

/** Phone-number entry that creates (or focuses) a conversation. */
export function NewChatForm({ onStart }: NewChatFormProps) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const problem = onStart(phone)
    setError(problem)
    if (!problem) setPhone('')
  }

  return (
    <form className="new-chat" onSubmit={submit} noValidate>
      <div className="new-chat__row">
        <label className="sr-only" htmlFor="new-chat-phone">
          Номер телефона
        </label>
        <input
          id="new-chat-phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="+7 999 123-45-67"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value)
            if (error) setError(null)
          }}
        />
        <button className="btn btn--primary" type="submit">
          Начать
        </button>
      </div>

      {error && (
        <span className="field__hint" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      )}
    </form>
  )
}

interface StatusBadgeProps {
  status: PollingStatus
  processedCount: number
  lastError: string | null
}

function StatusBadge({ status, processedCount, lastError }: StatusBadgeProps) {
  const label =
    status === 'listening'
      ? 'Приём сообщений активен'
      : status === 'error'
        ? 'Ошибка приёма сообщений'
        : 'Приём приостановлен'

  return (
    <div
      className={`status status--${status}`}
      title={lastError ?? `${label}. Обработано уведомлений: ${processedCount}`}
    >
      <span className="status__dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

interface SidebarProps {
  conversations: Conversation[]
  activeChatId: string | null
  idInstance: string
  pollingStatus: PollingStatus
  processedCount: number
  pollingError: string | null
  onSelect: (chatId: string) => void
  onStartChat: (phone: string) => string | null
  onSignOut: () => void
}

function initials(conversation: Conversation): string {
  const name = conversation.displayName.trim()
  if (name) {
    const letters = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/)
    if (letters.length >= 2) {
      return (letters[0][0] + letters[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return conversation.phone.slice(-2)
}

function preview(conversation: Conversation): string {
  const last = conversation.messages[conversation.messages.length - 1]
  if (!last) return 'Нет сообщений'
  const prefix = last.direction === 'outgoing' ? 'Вы: ' : ''
  return `${prefix}${last.text}` || 'Нет сообщений'
}

export function Sidebar({
  conversations,
  activeChatId,
  idInstance,
  pollingStatus,
  processedCount,
  pollingError,
  onSelect,
  onStartChat,
  onSignOut,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <LogoIcon className="sidebar__logo" />
        <div className="sidebar__brand">
          <h1 className="sidebar__title">MAX Chat</h1>
          <span className="sidebar__instance" title={`idInstance ${idInstance}`}>
            idInstance {idInstance}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onSignOut}
          title="Выйти и удалить сохранённые данные инстанса"
        >
          Выйти
        </button>
      </div>

      <div className="sidebar__section">
        <NewChatForm onStart={onStartChat} />
      </div>

      <div className="sidebar__list">
        {conversations.length === 0 ? (
          <p className="sidebar__empty">
            Чатов пока нет.
            <br />
            Введите номер телефона получателя выше, чтобы начать переписку.
          </p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.chatId}
              type="button"
              className={`chat-item${
                conversation.chatId === activeChatId ? ' chat-item--active' : ''
              }`}
              onClick={() => onSelect(conversation.chatId)}
            >
              <span className="chat-item__avatar" aria-hidden="true">
                {initials(conversation)}
              </span>

              <span className="chat-item__main">
                <span className="chat-item__top">
                  <span className="chat-item__name">
                    {conversation.displayName || conversation.phone}
                  </span>
                  <span className="chat-item__time">
                    {formatConversationTime(conversation.updatedAt)}
                  </span>
                </span>
                <span className="chat-item__bottom">
                  <span className="chat-item__preview">
                    {preview(conversation)}
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="chat-item__badge">
                      {conversation.unreadCount > 99
                        ? '99+'
                        : conversation.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="sidebar__footer">
        <StatusBadge
          status={pollingStatus}
          processedCount={processedCount}
          lastError={pollingError}
        />
      </div>
    </aside>
  )
}
