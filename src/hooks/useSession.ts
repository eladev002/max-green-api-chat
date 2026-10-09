import { useCallback, useEffect, useMemo, useState } from 'react'

import { GreenApiClient } from '@/api/greenApiClient'
import { GreenApiError } from '@/api/errors'
import { ENV_ID_INSTANCE, ENV_TOKEN_INSTANCE } from '@/config/constants'
import type { Credentials } from '@/types/domain'
import { storage } from '@/utils/format'

export type SessionStatus = 'checking' | 'anonymous' | 'authenticated'

export interface UseSessionResult {
  status: SessionStatus
  credentials: Credentials | null
  client: GreenApiClient | null
  error: string | null
  isSubmitting: boolean
  signIn: (credentials: Credentials) => Promise<void>
  signOut: () => void
}

/**
 * Owns authentication: stores credentials, builds the API client and verifies
 * the pair through `getSettings` before letting the user into the chat.
 */
export function useSession(): UseSessionResult {
  const [credentials, setCredentials] = useState<Credentials | null>(() => {
    const stored = storage.loadCredentials()
    if (stored) return stored

    if (ENV_ID_INSTANCE && ENV_TOKEN_INSTANCE) {
      return { idInstance: ENV_ID_INSTANCE, apiTokenInstance: ENV_TOKEN_INSTANCE }
    }
    return null
  })
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Validate stored credentials once on startup so a stale token is caught
  // before the user tries to send a message.
  useEffect(() => {
    if (!credentials) {
      setStatus('anonymous')
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const client = new GreenApiClient(credentials)

    setStatus('checking')
    client
      .getSettings(controller.signal)
      .then(() => {
        if (!cancelled) setStatus('authenticated')
      })
      .catch((cause: unknown) => {
        if (cancelled || (cause instanceof GreenApiError && cause.isAbort)) return
        storage.saveCredentials(null)
        setCredentials(null)
        setStatus('anonymous')
        setError(
          cause instanceof GreenApiError
            ? `Сохранённые данные не подошли: ${cause.friendlyMessage}`
            : 'Не удалось проверить сохранённые данные инстанса.',
        )
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // Re-running on apiBaseUrl changes is intentional; credentials is an object
    // so we depend on its primitive fields instead.
  }, [credentials?.idInstance, credentials?.apiTokenInstance, credentials?.apiBaseUrl])

  const client = useMemo(
    () => (credentials ? new GreenApiClient(credentials) : null),
    [credentials],
  )

  const signIn = useCallback(async (next: Credentials) => {
    setIsSubmitting(true)
    setError(null)

    const trimmed: Credentials = {
      idInstance: next.idInstance.trim(),
      apiTokenInstance: next.apiTokenInstance.trim(),
      apiBaseUrl: next.apiBaseUrl?.trim() || undefined,
    }

    try {
      const probe = new GreenApiClient(trimmed)
      await probe.getSettings()

      storage.saveCredentials(trimmed)
      if (trimmed.apiBaseUrl) {
        storage.saveApiBaseUrl(trimmed.apiBaseUrl)
      }
      setCredentials(trimmed)
      setStatus('authenticated')
    } catch (cause) {
      storage.saveCredentials(null)
      setCredentials(null)
      setStatus('anonymous')
      setError(
        cause instanceof GreenApiError
          ? cause.friendlyMessage
          : 'Не удалось подключиться к GREEN-API.',
      )
      throw cause
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const signOut = useCallback(() => {
    storage.saveCredentials(null)
    setCredentials(null)
    setError(null)
    setStatus('anonymous')
  }, [])

  return { status, credentials, client, error, isSubmitting, signIn, signOut }
}
