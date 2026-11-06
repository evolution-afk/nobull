/**
 * Rule based extraction of purchase-critical conditions from raw English
 * product descriptions returned by the upstream provider.
 *
 * The provider keeps every condition inside one free-form `description`
 * string, so nothing is stored in D1: warnings are derived on every catalog
 * read and returned next to the product in the API payload.
 */

export type ProductWarningLevel = 'critical' | 'warning' | 'info' | 'success'

export interface ProductWarning {
  id: string
  level: ProductWarningLevel
  title_fa: string
  title_en: string
}

/**
 * Descriptions often contain the opposite statement ("no credit card
 * required"). The card rule is the only one where that inversion is common,
 * so it is guarded separately before the rule is evaluated.
 */
const CARD_NEGATION_PATTERN =
  /(?:no|not|without)\s+(?:a\s+)?(?:credit\s+)?card|card\s+(?:is\s+|will\s+)?(?:not|never)\s+(?:be\s+)?(?:required|needed)/i

const WARNING_RULES: { pattern: RegExp; warning: ProductWarning }[] = [
  {
    pattern: /(credit card required|card.*required|need a card|payment of 0\.0|complete checkout using.*card|payment is required)/i,
    warning: { id: 'card_req', level: 'critical', title_fa: 'نیاز به کارت بانکی جهت فعال‌سازی', title_en: 'Card Required' }
  },
  {
    pattern: /(do not test links|one link = one redemption|account must not have subscribed before|fresh account|new account|fresh email|used once|only be used once|کد.*یکبار)/i,
    warning: { id: 'one_time', level: 'critical', title_fa: 'اکانت جدید / لینک و کد یکبار مصرف', title_en: 'Fresh Account / One-time Use' }
  },
  {
    pattern: /(no warranty after activation|warranty only if.*goes down|within the first.*hour|support issues within|no guarantee)/i,
    warning: { id: 'no_warranty', level: 'critical', title_fa: 'گارانتی بسیار محدود / بدون گارانتی', title_en: 'Limited / No Warranty' }
  },
  {
    pattern: /(cannot be refunded|no refund|non-refundable|non-transferable|cannot be.*transferred)/i,
    warning: { id: 'no_refund', level: 'warning', title_fa: 'غیرقابل استرداد و انتقال', title_en: 'No Refund / Transfer' }
  },
  {
    pattern: /(use only 1 device|maximum 2 devices|log in on 1-2 devices|do not share)/i,
    warning: { id: 'device_limit', level: 'warning', title_fa: 'محدودیت تعداد دستگاه', title_en: 'Device Limit' }
  },
  {
    pattern: /(do not change password|do not change payment|do not disconnect)/i,
    warning: { id: 'no_change', level: 'warning', title_fa: 'تغییر اطلاعات اکانت ممنوع است', title_en: 'Do Not Change Info' }
  },
  {
    pattern: /(can change mail and pass|change \+ reset the password|reset account security|must change|change the information|change 2fa|change.*email)/i,
    warning: { id: 'must_change', level: 'info', title_fa: 'الزام/امکان تغییر اطلاعات', title_en: 'Must Change Info' }
  },
  {
    pattern: /(switch vpn|different ip|proxy|use 5g|change ip|specific vpn|ip location)/i,
    warning: { id: 'vpn_required', level: 'warning', title_fa: 'نیاز به VPN یا IP خاص', title_en: 'Specific VPN/IP Required' }
  },
  {
    pattern: /(login via qr code|get help signing in|country code \+86|outlook\.com first|no otp|no 2fa)/i,
    warning: { id: 'login_quirk', level: 'info', title_fa: 'نیازمند روش ورود خاص', title_en: 'Special Login Method' }
  },
  {
    pattern: /(base url|custom endpoint|api\.gluapi\.com)/i,
    warning: { id: 'api_endpoint', level: 'warning', title_fa: 'نیازمند تنظیم Base URL اختصاصی', title_en: 'Custom API Endpoint Required' }
  },
  {
    pattern: /(official partner|vibi\.pro|gluapi\.com|redeem your.*code)/i,
    warning: { id: 'third_party', level: 'info', title_fa: 'استفاده در سایت واسط (پارتنر)', title_en: 'Third-Party Partner Site' }
  },
  {
    pattern: /(free account|promotion to receive|trial does not appear|آزمایشی)/i,
    warning: { id: 'trial_account', level: 'info', title_fa: 'اکانت تریال (آزمایشی)', title_en: 'Trial / Promo Account' }
  },
  {
    pattern: /(do not expire|without expiring|no expiration)/i,
    warning: { id: 'no_expire', level: 'success', title_fa: 'اعتبار بدون تاریخ انقضا', title_en: 'Credits Do Not Expire' }
  },
]

const LEVEL_ORDER: Record<ProductWarningLevel, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
}

/** Collapses newlines and bidirectional marks so multi-line rules still match. */
function normalizeDescription(description: string): string {
  return description
    .replace(/[\u200e\u200f\u200c\u202a-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns the ordered, de-duplicated warnings found in a product description.
 * Unknown or empty input yields an empty array.
 */
export function parseProductWarnings(description: string): ProductWarning[] {
  if (typeof description !== 'string' || !description.trim()) return []

  const text = normalizeDescription(description)
  if (!text) return []

  const cardIsNegated = CARD_NEGATION_PATTERN.test(text)
  const seenIds = new Set<string>()
  const seenTitles = new Set<string>()
  const warnings: ProductWarning[] = []

  for (const rule of WARNING_RULES) {
    const warning = rule.warning
    if (warning.id === 'card_req' && cardIsNegated) continue
    // Reset for safety in case a rule pattern is ever declared with /g.
    rule.pattern.lastIndex = 0
    if (!rule.pattern.test(text)) continue
    if (seenIds.has(warning.id) || seenTitles.has(warning.title_fa)) continue

    seenIds.add(warning.id)
    seenTitles.add(warning.title_fa)
    warnings.push({
      id: warning.id,
      level: warning.level,
      title_fa: warning.title_fa,
      title_en: warning.title_en,
    })
  }

  return warnings.sort(
    (first, second) => LEVEL_ORDER[first.level] - LEVEL_ORDER[second.level],
  )
}
