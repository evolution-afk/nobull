import { useEffect, useState } from 'react'
import {
  Download,
  Gauge,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  Wifi,
} from 'lucide-react'
import type { VpnServer, VpnSubscription } from '../types'
import { formatNumber } from '../utils/format'
import { getTelegramInitData } from '../utils/telegram'
import {
  formatVpnExpiry,
  normalizeVpnSubscriptions,
  protocolLabel,
} from '../utils/vpnCatalog'

type LoadStatus = 'loading' | 'ready' | 'error'

const MY_URL = '/api/vpn/my'
const CONFIG_URL = '/api/vpn/config'

const SERVER_FLAGS: Array<{ tokens: string[]; flag: string }> = [
  { tokens: ['آلمان', 'germany', 'frankfurt', 'فرانکفورت'], flag: '🇩🇪' },
  { tokens: ['آمریکا', 'امریکا', 'united states', 'usa', 'america'], flag: '🇺🇸' },
  { tokens: ['انگلیس', 'انگلستان', 'بریتانیا', 'england', 'london', 'uk'], flag: '🇬🇧' },
  { tokens: ['هلند', 'netherlands', 'amsterdam'], flag: '🇳🇱' },
  { tokens: ['فرانسه', 'france', 'paris'], flag: '🇫🇷' },
  { tokens: ['ترکیه', 'turkey', 'istanbul'], flag: '🇹🇷' },
  { tokens: ['امارات', 'دبی', 'uae', 'dubai'], flag: '🇦🇪' },
  { tokens: ['کانادا', 'canada'], flag: '🇨🇦' },
  { tokens: ['فنلاند', 'finland', 'helsinki'], flag: '🇫🇮' },
  { tokens: ['سوئد', 'sweden', 'stockholm'], flag: '🇸🇪' },
  { tokens: ['سوئیس', 'switzerland', 'zurich'], flag: '🇨🇭' },
  { tokens: ['اتریش', 'austria', 'vienna'], flag: '🇦🇹' },
  { tokens: ['لهستان', 'poland', 'warsaw'], flag: '🇵🇱' },
  { tokens: ['روسیه', 'russia', 'moscow'], flag: '🇷🇺' },
  { tokens: ['سنگاپور', 'singapore'], flag: '🇸🇬' },
  { tokens: ['ژاپن', 'japan', 'tokyo'], flag: '🇯🇵' },
  { tokens: ['ایران', 'iran', 'tehran'], flag: '🇮🇷' },
  { tokens: ['ایتالیا', 'italy', 'milan'], flag: '🇮🇹' },
  { tokens: ['اسپانیا', 'spain', 'madrid'], flag: '🇪🇸' },
]

/** Best-effort flag lookup so server buttons read as "- دانلود کانفیگ آلمان". */
function serverFlag(name: string): string {
  const haystack = name.toLowerCase()
  for (const entry of SERVER_FLAGS) {
    if (entry.tokens.some((token) => haystack.includes(token))) return entry.flag
  }
  return '🌐'
}

function filenameSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64)
}

function toErrorMessage(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function VpnSubscriptions() {
  const [initData] = useState(() => getTelegramInitData())
  const [subscriptions, setSubscriptions] = useState<VpnSubscription[]>([])
  const [servers, setServers] = useState<VpnServer[]>([])
  const [status, setStatus] = useState<LoadStatus>(initData ? 'loading' : 'error')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!initData) return
    const controller = new AbortController()

    void fetch(MY_URL, {
      cache: 'no-store',
      headers: { 'X-Telegram-Init-Data': initData },
      signal: controller.signal,
    })
      .then(async (response) => {
        const contentType = response.headers.get('content-type') ?? ''
        const payload: unknown = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : null
        if (!response.ok) {
          const record =
            payload && typeof payload === 'object' && !Array.isArray(payload)
              ? (payload as Record<string, unknown>)
              : {}
          throw new Error(
            toErrorMessage(record.error, 'دریافت اشتراک‌های وی‌پی‌ان ناموفق بود.'),
          )
        }
        const normalized = normalizeVpnSubscriptions(payload)
        if (!normalized) throw new Error('پاسخ سرور معتبر نیست.')
        return normalized
      })
      .then((normalized) => {
        if (controller.signal.aborted) return
        setSubscriptions(normalized.subscriptions)
        setServers(normalized.servers)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : 'دریافت اشتراک‌های وی‌پی‌ان ناموفق بود.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [initData, reloadToken])

  const retry = () => {
    if (!initData) return
    setStatus('loading')
    setErrorMessage('')
    setReloadToken((token) => token + 1)
  }

  const downloadConfig = async (
    subscription: VpnSubscription,
    server: VpnServer,
  ) => {
    if (!initData) {
      setErrorMessage('برای دریافت کانفیگ، فروشگاه را از داخل ربات تلگرام باز کنید.')
      return
    }
    if (busyKey) return

    setBusyKey(`${subscription.id}:${server.code}`)
    setErrorMessage('')
    setNotice('')

    try {
      const url = `${CONFIG_URL}?sub_id=${encodeURIComponent(
        String(subscription.id),
      )}&server_code=${encodeURIComponent(
        server.code,
      )}&initData=${encodeURIComponent(initData)}`
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? ''
        const payload: unknown = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : null
        const record =
          payload && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {}
        throw new Error(
          toErrorMessage(record.error, 'دریافت فایل کانفیگ ناموفق بود.'),
        )
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `Veloxa-${filenameSegment(
        server.code,
      )}-${filenameSegment(subscription.radius_username)}.ovpn`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
      setNotice(`فایل کانفیگ ${server.name} دانلود شد.`)
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
      )
    } finally {
      setBusyKey('')
    }
  }

  const displayError =
    errorMessage ||
    (!initData
      ? 'برای مشاهده اشتراک‌ها، فروشگاه را از داخل ربات تلگرام باز کنید.'
      : '')

  return (
    <section
      aria-labelledby="vpn-subscriptions-title"
      className="mx-auto mt-8 max-w-4xl rounded-[28px] border border-white/[0.1] bg-[#080b0c]/90 p-5 shadow-[0_24px_100px_rgba(0,0,0,0.65)] sm:p-8"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/[0.08] text-primary">
          <Server size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold text-primary">مدیریت اتصال</p>
          <h2
            id="vpn-subscriptions-title"
            className="mt-1 text-xl font-bold"
          >
            اشتراک‌های وی‌پی‌ان من
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-white/50">
            حجم و اعتبار اشتراک بین همه سرورها مشترک است؛ برای هر مکان، کانفیگ
            اختصاصی همان سرور را دانلود کنید.
          </p>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-4 text-xs leading-6 text-emerald-100/85"
        >
          {notice}
        </p>
      )}

      {displayError && (
        <div
          role="alert"
          className="mt-5 flex flex-col items-start gap-4 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm leading-7 text-red-200/80">
            <TriangleAlert
              size={16}
              className="mt-1 shrink-0"
              aria-hidden="true"
            />
            {displayError}
          </p>
          {initData && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-red-300/25 px-4 text-xs font-semibold text-red-100 transition hover:bg-red-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300/60"
            >
              <RefreshCw size={14} aria-hidden="true" />
              تلاش دوباره
            </button>
          )}
        </div>
      )}

      {status === 'loading' ? (
        <div className="mt-5 space-y-4">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="h-[220px] animate-pulse rounded-[22px] border border-white/[0.06] bg-white/[0.025]"
            />
          ))}
        </div>
      ) : status === 'error' ? null : subscriptions.length ? (
        <div className="mt-5 space-y-4">
          {subscriptions.map((subscription) => (
            <SubscriptionCard
              key={subscription.id}
              subscription={subscription}
              servers={servers}
              busyKey={busyKey}
              onDownload={downloadConfig}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-12 text-center">
          <Server className="mx-auto text-white/25" size={25} aria-hidden="true" />
          <p className="mt-3 text-sm text-white/60">
            هنوز اشتراک وی‌پی‌ان فعالی برای این حساب ثبت نشده است.
          </p>
          <p className="mt-2 text-xs text-white/35">
            پس از خرید اشتراک، وضعیت مصرف و کانفیگ سرورها همین‌جا نمایش داده
            می‌شود.
          </p>
        </div>
      )}
    </section>
  )
}

function SubscriptionCard({
  subscription,
  servers,
  busyKey,
  onDownload,
}: {
  subscription: VpnSubscription
  servers: VpnServer[]
  busyKey: string
  onDownload: (subscription: VpnSubscription, server: VpnServer) => void
}) {
  const usage = subscription.usage
  const expiry = formatVpnExpiry(subscription.expiry_date)
  const quotaGb = usage.quota_gb > 0 ? usage.quota_gb : 0
  const usedGb = Math.max(0, usage.used_gb)
  const percent =
    quotaGb > 0 ? Math.min(100, Math.round((usedGb / quotaGb) * 100)) : 0
  const usedLabel = quotaGb > 0 ? formatNumber(usedGb) : '—'
  const quotaLabel = quotaGb > 0 ? formatNumber(quotaGb) : '—'

  return (
    <article className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(0,242,255,0.05),rgba(11,17,20,0.97)_48%)]">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold leading-6 text-white">
              {subscription.plan_name}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1">
                <Wifi size={11} className="text-primary/70" aria-hidden="true" />
                {expiry ? `اعتبار تا ${expiry}` : 'تاریخ انقضا نامشخص'}
              </span>
              <span dir="ltr" className="font-mono text-[10.5px] text-white/35">
                {subscription.radius_username}
              </span>
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/[0.07] px-2.5 py-1 text-[10.5px] font-semibold text-emerald-100/90">
            <ShieldCheck size={11} aria-hidden="true" />
            فعال
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/25 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] text-white/50">
              <Gauge size={12} className="text-primary/65" aria-hidden="true" />
              مصرف حجم
            </p>
            <p className="text-[11.5px] font-bold text-white/85">
              {usedLabel}
              <span className="mx-1 font-normal text-white/35">از</span>
              {quotaLabel}
              <span className="mr-1 font-normal text-white/40">گیگابایت</span>
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="درصد مصرف حجم"
            className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
          >
            <span
              className={`block h-full rounded-full transition-[width] ${
                percent >= 90
                  ? 'bg-red-400/80'
                  : percent >= 70
                    ? 'bg-amber-300/80'
                    : 'bg-primary'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10.5px] text-white/40">
            <span>{formatNumber(Math.max(0, usage.remaining_gb))} گیگابایت باقی‌مانده</span>
            <span>
              {usage.live
                ? 'آمار لحظه‌ای از سرور'
                : 'آخرین مقدار ثبت‌شده (سرور در دسترس نیست)'}
            </span>
          </p>
        </div>
      </div>

      <div className="border-t border-white/[0.07] bg-black/20 p-4 sm:px-5">
        <p className="text-[11px] font-semibold text-white/55">
          دانلود کانفیگ برای همه مکان‌ها
        </p>
        {servers.length ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {servers.map((server) => {
              const busy = busyKey === `${subscription.id}:${server.code}`
              return (
                <button
                  key={server.code}
                  type="button"
                  onClick={() => void onDownload(subscription, server)}
                  disabled={busyKey !== ''}
                  aria-busy={busy}
                  className="inline-flex h-11 items-center justify-between gap-2 rounded-xl border border-primary/[0.22] bg-primary/[0.05] px-3.5 text-[12px] font-semibold text-[#B9FCFF] transition hover:border-primary/45 hover:bg-primary/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="text-[15px] leading-none">
                      {serverFlag(server.name)}
                    </span>
                    <span className="truncate">
                      دانلود کانفیگ {server.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-white/45">
                    <span
                      dir="ltr"
                      className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {protocolLabel(server.protocol_default)}
                    </span>
                    {busy ? (
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                    ) : (
                      <Download size={14} aria-hidden="true" />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3.5 py-2.5 text-[11.5px] leading-6 text-amber-100/75">
            در حال حاضر سرور فعالی برای دانلود کانفیگ ثبت نشده است.
          </p>
        )}
      </div>
    </article>
  )
}
