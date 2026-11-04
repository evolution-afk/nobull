import { ArrowUpLeft, ChevronDown } from 'lucide-react'
import type { BrandGroup, Product } from '../types'
import { BrandLogo } from './BrandLogo'
import { PlanCard } from './PlanCard'
import { formatNumber } from '../utils/format'
import { translateProductText } from '../utils/persianTranslator'

export function BrandCard({
  group,
  persianBrand,
  summary,
  expanded,
  onToggle,
  onOpenGuide,
  onSelectPlan,
}: {
  group: BrandGroup
  persianBrand: string
  summary: string
  expanded: boolean
  onToggle: () => void
  onOpenGuide: () => void
  onSelectPlan: (product: Product) => void
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border border-white/[0.09] bg-surface-card transition-colors hover:border-white/[0.16]">
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3.5">
          <BrandLogo asset={group.asset} className="h-11 w-11 rounded-xl" />
          <div className="min-w-0">
            <h3 className="flex items-baseline gap-2 text-[17px] font-extrabold text-white">
              <span dir="ltr">{group.brand}</span>
              <em className="text-[13.5px] font-semibold not-italic text-white/60">
                {persianBrand}
              </em>
            </h3>
            <p className="mt-1 text-[12.5px] text-white/40">
              {formatNumber(group.plans.length)} پلن
            </p>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3.5">
          <p className="line-clamp-1 text-[13px] font-bold text-white/90">
            {translateProductText(group.lowestPlan.name)}
          </p>
          <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-white/60">
            {summary}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/[0.06] pt-3.5">
          <div>
            <p className="text-xs text-white/40">شروع قیمت از</p>
            <p className="mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap text-[24px] font-extrabold leading-none text-primary sm:text-[26px]">
              {formatNumber(group.lowestPlan.price_toman)}
              <span className="text-[12.5px] font-semibold text-white/70">تومان</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenGuide}
            aria-label={`راهنمای کامل ${group.brand}`}
            title="راهنمای کامل و پلن‌ها"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/25 bg-primary/[0.07] text-primary transition hover:border-primary/60 hover:bg-primary/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ArrowUpLeft size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.02] px-5 py-3.5 text-[12.5px] font-semibold text-white/70 transition hover:bg-primary/[0.06] hover:text-primary sm:px-6"
      >
        <span>همه پلن‌های {persianBrand}</span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-surface-rail p-3">
          {group.plans.map((product) => (
            <PlanCard
              key={product.id}
              product={product}
              onSelect={() => onSelectPlan(product)}
            />
          ))}
        </div>
      )}
    </article>
  )
}
