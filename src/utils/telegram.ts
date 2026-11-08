export interface TelegramWebApp {
  initData?: string
  ready?: () => void
}

/**
 * Reads the Telegram WebApp bridge injected when the storefront runs inside
 * the bot. Returns null in a normal browser tab.
 */
export function getTelegramWebApp(): TelegramWebApp | null {
  const telegram = (
    window as Window & { Telegram?: { WebApp?: TelegramWebApp } }
  ).Telegram
  return telegram?.WebApp ?? null
}

/** Signed initData used to authenticate storefront requests as a bot user. */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData?.trim() ?? ''
}
