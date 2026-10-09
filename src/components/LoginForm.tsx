import { useState } from 'react'

import { API_BASE_URL } from '@/config/constants'
import type { Credentials } from '@/types/domain'

import { LogoIcon } from './Icons'

interface LoginFormProps {
  onSubmit: (credentials: Credentials) => void
  isSubmitting: boolean
  error: string | null
  /** Prefill from the environment or the previous session. */
  initial?: {
    idInstance?: string
    apiTokenInstance?: string
    apiBaseUrl?: string
  }
}

const API_DOCS_URL = 'https://green-api.com/docs/'

/**
 * Credentials form. The values are verified against `getSettings` before the
 * chat is unlocked, so a typo is reported here rather than on the first send.
 */
export function LoginForm({
  onSubmit,
  isSubmitting,
  error,
  initial,
}: LoginFormProps) {
  const [idInstance, setIdInstance] = useState(initial?.idInstance ?? '')
  const [apiTokenInstance, setApiTokenInstance] = useState(
    initial?.apiTokenInstance ?? '',
  )
  const [apiBaseUrl, setApiBaseUrl] = useState(initial?.apiBaseUrl ?? '')
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initial?.apiBaseUrl && initial.apiBaseUrl !== API_BASE_URL),
  )
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!idInstance.trim()) {
      setFormError('Укажите idInstance.')
      return
    }
    if (!/^\d+$/.test(idInstance.trim())) {
      setFormError('idInstance состоит только из цифр.')
      return
    }
    if (!apiTokenInstance.trim()) {
      setFormError('Укажите apiTokenInstance.')
      return
    }

    setFormError(null)
    onSubmit({
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
      apiBaseUrl: apiBaseUrl.trim() || undefined,
    })
  }

  const message = formError ?? error

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <LogoIcon className="login__logo" />
          <div>
            <h1 className="login__title">MAX Chat</h1>
            <p className="login__subtitle">Отправка и получение сообщений</p>
          </div>
        </div>

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          {message && (
            <div className="alert alert--error" role="alert">
              <span>{message}</span>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="idInstance">
              idInstance
            </label>
            <input
              id="idInstance"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1101000000"
              value={idInstance}
              onChange={(event) => setIdInstance(event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="apiTokenInstance">
              apiTokenInstance
            </label>
            <input
              id="apiTokenInstance"
              className="input"
              type="password"
              autoComplete="off"
              placeholder="••••••••••••••••••••••••••••••••"
              value={apiTokenInstance}
              onChange={(event) => setApiTokenInstance(event.target.value)}
              disabled={isSubmitting}
            />
            <span className="field__hint">
              Оба значения — в личном кабинете{' '}
              <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
                GREEN-API
              </a>
              .
            </span>
          </div>

          <div className="login__row">
            <button
              type="button"
              className="login__toggle"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              {showAdvanced ? 'Скрыть настройки подключения' : 'Настройки подключения'}
            </button>
          </div>

          {showAdvanced && (
            <div className="field">
              <label className="field__label" htmlFor="apiBaseUrl">
                Базовый адрес API (прокси)
              </label>
              <input
                id="apiBaseUrl"
                className="input"
                placeholder={API_BASE_URL}
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                disabled={isSubmitting}
              />
              <span className="field__hint">
                По умолчанию запросы идут через прокси{' '}
                <code>{API_BASE_URL}</code>. Укажите{' '}
                <code>https://api.green-api.com</code>, если ваш инстанс доступен
                напрямую.
              </span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Проверяем доступ…
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>

        <p className="login__footer">
          Данные инстанса хранятся только в этом браузере (localStorage) и
          передаются напрямую в GREEN-API.
        </p>
      </div>
    </div>
  )
}
