interface TranslationRule {
  pattern: RegExp
  replacement: string
}

const rules: TranslationRule[] = [
  { pattern: /\b(?:12\s*MONTHS?|1\s*YEAR)\b/gi, replacement: '۱۲ ماهه (یک‌ساله)' },
  { pattern: /\b6\s*MONTHS?\b/gi, replacement: '۶ ماهه' },
  { pattern: /\b3\s*MONTHS?\b/gi, replacement: '۳ ماهه' },
  { pattern: /\b(?:1\s*MONTH|30\s*DAYS?)\b/gi, replacement: '۱ ماهه' },
  { pattern: /\b(?:7\s*DAYS?|1\s*WEEK)\b/gi, replacement: '۷ روزه' },
  { pattern: /\b1\s*DAY\b/gi, replacement: '۱ روزه' },
  { pattern: /\b(?:REDEEM\s+CODE|COUPON\s+CODE|CDK)\b/gi, replacement: 'کد فعال‌سازی' },
  { pattern: /\bFULL\s+WARRANTY\b|\bFW\b/gi, replacement: 'گارانتی کامل' },
  { pattern: /\bNW\b/gi, replacement: 'بدون گارانتی' },
  { pattern: /\b(?:SHARED|SLOT)\b/gi, replacement: 'ظرفیت اختصاصی (اشتراکی)' },
  { pattern: /\b(?:PRIVATE|PERSONAL)\b/gi, replacement: 'اکانت شخصی' },
  { pattern: /\bTRIAL\b/gi, replacement: 'آزمایشی' },
  { pattern: /\bCREDITS?\b/gi, replacement: 'کردیت/اعتبار' },
  { pattern: /\bUNLIMITED\b/gi, replacement: 'نامحدود' },
  { pattern: /\bBUSINESS\b/gi, replacement: 'بیزینس' },
  { pattern: /\bPREMIUM\b/gi, replacement: 'پریمیوم' },
  { pattern: /\bSUPER\b/gi, replacement: 'سوپر' },
  { pattern: /\bACCOUNT\b/gi, replacement: 'اکانت آماده' },
  { pattern: /\bPLUS\b/gi, replacement: 'پلاس' },
  { pattern: /\bPRO\b/gi, replacement: 'پرو' },
]

const featureRules = rules.map(({ pattern, replacement }) => ({
  pattern,
  replacement,
}))

export function translateProductText(value: string): string {
  return rules
    .reduce(
      (translated, rule) => translated.replace(rule.pattern, rule.replacement),
      value,
    )
    .replace(/\s*[-|•]\s*/g, '، ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,،|/-]+|[\s,،|/-]+$/g, '')
    .trim()
}

export function getPersianProductBadges(...values: string[]): string[] {
  const text = values.filter(Boolean).join(' ')
  const badges = featureRules
    .filter(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text))
    .map(({ replacement }) => replacement)
  return [...new Set(badges)]
}
