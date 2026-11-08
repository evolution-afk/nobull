import type { BackendEnvironment } from './settings'

function fromHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null
  return Uint8Array.from(
    value.match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  )
}

/**
 * Extracts the signed Telegram WebApp payload from a request. The storefront
 * passes it as a query param because download links cannot set headers; API
 * clients may instead use `X-Telegram-Init-Data` or `Authorization: tma <initData>`.
 */
export function readTelegramInitData(request: Request): string {
  const fromQuery = new URL(request.url).searchParams.get('initData')?.trim()
  if (fromQuery) return fromQuery
  const fromHeader = request.headers.get('X-Telegram-Init-Data')?.trim()
  if (fromHeader) return fromHeader
  const authorization = request.headers.get('Authorization')?.trim() ?? ''
  return authorization.toLowerCase().startsWith('tma ')
    ? authorization.slice(4).trim()
    : ''
}

type TelegramInitDataFailure =
  | 'bot_token_missing'
  | 'payload_missing'
  | 'payload_too_large'
  | 'hash_missing_or_invalid'
  | 'auth_date_invalid'
  | 'auth_date_in_future'
  | 'auth_date_expired'
  | 'user_missing'
  | 'signature_invalid'
  | 'user_json_invalid'
  | 'user_id_invalid'
  | 'verification_error'

export async function verifyTelegramWebAppInitData(
  env: BackendEnvironment,
  initData: string,
  onFailure?: (reason: TelegramInitDataFailure) => void,
): Promise<{ id: string; firstName: string; username: string } | null> {
  const fail = (reason: TelegramInitDataFailure) => {
    onFailure?.(reason)
    return null
  }
  const botToken = env.TELEGRAM_BOT_TOKEN
  if (!botToken) return fail('bot_token_missing')
  if (!initData) return fail('payload_missing')
  if (initData.length > 8192) return fail('payload_too_large')

  const params = new URLSearchParams(initData)
  const suppliedHash = fromHex(params.get('hash') ?? '')
  const rawAuthDate = params.get('auth_date')
  const authDate = Number(rawAuthDate)
  const userValue = params.get('user')
  if (!suppliedHash) return fail('hash_missing_or_invalid')
  if (!rawAuthDate || !Number.isInteger(authDate)) return fail('auth_date_invalid')
  const now = Math.floor(Date.now() / 1000)
  if (authDate > now + 60) return fail('auth_date_in_future')
  if (now - authDate > 60 * 60) return fail('auth_date_expired')
  if (!userValue) return fail('user_missing')

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  try {
    const secretDerivationKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const secretKey = await crypto.subtle.sign(
      'HMAC',
      secretDerivationKey,
      new TextEncoder().encode(botToken),
    )
    const verificationKey = await crypto.subtle.importKey(
      'raw',
      secretKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      verificationKey,
      new Uint8Array(suppliedHash),
      new TextEncoder().encode(dataCheckString),
    )
    if (!valid) return fail('signature_invalid')

    let user: unknown
    try {
      user = JSON.parse(userValue)
    } catch {
      return fail('user_json_invalid')
    }
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      return fail('user_json_invalid')
    }
    const record = user as Record<string, unknown>
    const id = String(record.id ?? '')
    if (!/^\d{1,20}$/.test(id)) return fail('user_id_invalid')
    return {
      id,
      firstName: typeof record.first_name === 'string' ? record.first_name : '',
      username: typeof record.username === 'string' ? record.username : '',
    }
  } catch {
    return fail('verification_error')
  }
}
