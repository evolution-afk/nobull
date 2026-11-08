import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Boxes,
  Clock3,
  Gauge,
  RefreshCw,
  Server,
  ShieldCheck,
  ShoppingCart,
  TriangleAlert,
  Wallet,
  Zap,
} from 'lucide-react'
import type { VpnCheckoutResult, VpnPlan, VpnServer } from '../types'
import { formatNumber } from '../utils/format'
import { getTelegramInitData } from '../utils/telegram'
import {
  normalizeCheckoutResult,
  normalizeVpnCatalog,
  protocolLabel,
} from '../utils/vpnCatalog'
import { VpnPurchaseModal, VpnPurchaseReceipt } from './VpnPurchaseReceipt'

type LoadStatus = 'loading' | 'ready' | 'error'

interface CheckoutIssue {
  kind: 'insufficient' | 'refunded' | 'error'
  title: string
  message: string
  balanceToman?: number
  requiredToman?: number
  orderReference?: string
}

const CATALOG_URL = '/api/vpn/catalog'
const CHECKOUT_URL = '/api/vpn/checkout'
const SERVER_FIELD_NAME = 'vpn-server'

interface PlanSpec {
  key: string
  label: string
  value: string
  icon: ReactNode
  muted: boolean
}

/**
 * Always returns the same three slots so the spec columns line up across cards;
 * values the operator has not set render as a muted dash.
 */
function planSpecs(plan: VpnPlan): PlanSpec[] {
  const hasDuration = plan.duration_days !== null && plan.duration_days > 0
  const hasSpeed = plan.max_speed_mbps !== null && plan.max_speed_mbps > 0
  return [
    {
      key: 'quota',
      label: 'حجم',
      value: `${formatNumber(plan.quota_gb)} گیگابایت`,
      icon: <Boxes size={11} aria-hidden="true" />,
      muted: false,
    },
    {
      key: 'duration',
      label: 'مدت',
      value: hasDuration
        ? `${formatNumber(plan.duration_days ?? 0)} روز`
        : '—',
      icon: <Clock3 size={11} aria-hidden="true" />,
      muted: !hasDuration,
    },
    {
      key: 'speed',
      label: 'سرعت',
      value: hasSpeed ? `${formatNumber(plan.max_speed_mbps ?? 0)} مگابیت` : '—',
      icon: <Gauge size={11} aria-hidden="true" />,
      muted: !hasSpeed,
    },
  ]
}

export function VpnCatalog({
  onOpenWallet,
}: {
  onOpenWallet?: () => void
}) {
  const [plans, setPlans] = useState<VpnPlan[]>([])
  const [servers, setServers] = useState<VpnServer[]>([])
  const [selectedServerCode, setSelectedServerCode] = useState('')
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [busyPlanId, setBusyPlanId] = useState('')
  const [checkoutIssue, setCheckoutIssue] = useState<CheckoutIssue | null>(null)
  const [purchase, setPurchase] = useState<VpnCheckoutResult | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    void fetch(CATALOG_URL, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const contentType = response.headers.get('content-type') ?? ''
        const payload: unknown = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : null
        if (response.status === 404) {
          throw new Error('مسیر کاتالوگ وی‌پی‌ان در این محیط فعال نیست.')
        }
        if (!response.ok) {
          const record =
            payload && typeof payload === 'object'
              ? (payload as { error?: unknown })
              : {}
          const message =
            typeof record.error === 'string' ? record.error.trim() : ''
          throw new Error(message || 'دریافت پلن‌های وی‌پی‌ان ناموفق بود.')
        }
        if (!payload) {
          throw new Error('پاسخ کاتالوگ وی‌پی‌ان معتبر نیست.')
        }
        return normalizeVpnCatalog(payload)
      })
      .then((catalog) => {
        if (controller.signal.aborted) return
        setPlans(catalog.plans)
        setServers(catalog.servers)
        setSelectedServerCode((current) =>
          catalog.servers.some((server) => server.code === current)
            ? current
            : (catalog.servers[0]?.code ?? ''),
        )
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : 'دریافت پلن‌های وی‌پی‌ان ناموفق بود.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [reloadToken])

  const selectedServer = useMemo(
    () =>
      servers.find((server) => server.code === selectedServerCode) ?? null,
    [servers, selectedServerCode],
  )

  const cheapestPrice = useMemo(
    () =>
      plans.length
        ? Math.min(...plans.map((plan) => plan.price_amount))
        : null,
    [plans],
  )

  const retry = () => {
    setStatus('loading')
    setErrorMessage('')
    setReloadToken((token) => token + 1)
  }

  const busy = busyPlanId !== ''

  const startCheckout = async (plan: VpnPlan) => {
    if (busy) return
    if (!selectedServer) {
      setCheckoutIssue({
        kind: 'error',
        title: 'سرور اتصال انتخاب نشده است',
        message: 'برای ساخت کانفیگ اولیه، یکی از سرورها را انتخاب کنید.',
      })
      return
    }
    const initData = getTelegramInitData()
    if (!initData) {
      setCheckoutIssue({
        kind: 'error',
        title: 'خرید از داخل تلگرام انجام می‌شود',
        message:
          'برای پرداخت و دریافت اطلاعات اتصال، فروشگاه را از داخل ربات تلگرام باز کنید.',
      })
      return
    }

    setBusyPlanId(plan.id)
    setCheckoutIssue(null)

    try {
      const response = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan.id,
          server_code: selectedServer.code,
          initData,
        }),
        cache: 'no-store',
      })
      const contentType = response.headers.get('content-type') ?? ''
      const payload: unknown = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : null

      if (response.ok && record?.ok === true) {
        const result = normalizeCheckoutResult(record)
        if (!result) throw new Error('پاسخ سفارش معتبر نیست.')
        setPurchase(result)
        setReceiptOpen(true)
        return
      }

      const message =
        typeof record?.error === 'string' && record.error.trim()
          ? record.error.trim()
          : 'ثبت سفارش وی‌پی‌ان ناموفق بود.'
      const orderReference =
        typeof record?.order_reference === 'string'
          ? record.order_reference
          : undefined
      const balanceToman = Number(record?.balance_toman)
      const requiredToman = Number(record?.required_toman)

      if (response.status === 402) {
        setCheckoutIssue({
          kind: 'insufficient',
          title: 'موجودی کیف پول کافی نیست',
          message,
          balanceToman: Number.isFinite(balanceToman) ? balanceToman : undefined,
          requiredToman: Number.isFinite(requiredToman)
            ? requiredToman
            : undefined,
        })
        return
      }
      if (record?.refunded === true) {
        setCheckoutIssue({
          kind: 'refunded',
          title: 'سرور موقتاً در دسترس نیست',
          message,
          orderReference,
        })
        return
      }
      setCheckoutIssue({
        kind: 'error',
        title: 'ثبت سفارش ناموفق بود',
        message,
        orderReference,
      })
    } catch (error) {
      setCheckoutIssue({
        kind: 'error',
        title: 'اتصال به سرور برقرار نشد',
        message:
          error instanceof Error && /[\u0600-\u06FF]/.test(error.message)
            ? error.message
            : 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
      })
    } finally {
      setBusyPlanId('')
    }
  }

  return (
    <section aria-labelledby="vpn-title" className="mt-6">
      <div className="overflow-hidden rounded-[26px] border border-primary/[0.16] bg-[linear-gradient(150deg,rgba(0,242,255,0.07),rgba(8,11,12,0.96)_46%,rgba(8,11,12,0.98))]">
        <div className="relative p-5 sm:p-7">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,#00F2FF,rgba(0,242,255,0.16)_62%,transparent)]"
          />

          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 max-w-[560px]">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-semibold text-primary/90">
                <ShieldCheck size={12} aria-hidden="true" />
                IP ثابت
              </p>
              <h1
                id="vpn-title"
                className="mt-3 text-[22px] font-extrabold leading-[1.6] tracking-tight sm:text-[27px] sm:leading-[1.55]"
              >
                خرید وی‌پی‌ان (آی‌پی ثابت)
              </h1>
              <p className="mt-2 max-w-[470px] text-[13px] leading-7 text-white/55">
                حجم و اعتبار اشتراک بین همه سرورها مشترک است؛ انتخاب سرور فقط
                کانفیگ اولیه‌ای را مشخص می‌کند که تحویل می‌گیرید.
              </p>
            </div>

            <dl className="grid w-full max-w-[280px] grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] text-center">
              <div className="bg-surface px-3 py-3">
                <dt className="text-[10.5px] text-white/40">پلن فعال</dt>
                <dd className="mt-1.5 text-[16px] font-extrabold leading-none text-white">
                  {status === 'ready' ? formatNumber(plans.length) : '—'}
                </dd>
              </div>
              <div className="bg-surface px-3 py-3">
                <dt className="text-[10.5px] text-white/40">ارزان‌ترین پلن</dt>
                <dd className="mt-1.5 flex items-baseline justify-center gap-1 text-[16px] font-extrabold leading-none text-primary">
                  {cheapestPrice !== null ? formatNumber(cheapestPrice) : '—'}
                  {cheapestPrice !== null && (
                    <span className="text-[10px] font-semibold text-primary/60">
                      تومان
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <fieldset className="mt-6 border-t border-white/[0.07] pt-4">
            <legend className="flex items-center gap-2 px-0 text-[12.5px] font-semibold text-white/70">
              <Server size={14} className="text-primary/80" aria-hidden="true" />
              دریافت کانفیگ اولیه برای:
            </legend>

            {status === 'loading' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: 2 }, (_, index) => (
                  <div
                    key={index}
                    className="h-11 w-40 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025]"
                  />
                ))}
              </div>
            ) : servers.length > 0 ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {servers.map((server) => {
                    const active = server.code === selectedServerCode
                    return (
                      <label key={server.code} className="cursor-pointer">
                        <input
                          type="radio"
                          name={SERVER_FIELD_NAME}
                          value={server.code}
                          checked={active}
                          onChange={() => setSelectedServerCode(server.code)}
                          className="peer sr-only"
                        />
                        <span
                          className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-[12.5px] font-semibold transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary/60 ${
                            active
                              ? 'border-primary/[0.4] bg-primary/[0.08] text-[#B9FCFF]'
                              : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${
                              active
                                ? 'bg-primary shadow-[0_0_8px_#00F2FF]'
                                : 'bg-white/25'
                            }`}
                          />
                          {server.name}
                          <span
                            dir="ltr"
                            className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/45"
                          >
                            {protocolLabel(server.protocol_default)}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-3 text-[11.5px] leading-6 text-white/40">
                  {selectedServer
                    ? `کانفیگ اولیه برای ${selectedServer.name} (کد ${selectedServer.code}، پروتکل ${protocolLabel(selectedServer.protocol_default)}) ساخته می‌شود؛ حجم و اعتبار اشتراک روی همه سرورها مشترک است.`
                    : 'برای فعال‌شدن دکمه خرید، یک سرور انتخاب کنید.'}
                </p>
              </>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3.5 py-2.5 text-[11.5px] leading-6 text-amber-100/75">
                {status === 'error'
                  ? 'فهرست سرورها دریافت نشد؛ پس از تلاش دوباره نمایش داده می‌شود.'
                  : 'سرور فعالی ثبت نشده است؛ تا زمان فعال‌شدن سرور، افزودن به سبد امکان‌پذیر نیست.'}
              </p>
            )}
          </fieldset>
        </div>
      </div>

      {checkoutIssue && (
        <div
          role="alert"
          className={`mt-4 rounded-2xl border p-4 ${
            checkoutIssue.kind === 'insufficient'
              ? 'border-amber-300/25 bg-amber-300/[0.05]'
              : 'border-red-400/20 bg-red-400/[0.04]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${
                checkoutIssue.kind === 'insufficient'
                  ? 'text-amber-200/80'
                  : 'text-red-200/80'
              }`}
            >
              <TriangleAlert size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[12.5px] font-bold ${
                  checkoutIssue.kind === 'insufficient'
                    ? 'text-amber-100/90'
                    : 'text-red-100/90'
                }`}
              >
                {checkoutIssue.title}
              </p>
              <p className="mt-1 text-[12px] leading-6 text-white/55">
                {checkoutIssue.message}
              </p>
              {checkoutIssue.balanceToman !== undefined &&
                checkoutIssue.requiredToman !== undefined && (
                  <p className="mt-1.5 text-[11px] text-amber-100/70">
                    موجودی فعلی {formatNumber(checkoutIssue.balanceToman)} تومان
                    — مبلغ لازم {formatNumber(checkoutIssue.requiredToman)}{' '}
                    تومان
                  </p>
                )}
              {checkoutIssue.orderReference && (
                <p
                  dir="ltr"
                  className="mt-1.5 text-left text-[10.5px] text-white/35"
                >
                  {checkoutIssue.orderReference}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {checkoutIssue.kind === 'insufficient' && onOpenWallet && (
                  <button
                    type="button"
                    onClick={onOpenWallet}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-extrabold text-[#00161A] transition hover:bg-[#4FF7FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <Wallet size={14} aria-hidden="true" />
                    شارژ کیف پول
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCheckoutIssue(null)}
                  className="inline-flex h-10 items-center rounded-xl border border-white/15 px-4 text-[12px] font-semibold text-white/75 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-extrabold text-white">
          <Boxes size={17} className="text-primary/80" aria-hidden="true" />
          پلن‌های وی‌پی‌ان
        </h2>
        <span className="text-[12.5px] text-white/40">
          {status === 'ready'
            ? `${formatNumber(plans.length)} پلن فعال`
            : status === 'loading'
              ? 'در حال دریافت فهرست'
              : 'فهرست در دسترس نیست'}
        </span>
      </div>

      {status === 'error' ? (
        <div
          role="alert"
          className="mt-3 flex flex-col items-start gap-4 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm leading-7 text-red-200/80">{errorMessage}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300/25 px-4 text-xs font-semibold text-red-100 transition hover:bg-red-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300/60"
          >
            <RefreshCw size={14} aria-hidden="true" />
            تلاش دوباره
          </button>
        </div>
      ) : status === 'loading' ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-[236px] animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.025]"
            />
          ))}
        </div>
      ) : plans.length ? (
        <div className="mt-3 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <VpnPlanCard
              key={plan.id}
              plan={plan}
              highlight={
                cheapestPrice !== null && plan.price_amount === cheapestPrice
              }
              serverName={selectedServer?.name ?? null}
              disabled={!selectedServer || busy}
              busy={busyPlanId === plan.id}
              onAdd={() => void startCheckout(plan)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-12 text-center">
          <Boxes
            className="mx-auto text-white/25"
            size={25}
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-white/60">
            پلن فعالی برای فروش ثبت نشده است.
          </p>
          <p className="mt-2 text-xs text-white/35">
            به‌محض فعال‌شدن پلن‌ها، همین‌جا نمایش داده می‌شوند.
          </p>
        </div>
      )}

      {purchase && !receiptOpen && (
        <div className="mt-5">
          <VpnPurchaseReceipt
            result={purchase}
            onDismiss={() => setPurchase(null)}
          />
        </div>
      )}

      {purchase && receiptOpen && (
        <VpnPurchaseModal
          result={purchase}
          onClose={() => setReceiptOpen(false)}
        />
      )}

      <p className="mt-4 flex items-start gap-2 text-[11.5px] leading-6 text-white/40">
        <ShieldCheck
          size={14}
          className="mt-0.5 shrink-0 text-primary/60"
          aria-hidden="true"
        />
        اطلاعات اتصال پس از پرداخت از طریق ربات تلگرام تحویل داده می‌شود. حجم
        و مدت اشتراک بین همه سرورها مشترک است و کانفیگ اولیه برای سرور انتخابی
        ساخته می‌شود.
      </p>
    </section>
  )
}

function VpnPlanCard({
  plan,
  highlight,
  serverName,
  disabled,
  busy,
  onAdd,
}: {
  plan: VpnPlan
  highlight: boolean
  serverName: string | null
  disabled: boolean
  busy: boolean
  onAdd: () => void
}) {
  const specs = planSpecs(plan)

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-[20px] border p-4 transition ${
        highlight
          ? 'border-primary/[0.32] bg-[linear-gradient(155deg,rgba(0,242,255,0.08),rgba(11,17,20,0.97)_50%)]'
          : 'border-white/[0.07] bg-surface-card hover:border-white/[0.16]'
      }`}
    >
      {highlight && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,#00F2FF,rgba(0,242,255,0.18)_64%,transparent)]"
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-bold leading-7 text-white">
            {plan.name}
          </h3>
          {plan.name_en && (
            <p
              dir="ltr"
              className="mt-0.5 truncate text-[11px] tracking-[0.02em] text-white/35"
            >
              {plan.name_en}
            </p>
          )}
        </div>
        {highlight && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.09] px-2 py-0.5 text-[10.5px] font-semibold text-[#B9FCFF]">
            <Zap size={10} aria-hidden="true" />
            ارزان‌ترین
          </span>
        )}
      </div>

      <div className="mt-3.5 grid grid-cols-3 overflow-hidden rounded-xl border border-white/[0.06] bg-black/25">
        {specs.map((spec, index) => (
          <div
            key={spec.key}
            className={`px-2.5 py-2.5 ${
              index > 0 ? 'border-s border-white/[0.06]' : ''
            }`}
          >
            <p className="flex items-center gap-1 text-[10.5px] text-white/40">
              <span className="text-primary/55">{spec.icon}</span>
              {spec.label}
            </p>
            <p
              className={`mt-1 text-[12.5px] font-bold ${
                spec.muted ? 'text-white/30' : 'text-white/90'
              }`}
            >
              {spec.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <p className="flex items-baseline gap-1.5 text-[21px] font-extrabold leading-none text-white">
          {formatNumber(plan.price_amount)}
          <span className="text-[11.5px] font-semibold text-white/55">
            تومان
          </span>
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-[11px] text-white/40">
          <Server
            size={11}
            className="shrink-0 text-white/30"
            aria-hidden="true"
          />
          {serverName ? `کانفیگ اولیه: ${serverName}` : 'سرور انتخاب نشده'}
        </p>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          aria-busy={busy}
          className={`mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${
            highlight
              ? 'bg-primary text-[#00161A] hover:bg-[#4FF7FF]'
              : 'border border-primary/30 bg-primary/[0.07] text-primary hover:border-primary/55 hover:bg-primary/[0.12]'
          }`}
        >
          {busy ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              در حال فعال‌سازی…
            </>
          ) : (
            <>
              <ShoppingCart size={15} aria-hidden="true" />
              افزودن به سبد خرید
            </>
          )}
        </button>
      </div>
    </article>
  )
}
