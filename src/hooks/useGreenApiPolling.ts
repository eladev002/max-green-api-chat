import { useEffect, useRef, useState } from 'react'

import { GreenApiError } from '@/api/errors'
import type { GreenApiClient } from '@/api/greenApiClient'
import { toInboundTextMessage } from '@/api/normalizeNotification'
import type { InboundTextMessage } from '@/api/normalizeNotification'
import {
  EMPTY_QUEUE_DELAY_MS,
  POLL_ERROR_DELAY_MS,
  RECEIVE_TIMEOUT,
} from '@/config/constants'

export type PollingStatus = 'idle' | 'listening' | 'error'

export interface UseGreenApiPollingOptions {
  client: GreenApiClient | null
  /** Set to false to suspend polling (e.g. while the tab is hidden). */
  enabled?: boolean
  /** Called for every displayable incoming/outgoing text message. */
  onMessage: (message: InboundTextMessage) => void
  /** Called whenever a notification is consumed, whatever its type. */
  onNotification?: (typeWebhook: string) => void
}

export interface UseGreenApiPollingResult {
  status: PollingStatus
  /** Number of notifications processed since the app was opened. */
  processedCount: number
  lastError: string | null
  /** Populated by the last `stateInstanceChanged` notification. */
  instanceState: string | null
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * Long-poll engine for GREEN-API.
 *
 * The provider has no websockets: incoming messages are delivered through
 * `receiveNotification`, which blocks until something arrives. Each
 * notification MUST then be acknowledged with `deleteNotification`, otherwise
 * it is returned again on the next call.
 *
 * The loop is strictly sequential: one in-flight request at a time, always
 * cancelled through an `AbortController` on unmount / client change.
 */
export function useGreenApiPolling({
  client,
  enabled = true,
  onMessage,
  onNotification,
}: UseGreenApiPollingOptions): UseGreenApiPollingResult {
  const [status, setStatus] = useState<PollingStatus>('idle')
  const [processedCount, setProcessedCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [instanceState, setInstanceState] = useState<string | null>(null)

  // Keep the newest callbacks in refs: updating them must not restart the loop.
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const onNotificationRef = useRef(onNotification)
  onNotificationRef.current = onNotification

  useEffect(() => {
    if (!client || !enabled) {
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    let stopped = false

    const run = async () => {
      setStatus('listening')

      while (!stopped && !controller.signal.aborted) {
        try {
          const notification = await client.receiveNotification(
            controller.signal,
            RECEIVE_TIMEOUT,
          )

          if (stopped || controller.signal.aborted) break

          if (!notification) {
            setStatus('listening')
            setLastError(null)
            await sleep(EMPTY_QUEUE_DELAY_MS, controller.signal)
            continue
          }

          // Acknowledge first: if handling throws, the notification is already
          // gone from the queue and will not be replayed forever.
          try {
            await client.deleteNotification(
              notification.receiptId,
              controller.signal,
            )
          } catch (cause) {
            if (cause instanceof GreenApiError && cause.isAbort) break
            // Non-fatal: continue, the message can still be displayed.
          }

          const body = notification.body
          onNotificationRef.current?.(body.typeWebhook)

          if (body.typeWebhook === 'stateInstanceChanged') {
            const state = (body as { stateInstance?: string }).stateInstance
            if (state) setInstanceState(state)
          }

          const message =
            body.typeWebhook === 'incomingMessageReceived' ||
            body.typeWebhook === 'outgoingMessageReceived'
              ? toInboundTextMessage(body)
              : null

          // Deduplicate against the optimistic bubble: this notification may
          // simply echo a message this app has already rendered.
          if (message && body.typeWebhook !== 'outgoingAPIMessageReceived') {
            onMessageRef.current(message)
          }

          setProcessedCount((count) => count + 1)
          setStatus('listening')
          setLastError(null)
        } catch (cause) {
          if (stopped || controller.signal.aborted) break
          if (cause instanceof GreenApiError && cause.isAbort) break

          setStatus('error')
          setLastError(
            cause instanceof GreenApiError
              ? cause.friendlyMessage
              : 'Не удалось получить уведомления от GREEN-API.',
          )
          await sleep(POLL_ERROR_DELAY_MS, controller.signal)
        }
      }

      if (!controller.signal.aborted) setStatus('idle')
    }

    void run()

    return () => {
      stopped = true
      controller.abort()
    }
  }, [client, enabled])

  return { status, processedCount, lastError, instanceState }
}
