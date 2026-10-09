import { useEffect, useRef, useState } from 'react'

import { SendIcon } from './Icons'

interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
  isSending?: boolean
  error?: string | null
  onDismissError?: () => void
}

const MAX_LENGTH = 20_000

/** Message input: Enter sends, Shift+Enter adds a line break. */
export function Composer({
  onSend,
  disabled = false,
  isSending = false,
  error,
  onDismissError,
}: ComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow the textarea with its content, up to the CSS max-height.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [text])

  const canSend = text.trim().length > 0 && !disabled

  const submit = () => {
    if (!canSend) return
    onSend(text.trim())
    setText('')
    onDismissError?.()
    textareaRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
      {error && (
        <div className="alert alert--error composer__error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="composer__row">
        <label className="sr-only" htmlFor="composer-input">
          Текст сообщения
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          className="composer__input"
          rows={1}
          placeholder="Введите сообщение…"
          value={text}
          maxLength={MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          type="button"
          className="composer__send"
          onClick={submit}
          disabled={!canSend || isSending}
          aria-label="Отправить сообщение"
          title="Отправить (Enter)"
        >
          {isSending ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <SendIcon />
          )}
        </button>
      </div>

      <div className="composer__hint">
        <span>Enter — отправить, Shift + Enter — новая строка</span>
        {text.length > MAX_LENGTH - 500 && (
          <span>
            {text.length} / {MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  )
}
