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

export async function verifyTelegramWebAppInitData(
  env: BackendEnvironment,
  initData: string,
): Promise<{ id: string; firstName: string; username: string } | null> {
  const botToken = env.TELEGRAM_BOT_TOKEN
  if (!botToken || !initData || initData.length > 8192) return null

  const params = new URLSearchParams(initData)
  const suppliedHash = fromHex(params.get('hash') ?? '')
  const authDate = Number(params.get('auth_date'))
  const userValue = params.get('user')
  if (
    !suppliedHash ||
    !Number.isInteger(authDate) ||
    authDate > Math.floor(Date.now() / 1000) + 60 ||
    Math.floor(Date.now() / 1000) - authDate > 60 * 60 ||
    !userValue
  ) {
    return null
  }

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
    if (!valid) return null

    const user: unknown = JSON.parse(userValue)
    if (!user || typeof user !== 'object' || Array.isArray(user)) return null
    const record = user as Record<string, unknown>
    const id = String(record.id ?? '')
    if (!/^\d{1,20}$/.test(id)) return null
    return {
      id,
      firstName: typeof record.first_name === 'string' ? record.first_name : '',
      username: typeof record.username === 'string' ? record.username : '',
    }
  } catch {
    return null
  }
}
