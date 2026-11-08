import { useEffect, useState } from 'react'
import { Check, CircleCheck, Copy, Download, X } from 'lucide-react'
import type { VpnCheckoutResult } from '../types'
import { copyTextToClipboard } from '../utils/clipboard'
import { formatNumber } from '../utils/format'
import { formatVpnExpiry } from '../utils/vpnCatalog'

function CredentialField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    setCopied(await copyTextToClipboard(value))
  }

  return (
    <div className="min-w-0 rounded-xl border border-white/[0.09] bg-black/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] text-white/40">{label}</p>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`کپی ${label}`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-semibold text-primary/80 transition hover:bg-primary/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
        >
          {copied ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <Copy size={12} aria-hidden="true" />
          )}
          {copied ? 'کپی شد' : 'کپی'}
        </button>
      </div>
      <p
        dir="ltr"
        className="mt-1 text-left font-mono text-[12.5px] leading-6 break-all text-white/90"
      >
        {value}
      </p>
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="text-[10.5px] text-white/40">{label}</dt>
      <dd className="mt-1 text-[12px] font-bold text-white/90">{value}</dd>
    </div>
  )
}

export function VpnPurchaseReceipt({
  result,
  onDismiss,
}: {
  result: VpnCheckoutResult
  onDismiss?: () => void
}) {
  const expiry = formatVpnExpiry(result.expiresAt)
  const isDownloadableProfile = result.configUrl?.startsWith('data:') ?? false

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-primary/[0.22] bg-[linear-gradient(155deg,rgba(0,242,255,0.08),rgba(11,17,20,0.97)_52%)] p-4 sm:p-5">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,#00F2FF,rgba(0,242,255,0.18)_62%,transparent)]"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08] text-primary"
          >
            <CircleCheck size={19} />
          </span>
          <div className="min-w-0">
            <h2
              id="vpn-receipt-title"
              className="text-[15px] font-extrabold leading-6 text-white"
            >
              اشتراک شما فعال شد
            </h2>
            <p className="mt-0.5 truncate text-[11.5px] text-white/45">
              {result.planTitle}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="بستن اطلاعات اتصال"
            className="shrink-0 rounded-lg p-1.5 text-white/45 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <CredentialField label="نام کاربری" value={result.username} />
        <CredentialField label="رمز عبور" value={result.password} />
      </div>

      {result.configUrl && (
        <a
          href={result.configUrl}
          {...(isDownloadableProfile
            ? { download: `nobull-${result.serverCode || 'vpn'}.ovpn` }
            : { target: '_blank', rel: 'noreferrer noopener' })}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[12.5px] font-extrabold text-[#00161A] transition hover:bg-[#4FF7FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Download size={15} aria-hidden="true" />
          دانلود فایل کانفیگ
        </a>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
        <MetaCell
          label="حجم"
          value={`${formatNumber(result.quotaGb)} گیگابایت`}
        />
        <MetaCell label="مدت" value={`${formatNumber(result.durationDays)} روز`} />
        <MetaCell label="اعتبار تا" value={expiry ?? '—'} />
        <MetaCell
          label="موجودی کیف پول"
          value={`${formatNumber(result.walletBalanceToman)} تومان`}
        />
      </dl>

      <p className="mt-3 text-[11.5px] leading-6 text-white/45">
        فایل کانفیگ را در اپلیکیشن OpenVPN وارد کنید و با نام کاربری و رمز بالا
        متصل شوید. کانفیگ اولیه برای{' '}
        <span className="font-semibold text-white/70">
          {result.serverName || result.serverCode}
        </span>{' '}
        ساخته شده است؛ حجم و اعتبار اشتراک روی همه سرورها مشترک است.
      </p>
      <p className="mt-1.5 text-[10.5px] text-white/30">
        شماره سفارش: {result.orderId}
      </p>
      {result.orderReference && (
        <p className="mt-0.5 text-[10.5px] text-white/30">
          شناسه پیگیری:{' '}
          <span dir="ltr" className="font-mono">
            {result.orderReference}
          </span>
        </p>
      )}
    </div>
  )
}

export function VpnPurchaseModal({
  result,
  onClose,
}: {
  result: VpnCheckoutResult
  onClose: () => void
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="vpn-receipt-title"
        className="w-full max-w-xl"
      >
        <VpnPurchaseReceipt result={result} onDismiss={onClose} />
      </section>
    </div>
  )
}
