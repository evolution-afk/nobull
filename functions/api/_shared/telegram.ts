import { translateProductText } from '../../../src/utils/persianTranslator'

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

const deliveryLabels: Record<string, string> = {
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
  two_fa_secret: 'کلید ورود دومرحله‌ای',
  totp: 'کد یک‌بارمصرف',
  authenticator: 'برنامه تولید کد تأیید',
  warranty: 'گارانتی',
  warranty_exclusions: 'موارد خارج از پوشش گارانتی',
  format: 'قالب اطلاعات',
}

export function formatDelivery(value: unknown): string {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*([\w -]{2,40})\s*:\s*(.*)$/)
        if (!match) {
          return (
            /(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i.test(line) ||
            /^[A-Za-z0-9._~+/=-]{4,}$/.test(line.trim())
          )
            ? line
            : translateProductText(line)
        }
        const key = match[1].trim()
        const label =
          deliveryLabels[key.toLowerCase().replace(/[\s-]+/g, '_')] ??
          translateProductText(key)
        const rawValue = match[2]
        const sensitive = /^(?:user(?:name)?|email|password|pass|two_fa|2fa|two_fa_secret|recovery_code|code|token|secret|url|link)$/i.test(
          key.replace(/[\s-]+/g, '_'),
        )
        return `${label}: ${sensitive ? rawValue : translateProductText(rawValue)}`
      })
      .join('\n')
      .trim()
  }
  if (!value || typeof value !== 'object') return String(value ?? '')

  const lines: string[] = []

  const visit = (item: unknown, key?: string) => {
    if (item === null || item === undefined || item === '') return
    if (typeof item !== 'object') {
      const label = key
        ? deliveryLabels[key.toLowerCase()] ??
          translateProductText(key.replace(/[_-]+/g, ' '))
        : 'اطلاعات'
      const stringValue = String(item)
      lines.push(
        `${label}: ${key && /(?:user|email|pass|token|secret|recovery|2fa|auth|url|link|code)/i.test(key) ? stringValue : translateProductText(stringValue)}`,
      )
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
