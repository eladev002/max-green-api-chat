/** Application-wide constants and environment configuration. */

import { env } from 'virtual:env'

/** Base URL for API calls. `/green-api` is proxied (see vite.config.ts). */
export const API_BASE_URL: string = env.VITE_GREEN_API_BASE_URL ?? '/green-api'

/**
 * Sent as an `Authorization: Bearer …` header when set. GREEN-API's public
 * host does not require it, so it is empty by default.
 */
export const ACCESS_TOKEN: string | undefined =
  env.VITE_GREEN_API_ACCESS_TOKEN || undefined

/** Long-poll timeout (seconds) passed to `receiveNotification`. */
export const RECEIVE_TIMEOUT: number =
  Number(env.VITE_GREEN_API_RECEIVE_TIMEOUT) > 0
    ? Number(env.VITE_GREEN_API_RECEIVE_TIMEOUT)
    : 20

/** Delay between two `receiveNotification` calls when the queue was empty (ms). */
export const EMPTY_QUEUE_DELAY_MS = 400

/** Delay before retrying after a failed `receiveNotification` call (ms). */
export const POLL_ERROR_DELAY_MS = 3000

/** Instance credentials optionally prefilled from the environment. */
export const ENV_ID_INSTANCE: string = env.VITE_GREEN_API_ID_INSTANCE ?? ''
export const ENV_TOKEN_INSTANCE: string = env.VITE_GREEN_API_TOKEN_INSTANCE ?? ''

/* -------------------------------------------------------------------------- */
/* localStorage keys                                                          */
/* -------------------------------------------------------------------------- */

export const STORAGE_KEYS = {
  credentials: 'max-chat:credentials',
  conversations: 'max-chat:conversations',
  apiBaseUrl: 'max-chat:api-base-url',
} as const
