import { KeyRound, MessageCircle, PackageCheck, Users } from 'lucide-react'
import type { Product } from '../types'
import { formatNumber, stockLabel, stockToneClass } from '../utils/format'
import {
  getPersianProductBadges,
  translateProductText,
} from '../utils/persianTranslator'

const DURATION_PATTERN = /ماهه|روزه|ساله/
const METHOD_PATTERN = /کد فعال‌سازی|دعوت‌نامه|اشتراکی|اختصاصی|اکانت آماده|آزمایشی|ظرفیت/

function methodIcon(method: string) {
  if (/اشتراکی|ظرفیت/.test(method)) {
    return <Users size={13} aria-hidden="true" />
  }
  if (/دعوت‌نامه/.test(method)) {
    return <MessageCircle size={13} aria-hidden="true" />
  }
  if (/اکانت آماده/.test(method)) {
    return <PackageCheck size={13} aria-hidden="true" />
  }
  return <KeyRound size={13} aria-hidden="true" />
}

export function PlanCard({
  product,
  onSelect,
}: {
  product: Product
  onSelect: () => void
}) {
  const badges = getPersianProductBadges(product.name, product.description)
  const duration = badges.find((badge) => DURATION_PATTERN.test(badge))
  const method =
    badges.find((badge) => METHOD_PATTERN.test(badge)) ?? 'روش تحویل در جزئیات پلن'
  const title = product.persianName || translateProductText(product.name)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`جزئیات پلن ${title}`}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-surface-card px-4 py-3.5 text-right transition hover:border-primary/[0.28] hover:bg-[#0D1518] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-white">
          <span className="min-w-0 truncate">{title}</span>
          {duration && (
            <em className="shrink-0 rounded-md border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 text-[11.5px] font-semibold not-italic text-primary/85">
              {duration}
            </em>
          )}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-white/60">
          <span className="text-primary/60">{methodIcon(method)}</span>
          <span className="line-clamp-1">{method}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="flex items-baseline gap-1 whitespace-nowrap text-sm font-extrabold text-white">
          {formatNumber(product.price_toman)}
          <span className="text-[11.5px] font-semibold text-white/60">تومان</span>
        </span>
        <span
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold ${stockToneClass(product.status)}`}
        >
          {stockLabel(product)}
        </span>
      </span>
    </button>
  )
}
