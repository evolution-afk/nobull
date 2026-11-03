import {
  formatDelivery,
  sendMessage,
  type TelegramEnvironment,
} from './_shared/telegram'
import { completeOrderByReference } from './_shared/orderActions'
import {
  getOrderByReference,
  type BackendEnvironment,
} from './_shared/settings'

interface DanteWebhookEnvironment extends TelegramEnvironment, BackendEnvironment {
  DANTE_WEBHOOK_SECRET?: string
  TELEGRAM_ADMIN_CHAT_ID?: string
}

interface DanteWebhookContext {
  request: Request
  env: DanteWebhookEnvironment
}

interface DanteOrder {
  ref?: string
  delivery?: unknown
  product?: { name?: string; title?: string }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(
  body: ArrayBuffer,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  const signature = signatureHeader.replace(/^sha256=/i, '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(signature)) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = toHex(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, body)),
  )
  let difference = expected.length ^ signature.length
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ (signature.charCodeAt(index) || 0)
  }
  return difference === 0
}

function extractOrder(payload: unknown): DanteOrder {
  const record = asRecord(payload)
  const data = asRecord(record.data)
  return asRecord(record.order ?? data.order ?? record.data ?? payload) as DanteOrder
}

export async function onRequestPost({
  request,
  env,
}: DanteWebhookContext): Promise<Response> {
  if (!env.DANTE_WEBHOOK_SECRET || !env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse({ error: 'Dante webhook is not configured.' }, 503)
  }

  const body = await request.arrayBuffer()
  try {
    const valid = await verifySignature(
      body,
      request.headers.get('X-DanteHub-Signature'),
      env.DANTE_WEBHOOK_SECRET,
    )
    if (!valid) return jsonResponse({ error: 'Invalid signature.' }, 401)

    const payload = JSON.parse(new TextDecoder().decode(body)) as unknown
    const eventRecord = asRecord(payload)
    const event = String(eventRecord.event ?? eventRecord.type ?? '')
    if (event !== 'order.delivered') return jsonResponse({ ok: true })

    const order = extractOrder(payload)
    const reference = order.ref ?? ''
    const match = reference.match(/^tg-(\d+)-\d+(?:-[a-f0-9]{8})?$/i)
    if (!match) return jsonResponse({ ok: true })
    if (!order.delivery) {
      return jsonResponse({ error: 'Delivered order has no delivery payload.' }, 400)
    }

    const delivery = formatDelivery(order.delivery)
    if (!delivery) {
      return jsonResponse({ error: 'Delivered order payload is empty.' }, 400)
    }
    const savedOrder = env.NOBULL_SETTINGS
      ? await getOrderByReference(env, reference)
      : null
    if (savedOrder?.status === 'completed') return jsonResponse({ ok: true })
    const title = order.product?.name ?? order.product?.title
    const message = `✅ سفارش شما آماده است.${title ? `\nمحصول: ${title}` : ''}\n\n${delivery}`
    await sendMessage(env, match[1], message)
    if (env.TELEGRAM_ADMIN_CHAT_ID) {
      await sendMessage(
        env,
        env.TELEGRAM_ADMIN_CHAT_ID,
        `تحویل سفارش ${reference} برای کاربر ${match[1]} انجام شد:${title ? `\nمحصول: ${title}` : ''}\n\n${delivery}`,
      )
    }
    if (savedOrder) await completeOrderByReference(env, reference)
    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('Dante webhook processing failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse({ error: 'Dante webhook processing failed.' }, 500)
  }
}
