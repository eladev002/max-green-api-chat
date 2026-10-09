import { STORAGE_KEYS } from '@/config/constants'
import type { Conversation, Credentials } from '@/types/domain'

/**
 * Format a phone number for display as `+7 999 123-45-67`.
 * Unknown lengths fall back to digit grouping so nothing is lost.
 */
export function formatPhone(digits: string): string {
  const value = digits.replace(/\D/g, '')

  if (value.length === 11 && (value.startsWith('7') || value.startsWith('8'))) {
    return `+7 ${value.slice(1, 4)} ${value.slice(4, 7)}-${value.slice(7, 9)}-${value.slice(9, 11)}`
  }

  if (value.length === 11) {
    return `+${value.slice(0, 1)} ${value.slice(1, 4)} ${value.slice(4, 7)}-${value.slice(7, 9)}-${value.slice(9, 11)}`
  }

  if (value.length > 3) {
    return `+${value.replace(/(\d{3})(?=\d)/g, '$1 ').trim()}`
  }

  return value ? `+${value}` : ''
}

/**
 * Normalise anything the user types into a GREEN-API chat id.
 *
 * Accepts `+7 999 123-45-67`, `89991234567`, `9991234567`, `79991234567@c.us`
 * and always returns `<countrycode><number>@c.us`-ish digits without `+`.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''

  // A Russian local number without the country code: 9991234567 (10 digits).
  if (digits.length === 10 && digits.startsWith('9')) {
    return `7${digits}`
  }

  // Legacy Russian trunk prefix: 89991234567 -> 79991234567
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`
  }

  return digits
}

/** Build the GREEN-API `chatId` for a phone number. */
export function toChatId(phone: string): string {
  return `${normalizePhone(phone)}@c.us`
}

/** Extract the phone digits from a `chatId` (or pass plain digits through). */
export function chatIdToPhone(chatId: string): string {
  return chatId.replace(/@[\w.]+$/, '').replace(/\D/g, '')
}

/** True when the string looks like a usable phone number for GREEN-API. */
export function isValidPhone(input: string): boolean {
  const digits = normalizePhone(input)
  return digits.length >= 10 && digits.length <= 15
}

/** `HH:MM` in the user's locale for a Unix timestamp in seconds. */
export function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Human shortcut for sidebar timestamps: time today, else a date. */
export function formatConversationTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const today = new Date()
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()

  return isToday
    ? formatTime(timestamp)
    : date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

/** Locally generated message id for optimistic bubbles. */
export function createLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Current Unix time in seconds (the unit GREEN-API uses). */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/* -------------------------------------------------------------------------- */
/* localStorage persistence                                                   */
/* -------------------------------------------------------------------------- */

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // Corrupted or unavailable storage must never break the app.
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {
    // Quota exceeded / private mode: ignore, persistence is best-effort.
  }
}

export const storage = {
  loadCredentials(): Credentials | null {
    const value = readJson<Credentials>(STORAGE_KEYS.credentials)
    if (value && typeof value.idInstance === 'string' && typeof value.apiTokenInstance === 'string') {
      return value
    }
    return null
  },
  saveCredentials(credentials: Credentials | null): void {
    writeJson(STORAGE_KEYS.credentials, credentials)
  },

  loadConversations(): Conversation[] {
    const value = readJson<Conversation[]>(STORAGE_KEYS.conversations)
    return Array.isArray(value) ? value.filter((item) => Boolean(item?.chatId)) : []
  },
  saveConversations(conversations: Conversation[]): void {
    writeJson(STORAGE_KEYS.conversations, conversations)
  },

  loadApiBaseUrl(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.apiBaseUrl)
    } catch {
      return null
    }
  },
  saveApiBaseUrl(baseUrl: string | null): void {
    writeJson(STORAGE_KEYS.apiBaseUrl, baseUrl)
  },
}
