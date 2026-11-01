export interface TelegramEnvironment {
  TELEGRAM_BOT_TOKEN?: string
}

export interface TelegramButton {
  text: string
  callback_data?: string
  web_app?: { url: string }
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramButton[][]
}

export async function callTelegram<T>(
  env: TelegramEnvironment,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token is not configured.')
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  )
  const result = (await response.json()) as {
    ok?: boolean
    description?: string
    result?: T
  }
  if (!response.ok || !result.ok) {
    throw new Error(result.description ?? 'Telegram API request failed.')
  }
  return result.result as T
}

export async function sendMessage(
  env: TelegramEnvironment,
  chatId: string | number,
  text: string,
  replyMarkup?: TelegramInlineKeyboard | { force_reply: true },
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
  }
  if (replyMarkup) body.reply_markup = replyMarkup
  return callTelegram(env, 'sendMessage', body)
}

export function formatDelivery(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return String(value ?? '')

  const labels: Record<string, string> = {
    username: 'نام کاربری',
    user: 'نام کاربری',
    email: 'ایمیل',
    password: 'رمز عبور',
    pass: 'رمز عبور',
    login: 'ورود',
    account: 'اکانت',
    url: 'لینک ورود',
    link: 'لینک ورود',
    two_fa: 'کد دومرحله‌ای',
    '2fa': 'کد دومرحله‌ای',
    recovery_code: 'کد بازیابی',
    instructions: 'راهنما',
  }
  const lines: string[] = []

  const visit = (item: unknown, key?: string) => {
    if (item === null || item === undefined || item === '') return
    if (typeof item !== 'object') {
      const label = key
        ? labels[key.toLowerCase()] ??
          key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) =>
            letter.toUpperCase(),
          )
        : 'اطلاعات'
      lines.push(`${label}: ${String(item)}`)
      return
    }
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry, key))
      return
    }
    for (const [childKey, childValue] of Object.entries(
      item as Record<string, unknown>,
    )) {
      visit(childValue, childKey)
    }
  }

  visit(value)
  return lines.join('\n')
}
