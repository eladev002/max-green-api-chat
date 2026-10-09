/**
 * Error thrown for any failed GREEN-API interaction. Carries the HTTP status
 * and the provider's `code` so the UI can show a meaningful hint
 * (e.g. 401 -> wrong token, 403 -> instance not authorized).
 */
export class GreenApiError extends Error {
  readonly status: number
  readonly code?: number

  constructor(
    message: string,
    options: { status?: number; code?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'GreenApiError'
    this.status = options.status ?? 0
    this.code = options.code
  }

  /** True when the request never reached the server or was aborted. */
  get isNetworkError(): boolean {
    return this.status === 0
  }

  get isAbort(): boolean {
    return this.name === 'AbortError'
  }

  /** A user-facing, localised explanation with an actionable hint. */
  get friendlyMessage(): string {
    if (this.isAbort) {
      return 'Запрос отменён.'
    }

    switch (this.status) {
      case 401:
        return 'Неверный apiTokenInstance. Проверьте токен в личном кабинете GREEN-API.'
      case 403:
        return 'Доступ запрещён. Проверьте idInstance и apiTokenInstance, а также что инстанс авторизован.'
      case 404:
        return 'Инстанс не найден. Проверьте idInstance.'
      case 429:
        return 'Слишком много запросов. Подождите немного и повторите.'
      case 466:
        return 'Исчерпан лимит запросов инстанса.'
      case 500:
      case 502:
      case 503:
        return 'Сервер GREEN-API временно недоступен. Повторите попытку позже.'
      default:
        break
    }

    if (this.isNetworkError) {
      return 'Не удалось связаться с GREEN-API. Проверьте интернет-соединение и настройку прокси (VITE_GREEN_API_BASE_URL).'
    }

    return this.message || 'Неизвестная ошибка GREEN-API.'
  }
}
