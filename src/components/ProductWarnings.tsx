import { CircleCheck, Info, ShieldAlert, TriangleAlert } from 'lucide-react'
import type { ProductWarning, ProductWarningLevel } from '../types'
import { formatNumber } from '../utils/format'

interface LevelTone {
  Icon: typeof ShieldAlert
  box: string
  iconBox: string
  title: string
  subtitle: string
}

const LEVEL_TONE: Record<ProductWarningLevel, LevelTone> = {
  critical: {
    Icon: ShieldAlert,
    box: 'border-red-400/30 bg-red-500/[0.08]',
    iconBox: 'border-red-400/30 bg-red-500/[0.14] text-red-200',
    title: 'text-red-50',
    subtitle: 'text-red-200/60',
  },
  warning: {
    Icon: TriangleAlert,
    box: 'border-amber-300/25 bg-amber-300/[0.05]',
    iconBox: 'border-amber-300/25 bg-amber-300/[0.12] text-amber-200',
    title: 'text-amber-50',
    subtitle: 'text-amber-100/55',
  },
  info: {
    Icon: Info,
    box: 'border-sky-300/20 bg-sky-300/[0.04]',
    iconBox: 'border-sky-300/25 bg-sky-400/[0.12] text-sky-200',
    title: 'text-sky-50',
    subtitle: 'text-sky-100/50',
  },
  success: {
    Icon: CircleCheck,
    box: 'border-emerald-300/25 bg-emerald-300/[0.05]',
    iconBox: 'border-emerald-300/25 bg-emerald-300/[0.12] text-emerald-200',
    title: 'text-emerald-50',
    subtitle: 'text-emerald-100/55',
  },
}

export function ProductWarnings({
  warnings,
  max,
  className = '',
}: {
  warnings: ProductWarning[] | null | undefined
  /** Caps the visible rows; the remainder is summarised in a trailing line. */
  max?: number
  className?: string
}) {
  const list = warnings ?? []
  if (list.length === 0) return null

  const visible =
    typeof max === 'number' && max > 0 ? list.slice(0, max) : list
  const hiddenCount = list.length - visible.length

  return (
    <ul
      aria-label="شرایط و هشدارهای فعال‌سازی"
      className={`flex flex-col gap-1.5 ${className}`}
    >
      {visible.map((warning) => {
        const tone = LEVEL_TONE[warning.level] ?? LEVEL_TONE.info
        const Icon = tone.Icon

        return (
          <li
            key={warning.id}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${tone.box}`}
          >
            <span
              aria-hidden="true"
              className={`mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${tone.iconBox}`}
            >
              <Icon size={14} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                dir="rtl"
                className={`block text-[12.5px] font-extrabold leading-5 ${tone.title}`}
              >
                {warning.title_fa}
              </span>
              <span
                dir="ltr"
                className={`mt-0.5 block text-right text-[10px] font-medium leading-4 tracking-[0.03em] ${tone.subtitle}`}
              >
                {warning.title_en}
              </span>
            </span>
          </li>
        )
      })}

      {hiddenCount > 0 && (
        <li className="px-1 pt-0.5 text-[10.5px] font-semibold text-white/40">
          {`+${formatNumber(hiddenCount)} مورد دیگر در جزئیات پلن`}
        </li>
      )}
    </ul>
  )
}
