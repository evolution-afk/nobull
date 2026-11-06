interface TranslationRule {
  pattern: RegExp
  replacement: string
}

const rules: TranslationRule[] = [
  { pattern: /\b(?:1\s*W|1\s*MW|FW|FULL\s+WARRANTY)\b/gi, replacement: 'گارانتی کامل' },
  { pattern: /\b25\s*DW\b/gi, replacement: '۲۵ روز گارانتی' },
  { pattern: /\b7\s*DW\b/gi, replacement: '۷ روز گارانتی' },
  { pattern: /\b(?:NW|NO\s+WARRANTY)\b/gi, replacement: 'بدون گارانتی (تست اولیه)' },
  { pattern: /\b(?:12\s*M|12\s*MONTHS?|1\s*YEAR)\b/gi, replacement: '۱ ساله' },
  { pattern: /\b(?:6\s*M|6\s*MONTHS?)\b/gi, replacement: '۶ ماهه' },
  { pattern: /\b(?:3\s*M|3\s*MONTHS?)\b/gi, replacement: '۳ ماهه' },
  { pattern: /\b(?:1\s*M|1\s*MONTH|30\s*DAYS?)\b/gi, replacement: '۱ ماهه' },
  { pattern: /\b14\s*DAYS?\b/gi, replacement: '۱۴ روزه' },
  { pattern: /\b7\s*DAYS?\b/gi, replacement: '۷ روزه' },
  {
    pattern: /\b(?:REDEEM\s+CODE|CDK|ACTIVATION\s+CODE)\b/gi,
    replacement: 'کد فعال‌سازی (روی اکانت شخصی)',
  },
  { pattern: /\b(?:KEY|COUPON\s+CODE)\b/gi, replacement: 'کد فعال‌سازی' },
  { pattern: /\bFREE\s+TRIAL\b/gi, replacement: 'پلن آزمایشی' },
  { pattern: /\b(?:INVITE\s+SLOTS?|EMAIL\s+INVITE)\b/gi, replacement: 'دعوت‌نامه ایمیل شخصی' },
  { pattern: /\bINVITE\b/gi, replacement: 'دعوت‌نامه ایمیل شخصی' },
  { pattern: /\bSHARED\b/gi, replacement: 'اشتراکی' },
  { pattern: /\b(?:PRIVATE|PERSONAL)\b/gi, replacement: 'اختصاصی' },
  {
    pattern: /\bformat\s*:\s*email\s*,?\s*password\s*,?\s*(?:2fa|two[- ]factor)(?:\s*secret)?\b/gi,
    replacement: 'اطلاعات تحویل: ایمیل، رمز عبور و کد ورود دومرحله‌ای',
  },
  { pattern: /\bwarranty\s+exclusions?\b/gi, replacement: 'موارد خارج از پوشش گارانتی' },
  { pattern: /\bfull\s+account\b/gi, replacement: 'اکانت کامل' },
  { pattern: /\bready\s+account\b/gi, replacement: 'اکانت آماده' },
  { pattern: /\baccount\s+details\b/gi, replacement: 'اطلاعات اکانت' },
  { pattern: /\blogin\s+details\b/gi, replacement: 'اطلاعات ورود' },
  { pattern: /\bsecurity\s+information\b/gi, replacement: 'اطلاعات امنیتی' },
  { pattern: /\bpassword\s+change\b/gi, replacement: 'تغییر رمز عبور' },
  { pattern: /\bemail\s+verification\b/gi, replacement: 'تأیید ایمیل' },
  { pattern: /\btwo[- ]factor authentication\b/gi, replacement: 'ورود دومرحله‌ای' },
  { pattern: /\b2fa\s+secret\b/gi, replacement: 'کلید ورود دومرحله‌ای' },
  { pattern: /\b2fa\b/gi, replacement: 'ورود دومرحله‌ای' },
  { pattern: /\bemail\b/gi, replacement: 'ایمیل' },
  { pattern: /\bpassword\b/gi, replacement: 'رمز عبور' },
  { pattern: /\busername\b/gi, replacement: 'نام کاربری' },
  { pattern: /\blogin\b/gi, replacement: 'ورود' },
  { pattern: /\baccount\b/gi, replacement: 'اکانت' },
  { pattern: /\bsubscription\b/gi, replacement: 'اشتراک' },
  { pattern: /\bplan\b/gi, replacement: 'پلن' },
  { pattern: /\bmonths?\b/gi, replacement: 'ماه' },
  { pattern: /\bdays?\b/gi, replacement: 'روز' },
  { pattern: /\bweeks?\b/gi, replacement: 'هفته' },
  { pattern: /\bwarranty\b/gi, replacement: 'گارانتی' },
  { pattern: /\bactivation\b/gi, replacement: 'فعال‌سازی' },
  { pattern: /\bcode\b/gi, replacement: 'کد' },
  { pattern: /\baccess\b/gi, replacement: 'دسترسی' },
  { pattern: /\bvalidity\b/gi, replacement: 'مدت اعتبار' },
  { pattern: /\bexclusions?\b/gi, replacement: 'موارد خارج از پوشش' },
  { pattern: /\bafter\s+sale\b/gi, replacement: 'پس از خرید' },
  { pattern: /\bnot\s+included\b/gi, replacement: 'شامل نمی‌شود' },
  { pattern: /\bavailable\b/gi, replacement: 'موجود' },
  { pattern: /\bnew\b/gi, replacement: 'جدید' },
  { pattern: /\baccount\b/gi, replacement: 'اکانت' },
  { pattern: /\b(?:1\s*W|1\s*MW|FW|FULL\s+WARRANTY)\b/gi, replacement: 'گارانتی کامل' },
  { pattern: /\b25\s*DW\b/gi, replacement: '۲۵ روز گارانتی' },
  { pattern: /\b7\s*DW\b/gi, replacement: '۷ روز گارانتی' },
  { pattern: /\b(?:NW|NO\s+WARRANTY)\b/gi, replacement: 'بدون گارانتی (تست اولیه)' },
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
  { pattern: /\bANTHROPIC\b/gi, replacement: 'آنتروپیک' },
  { pattern: /\bXAI\b/gi, replacement: 'ایکس‌ای‌آی' },
  { pattern: /\bAPPLE\b/gi, replacement: 'اپل' },
  { pattern: /\bTELEGRAM\b/gi, replacement: 'تلگرام' },
  { pattern: /\bTRADINGVIEW\b/gi, replacement: 'تریدینگ‌ویو' },
  { pattern: /\bJETBRAINS?\b/gi, replacement: 'جت‌برینز' },
  { pattern: /\bLINKEDIN\b/gi, replacement: 'لینکدین' },
  { pattern: /\bGRAMMARLY\b/gi, replacement: 'گرامرلی' },
  { pattern: /\bDUOLINGO\b/gi, replacement: 'دولینگو' },
  { pattern: /\bDISCORD\b/gi, replacement: 'دیسکورد' },
  { pattern: /\bNORDVPN\b/gi, replacement: 'نورد‌وی‌پی‌ان' },
  { pattern: /\bEXPRESSVPN\b/gi, replacement: 'اکسپرس‌وی‌پی‌ان' },
  { pattern: /\bEXCLUSIVELY\b/gi, replacement: 'به‌صورت اختصاصی' },
]

const featureRules = rules.slice(0, 17).map(({ pattern, replacement }) => ({
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
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/^[\s,،|/-]+|[\s,،|/-]+$/g, '')
    .trim()
}

export function getPersianDeliveryDescription(
  ...values: Array<string | undefined>
): string {
  const text = values.join(' ').toLowerCase()
  if (/\b(?:cdk|key|redeem\s+code|activation\s+code|coupon\s+code)\b|کد فعال‌سازی/.test(text)) {
    return 'تحویل به‌صورت کد فعال‌سازی است؛ کد را طبق راهنمای سرویس روی اکانت شخصی خودتان وارد کنید. اگر کد پذیرفته نشد، پیش از تلاش دوباره کشور، پلن و شرایط درج‌شده برای کد را بررسی کنید.'
  }
  if (/\b(?:invite|invitation|invite\s+slot)\b|دعوت‌نامه/.test(text)) {
    return 'تحویل با دعوت‌نامه ایمیلی انجام می‌شود؛ نشانی ایمیل شخصی و در دسترس خود را ارائه کنید، پوشه هرزنامه را بررسی کنید و دعوت را با همان ایمیل بپذیرید.'
  }
  if (/\b(?:shared|slot)\b|اشتراکی/.test(text)) {
    return 'این پلن اشتراکی است؛ دسترسی با دیگران مشترک است. اطلاعات حساس، فایل خصوصی یا روش پرداخت شخصی را در آن نگه ندارید.'
  }
  if (/\b(?:private|personal)\b|اختصاصی/.test(text)) {
    return 'این پلن برای استفاده اختصاصی معرفی شده است؛ جزئیات مالکیت، امکان تغییر اطلاعات و روش تحویل را با مشخصات همین محصول تطبیق دهید.'
  }
  if (/\b(?:account|ready\s+account|ready)\b|اکانت آماده/.test(text)) {
    return 'تحویل به‌شکل اکانت آماده است؛ ایمیل و رمز عبور را دقیق وارد کنید، سپس امکان تغییر اطلاعات امنیتی را مطابق شرایط محصول بررسی کنید. اگر ورود ناموفق بود، زبان صفحه‌کلید و نشانی ورود را کنترل کنید و رمز را چندبار پیاپی امتحان نکنید.'
  }
  if (/\b(?:free\s+trial|trial)\b|آزمایشی/.test(text)) {
    return 'این پلن آزمایشی است؛ مدت، محدودیت‌ها و شرایط تمدید یا تبدیل آن به پلن پولی را پیش از خرید بررسی کنید.'
  }
  return 'روش تحویل و نوع دسترسی برای هر پلن متفاوت است؛ توضیحات همان محصول را مبنا قرار دهید و پیش از پرداخت ابهام‌ها را بپرسید.'
}

export function getPersianWarrantyDescription(
  ...values: Array<string | undefined>
): string {
  const text = values.join(' ').toLowerCase()
  if (/\b(?:nw|no\s+warranty)\b|بدون گارانتی/.test(text)) {
    return '⚠️ این محصول گارانتی ندارد و فقط برای تست اولیه قابل بررسی است؛ پیش از خرید این محدودیت را در نظر بگیرید.'
  }
  const limitedWarranty = text.match(/\b(25|7)\s*dw\b|([۰-۹]+)\s*روز\s*گارانتی/)
  if (limitedWarranty) {
    const days =
      limitedWarranty[1] === '25'
        ? '۲۵'
        : limitedWarranty[1] === '7'
          ? '۷'
          : limitedWarranty[2]
    return `🛡️ این محصول ${days} روز گارانتی دارد.`
  }
  if (/\b(?:1\s*w|1\s*mw|fw|full\s+warranty)\b|گارانتی کامل/.test(text)) {
    return '✅ این محصول دارای گارانتی کامل است.'
  }
  return '🛡️ مدت و دامنه گارانتی مطابق مشخصات همین محصول است؛ موارد خارج از پوشش را پیش از خرید بررسی کنید.'
}

export function getPersianLoginInstructions(
  ...values: Array<string | undefined>
): string {
  const text = values.join(' ').toLowerCase()
  if (/\b(?:2fa|two[- ]factor|authenticator)\b|دومرحله‌ای|دومرحله ای/.test(text)) {
    return 'برای ورود دومرحله‌ای، ابتدا ایمیل و رمز عبور را وارد کنید؛ سپس کد یک‌بارمصرف یا کلید ارائه‌شده را در بخش تأیید دومرحله‌ای وارد کنید. کدها زمان‌دارند؛ ساعت دستگاه را روی تنظیم خودکار بگذارید و در صورت خطا کد تازه بگیرید. کلید یا کد را با دیگران به اشتراک نگذارید.'
  }
  if (/\b(?:email|mail|invite)\b|ایمیل|دعوت‌نامه/.test(text)) {
    return 'برای ورود با ایمیل، نشانی را بدون فاصله وارد کنید و صندوق ورودی و هرزنامه را برای پیام تأیید بررسی کنید. لینک تأیید را با همان نشانی ایمیل باز کنید؛ اگر پیام نرسید، چند دقیقه صبر کنید و سپس نشانی را بررسی کنید.'
  }
  return 'اگر ورود انجام نشد، نشانی سرویس، زبان صفحه‌کلید و اتصال اینترنت را بررسی کنید. از تغییر مکرر رمز یا ارسال چندباره کد خودداری کنید و برای راهنمایی با پشتیبانی تماس بگیرید.'
}

export function getPersianProductBadges(...values: string[]): string[] {
  const text = values.filter(Boolean).join(' ')
  const badges = featureRules
    .filter(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text))
    .map(({ replacement }) => replacement)
  return [...new Set(badges)]
}
