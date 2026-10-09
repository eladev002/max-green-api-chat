import {
  ACCESS_TOKEN,
  API_BASE_URL,
  RECEIVE_TIMEOUT,
  STORAGE_KEYS,
} from '@/config/constants'
import type {
  DeleteNotificationResponse,
  GreenApiErrorPayload,
  GreenApiSettings,
  ReceiveNotificationResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '@/types/greenapi'

import { GreenApiError } from './errors'

/**
 * Combine the caller's abort signal with a hard timeout, so a stalled request
 * can never wedge the long-poll loop (e.g. when the laptop sleeps).
 */
function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/** Resolve the base URL: explicit argument > stored override > env default. */
function resolveBaseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/+$/, '')

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.apiBaseUrl)
    if (stored) return stored.replace(/\/+$/, '')
  } catch {
    // ignore unavailable storage
  }

  return API_BASE_URL.replace(/\/+$/, '')
}

/**
 * Thin, fully typed client for the GREEN-API HTTP interface.
 *
 * The credentials are held in the URL path, exactly as the provider requires:
 *   {base}/waInstance{idInstance}/{method}/{apiTokenInstance}
 *
 * Every call accepts an `AbortSignal` so long-polling can be cancelled
 * instantly on logout or unmount.
 */
export class GreenApiClient {
  readonly idInstance: string
  readonly apiTokenInstance: string
  private readonly baseUrl: string

  constructor(credentials: {
    idInstance: string
    apiTokenInstance: string
    apiBaseUrl?: string
  }) {
    this.idInstance = credentials.idInstance.trim()
    this.apiTokenInstance = credentials.apiTokenInstance.trim()
    this.baseUrl = resolveBaseUrl(credentials.apiBaseUrl)
  }

  /** `GET /waInstance{id}/getSettings/{token}` — also validates credentials. */
  async getSettings(signal?: AbortSignal): Promise<GreenApiSettings> {
    return this.request<GreenApiSettings>('getSettings', { method: 'GET', signal })
  }

  /** `POST /waInstance{id}/sendMessage/{token}` — sends a text message. */
  async sendMessage(
    payload: SendMessageRequest,
    signal?: AbortSignal,
  ): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>('sendMessage', {
      method: 'POST',
      body: { ...payload, message: payload.message },
      signal,
    })
  }

  /**
   * `GET /waInstance{id}/receiveNotification/{token}?receiveTimeout=N`
   *
   * Long-polls: blocks up to N seconds until a notification is available.
   * Returns `null` when the queue is empty (HTTP 200 with an empty body).
   */
  async receiveNotification(
    signal?: AbortSignal,
    receiveTimeout: number = RECEIVE_TIMEOUT,
  ): Promise<ReceiveNotificationResponse | null> {
    const raw = await this.requestRaw('receiveNotification', {
      method: 'GET',
      // The provider only accepts 5..60 seconds and defaults to 5 when the
      // parameter is absent, so always send an explicit in-range value.
      query: { receiveTimeout: String(Math.min(60, Math.max(5, receiveTimeout))) },
      signal,
      // The long-poll may block for `receiveTimeout` seconds; allow a margin.
      timeoutMs: receiveTimeout > 0 ? (receiveTimeout + 15) * 1000 : 30_000,
    })

    const text = raw.text.trim()
    if (!text || text === 'null') return null

    try {
      const parsed = JSON.parse(text) as ReceiveNotificationResponse | null
      if (!parsed || typeof parsed.receiptId !== 'number' || !parsed.body) return null
      return parsed
    } catch (cause) {
      throw new GreenApiError('Некорректный ответ receiveNotification.', {
        status: raw.status,
        cause,
      })
    }
  }

  /**
   * `DELETE /waInstance{id}/deleteNotification/{token}/{receiptId}`
   *
   * Must be called for every received notification, otherwise the same
   * notification is returned again by the next `receiveNotification`.
   */
  async deleteNotification(
    receiptId: number,
    signal?: AbortSignal,
  ): Promise<DeleteNotificationResponse> {
    return this.request<DeleteNotificationResponse>(
      `deleteNotification/${receiptId}`,
      { method: 'DELETE', signal },
    )
  }

  /* ---------------------------------------------------------------------- */
  /* internals                                                              */
  /* ---------------------------------------------------------------------- */

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(
      `${this.baseUrl}/waInstance${this.idInstance}/${path}/${this.apiTokenInstance}`,
    )
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value)
      }
    }
    return url.toString()
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE'
      body?: unknown
      query?: Record<string, string>
      signal?: AbortSignal
    },
  ): Promise<T> {
    const raw = await this.requestRaw(path, options)
    const text = raw.text.trim()

    if (!text) {
      // Endpoints such as deleteNotification return `{"result":true}`; an
      // entirely empty body is still treated as a successful call.
      return undefined as T
    }

    try {
      return JSON.parse(text) as T
    } catch (cause) {
      throw new GreenApiError('Сервер вернул ответ в неизвестном формате.', {
        status: raw.status,
        cause,
      })
    }
  }

  private async requestRaw(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE'
      body?: unknown
      query?: Record<string, string>
      signal?: AbortSignal
      timeoutMs?: number
    },
  ): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (ACCESS_TOKEN) headers.Authorization = `Bearer ${ACCESS_TOKEN}`

    const timeoutMs = options.timeoutMs ?? 30_000
    const { signal, cleanup } = withTimeout(options.signal, timeoutMs)
    const callerAborted = () => options.signal?.aborted === true

    let response: Response
    try {
      response = await fetch(this.buildUrl(path, options.query), {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
      })
    } catch (cause) {
      // Only report an abort when the *caller* asked for it; a timeout is an
      // error the polling loop should surface and back off from.
      if (callerAborted()) {
        const abort = new GreenApiError('Запрос отменён.', { cause })
        abort.name = 'AbortError'
        throw abort
      }
      throw new GreenApiError(
        cause instanceof Error ? cause.message : 'Сетевая ошибка.',
        { cause },
      )
    } finally {
      cleanup()
    }

    const text = await response.text()

    if (!response.ok) {
      let payload: GreenApiErrorPayload | undefined
      try {
        payload = text ? (JSON.parse(text) as GreenApiErrorPayload) : undefined
      } catch {
        payload = undefined
      }

      throw new GreenApiError(
        payload?.message ?? `GREEN-API вернул ошибку ${response.status}.`,
        { status: response.status, code: payload?.code },
      )
    }

    return { status: response.status, text }
  }
}
