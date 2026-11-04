import { ArrowUpLeft, ChevronLeft, ChevronRight, CircleCheck, KeyRound, Tag } from 'lucide-react'
import type { Product } from '../types'
import { BrandLogo } from './BrandLogo'
import { formatNumber, stockLabel } from '../utils/format'
import {
  getPersianProductBadges,
  translateProductText,
} from '../utils/persianTranslator'

const DURATION_PATTERN = /ماهه|روزه|ساله/
const METHOD_PATTERN = /کد فعال‌سازی|دعوت‌نامه|اشتراکی|اختصاصی|اکانت آماده|آزمایشی|ظرفیت/

export function FeaturedOffer({
  product,
  index,
  total,
  loading,
  onPrevious,
  onNext,
  onSelect,
  onBrowseAll,
}: {
  product?: Product
  index: number
  total: number
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onSelect: () => void
  onBrowseAll: () => void
}) {
  const badges = product
    ? getPersianProductBadges(product.name, product.description)
    : []
  const duration = badges.find((badge) => DURATION_PATTERN.test(badge))
  const method = badges.find((badge) => METHOD_PATTERN.test(badge))
  const carouselDisabled = total < 2

  return (
    <div className="relative flex flex-col gap-5 overflow-hidden rounded-[28px] border border-primary/[0.16] bg-surface-feature p-5 sm:p-7">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,#00F2FF,rgba(0,242,255,0.18)_65%,transparent)]"
      />

      <div>
        <h2 className="flex items-center gap-2.5 text-[17px] font-extrabold leading-8 sm:text-[19px] sm:leading-9">
          <Tag size={18} className="shrink-0 text-primary" aria-hidden="true" />
          پیشنهادی ویژه: فعال‌سازی روی اکانت شخصی شما
        </h2>
        <p className="mt-2 max-w-[640px] text-[13px] leading-7 text-white/60">
          محصولات دارای کد، کلید فعال‌سازی، دعوت‌نامه یا تحویل شخصی؛ روش، مدت و
          ضمانت هر محصول را پیش از سفارش بررسی کنید.
        </p>
      </div>

      {product ? (
        <div className="grid gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center sm:gap-5">
          <BrandLogo
            asset={product.brandAsset}
            className="h-14 w-14 rounded-[18px] sm:h-[72px] sm:w-[72px] sm:rounded-[20px]"
          />

          <div className="min-w-0">
            <p className="text-xs tracking-[0.04em] text-white/40">
              <span dir="ltr">{product.brand}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-[17px] font-extrabold leading-7 sm:text-[19px] sm:leading-8">
              {translateProductText(product.name)}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {product.featured && (
                <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/[0.28] bg-primary/[0.07] px-2.5 text-xs text-[#B9FCFF]">
                  <CircleCheck size={13} aria-hidden="true" />
                  پیشنهاد منتخب نوبول
                </span>
              )}
              <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 text-xs text-emerald-200">
                {stockLabel(product)}
              </span>
              {duration && (
                <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white/80">
                  {duration}
                </span>
              )}
              {method && (
                <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white/80">
                  <KeyRound size={13} className="text-primary/70" aria-hidden="true" />
                  {method}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="flex items-baseline gap-2 whitespace-nowrap text-[30px] font-extrabold leading-none text-primary sm:text-[36px]">
              {formatNumber(product.price_toman)}
              <span className="text-[13px] font-semibold text-white/70">تومان</span>
            </p>
            <button
              type="button"
              onClick={onSelect}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-extrabold text-[#00161A] transition hover:bg-[#4FF7FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              جزئیات و خرید
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-center">
          <span
            aria-hidden="true"
            className="h-14 w-14 rounded-[18px] border border-white/10 bg-white/[0.03] sm:h-[72px] sm:w-[72px]"
          />
          <p className="text-sm text-white/50">
            {loading ? 'در حال دریافت پیشنهادها…' : 'پیشنهاد شخصی تازه به‌زودی'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={carouselDisabled}
            aria-label="پیشنهاد قبلی"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={carouselDisabled}
            aria-label="پیشنهاد بعدی"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <span className="ms-1.5 text-xs text-white/40">
            {total
              ? `${formatNumber(index + 1)} از ${formatNumber(total)} پیشنهاد`
              : loading
                ? 'در حال بارگذاری پیشنهادها…'
                : 'پیشنهاد شخصی تازه به‌زودی'}
          </span>
        </div>
        <button
          type="button"
          onClick={onBrowseAll}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary/90 transition hover:text-primary"
        >
          مشاهده همه محصولات
          <ArrowUpLeft size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
