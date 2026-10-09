import { useEffect, useRef } from 'react'

import type { ChatMessage } from '@/types/domain'
import { formatTime } from '@/utils/format'

import { AlertIcon, CheckIcon, ClockIcon } from './Icons'

interface MessageBubbleProps {
  message: ChatMessage
  /** Show the author name above the text (incoming messages only). */
  showAuthor?: boolean
  onRetry?: (message: ChatMessage) => void
}

function StatusIndicator({ message }: { message: ChatMessage }) {
  if (message.direction !== 'outgoing') return null

  if (message.status === 'pending') {
    return (
      <span className="bubble__tick" title="Отправляется">
        <ClockIcon />
      </span>
    )
  }

  if (message.status === 'failed') {
    return (
      <span className="bubble__tick" title="Не отправлено">
        <AlertIcon />
      </span>
    )
  }

  return (
    <span className="bubble__tick" title="Отправлено">
      <CheckIcon />
    </span>
  )
}

export function MessageBubble({
  message,
  showAuthor = false,
  onRetry,
}: MessageBubbleProps) {
  const isFailed = message.status === 'failed'
  const className = [
    'bubble',
    message.direction === 'outgoing' ? 'bubble--out' : 'bubble--in',
    isFailed ? 'bubble--failed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {showAuthor && message.direction === 'incoming' && (
        <span className="bubble__author">
          {message.senderName?.trim() || 'Собеседник'}
        </span>
      )}

      <span className="bubble__text">{message.text}</span>

      {isFailed && message.error && (
        <span className="bubble__error">{message.error}</span>
      )}

      {isFailed && onRetry && (
        <button
          type="button"
          className="bubble__retry"
          onClick={() => onRetry(message)}
        >
          Повторить
        </button>
      )}

      <span className="bubble__footer">
        <span>{formatTime(message.timestamp)}</span>
        <StatusIndicator message={message} />
      </span>
    </div>
  )
}

/**
 * Renders the message list and keeps the view pinned to the newest message,
 * but only when the user is already at the bottom (so scrolling up to read
 * history is not interrupted by an incoming message).
 */
export function MessageList({
  messages,
  onRetry,
}: {
  messages: ChatMessage[]
  onRetry?: (message: ChatMessage) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldStickRef = useRef(true)

  const handleScroll = () => {
    const element = containerRef.current
    if (!element) return
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight
    shouldStickRef.current = distanceFromBottom < 120
  }

  useEffect(() => {
    if (shouldStickRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages.length, messages[messages.length - 1]?.status])

  return (
    <div className="messages" ref={containerRef} onScroll={handleScroll}>
      {messages.length === 0 && (
        <div className="messages__notice">
          Сообщений пока нет. Напишите первым — ответ появится здесь.
        </div>
      )}

      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          showAuthor={index === 0 || messages[index - 1].direction !== 'incoming'}
          onRetry={onRetry}
        />
      ))}

      <div ref={bottomRef} />
    </div>
  )
}
