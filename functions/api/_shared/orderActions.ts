import {
  getOrder,
  getOrderByReference,
  getProviders,
  getProviderKey,
  providerHeaders,
  providerRequestUrl,
  saveOrder,
  upsertCustomer,
  type BackendEnvironment,
  type StoredOrder,
} from './settings'
import { formatDelivery, sendMessage, type TelegramEnvironment } from './telegram'
import {
  getPersianLoginInstructions,
  getPersianWarrantyDescription,
} from '../../../src/utils/persianTranslator'
import { decryptDelivery, encryptDelivery } from './vault'

export interface OrderActionEnvironment extends BackendEnvironment, TelegramEnvironment {
  TELEGRAM_ADMIN_CHAT_ID?: string
}

interface ProviderOrderResponse {
  status?: string
  delivery?: unknown
  product?: { name?: string; title?: string }
}

function unwrapOrder(value: unknown): ProviderOrderResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : {}
  const order =
    record.order && typeof record.order === 'object'
      ? record.order
      : data.order && typeof data.order === 'object'
        ? data.order
        : record.data ?? value
  return order && typeof order === 'object'
    ? (order as ProviderOrderResponse)
    : {}
}

export async function decideStoredOrder(
  env: OrderActionEnvironment,
  orderId: string,
  action: 'approve' | 'reject',
): Promise<StoredOrder> {
  if (!/^[a-f0-9-]{16,64}$/i.test(orderId)) {
    throw new Error('Invalid order id.')
  }
  const order = await getOrder(env, orderId)
  if (!order) throw new Error('Order not found.')
  if (!/^\d+$/.test(order.userId) || Number(order.userId) <= 0) {
    throw new Error('Order recipient is not a private user.')
  }
  if (
    order.status !== 'waiting_review' &&
    !(action === 'reject' && order.status === 'pending_receipt')
  ) {
    throw new Error('Order is no longer pending review.')
  }

  if (action === 'reject') {
    const rejected: StoredOrder = {
      ...order,
      status: 'rejected',
      updatedAt: Date.now(),
    }
    await saveOrder(env, rejected)
    await sendMessage(
      env,
      order.userId,
      'پرداخت شما تأیید نشد. برای پیگیری با پشتیبانی تماس بگیرید.',
    )
    return rejected
  }

  const provider = getProviders(env).find((item) => item.id === order.provider)
  if (!provider) throw new Error(`Unknown provider ${order.provider}.`)
  if (!env.VAULT_ENCRYPTION_KEY) {
    throw new Error('VAULT_ENCRYPTION_KEY is not configured.')
  }
  if (order.deliveredCredentials) {
    const delivery = formatDelivery(
      await decryptDelivery(
        env.VAULT_ENCRYPTION_KEY,
        order.deliveredCredentials,
      ),
    )
    await sendMessage(
      env,
      order.userId,
      `✅ سفارش شما آماده است.\n\n${delivery}\n\n${getPersianWarrantyDescription(order.productWarrantySource, order.productDescription)}\n\n${getPersianLoginInstructions(order.productWarrantySource, order.productDescription, delivery)}`,
    )
    const completed: StoredOrder = {
      ...order,
      status: 'completed',
      updatedAt: Date.now(),
      completedAt: Date.now(),
    }
    await saveOrder(env, completed)
    await upsertCustomer(
      env,
      order.userId,
      { username: order.username, firstName: order.firstName },
      { completedOrders: 1, totalSpentToman: order.priceToman },
    )
    return completed
  }
  const apiKey = getProviderKey(env, provider)
  if (!apiKey) throw new Error(`Provider ${provider.id} is not configured.`)
  const headers = providerHeaders(provider, apiKey)
  headers.set('Content-Type', 'application/json')

  const processing: StoredOrder = {
    ...order,
    status: 'processing',
    updatedAt: Date.now(),
  }
  await saveOrder(env, processing)

  let response: Response
  try {
    response = await fetch(providerRequestUrl(provider, provider.ordersPath), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        product_id: order.productId,
        qty: 1,
        ref: order.reference,
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) {
      throw new Error(`Provider ${provider.id} request failed (${response.status}).`)
    }
  } catch (error) {
    await saveOrder(env, { ...order, status: 'waiting_review', updatedAt: Date.now() })
    throw error
  }

  const result = unwrapOrder(await response.json())
  if (result.delivery) {
    const deliveredCredentials = await encryptDelivery(
      env.VAULT_ENCRYPTION_KEY,
      result.delivery,
    )
    const deliveredOrder: StoredOrder = {
      ...processing,
      deliveredCredentials,
      updatedAt: Date.now(),
    }
    await saveOrder(env, deliveredOrder)
    const delivery = formatDelivery(result.delivery)
    if (!delivery) throw new Error('Provider returned an empty delivery.')
    await sendMessage(
      env,
      order.userId,
      `✅ سفارش شما آماده است.\n\n${delivery}\n\n${getPersianWarrantyDescription(order.productWarrantySource, order.productDescription)}\n\n${getPersianLoginInstructions(order.productWarrantySource, order.productDescription, delivery)}`,
    )
    const completed: StoredOrder = {
      ...deliveredOrder,
      status: 'completed',
      updatedAt: Date.now(),
      completedAt: Date.now(),
    }
    await saveOrder(env, completed)
    await upsertCustomer(
      env,
      order.userId,
      { username: order.username, firstName: order.firstName },
      { completedOrders: 1, totalSpentToman: order.priceToman },
    )
    if (env.TELEGRAM_ADMIN_CHAT_ID) {
      await sendMessage(
        env,
        env.TELEGRAM_ADMIN_CHAT_ID,
        `تحویل سفارش ${order.reference} برای کاربر ${order.userId} انجام شد.`,
      )
    }
    return completed
  }

  await sendMessage(
    env,
    order.userId,
    '✅ سفارش شما ثبت شد. اطلاعات حساب به‌محض آماده‌شدن به‌صورت خودکار برایتان ارسال می‌شود.',
  )
  return processing
}

export async function completeOrderByReference(
  env: OrderActionEnvironment,
  reference: string,
): Promise<StoredOrder | null> {
  const order = await getOrderByReference(env, reference)
  if (!order || order.status === 'completed') return null
  const completed: StoredOrder = {
    ...order,
    status: 'completed',
    updatedAt: Date.now(),
    completedAt: Date.now(),
  }
  await saveOrder(env, completed)
  await upsertCustomer(
    env,
    order.userId,
    { username: order.username, firstName: order.firstName },
    { completedOrders: 1, totalSpentToman: order.priceToman },
  )
  return completed
}
