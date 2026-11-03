interface TranslationRule {
  pattern: RegExp
  replacement: string
}

const rules: TranslationRule[] = [
  { pattern: /\b25\s*DW\b/gi, replacement: '۲۵ روز گارانتی' },
  { pattern: /\b7\s*DW\b/gi, replacement: '۷ روز گارانتی' },
  {
    pattern: /\b(?:1\s*MW|1\s*W|FW|FULL\s+WARRANTY)\b/gi,
    replacement: 'گارانتی کامل',
  },
  { pattern: /\b(?:NW|NO\s+WARRANTY)\b/gi, replacement: 'بدون گارانتی' },
  {
    pattern: /\b(?:12\s*M|12\s*MONTHS?|1\s*YEAR)\b/gi,
    replacement: '۱ ساله',
  },
  {
    pattern: /\b(?:6\s*M|6\s*MONTHS?)\b/gi,
    replacement: '۶ ماهه',
  },
  {
    pattern: /\b(?:3\s*M|3\s*MONTHS?)\b/gi,
    replacement: '۳ ماهه',
  },
  {
    pattern: /\b(?:1\s*M|1\s*MONTH|30\s*DAYS?)\b/gi,
    replacement: '۱ ماهه',
  },
  { pattern: /\b14\s*DAYS?\b/gi, replacement: '۱۴ روزه' },
  { pattern: /\b7\s*DAYS?\b/gi, replacement: '۷ روزه' },
  { pattern: /\b1\s*W\b/gi, replacement: '۱ هفته' },
  { pattern: /\b1\s*DAY\b/gi, replacement: '۱ روزه' },
  {
    pattern: /\b(?:REDEEM\s+CODE|CDK|ACTIVATION\s+CODE)\b/gi,
    replacement: 'کد فعال‌سازی (روی اکانت شخصی)',
  },
  { pattern: /\b(?:APPLE\s+PAY)\b/gi, replacement: 'وریفای‌شده با اپل‌پی' },
  { pattern: /\b50\s*%\s*OFF\b/gi, replacement: 'تخفیف ویژه' },
  { pattern: /\bFREE\s+TRIAL\b/gi, replacement: 'پلن آزمایشی' },
  {
    pattern: /\b(?:INVITE\s+SLOTS?|EMAIL\s+INVITE)\b/gi,
    replacement: 'دعوت‌نامه به ایمیل شخصی',
  },
  { pattern: /\bINVITE\b/gi, replacement: 'دعوت‌نامه به ایمیل شخصی' },
  { pattern: /\b(?:KEY|COUPON\s+CODE)\b/gi, replacement: 'کد فعال‌سازی' },
  { pattern: /\bSHARED\b/gi, replacement: 'اشتراکی' },
  { pattern: /\bSLOT\b/gi, replacement: 'ظرفیت اشتراکی' },
  { pattern: /\b(?:PRIVATE|PERSONAL)\b/gi, replacement: 'اختصاصی' },
  { pattern: /\bTRIAL\b/gi, replacement: 'آزمایشی' },
  { pattern: /\bCREDITS?\b/gi, replacement: 'اعتبار' },
  { pattern: /\bUNLIMITED\b/gi, replacement: 'نامحدود' },
  { pattern: /\bBUSINESS\b/gi, replacement: 'تجاری' },
  { pattern: /\bPREMIUM\b/gi, replacement: 'پریمیوم' },
  { pattern: /\bSUPER\b/gi, replacement: 'سوپر' },
  { pattern: /\bACCOUNT\b/gi, replacement: 'اکانت' },
  { pattern: /\bPLUS\b/gi, replacement: 'پلاس' },
  { pattern: /\bPRO\b/gi, replacement: 'پرو' },
  { pattern: /\bCHAT\s*GPT\b/gi, replacement: 'چت‌جی‌پی‌تی' },
  { pattern: /\bGROK\b/gi, replacement: 'گراک' },
  { pattern: /\bCLAUDE\b/gi, replacement: 'کلود' },
  { pattern: /\bGEMINI\b/gi, replacement: 'جمینای' },
  { pattern: /\bMIDJOURNEY\b/gi, replacement: 'میدجرنی' },
  { pattern: /\bCANVA\b/gi, replacement: 'کانوا' },
  { pattern: /\bSPOTIFY\b/gi, replacement: 'اسپاتیفای' },
  { pattern: /\bYOUTUBE\b/gi, replacement: 'یوتیوب' },
  { pattern: /\bPERPLEXITY\b/gi, replacement: 'پرپلکسیتی' },
  { pattern: /\bCURSOR\b/gi, replacement: 'کرسر' },
  { pattern: /\bNETFLIX\b/gi, replacement: 'نتفلیکس' },
  { pattern: /\bCAPCUT\b/gi, replacement: 'کپ‌کات' },
  { pattern: /\bNOTION\b/gi, replacement: 'نوشن' },
  { pattern: /\bGOOGLE\b/gi, replacement: 'گوگل' },
  { pattern: /\bOPENAI\b/gi, replacement: 'اوپن‌ای‌آی' },
]

const featureRules = rules.map(({ pattern, replacement }) => ({
  pattern,
  replacement,
}))

function toPersianDigits(value: string): string {
  return value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
}

export function translateProductText(value: string): string {
  const translated = rules.reduce(
    (text, rule) => text.replace(rule.pattern, rule.replacement),
    value,
  )
  return toPersianDigits(translated)
    .replace(/\s*[-|•]\s*/g, '، ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,،|/-]+|[\s,،|/-]+$/g, '')
    .trim()
}

export function getPersianDeliveryDescription(...values: string[]): string {
  const text = values.join(' ').toLowerCase()
  if (/\b(?:cdk|redeem\s+code|activation\s+code|coupon\s+code)\b/.test(text)) {
    return 'تحویل به‌صورت کد فعال‌سازی است؛ کد را طبق راهنمای سرویس روی اکانت شخصی خودتان وارد می‌کنید.'
  }
  if (/\b(?:invite|invitation|invite\s+slot)\b/.test(text)) {
    return 'تحویل با دعوت‌نامه انجام می‌شود؛ ایمیل شخصی و در دسترس خودتان را برای دریافت دعوت ارائه کنید.'
  }
  if (/\b(?:shared|slot)\b/.test(text)) {
    return 'این پلن اشتراکی است؛ دسترسی با دیگران مشترک است و نباید اطلاعات حساس یا فایل خصوصی در آن نگه دارید.'
  }
  if (/\b(?:private|personal)\b/.test(text)) {
    return 'این پلن برای استفاده اختصاصی معرفی شده است؛ جزئیات مالکیت و روش تحویل را با مشخصات محصول تطبیق دهید.'
  }
  if (/\b(?:account|ready\s+account|ready)\b/.test(text)) {
    return 'تحویل به‌شکل اکانت آماده است؛ پس از دریافت، اطلاعات ورود و امکان تغییر رمز را طبق توضیحات محصول بررسی کنید.'
  }
  if (/\b(?:free\s+trial|trial)\b/.test(text)) {
    return 'این پلن آزمایشی است؛ مدت، محدودیت‌ها و شرایط تمدید یا تبدیل آن به پلن پولی را پیش از خرید بررسی کنید.'
  }
  return 'روش تحویل و نوع دسترسی برای هر پلن متفاوت است؛ توضیحات همان محصول را مبنا قرار دهید و پیش از پرداخت ابهام‌ها را بپرسید.'
}

export function getPersianProductBadges(...values: string[]): string[] {
  const text = values.filter(Boolean).join(' ')
  const badges = featureRules
    .filter(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text))
    .map(({ replacement }) => replacement)
  return [...new Set(badges)]
}
