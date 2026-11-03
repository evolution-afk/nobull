import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import * as OTPAuth from 'otpauth'
import {
  getPersianDeliveryDescription,
  getPersianProductBadges,
  translateProductText,
} from './utils/persianTranslator'
import { resolveBrandAsset, type BrandAsset } from './utils/brandAssets'
import {
  ArrowLeft,
  Beef,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import AdminDashboard from './AdminDashboard'

type StockStatus = 'available' | 'unavailable' | 'unknown'

interface Product {
  id: string
  providerId: string
  providerProductId: string
  name: string
  brand: string
  brandKey: string
  brandAsset: BrandAsset
  category: string
  persianCategory: string
  description: string
  price_toman: number
  usdt_rate_used: number | null
  stock: number | null
  status: StockStatus
  purchaseUrl: string | null
}

interface ProductRecord {
  [key: string]: unknown
}

const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.replace(
  /^@/,
  '',
)
const ALL_FILTER = 'all'

interface ServiceGuide {
  title: string
  summary: string
  description: string
  planDifferences: string
  tips: string[]
}

const serviceGuides: Record<string, ServiceGuide> = {
  openai: {
    title: 'ChatGPT و سرویس‌های OpenAI',
    summary: 'دستیار هوش مصنوعی برای نوشتن، تحلیل، یادگیری و ایده‌پردازی.',
    description:
      'ChatGPT یک دستیار گفت‌وگومحور هوش مصنوعی است. می‌توانید برای پیش‌نویس و ویرایش متن، ترجمه، توضیح مفاهیم، تحلیل فایل و داده، برنامه‌ریزی و کمک در کدنویسی از آن استفاده کنید. پاسخ‌ها ممکن است اشتباه یا قدیمی باشند؛ برای تصمیم‌های حساس، منبع مستقل را بررسی کنید.',
    planDifferences:
      'پلن‌های پولی معمولاً به مدل‌ها و سقف استفاده بیشتری دسترسی می‌دهند. «کد فعال‌سازی» را روی حساب شخصی خودتان وارد می‌کنید؛ «دعوتی» با ایمیل شما به فضای یک پلن اضافه می‌شود؛ «اشتراکی» به معنی استفاده مشترک است. Trial هم آزمایشی و محدود است.',
    tips: [
      'ورود و دسترسی به قابلیت‌ها به نوع پلن و منطقه حساب بستگی دارد؛ قبل از خرید توضیحات همان محصول را بخوانید.',
      'برای کاهش خطاهای ورود، از IP تمیز و ثابت استفاده کنید و مرتب کشور اتصال را عوض نکنید.',
      'اشتراکی، دعوتی یا شخصی بودن را از عنوان و جزئیات همان پلن بررسی کنید؛ اسم برند به‌تنهایی چیزی را تضمین نمی‌کند.',
    ],
  },
  x: {
    title: 'Grok',
    summary: 'دستیار هوش مصنوعی X برای گفت‌وگو و بررسی موضوعات روز.',
    description:
      'Grok دستیار هوش مصنوعی وابسته به پلتفرم X است و برای گفت‌وگو، ایده‌پردازی، نوشتن و دنبال‌کردن موضوعات روز کاربرد دارد. برخی قابلیت‌ها با داده‌های عمومی X کار می‌کنند؛ خروجی را همچنان باید از نظر دقت و منبع بررسی کنید.',
    planDifferences:
      'دسترسی ممکن است به پلن X، کشور حساب یا روش فعال‌سازی وابسته باشد. عنوان محصول مشخص می‌کند اکانت آماده است، دعوت‌نامه می‌گیرید یا دسترسی دیگری ارائه می‌شود؛ صرفاً از نام Grok نوع تحویل را حدس نزنید.',
    tips: [
      'دسترسی Grok به پلن و شرایط حساب X وابسته است؛ قبل از خرید، نوع دسترسی درج‌شده برای محصول را بررسی کنید.',
      'با IP تمیز و ثابت وارد شوید و از جابه‌جایی مکرر کشور یا ورود هم‌زمان از چند دستگاه خودداری کنید.',
      'در پلن‌های اشتراکی، اطلاعات ورود یا دعوت را با دیگران به اشتراک نگذارید.',
    ],
  },
  claude: {
    title: 'Claude',
    summary: 'دستیار هوش مصنوعی مناسب متن‌های طولانی و کدنویسی.',
    description:
      'Claude دستیار هوش مصنوعی Anthropic است و در نوشتن و بازبینی متن، خلاصه‌سازی اسناد طولانی، تحلیل، ایده‌پردازی و کمک به توسعه نرم‌افزار کاربرد دارد. پاسخ‌ها جایگزین بررسی تخصصی نیستند و سقف استفاده بسته به پلن تغییر می‌کند.',
    planDifferences:
      'پلن‌ها ممکن است از نظر مدل، سهمیه و مدت دسترسی متفاوت باشند. دعوت‌نامه یعنی افزودن ایمیل شما به پلن؛ اشتراکی یعنی منابع یا ورود مشترک؛ کد فعال‌سازی روی حساب خودتان اعمال می‌شود. قبل از خرید نوع دقیق محصول را بخوانید.',
    tips: [
      'محدودیت‌ها و دسترسی به مدل‌ها به پلن و سیاست‌های منطقه‌ای بستگی دارد.',
      'برای ثبات ورود، IP تمیز و ثابت داشته باشید و تغییر مداوم منطقه انجام ندهید.',
      'قبل از سفارش مشخص کنید محصول شخصی، دعوتی یا اشتراکی است؛ این موارد بین پلن‌ها فرق می‌کند.',
    ],
  },
  midjourney: {
    title: 'Midjourney',
    summary: 'تولید تصویر با هوش مصنوعی از روی توضیح متنی.',
    description:
      'Midjourney ابزار تولید تصویر با هوش مصنوعی است. با نوشتن توصیف می‌توانید تصویر مفهومی، مودبرد، طرح اولیه و سبک‌های بصری مختلف بسازید. خروجی به کیفیت prompt و تنظیمات بستگی دارد و برای استفاده تجاری باید شرایط فعلی سرویس را بررسی کنید.',
    planDifferences:
      'پلن‌ها معمولاً در سهمیه تولید، سرعت صف و خصوصی‌بودن کارها فرق دارند. در فضای اشتراکی، promptها یا خروجی‌ها ممکن است برای دیگران قابل مشاهده باشند؛ وضعیت فضای کاری و تحویل را قبل از سفارش روشن کنید.',
    tips: [
      'روش دسترسی، سهمیه تولید و وضعیت خصوصی‌بودن تصاویر را در توضیحات پلن بخوانید.',
      'اگر پلن از طریق دعوت یا فضای مشترک ارائه می‌شود، دستورها و تصاویرتان ممکن است برای اعضای دیگر قابل مشاهده باشد.',
      'از IP تمیز و ثابت استفاده کنید و قوانین محتوایی سرویس را رعایت کنید.',
    ],
  },
  canva: {
    title: 'Canva',
    summary: 'ساخت آسان طرح، ارائه، پوستر و محتوای شبکه‌های اجتماعی.',
    description:
      'Canva ابزار طراحی آنلاین برای ساخت پست شبکه‌های اجتماعی، ارائه، پوستر، رزومه، ویدیو و محتوای بازاریابی است. قالب‌های آماده و ابزارهای همکاری باعث می‌شوند بدون تجربه حرفه‌ای طراحی، محتوای قابل ویرایش بسازید.',
    planDifferences:
      'تفاوت پلن‌ها معمولاً در دسترسی به قالب‌ها و محتوای حرفه‌ای، فضای ذخیره‌سازی و امکانات تیمی است. در پلن تیمی، فایل‌ها و اعضا ممکن است برای مدیران یا هم‌تیمی‌ها قابل مشاهده باشند.',
    tips: [
      'امکانات حرفه‌ای و فضای تیمی به نوع پلن بستگی دارد؛ سهمیه و مدت را در جزئیات محصول بررسی کنید.',
      'در پلن تیمی، فایل‌ها و طراحی‌ها ممکن است برای اعضای همان تیم قابل مشاهده باشند.',
      'ورودهای مکرر از IP و کشور‌های مختلف می‌تواند بررسی امنیتی ایجاد کند؛ اتصال ثابت بهتر است.',
    ],
  },
  spotify: {
    title: 'Spotify',
    summary: 'پخش موسیقی و پادکست با امکانات پریمیوم.',
    description:
      'Spotify سرویس پخش موسیقی، آلبوم و پادکست است. اشتراک Premium معمولاً پخش بدون تبلیغ و کنترل بیشتر روی پخش را فراهم می‌کند؛ موجودی محتوا و بعضی امکانات به کشور حساب بستگی دارد.',
    planDifferences:
      'پلن شخصی برای یک حساب است؛ پلن خانوادگی یا ظرفیت اشتراکی شرایط اعضا و منطقه دارد. روش فعال‌سازی، مدت و اینکه اکانت آماده است یا روی حساب شما اعمال می‌شود باید در توضیحات همان محصول مشخص باشد.',
    tips: [
      'کشور حساب، روش فعال‌سازی و نوع پلن (شخصی یا خانوادگی) را پیش از خرید بررسی کنید.',
      'در پلن خانوادگی، تغییر مکرر کشور یا ناسازگاری منطقه اعضا ممکن است باعث محدودیت شود.',
      'رمز حساب را با افراد خارج از پلن به اشتراک نگذارید و اطلاعات بازیابی خود را نگه دارید.',
    ],
  },
  youtube: {
    title: 'YouTube Premium',
    summary: 'تماشای YouTube با امکانات Premium و پخش بدون تبلیغ.',
    description:
      'YouTube Premium تجربه تماشای ویدیو را با قابلیت‌هایی مانند پخش بدون تبلیغ و امکانات جانبی بهتر می‌کند. قابلیت‌های دقیق، قیمت منطقه‌ای و شرایط عضویت خانوادگی ممکن است در کشورها متفاوت باشد.',
    planDifferences:
      'پلن شخصی، خانوادگی، دعوتی و اکانت آماده تحویل یکسان نیستند. در پلن دعوتی، ایمیل خودتان را برای عضویت می‌دهید؛ پیش از خرید منطقه و شرایط اعضا را بررسی کنید.',
    tips: [
      'روش فعال‌سازی و منطقه لازم را با توضیحات محصول تطبیق دهید؛ تغییر منطقه تضمین‌شده نیست.',
      'پلن خانوادگی به اعضا و شرایط منطقه‌ای وابسته است؛ قبل از سفارش نوع دسترسی را بپرسید.',
      'برای جلوگیری از هشدارهای امنیتی، کشور IP را مداوم تغییر ندهید.',
    ],
  },
  perplexity: {
    title: 'Perplexity',
    summary: 'جست‌وجو و پاسخ هوش مصنوعی با ارجاع به منابع وب.',
    description:
      'Perplexity ابزار جست‌وجو و پاسخ‌گویی مبتنی بر هوش مصنوعی است که وب را برای پاسخ و جمع‌بندی بررسی می‌کند و معمولاً پیوند منابع را هم نشان می‌دهد. برای تحقیق اولیه مفید است، اما صحت منابع را خودتان باز کنید و بسنجید.',
    planDifferences:
      'تعداد جست‌وجوهای حرفه‌ای، مدل‌های قابل انتخاب و سهمیه‌ها بسته به پلن فرق می‌کنند. دعوتی با ایمیل شما انجام می‌شود؛ اشتراکی یا اکانت آماده محدودیت حریم خصوصی و کنترل بیشتری دارد.',
    tips: [
      'تعداد جست‌وجوها و مدل‌های قابل انتخاب تابع پلن است؛ سهمیه محصول را بررسی کنید.',
      'ورود پایدار با IP تمیز توصیه می‌شود؛ از اشتراک‌گذاری نشست یا کد ورود خودداری کنید.',
      'شخصی یا اشتراکی بودن اکانت را از جزئیات همان محصول بسنجید.',
    ],
  },
  cursor: {
    title: 'Cursor',
    summary: 'ویرایشگر کد با دستیار هوش مصنوعی برای توسعه نرم‌افزار.',
    description:
      'Cursor ویرایشگر کدی برای توسعه‌دهندگان است که قابلیت‌هایی مانند تکمیل خودکار، پرسش درباره کد و کمک در تغییر چند فایل را در محیط پروژه فراهم می‌کند. پیشنهادهای هوش مصنوعی را بازبینی و تست کنید؛ مسئولیت تغییر نهایی با شماست.',
    planDifferences:
      'پلن‌ها در سهمیه درخواست‌ها و مدل‌های قابل استفاده تفاوت دارند. اکانت شخصی، دعوت به تیم و دسترسی اشتراکی سطح حریم خصوصی یکسانی ندارند؛ در محیط مشترک کد محرمانه یا کلیدها را وارد نکنید.',
    tips: [
      'سهمیه درخواست‌ها و مدل‌ها ممکن است با نوع پلن فرق کند؛ قبل از خرید محدودیت‌ها را بخوانید.',
      'کد محرمانه یا کلیدهای دسترسی را در گفتگوها وارد نکنید مگر سیاست‌های تیم‌تان اجازه دهد.',
      'اگر پلن تیمی یا اشتراکی است، درباره دسترسی اعضا و حریم خصوصی workspace سؤال کنید.',
    ],
  },
  netflix: {
    title: 'Netflix',
    summary: 'تماشای آنلاین فیلم و سریال؛ کتابخانه محتوا منطقه‌ای است.',
    description:
      'Netflix سرویس پخش آنلاین فیلم، سریال و مستند است. فهرست محتوا، زبان‌ها و بعضی امکانات با منطقه حساب تغییر می‌کند؛ نوع پلن و تعداد نمایشگر هم باید از مشخصات محصول بررسی شود.',
    planDifferences:
      'اکانت شخصی، پروفایل در اکانت مشترک و اکانت آماده، سطح کنترل و حریم خصوصی متفاوت دارند. اگر پروفایل یا ظرفیت اشتراکی می‌خرید، رمز و تنظیمات حساب را تغییر ندهید مگر صریحاً اجازه داده شده باشد.',
    tips: [
      'نوع اکانت، تعداد نمایشگر و روش تحویل را در مشخصات همان محصول ببینید.',
      'در اکانت اشتراکی، پروفایل و رمز را تغییر ندهید مگر فروشنده صریحاً اجازه داده باشد.',
      'IP و منطقه را پیوسته عوض نکنید؛ تغییرات غیرعادی ممکن است تأیید امنیتی بخواهد.',
    ],
  },
  capcut: {
    title: 'CapCut',
    summary: 'تدوین ویدیو، زیرنویس و آماده‌سازی کلیپ برای شبکه‌های اجتماعی.',
    description:
      'CapCut ابزار تدوین ویدیو برای برش و چسباندن کلیپ، افزودن زیرنویس، افکت و خروجی مناسب شبکه‌های اجتماعی است. امکانات حرفه‌ای و دارایی‌های قابل استفاده با پلن و منطقه تغییر می‌کند.',
    planDifferences:
      'پلن Pro، فعال‌سازی کد، دعوت به فضای تیمی یا اکانت آماده روش‌های متفاوتی هستند. در حساب تیمی ممکن است پروژه‌ها و فایل‌ها مشترک باشند؛ نوع تحویل و مدت را بخوانید.',
    tips: [
      'امکانات Pro و مدت فعال‌سازی به نوع محصول بستگی دارد؛ جزئیات را قبل از پرداخت بررسی کنید.',
      'در دسترسی تیمی، پروژه‌ها یا فضای کاری ممکن است مشترک باشد.',
      'از IP تمیز و ثابت استفاده کنید و برای تحویل، ایمیل درست و در دسترس ارائه دهید.',
    ],
  },
  googlegemini: {
    title: 'Gemini',
    summary: 'دستیار هوش مصنوعی گوگل برای تحقیق، نوشتن و کار با محتوا.',
    description:
      'Gemini دستیار هوش مصنوعی Google است و برای گفت‌وگو، نوشتن و بازنویسی، جمع‌بندی، تحلیل و در برخی پلن‌ها کار با تصویر یا فایل استفاده می‌شود. اتصال آن به محصولات Google و قابلیت‌های قابل دسترس به کشور، حساب و پلن بستگی دارد.',
    planDifferences:
      'تفاوت پلن‌ها ممکن است در مدل‌ها، سهمیه و اتصال به سرویس‌های دیگر Google باشد. کد فعال‌سازی روی حساب خودتان اعمال می‌شود؛ دعوت به طرح خانوادگی یا تیمی شرایط منطقه و ایمیل دارد؛ اکانت اشتراکی حریم خصوصی کمتری دارد.',
    tips: [
      'با IP تمیز و باثبات وارد شوید و منطقه اتصال را مرتب عوض نکنید.',
      'پیش از خرید بررسی کنید پلن روی حساب Google خودتان فعال می‌شود یا اکانت جدا تحویل می‌گیرید.',
      'اطلاعات محرمانه یا فایل‌های خصوصی را در حسابی که مالک آن نیستید بارگذاری نکنید.',
    ],
  },
  notion: {
    title: 'Notion',
    summary: 'فضای کاری برای یادداشت، پایگاه داده و مدیریت پروژه.',
    description:
      'Notion فضای کاری آنلاین برای نوشتن یادداشت، مستندسازی، ساخت پایگاه داده و مدیریت پروژه است. می‌توان صفحات مرتبط را کنار هم نگه داشت و با تیم همکاری کرد؛ ساختار و دسترسی هر workspace را خودتان دقیق بررسی کنید.',
    planDifferences:
      'پلن‌ها در محدودیت‌ها، امکانات تیمی و ابزارهای هوش مصنوعی تفاوت دارند. دعوتی یعنی ایمیل شما به workspace اضافه می‌شود و ممکن است مدیران محتوا را ببینند؛ اشتراکی بودن را با دسترسی شخصی یکی نگیرید.',
    tips: [
      'صفحات شخصی و محرمانه را در workspace تیمی قرار ندهید مگر از دسترسی مدیران مطمئن باشید.',
      'قبل از پرداخت نوع workspace، امکان خروج و مدت دسترسی را مشخص کنید.',
      'برای ورود امن از IP ثابت و ایمیل قابل بازیابی استفاده کنید.',
    ],
  },
  github: {
    title: 'GitHub',
    summary: 'میزبانی کد و همکاری تیمی برای توسعه نرم‌افزار.',
    description:
      'GitHub برای میزبانی مخازن کد، مدیریت تغییرات با Git، مرور کد و همکاری روی پروژه‌های نرم‌افزاری استفاده می‌شود. بعضی پلن‌ها قابلیت‌های امنیتی، CI/CD يا ابزارهای همکارانه بیشتری دارند.',
    planDifferences:
      'دعوت به سازمان یا تیم با فعال‌سازی اشتراك روی حساب شخصی تفاوت دارد؛ دسترسی مخزن‌ها و داده‌ها ممکن است تحت کنترل مدیر سازمان باشد. بررسی کنید محصول دقیقاً چه سطح دسترسی یا قابلیت پولی‌ای فراهم می‌کند.',
    tips: [
      'هیچ‌وقت رمز، توکن دسترسی یا کلید خصوصی را به فروشنده یا هم‌تیمی نامطمئن ندهید.',
      'در حساب سازمانی، مدیران ممکن است دسترسی مخزن و تنظیمات را کنترل کنند.',
      'محدودیت‌های منطقه، صورتحساب و مجوز قابلیت‌های پولی را قبل از استفاده تجاری بررسی کنید.',
    ],
  },
  nordvpn: {
    title: 'NordVPN',
    summary: 'سرویس VPN برای رمزگذاری مسیر اتصال و انتخاب سرور منطقه‌ای.',
    description:
      'NordVPN سرویس VPN برای عبور ترافیک از سرورهای مختلف و رمزگذاری مسیر اتصال تا سرویس VPN است. VPN آدرس IP خروجی را تغییر می‌دهد، اما ناشناس‌بودن کامل، امنیت دستگاه یا مجازبودن دسترسی به هر محتوا را تضمین نمی‌کند.',
    planDifferences:
      'پلن‌ها از نظر مدت، امکانات جانبی، تعداد دستگاه و روش فعال‌سازی فرق می‌کنند. کد فعال‌سازی را روی حساب شخصی وارد می‌کنید؛ اکانت آماده یا ظرفیت اشتراکی لزوماً امکان تغییر مالکیت یا رمز را نمی‌دهد.',
    tips: [
      'از VPN برای دسترسی غیرمجاز استفاده نکنید و قوانین سرویس مقصد را رعایت کنید.',
      'برای حساب‌های حساس از کشور و سرور ثابت استفاده کنید؛ تغییر مداوم مکان می‌تواند هشدار ورود بدهد.',
      'سیاست ثبت داده و شرایط تمدید را بخوانید؛ نام VPN تضمین حریم خصوصی مطلق نیست.',
    ],
  },
  discord: {
    title: 'Discord',
    summary: 'پلتفرم گفت‌وگوی متنی، صوتی و تصویری برای گروه‌ها و انجمن‌ها.',
    description:
      'Discord پلتفرم ارتباطی برای پیام‌رسانی، تماس صوتی و تصویری و ساخت انجمن‌های موضوعی است. پلن‌های پولی معمولاً به امکانات بیشتر حساب یا سرور مربوط‌اند و جزئیات دقیق با پلن تغییر می‌کند.',
    planDifferences:
      'فعال‌سازی روی حساب شخصی، دعوت به سرور و اکانت آماده با یکدیگر فرق دارند. اگر محصولی دعوتی یا اشتراکی است، مشخص کنید پرداخت قابلیت به حساب شما اعمال می‌شود یا تنها دسترسی به فضای مشترک می‌گیرید.',
    tips: [
      'رمز و کدهای یک‌بارمصرف خود را برای فعال‌سازی در اختیار کسی نگذارید.',
      'پیش از پرداخت، مدت، قابلیت دقیق و اینکه روی حساب شخصی خودتان اعمال می‌شود را بررسی کنید.',
      'از سرور یا حساب مشترک برای اطلاعات محرمانه استفاده نکنید.',
    ],
  },
}

const categoryGuides: Record<string, ServiceGuide> = {
  'هوش مصنوعی': {
    title: 'راهنمای سرویس‌های هوش مصنوعی',
    summary: 'ابزارهای گفتگو، جست‌وجو، تولید محتوا و کمک تخصصی.',
    description:
      'سرویس‌های این دسته با مدل‌های هوش مصنوعی برای پاسخ‌گویی، جست‌وجو، تولید متن و تصویر، تحلیل فایل و کمک در برنامه‌نویسی به کار می‌روند. هر سرویس مدل‌ها، سهمیه، سیاست داده و محدودیت‌های خودش را دارد؛ خروجی را برای موضوعات حساس راستی‌آزمایی کنید.',
    planDifferences:
      'پلن پولی می‌تواند سهمیه یا مدل بیشتری بدهد، اما «کد فعال‌سازی» با «دعوت ایمیلی» و «اکانت اشتراکی» فرق دارد: اولی روی حساب خودتان اعمال می‌شود، دومی ایمیل شما را عضو می‌کند و سومی دسترسی مشترک دارد. Trial نیز موقت و محدود است.',
    tips: [
      'قبل از خرید، سهمیه، مدت، روش ورود و شخصی یا اشتراکی بودن را در مشخصات همان محصول بخوانید.',
      'از IP تمیز و ثابت استفاده کنید و مرتب کشور اتصال را عوض نکنید.',
      'اطلاعات حساس، رمزها و داده‌های محرمانه را در سرویس یا حساب اشتراکی وارد نکنید.',
    ],
  },
  'برنامه‌نویسی': {
    title: 'راهنمای ابزارهای برنامه‌نویسی',
    summary: 'ابزارهای کمک به نوشتن، بازبینی و توسعه نرم‌افزار.',
    description:
      'این ابزارها در تکمیل کد، فهم پروژه، رفع خطا، مستندسازی و ساخت نرم‌افزار کمک می‌کنند. پیشنهاد هوش مصنوعی ممکن است ناامن یا نادرست باشد؛ تغییرات را بازبینی و تست کنید و مجوز استفاده از کد را بررسی کنید.',
    planDifferences:
      'دسترسی ممکن است اشتراک مستقیم، دعوت به تیم یا سهمیه/کد فعال‌سازی باشد. در اکانت تیمی، مدیران ممکن است به فضای کاری دسترسی داشته باشند؛ کد خصوصی، رمز و کلید API را در اشتراک نامطمئن قرار ندهید.',
    tips: [
      'سهمیه، مدل‌های در دسترس و مجوز استفاده تجاری را با پلن محصول تطبیق دهید.',
      'کلید API، رمز عبور و کد محرمانه را در workspace یا گفت‌وگوی مشترک قرار ندهید.',
      'تیمی یا شخصی بودن اشتراک و دسترسی اعضا را پیش از سفارش روشن کنید.',
    ],
  },
  'طراحی و گرافیک': {
    title: 'راهنمای ابزارهای طراحی',
    summary: 'ساخت و ویرایش گرافیک، تصویر، ارائه و ویدیو.',
    description:
      'ابزارهای این دسته برای طراحی گرافیک، ویرایش تصویر و ویدیو، ساخت ارائه و مدیریت دارایی‌های بصری به کار می‌روند. قالب یا محتوای آماده ممکن است مجوز استفاده مشخصی داشته باشد؛ قبل از استفاده تجاری شرایط آن را بررسی کنید.',
    planDifferences:
      'دسترسی Pro، کد فعال‌سازی، دعوت به تیم و فضای اشتراکی با هم فرق دارند. در عضویت تیمی فایل‌ها ممکن است برای هم‌تیمی‌ها یا مدیران قابل مشاهده باشند؛ مالکیت فایل و روش خروج از تیم را از قبل روشن کنید.',
    tips: [
      'مالکیت فایل‌ها، فضای تیمی و میزان دسترسی سایر اعضا را بررسی کنید.',
      'پیش از سفارش، مدت و امکانات دقیق پلن را از عنوان و توضیحات محصول بسنجید.',
      'برای جلوگیری از قفل امنیتی، از IP تمیز و ثابت استفاده کنید.',
    ],
  },
  'موسیقی و ویدیو': {
    title: 'راهنمای سرویس‌های موسیقی و ویدیو',
    summary: 'پخش موسیقی، پادکست، فیلم و محتوای تصویری.',
    description:
      'این سرویس‌ها پخش آنلاین موسیقی، پادکست، فیلم یا سریال را فراهم می‌کنند. کشور حساب می‌تواند روی محتوای در دسترس، قیمت و روش فعال‌سازی اثر بگذارد؛ سازگاری پلن و دستگاه را پیش از خرید بررسی کنید.',
    planDifferences:
      'پلن شخصی، خانوادگی، دعوتی و ظرفیت اشتراکی متفاوت‌اند. دعوت‌نامه به ایمیل شما می‌آید؛ ظرفیت اشتراکی به معنی استفاده مشترک است و اکانت آماده الزاماً مالکیت کامل یا امکان تغییر اطلاعات را نمی‌دهد.',
    tips: [
      'منطقه حساب و محدودیت اعضای خانوادگی را پیش از سفارش روشن کنید.',
      'در اکانت مشترک رمز، پروفایل دیگران یا تنظیمات امنیتی را بدون اجازه تغییر ندهید.',
      'IP ثابت می‌تواند از هشدار ورود کم کند، اما ضمانت رفع مسدودی نیست.',
    ],
  },
  'آموزش و ابزارها': {
    title: 'راهنمای ابزارها و سرویس‌های آموزشی',
    summary: 'ابزارهای بهره‌وری، یادگیری و کارهای روزمره.',
    description:
      'این دسته ابزارهای متنوع برای نوشتن، مدیریت کار، یادگیری، ذخیره اطلاعات و انجام کارهای آنلاین را در بر می‌گیرد. امکانات، سازگاری و سیاست داده در هر سرویس متفاوت است؛ کاربرد واقعی خود را با توضیحات پلن تطبیق دهید.',
    planDifferences:
      'کد فعال‌سازی روی حساب شخصی وارد می‌شود؛ Trial محدود و موقت است؛ دعوت‌نامه حساب شما را به تیم یا طرح خانوادگی اضافه می‌کند؛ پلن اشتراکی هم‌زمان در اختیار چند نفر است. اکانت آماده الزاماً مالکیت کامل ندارد.',
    tips: [
      'روش تحویل، ایمیل لازم، مدت و محدودیت تمدید را قبل از پرداخت بررسی کنید.',
      'اطلاعات حساس یا فایل محرمانه را روی حسابی که کنترلش دست شما نیست ذخیره نکنید.',
      'IP تمیز و ثابت کمک می‌کند اما ریسک سرویس‌های منطقه‌ای یا بازار خاکستری را حذف نمی‌کند.',
    ],
  },
  'امنیت و VPN': {
    title: 'راهنمای امنیت و VPN',
    summary: 'ابزارهای اتصال خصوصی‌تر و مدیریت دسترسی آنلاین.',
    description:
      'این سرویس‌ها می‌توانند مسیر اتصال را از VPN عبور دهند یا به مدیریت حریم خصوصی کمک کنند. VPN به‌تنهایی ناشناس‌بودن کامل، حفاظت از دستگاه یا مجازبودن استفاده در سرویس مقصد را تضمین نمی‌کند.',
    planDifferences:
      'پلن‌ها ممکن است در تعداد دستگاه‌ها، مدت، سرورها و نوع فعال‌سازی فرق کنند. کد فعال‌سازی روی حساب خودتان اعمال می‌شود؛ اکانت آماده یا اشتراکی ممکن است مالکیت و کنترل محدودتری داشته باشد.',
    tips: [
      'سیاست ثبت داده سرویس‌دهنده را بخوانید؛ وعده «ناشناس کامل» واقع‌بینانه نیست.',
      'برای ورود به حساب حساس، کشور IP را مرتب تغییر ندهید.',
      'نوع تحویل و تعداد دستگاه مجاز را از مشخصات دقیق محصول تأیید کنید.',
    ],
  },
  سرگرمی: {
    title: 'راهنمای سرویس‌های سرگرمی',
    summary: 'اشتراک فیلم، سریال، بازی و محتوای آنلاین.',
    description:
      'سرویس‌های سرگرمی دسترسی به فیلم، سریال، موسیقی یا بازی را فراهم می‌کنند. منطقه حساب می‌تواند روی محتوای قابل مشاهده و فعال‌سازی اثر بگذارد؛ سازگاری دستگاه و تعداد کاربران را هم بررسی کنید.',
    planDifferences:
      'پلن شخصی، خانوادگی، پروفایل اشتراکی، دعوت ایمیلی و اکانت آماده یکسان نیستند. اشتراک مشترک محدودیت حریم خصوصی دارد و ضمانت فقط همان چیزی است که مشخصاً در جزئیات محصول نوشته شده است.',
    tips: [
      'کشور حساب و شرایط منطقه‌ای پلن را پیش از پرداخت روشن کنید؛ تغییر کشور مداوم ممکن است بررسی امنیتی ایجاد کند.',
      'در اکانت مشترک رمز، ایمیل بازیابی یا تنظیمات پرداخت را تغییر ندهید.',
      'ریسک مسدودی یا تغییر سیاست سرویس وجود دارد؛ ضمانت صددرصدی واقعی نیست مگر دقیق و مکتوب تعریف شده باشد.',
    ],
  },
  'ابزار دیجیتال': {
    title: 'راهنمای ابزارهای دیجیتال',
    summary: 'سرویس‌های ابری، کاری و ابزارهای روزمره آنلاین.',
    description:
      'این دسته شامل ابزارهای کار، ذخیره‌سازی، ارتباط و سرویس‌های ابری است که برای مدیریت پروژه، همکاری، نگهداری فایل یا انجام کارهای روزانه استفاده می‌شوند. امکانات و سیاست نگهداری داده را متناسب با نیازتان بررسی کنید.',
    planDifferences:
      'پلن شخصی با دعوت تیمی یا اکانت اشتراکی از نظر مالکیت داده و کنترل حساب فرق دارد. کد فعال‌سازی معمولاً روی حساب خودتان اعمال می‌شود؛ دعوت به تیم حساب را به یک فضای مدیریتی اضافه می‌کند.',
    tips: [
      'برای داده‌های کاری مهم، نسخه پشتیبان مستقل داشته باشید و روی اکانت اشتراکی فایل محرمانه نگذارید.',
      'دسترسی مدیر تیم، امکان خروج و مدت اشتراک را پیش از پرداخت بررسی کنید.',
      'از IP باثبات استفاده کنید و رمز یا روش بازیابی را با دیگران به اشتراک نگذارید.',
    ],
  },
  'حریم خصوصی': {
    title: 'راهنمای ابزارهای حریم خصوصی و VPN',
    summary: 'ابزارهای اتصال امن‌تر و مدیریت حریم خصوصی آنلاین.',
    description:
      'VPN و ابزارهای حریم خصوصی ترافیک اتصال را از مسیر سرویس‌دهنده عبور می‌دهند و می‌توانند برای دسترسی امن‌تر به شبکه‌های عمومی یا حفاظت از مسیر ارتباط استفاده شوند. VPN ناشناس‌بودن کامل یا امنیت مطلق را تضمین نمی‌کند.',
    planDifferences:
      'پلن‌ها در مدت، تعداد دستگاه، کشورها و نوع تحویل متفاوت‌اند. کد فعال‌سازی روی اکانت شما اعمال می‌شود؛ اکانت یا ظرفیت اشتراکی ممکن است دستگاه یا مصرف مشترک داشته باشد.',
    tips: [
      'از VPN برای دور زدن قوانین سرویس یا کار غیرقانونی استفاده نکنید؛ هر سرویس سیاست خودش را دارد.',
      'برای ورود به حساب‌ها، اتصال پایدار انتخاب کنید؛ تغییر پی‌درپی کشور ممکن است هشدار ورود ایجاد کند.',
      'عبارت «VPN» تضمین سرعت، عدم ثبت داده یا امنیت کامل نیست؛ سیاست حریم خصوصی ارائه‌دهنده را بخوانید.',
    ],
  },
  آموزش: {
    title: 'راهنمای سرویس‌های آموزشی',
    summary: 'دوره‌ها و ابزارهای یادگیری آنلاین.',
    description:
      'سرویس‌های آموزشی دوره، تمرین و محتوای یادگیری آنلاین ارائه می‌کنند. زبان، اعتبار گواهی، دسترسی آفلاین و مدت دسترسی بسته به دوره و حساب متفاوت است.',
    planDifferences:
      'دسترسی ممکن است کد دوره، عضویت مستقیم، دعوت تیمی یا اکانت آماده باشد. نوع دسترسی و اعتبار گواهی را از توضیحات همان محصول بررسی کنید؛ همه دوره‌ها گواهی معتبر ارائه نمی‌کنند.',
    tips: [
      'پیش‌نیازها، زبان محتوا و شرایط صدور گواهی را پیش از خرید ببینید.',
      'ایمیل شخصی و قابل بازیابی استفاده کنید؛ در اکانت مشترک سابقه یادگیری خصوصی نیست.',
      'مدت دسترسی و امکان دانلود را دقیق بخوانید؛ فعال بودن اشتراک معادل دسترسی دائمی نیست.',
    ],
  },
  'طراحی و تدوین': {
    title: 'راهنمای ابزارهای طراحی و تدوین',
    summary: 'ابزار ساخت گرافیک، محتوای بصری و ویدیو.',
    description:
      'این ابزارها برای ساخت طرح گرافیکی، ویرایش عکس و ویدیو، تولید محتوای شبکه‌های اجتماعی و آماده‌سازی ارائه استفاده می‌شوند. امکانات، منابع آماده و حقوق استفاده از خروجی با سرویس و پلن فرق می‌کند.',
    planDifferences:
      'پلن شخصی، کد فعال‌سازی، دعوت تیمی و اکانت اشتراکی سطوح کنترل و حریم خصوصی متفاوتی دارند. در فضای تیمی فایل‌ها ممکن است برای اعضا قابل مشاهده باشند؛ مالکیت و امکان خروج را بپرسید.',
    tips: [
      'مجوز استفاده تجاری از قالب‌ها، فونت‌ها و دارایی‌های آماده را جداگانه بررسی کنید.',
      'فایل محرمانه را در workspace مشترک نگذارید و از خروجی مهم نسخه پشتیبان بگیرید.',
      'روش تحویل و مدت پلن را از روی مشخصات دقیق محصول بسنجید، نه فقط نام برند.',
    ],
  },
  'ابزار نوشتاری': {
    title: 'راهنمای ابزارهای نوشتاری',
    summary: 'ابزارهای نگارش، ویرایش و بهبود متن.',
    description:
      'ابزارهای نوشتاری برای بررسی املا و دستور زبان، بازنویسی، تنظیم لحن و کمک به تولید متن استفاده می‌شوند. پیشنهادها همیشه درست یا مناسب بافت متن نیستند و باید بازبینی شوند.',
    planDifferences:
      'پلن‌ها ممکن است در زبان‌ها، حجم استفاده، قابلیت بازنویسی و تعداد کاربران فرق کنند. دعوت تیمی با اشتراک شخصی یکسان نیست و متن‌های شما ممکن است تحت دسترسی فضای کاری قرار بگیرند.',
    tips: [
      'متن محرمانه، قرارداد یا اطلاعات شخصی را بدون بررسی سیاست داده سرویس وارد نکنید.',
      'نسخه نهایی را از نظر معنی، لحن و صحت ادعاها خودتان بازبینی کنید.',
      'نوع تحویل، مدت و سقف استفاده را پیش از سفارش روشن کنید.',
    ],
  },
  'شبکه و ارتباطات': {
    title: 'راهنمای ابزارهای ارتباطی',
    summary: 'ابزارهای پیام‌رسانی، تماس و همکاری آنلاین.',
    description:
      'ابزارهای ارتباطی امکان گفتگو، تماس و همکاری در گروه‌ها یا تیم‌ها را فراهم می‌کنند. کنترل حساب، نقش مدیر و حریم خصوصی در فضای شخصی و تیمی متفاوت است.',
    planDifferences:
      'اکانت شخصی، دعوت به گروه/تیم و حساب اشتراکی سه نوع دسترسی متفاوت‌اند. دعوت‌نامه معمولاً به ایمیل می‌آید؛ عضویت در تیم به معنی مالکیت آن حساب یا داده‌ها نیست.',
    tips: [
      'کدهای ورود، رمز و کد بازیابی را هیچ‌وقت در اختیار واسطه نگذارید.',
      'محتوای حساس را در گروه یا اکانت مشترک منتشر نکنید.',
      'پیش از خرید مطمئن شوید قابلیت موردنیاز روی حساب خودتان فعال می‌شود.',
    ],
  },
  'مالی و بازار': {
    title: 'راهنمای ابزارهای مالی و بازار',
    summary: 'ابزارهای مشاهده داده، نمودار و تحلیل بازار.',
    description:
      'این سرویس‌ها برای مشاهده نمودار، داده‌های مالی و ابزارهای تحلیل بازار به کار می‌روند. داده یا ابزار تحلیلی تضمین سود و توصیه سرمایه‌گذاری نیست؛ تصمیم مالی را مستقل و با ارزیابی ریسک بگیرید.',
    planDifferences:
      'پلن‌ها در بازارهای پوشش‌داده‌شده، هشدارها، شاخص‌ها و محدودیت داده تفاوت دارند. اشتراک تیمی یا اشتراکی ممکن است سابقه و تنظیمات شما را در معرض دیگران قرار دهد.',
    tips: [
      'هیچ اشتراکی سود یا درستی پیش‌بینی بازار را تضمین نمی‌کند.',
      'از فعال‌سازی‌های مشکوک و ارائه رمز یا کد دومرحله‌ای حساب مالی خودداری کنید.',
      'نوع دسترسی، منطقه و مدت تمدید را پیش از پرداخت دقیق بخوانید.',
    ],
  },
}

const persianBrandNames: Record<string, string> = {
  openai: 'چت‌جی‌پی‌تی',
  x: 'گراک',
  claude: 'کلود',
  googlegemini: 'جمینای',
  cursor: 'کرسر',
  midjourney: 'میدجرنی',
  canva: 'کانوا',
  spotify: 'اسپاتیفای',
  youtube: 'یوتیوب',
  perplexity: 'پرپلکسیتی',
  netflix: 'نتفلیکس',
  capcut: 'کپ‌کات',
  notion: 'نوشن',
  google: 'گوگل',
  adobe: 'ادوبی',
  microsoft: 'مایکروسافت',
  figma: 'فیگما',
  grammarly: 'گرامرلی',
  duolingo: 'دولینگو',
  elevenlabs: 'اِلِون‌لبز',
  lovable: 'لاوابل',
  coursera: 'کورسرا',
  bolt: 'بولت',
  gamma: 'گاما',
  klingai: 'کلینگ',
  leonardo: 'لئوناردو',
  quillbot: 'کویل‌بات',
  replit: 'ریپلیت',
  apple: 'اپل',
  amazon: 'آمازون',
  autodesk: 'اتو‌دسک',
  discord: 'دیسکورد',
  facebook: 'فیس‌بوک',
  framer: 'فریمر',
  hbo: 'اچ‌بی‌او',
  heygen: 'هی‌جن',
  jetbrains: 'جت‌برینز',
  linkedin: 'لینکدین',
  nordvpn: 'نورد‌وی‌پی‌ان',
  proton: 'پروتون',
  purevpn: 'پیور‌وی‌پی‌ان',
  surfshark: 'سرف‌شارک',
  runway: 'ران‌وی',
  suno: 'سونو',
  telegram: 'تلگرام',
  tradingview: 'تریدینگ‌ویو',
  udemy: 'یودمی',
  zoom: 'زوم',
  expressvpn: 'اکسپرس‌وی‌پی‌ان',
  veepn: 'وی‌پی‌ان',
  tidal: 'تیدال',
  crunchyroll: 'کرانچی‌رول',
  disneyplus: 'دیزنی‌پلاس',
  xbox: 'ایکس‌باکس',
  playstation: 'پلی‌استیشن',
  github: 'گیت‌هاب',
  githubcopilot: 'گیت‌هاب کوپایلت',
  codeium: 'ویندسرف',
}

function getServiceGuide(
  brandKey: string,
  brand: string,
  category: string,
): ServiceGuide {
  const categoryAlias =
    /موسیقی|ویدیو|سرگرمی/.test(category)
      ? 'موسیقی و ویدیو'
      : /آموزش|ابزارها/.test(category)
        ? 'آموزش و ابزارها'
        : /امنیت|vpn|حریم خصوصی/i.test(category)
          ? 'امنیت و VPN'
          : /طراحی|گرافیک/.test(category)
            ? 'طراحی و گرافیک'
            : category
  return (
    serviceGuides[brandKey] ??
    categoryGuides[category] ??
    categoryGuides[categoryAlias] ?? {
      title: `معرفی ${brand}`,
      summary: `${brand}؛ سرویس دیجیتال برای کار، یادگیری یا سرگرمی.`,
      description: `${brand} یک سرویس دیجیتال برای استفاده آنلاین در حوزه ${category || 'ابزارهای دیجیتال'} است. قابلیت‌های دقیق به محصول و نوع اشتراک وابسته است؛ پیش از خرید مشخصات هر پلن، مدت، محدودیت‌ها و روش فعال‌سازی را بخوانید و درباره ویژگی‌ای که صریحاً درج نشده فرض نسازید.`,
      planDifferences:
        '«کد فعال‌سازی» را خودتان روی اکانت شخصی وارد می‌کنید؛ «Trial» دسترسی آزمایشی و محدود است؛ «دعوتی» با ایمیل شما انجام می‌شود؛ و «اشتراکی» یعنی دسترسی یا منابع با افراد دیگر مشترک است. «اکانت آماده» هم لزوماً به معنی مالکیت کامل یا امکان تغییر اطلاعات نیست.',
      tips: [
        'برای سرویس‌های منطقه‌ای از IP تمیز و باثبات استفاده کنید؛ تغییر مداوم کشور می‌تواند ورود را مشکوک کند، اما IP تضمین ضد مسدودی نیست.',
        'وضعیت گارانتی را از عبارت دقیق محصول بخوانید: گارانتی کامل، ضمانت چندروزه و بدون گارانتی معانی متفاوت دارند.',
        'ریسک تغییر سیاست، قطع دسترسی یا مسدودی وجود دارد؛ نوبول تضمین صددرصدی نمی‌دهد. برای داده‌های حساس از اکانت اشتراکی استفاده نکنید.',
      ],
    }
  )
}

function getPersianCategory(asset: BrandAsset, source: string): string {
  const category = `${asset.categoryLabel} ${source}`.toLocaleLowerCase()
  if (/هوش مصنوعی|artificial intelligence|\bai\b/.test(category)) {
    return 'هوش مصنوعی'
  }
  if (
    /برنامه‌نویسی|برنامه نویسی|کدنویسی|programming|developer|coding|software development/.test(
      category,
    )
  ) {
    return 'برنامه‌نویسی'
  }
  if (
    /سرگرمی|موسیقی|ویدیو|entertainment|video|music|stream/.test(category)
  ) {
    return 'موسیقی و ویدیو'
  }
  if (/طراحی|گرافیک|design|graphic|creative|illustration/.test(category)) {
    return 'طراحی و گرافیک'
  }
  if (/حریم خصوصی|امنیت|privacy|vpn|security|antivirus/.test(category)) {
    return 'امنیت و VPN'
  }
  if (
    /آموزش|education|learning|course|training|ابزار|tool|productivity|نوشتاری|writing|شبکه|network|ارتباطات|communication|مالی|finance|بازار|market/.test(
      category,
    )
  ) {
    return 'آموزش و ابزارها'
  }
  return 'آموزش و ابزارها'
}

function asRecord(value: unknown): ProductRecord {
  return value && typeof value === 'object' ? (value as ProductRecord) : {}
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const record = asRecord(value)
    return asText(record.name ?? record.title ?? record.label)
  }
  return ''
}

function getProductList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  const data = asRecord(record.data)
  const list =
    record.products ??
    record.items ??
    record.results ??
    (Array.isArray(record.data) ? record.data : undefined) ??
    data.products ??
    data.items
  return Array.isArray(list) ? list : []
}

function getStock(record: ProductRecord): {
  stock: number | null
  status: StockStatus
} {
  const stockValue = record.stock ?? record.quantity ?? record.available_stock
  const parsedStock =
    typeof stockValue === 'number'
      ? stockValue
      : typeof stockValue === 'string' && stockValue.trim()
        ? Number(stockValue)
        : Number.NaN
  const stock = Number.isFinite(parsedStock) ? parsedStock : null
  const inStock =
    typeof record.in_stock === 'boolean'
      ? record.in_stock
      : typeof record.inStock === 'boolean'
        ? record.inStock
        : null
  const stockUpdatedAt = asText(
    record.stock_updated_at ?? record.inventory_updated_at,
  )
  const updatedTime = stockUpdatedAt ? Date.parse(stockUpdatedAt) : Number.NaN
  const isStale =
    Number.isFinite(updatedTime) && Date.now() - updatedTime > 5 * 60 * 1000

  if (isStale) return { stock, status: 'unknown' }
  if (stock !== null && inStock !== null && (stock > 0) !== inStock) {
    return { stock, status: 'unknown' }
  }
  if (stock !== null) {
    return { stock, status: stock > 0 ? 'available' : 'unavailable' }
  }
  if (inStock !== null) {
    return {
      stock: null,
      status: inStock ? 'available' : 'unavailable',
    }
  }
  return { stock: null, status: 'unknown' }
}

function normalizeProducts(payload: unknown): Product[] {
  return getProductList(payload)
    .map((item) => {
      const record = asRecord(item)
      const id = asText(record.id ?? record.product_id ?? record.uuid)
      const name = asText(record.name ?? record.title ?? record.product_name)
      const priceToman = Number(record.price_toman)
      if (!id || !name || !Number.isFinite(priceToman) || priceToman < 0) {
        return null
      }

      const brand =
        asText(record.brand ?? record.brand_name) ||
        asText(record.category ?? record.category_name) ||
        'سایر'
      const category =
        asText(record.category ?? record.category_name) || brand
      const providerId = asText(record.provider_id) || 'dante'
      const providerProductId =
        asText(record.provider_product_id) ||
        id.replace(new RegExp(`^${providerId}--`), '')
      const brandAsset = resolveBrandAsset(
        name,
        brand,
        category,
        asText(record.description ?? record.subtitle),
      )
      const resolvedBrand =
        brandAsset.name !== 'سایر' ? brandAsset.name : brand
      const brandKey =
        brandAsset.name !== 'سایر'
          ? brandAsset.slug
          : brand.toLocaleLowerCase().trim().replace(/\s+/g, '-')
      const persianCategory = getPersianCategory(
        brandAsset,
        `${category} ${name} ${asText(record.description ?? record.subtitle)}`,
      )
      const { stock, status } = getStock(record)
      const purchaseUrl = asText(
        record.purchase_url ?? record.telegram_url ?? record.mini_app_url,
      )

      return {
        id,
        providerId,
        providerProductId,
        name,
        brand: resolvedBrand,
        brandKey,
        brandAsset,
        category,
        persianCategory,
        description: asText(record.description ?? record.subtitle),
        price_toman: priceToman,
        usdt_rate_used: Number.isFinite(Number(record.usdt_rate_used))
          ? Number(record.usdt_rate_used)
          : null,
        stock,
        status,
        purchaseUrl: purchaseUrl || null,
      }
    })
    .filter((product): product is Product => product !== null)
}

function formatToman(value: number): string {
  return `${new Intl.NumberFormat('fa-IR').format(value)} تومان`
}

function stockLabel(product: Product): string {
  if (product.status === 'available') {
    return product.stock === null
      ? 'موجود'
      : `${new Intl.NumberFormat('fa-IR').format(product.stock)} عدد موجود`
  }
  if (product.status === 'unavailable') return 'ناموجود'
  return 'استعلام موجودی'
}

function telegramUrl(product: Product): string | null {
  const username = telegramBotUsername || 'NoBullShopBot'
  const startPayload = `buy_${product.providerId}_${product.providerProductId}`
  return `https://t.me/${username}?start=${encodeURIComponent(startPayload)}`
}

function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | '2fa' | 'admin'>(() =>
    window.location.hash === '#admin' ? 'admin' : 'catalog',
  )
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_FILTER)
  const [selectedBrand, setSelectedBrand] = useState(ALL_FILTER)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [expandedBrand, setExpandedBrand] = useState('')
  const [guideBrandKey, setGuideBrandKey] = useState('')
  const [logoSrc, setLogoSrc] = useState('/logo.jpg')
  const [totpInput, setTotpInput] = useState('')
  const [now, setNow] = useState(0)
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/catalog', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 503
              ? 'سرویس کاتالوگ پیکربندی نشده است.'
              : 'دریافت کاتالوگ با خطا روبه‌رو شد.',
          )
        }
        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        setProducts(normalizeProducts(payload))
        setCatalogError('')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'دریافت کاتالوگ با خطا روبه‌رو شد.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncHashRoute = () => {
      if (window.location.hash === '#admin') setActiveTab('admin')
      else if (activeTab === 'admin') setActiveTab('catalog')
    }
    window.addEventListener('hashchange', syncHashRoute)
    return () => window.removeEventListener('hashchange', syncHashRoute)
  }, [activeTab])

  const totpResult = useMemo(() => {
    const value = totpInput.trim()
    if (!value) return { totp: null, error: '' }
    try {
      const parsed = value.startsWith('otpauth://')
        ? OTPAuth.URI.parse(value)
        : new OTPAuth.TOTP({
            issuer: 'NoBull',
            label: 'NoBull',
            secret: OTPAuth.Secret.fromBase32(value.replace(/\s/g, '').toUpperCase()),
            digits: 6,
            period: 30,
          })
      if (!(parsed instanceof OTPAuth.TOTP)) {
        return { totp: null, error: 'این لینک از نوع TOTP نیست.' }
      }
      if (parsed.digits !== 6) {
        return { totp: null, error: 'این کد، شش‌رقمی تنظیم نشده است.' }
      }
      return { totp: parsed, error: '' }
    } catch {
      return {
        totp: null,
        error: 'کلید Base32 یا لینک otpauth معتبر نیست.',
      }
    }
  }, [totpInput])

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const product of products) {
      counts.set(
        product.persianCategory,
        (counts.get(product.persianCategory) ?? 0) + 1,
      )
    }
    return [
      { key: ALL_FILTER, label: 'همه دسته‌ها', count: products.length },
      ...[...counts.entries()].map(([label, count]) => ({
        key: label,
        label,
        count,
      })),
    ]
  }, [products])

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === ALL_FILTER ||
        product.persianCategory === selectedCategory
      const matchesBrand =
        selectedBrand === ALL_FILTER || product.brandKey === selectedBrand
      const matchesQuery =
        !normalizedQuery ||
        `${translateProductText(product.name)} ${product.name} ${product.brand} ${product.category} ${product.persianCategory}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      return matchesCategory && matchesQuery && matchesBrand
    })
  }, [products, query, selectedBrand, selectedCategory])

  const brandGroups = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const product of products) {
      const plans = groups.get(product.brandKey) ?? []
      plans.push(product)
      groups.set(product.brandKey, plans)
    }
    return [...groups.entries()].map(([brandKey, plans]) => {
      const lowestPlan = plans.reduce((lowest, plan) =>
        plan.price_toman < lowest.price_toman ? plan : lowest,
      )
      return {
        brand: plans[0].brand,
        brandKey,
        asset: plans[0].brandAsset,
        category: plans[0].brandAsset.categoryLabel,
        plans,
        availablePlans: plans.filter((product) => product.status === 'available')
          .length,
        lowestPlan,
      }
    })
  }, [products])
  const visibleBrandGroups = useMemo(() => {
    const visibleIds = new Set(filteredProducts.map((product) => product.id))
    return brandGroups
      .map((group) => ({
        ...group,
        plans: group.plans.filter((product) => visibleIds.has(product.id)),
      }))
      .filter((group) => group.plans.length > 0)
  }, [brandGroups, filteredProducts])
  const activeBrand = brandGroups.find(
    (group) => group.brandKey === selectedBrand,
  )
  const activeGuide =
    selectedBrand !== ALL_FILTER
      ? getServiceGuide(
          selectedBrand,
          activeBrand?.brand ?? selectedBrand,
          activeBrand?.asset.categoryLabel ?? selectedCategory,
        )
      : selectedCategory !== ALL_FILTER
        ? getServiceGuide('', selectedCategory, selectedCategory)
        : null
  const guideBrand = brandGroups.find(
    (group) => group.brandKey === guideBrandKey,
  )
  const totpCode =
    now > 0 ? (totpResult.totp?.generate({ timestamp: now }) ?? '') : ''
  const totpPeriod = totpResult.totp?.period ?? 30
  const totpSecondsLeft = totpResult.totp
    ? Math.ceil(
        OTPAuth.TOTP.remaining({ period: totpPeriod, timestamp: now }) / 1000,
      )
    : 0

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(successMessage)
    } catch {
      const input = document.createElement('textarea')
      input.value = value
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.append(input)
      input.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      } finally {
        input.remove()
      }
      setCopyMessage(
        copied
          ? successMessage
          : `کپی خودکار در دسترس نیست؛ لینک را دستی کپی کنید: ${value}`,
      )
    }
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  const scrollToProducts = () => {
    document
      .getElementById('product-plans')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const resetFilters = () => {
    setSelectedCategory(ALL_FILTER)
    setSelectedBrand(ALL_FILTER)
    setQuery('')
    scrollToProducts()
  }

  const hasActiveFilters =
    selectedCategory !== ALL_FILTER ||
    selectedBrand !== ALL_FILTER ||
    Boolean(query.trim())

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-black text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[540px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,242,255,0.12),transparent_65%)]"
      />
      <div className="relative z-10 mx-auto w-full max-w-[1240px] px-4 pb-14 pt-5 sm:px-7 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="NoBull"
                className="h-12 w-12 rounded-xl border border-[#00F2FF]/30 object-cover shadow-[0_0_15px_rgba(0,242,255,0.2)] transition-all hover:scale-105"
                onError={() =>
                  setLogoSrc((current) =>
                    current === '/logo.jpg' ? '/logo.png' : '',
                  )
                }
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/[0.08] text-primary shadow-[0_0_25px_rgba(0,242,255,0.12)]">
                <Beef size={27} strokeWidth={1.7} />
              </span>
            )}
            <div>
              <div className="text-xl font-extrabold tracking-tight">
                NoBull <span className="text-primary">| نوبول</span>
              </div>
              <p className="mt-1 max-w-[720px] text-xs leading-6 text-white/65 drop-shadow-[0_0_12px_rgba(0,242,255,0.18)] sm:text-[13px]">
                بی‌حاشیه و روراست؛ اشتراک‌های هوش مصنوعی و دیجیتال ویژه رفقا و خانواده
              </p>
            </div>
          </div>
          <span className="flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-[11px] text-primary/90">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_#00F2FF]" />
            خرید امن و شفاف
          </span>
        </header>

        <nav
          aria-label="بخش‌های نوبول"
          className="mt-5 flex w-full gap-2 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
              setActiveTab('catalog')
            }}
            aria-current={activeTab === 'catalog' ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
              activeTab === 'catalog'
                ? 'border-primary/40 bg-primary/[0.1] text-primary shadow-[0_0_22px_rgba(0,242,255,0.07)]'
                : 'border-white/[0.08] bg-white/[0.025] text-white/55 hover:border-white/20 hover:text-white'
            }`}
          >
            <ShoppingBag size={16} />
            کاتالوگ اشتراک‌ها
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
              setActiveTab('2fa')
            }}
            aria-current={activeTab === '2fa' ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
              activeTab === '2fa'
                ? 'border-primary/40 bg-primary/[0.1] text-primary shadow-[0_0_22px_rgba(0,242,255,0.07)]'
                : 'border-white/[0.08] bg-white/[0.025] text-white/55 hover:border-white/20 hover:text-white'
            }`}
          >
            <KeyRound size={16} />
            دریافت کد دو مرحله‌ای (2FA)
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.hash = 'admin'
              setActiveTab('admin')
            }}
            aria-current={activeTab === 'admin' ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
              activeTab === 'admin'
                ? 'border-emerald-300/40 bg-emerald-300/[0.08] text-emerald-100'
                : 'border-white/[0.08] bg-white/[0.025] text-white/55 hover:border-white/20 hover:text-white'
            }`}
          >
            <LockKeyhole size={16} />
            پنل مدیریت
          </button>
        </nav>

        {activeTab === 'catalog' ? (
          <>
            <section className="relative mt-8 overflow-hidden rounded-[28px] border border-primary/20 bg-[#071012] px-5 py-7 shadow-[0_20px_80px_rgba(0,242,255,0.045)] sm:mt-10 sm:px-9 sm:py-10">
              <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-primary/[0.08] blur-[90px]" />
              <div className="relative">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-[10px] font-semibold tracking-wide text-primary sm:text-xs">
                  <Sparkles size={13} />
                  دنیای اشتراک‌های دیجیتال، بدون حاشیه
                </div>
                <h1 className="max-w-3xl text-[26px] font-extrabold leading-[1.65] tracking-tight sm:text-4xl sm:leading-[1.5]">
                  اشتراک مناسب خودت را
                  <span className="text-primary"> پیدا کن.</span>
                </h1>
                <p className="mt-2 max-w-2xl text-xs leading-7 text-white/50 sm:text-sm">
                  قیمت شفاف، موجودی به‌روز و تحویل راحت برای رفقا و خانواده.
                </p>

                <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  <StatCard
                    icon={<PackageCheck size={17} />}
                    value="+۶۸"
                    label="برند معتبر"
                  />
                  <StatCard
                    icon={<ShoppingBag size={17} />}
                    value="آنی"
                    label="تحویل در تلگرام"
                  />
                  <StatCard
                    icon={<Zap size={17} />}
                    value="تومانی"
                    label="قیمت رفاقتی"
                  />
                  <StatCard
                    icon={<Check size={17} />}
                    value="داخلی"
                    label="ابزار کد ۲ مرحله‌ای"
                  />
                </div>
              </div>
            </section>

            <section
              aria-labelledby="nobull-promise"
              className="mt-5 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-zinc-950/90 to-zinc-950/80 p-5 shadow-[0_12px_45px_rgba(0,242,255,0.035)] sm:mt-6 sm:p-7"
            >
              <p className="text-[10px] font-semibold tracking-[0.16em] text-primary/75">
                NO BULL • OUR PROMISE
              </p>
              <h2
                id="nobull-promise"
                className="mt-2 text-lg font-extrabold leading-8 text-white sm:text-xl"
              >
                نوبول؛ صداقت بی‌رحمانه، قیمت واقعی، بدون حاشیه.
              </h2>
              <div className="mt-4 space-y-4 text-xs leading-8 text-white/65 sm:text-sm sm:leading-9">
                <p>
                  این اکانت‌ها همه از آفرهای کشورهای مختلف و ارزان تهیه می‌شوند.
                  به دلیل محدودیت‌های جغرافیایی و رعایت نکردن مواردی مثل استفاده
                  از آی‌پی کثیف یا تحریم‌های ریجنی، احتمال غیرفعال شدن برخی
                  اکانت‌ها وجود دارد؛ اما در صورت رعایت نکات، اکثراً بدون مشکل و
                  بدون ساسپند کار می‌کنند. در کل، خرید این اکانت‌ها در زمره
                  خدمات بازار خاکستری قرار دارد و دارای ریسک مسدودی است. اگر
                  امکان تهیه کارت بانکی بین‌المللی و خرید قانونی را دارید،
                  حتماً از روش قانونی اقدام کنید؛ اما اگر مثل ما شرایط ارزی
                  سختی دارید، حداقل با قیمت منطقی خرید کنید.
                </p>
                <p>
                  هیچ‌گونه گارانتیِ دروغین و تضمین صددرصدی از سوی نوبول وجود
                  ندارد؛ به همین دلیل است که قیمت‌ها بسیار پایین و اقتصادی
                  تعیین شده‌اند تا برای شما دوستان عزیز ارزش خرید داشته باشد.
                  توجه داشته باشید که این محصولات دقیقاً همان خدماتی است که
                  خیلی‌ها با چند برابر قیمت، تحت عنوان «ساخت تیم خودمان» یا با
                  گارانتی‌های ساختگی به شما می‌فروشند، در حالی که همه از همین
                  سرچشمه تأمین می‌شوند. هدف ما این است که امکان تهیه این
                  اکانت‌ها به صورت ریالی، با مناسب‌ترین قیمت و اخذ کمترین
                  کارمزد و سود ممکن، برای شما رفقای عزیز فراهم شود.
                </p>
              </div>
            </section>

            <section className="mt-7">
              {brandGroups.length > 0 && (
                <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                  {brandGroups.slice(0, 10).map(({ brand, brandKey, asset }) => (
                    <button
                      type="button"
                      key={brandKey}
                      onClick={() => {
                        setSelectedBrand(brandKey)
                        setSelectedCategory(ALL_FILTER)
                        setQuery('')
                        scrollToProducts()
                      }}
                      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[11px] transition ${
                        selectedBrand === brandKey
                          ? 'border-primary/50 bg-primary/[0.1] text-primary'
                          : 'border-white/[0.08] bg-white/[0.035] text-white/65 hover:border-primary/35'
                      }`}
                    >
                      <BrandLogo asset={asset} className="h-5 w-5" />
                      {brand}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={handleSearchSubmit}
                className="flex h-12 items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#090c0d] px-4 transition focus-within:border-primary/45 focus-within:shadow-[0_0_24px_rgba(0,242,255,0.06)]"
              >
                <Search size={18} className="shrink-0 text-white/35" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                  }}
                  placeholder="جست‌وجوی برند یا اشتراک..."
                  aria-label="جست‌وجوی کاتالوگ"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
                />
                <ChevronDown size={16} className="text-white/25" />
              </form>

              <div
                aria-label="فیلتر دسته‌بندی"
                className="mt-3 flex gap-2 overflow-x-auto pb-2"
              >
                {categoryOptions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(item.key)
                      setSelectedBrand(ALL_FILTER)
                      setQuery('')
                      scrollToProducts()
                    }}
                    aria-pressed={selectedCategory === item.key}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-medium transition ${
                      selectedCategory === item.key
                        ? 'border-primary/40 bg-primary/[0.1] text-primary'
                        : 'border-white/[0.08] bg-white/[0.025] text-white/50 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {item.label}
                    <span className="mr-1 text-[9px] opacity-60">
                      {new Intl.NumberFormat('fa-IR').format(item.count)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {visibleBrandGroups.length > 0 && (
              <section className="mt-8">
                <SectionHeading
                  eyebrow="PLANS BY SERVICE"
                  title="برندها و پلن‌های موجود"
                  icon={<Beef size={17} />}
                  detail={`${new Intl.NumberFormat('fa-IR').format(visibleBrandGroups.length)} برند`}
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {visibleBrandGroups.map((group) => {
                    const guide = getServiceGuide(
                      group.brandKey,
                      group.brand,
                      group.category,
                    )
                    const persianBrand =
                      persianBrandNames[group.brandKey] ?? group.brand
                    const isExpanded = expandedBrand === group.brandKey
                    return (
                      <article
                        key={group.brandKey}
                        className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b1114] shadow-[0_15px_45px_rgba(0,0,0,0.2)] transition-colors hover:border-emerald-400/25"
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex items-center justify-between">
                            <BrandLogo
                              asset={group.asset}
                              className="h-12 w-12 rounded-xl"
                            />
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-emerald-200/85">
                              {new Intl.NumberFormat('fa-IR').format(
                                group.plans.length,
                              )}{' '}
                              پلن
                            </span>
                          </div>

                          <h3 className="mt-3 text-base font-extrabold text-white">
                            <span dir="ltr">{group.brand}</span>
                            <span className="px-1.5 text-white/35">|</span>
                            <span>{persianBrand}</span>
                          </h3>
                          <p className="mt-2 line-clamp-2 text-[11px] leading-6 text-white/55">
                            <span className="font-semibold text-white/75">
                              {translateProductText(group.lowestPlan.name)}
                            </span>
                            <span className="px-1 text-white/25">—</span>
                            {guide.summary}
                          </p>

                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
                            <div>
                              <p className="text-[10px] text-white/40">
                                شروع قیمت از
                              </p>
                              <p className="mt-1 text-lg font-extrabold text-emerald-300">
                                {formatToman(group.lowestPlan.price_toman)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setGuideBrandKey(group.brandKey)}
                              aria-label={`راهنمای کامل ${group.brand}`}
                              title="راهنمای کامل و پلن‌ها"
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] text-lg font-bold text-cyan-200 transition hover:border-cyan-200/60 hover:bg-cyan-300/15"
                            >
                              ↗
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedBrand(isExpanded ? '' : group.brandKey)
                          }
                          className="flex w-full items-center justify-between border-t border-emerald-400/10 bg-emerald-400/[0.045] px-4 py-3 text-right text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/[0.09] sm:px-5"
                        >
                          <span>
                            {isExpanded ? '▼' : '▶'} مشاهده همه پلن‌های{' '}
                            {persianBrand}
                          </span>
                          <ChevronDown
                            size={15}
                            className={`transition-transform duration-300 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="space-y-2 border-t border-white/[0.06] bg-[#111a1e] p-3 sm:p-4">
                              {group.plans.map((product) => (
                                <PlanRow
                                  key={product.id}
                                  product={product}
                                  onSelect={() => setSelectedProduct(product)}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            {activeGuide && (
              <section className="mt-7 rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,rgba(0,242,255,0.07),rgba(8,11,12,0.92)_48%)] p-5 shadow-[0_0_35px_rgba(0,242,255,0.045)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08] text-primary">
                    <CircleHelp size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold tracking-[0.16em] text-primary/75">
                      SERVICE GUIDE • راهنمای بی‌تعارف
                    </p>
                    <h2 className="mt-1 text-base font-bold text-white sm:text-lg">
                      معرفی سرویس و نکات استفاده: {activeGuide.title}
                    </h2>
                  </div>
                </div>
                <ServiceGuideContent guide={activeGuide} />
              </section>
            )}

            <section id="product-plans" className="mt-9 scroll-mt-6">
              <SectionHeading
                eyebrow="SELECTED PLANS"
                title="پلن‌های اشتراک"
                icon={<Sparkles size={17} />}
                detail={
                  loading
                    ? 'در حال دریافت...'
                    : `${new Intl.NumberFormat('fa-IR').format(filteredProducts.length)} مورد`
                }
              />

              {hasActiveFilters && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                    <span className="font-semibold text-primary">
                      فیلترهای فعال:
                    </span>
                    {selectedCategory !== ALL_FILTER && (
                      <span className="rounded-full border border-white/10 px-2.5 py-1">
                        {selectedCategory}
                      </span>
                    )}
                    {selectedBrand !== ALL_FILTER && (
                      <span className="rounded-full border border-white/10 px-2.5 py-1">
                        {brandGroups.find(
                          (group) => group.brandKey === selectedBrand,
                        )?.brand ?? selectedBrand}
                      </span>
                    )}
                    {query.trim() && (
                      <span className="rounded-full border border-white/10 px-2.5 py-1">
                        «{query.trim()}»
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11px] font-semibold text-primary transition hover:text-white"
                  >
                    همه محصولات
                  </button>
                </div>
              )}
              {copyMessage && hasActiveFilters && (
                <p role="status" className="mt-3 text-[11px] text-primary/80">
                  {copyMessage}
                </p>
              )}

              {catalogError ? (
                <div
                  role="alert"
                  className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm leading-7 text-red-200/80">
                    {catalogError}
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-xl border border-red-300/20 px-4 py-2 text-xs text-red-100 transition hover:bg-red-300/10"
                  >
                    تلاش دوباره
                  </button>
                </div>
              ) : loading ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className="h-52 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]"
                    />
                  ))}
                </div>
              ) : filteredProducts.length ? (
                <p className="sr-only">
                  {new Intl.NumberFormat('fa-IR').format(filteredProducts.length)} پلن در کارت‌های برند نمایش داده شده است.
                </p>
              ) : (
                <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-12 text-center">
                  <Search className="mx-auto text-white/25" size={25} />
                  <p className="mt-3 text-sm text-white/60">
                    {products.length
                      ? hasActiveFilters
                        ? 'محصولی با فیلترهای انتخاب‌شده پیدا نشد.'
                        : 'محصولی با این جست‌وجو پیدا نشد.'
                      : 'فعلاً محصولی در کاتالوگ موجود نیست.'}
                  </p>
                  {!products.length && (
                    <p className="mt-2 text-xs text-white/35">
                      با آماده‌شدن محصولات، آن‌ها را همین‌جا می‌بینید.
                    </p>
                  )}
                </div>
              )}
            </section>
          </>
        ) : activeTab === '2fa' ? (
          <section className="mx-auto mt-8 max-w-2xl rounded-[28px] border border-white/[0.1] bg-[#080b0c]/90 p-5 shadow-[0_24px_100px_rgba(0,0,0,0.65),0_0_45px_rgba(0,242,255,0.05)] sm:mt-12 sm:p-8">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/[0.08] text-primary shadow-[0_0_25px_rgba(0,242,255,0.1)]">
                <ShieldCheck size={27} />
              </span>
              <p className="mt-5 text-[10px] font-semibold tracking-[0.18em] text-primary/80">
                AUTHENTICATOR
              </p>
              <h1 className="mt-2 text-2xl font-bold">کد دو مرحله‌ای</h1>
              <p className="mx-auto mt-2 max-w-md text-xs leading-7 text-white/45 sm:text-sm">
                کلید مخفی یا لینک otpauth را وارد کنید تا کد یک‌بارمصرف لحظه‌ای
                ساخته شود. اطلاعات فقط در مرورگر شما پردازش می‌شود.
              </p>
            </div>

            <label
              htmlFor="totp-secret"
              className="mb-2 mt-7 block text-xs font-medium text-white/75"
            >
              کلید مخفی یا لینک احراز هویت
            </label>
            <textarea
              id="totp-secret"
              value={totpInput}
              onChange={(event) => {
                setTotpInput(event.target.value)
                setCopyMessage('')
              }}
              dir="ltr"
              rows={3}
              autoComplete="off"
              spellCheck={false}
              placeholder="JBSWY3DPEHPK3PXP یا otpauth://totp/..."
              className="w-full resize-y rounded-2xl border border-white/[0.12] bg-black/50 p-4 font-mono text-xs leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-primary/60 focus:shadow-[0_0_20px_rgba(0,242,255,0.08)]"
            />
            {totpResult.error && (
              <p role="alert" className="mt-2 text-xs text-amber-200/80">
                {totpResult.error}
              </p>
            )}

            <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.035] p-5 text-center sm:p-7">
              {totpCode ? (
                <>
                  <div className="flex items-center justify-center gap-2 text-[11px] text-white/45">
                    <Clock3 size={14} className="text-primary" />
                    کد بعدی تا {new Intl.NumberFormat('fa-IR').format(totpSecondsLeft)} ثانیه دیگر
                  </div>
                  <div
                    dir="ltr"
                    aria-label={`کد یک‌بارمصرف ${totpCode}`}
                    className="mt-4 font-mono text-4xl font-bold tracking-[0.24em] text-primary drop-shadow-[0_0_18px_rgba(0,242,255,0.38)] sm:text-5xl"
                  >
                    {totpCode}
                  </div>
                  <div className="mx-auto mt-5 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-primary shadow-[0_0_10px_#00F2FF] transition-[width] duration-1000"
                      style={{
                        width: `${(totpSecondsLeft / totpPeriod) * 100}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(totpCode, 'کد تایید کپی شد.')
                    }
                    className="mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/25 px-4 py-2.5 text-xs text-primary transition hover:bg-primary/10"
                  >
                    <Copy size={14} />
                    کپی کد
                  </button>
                </>
              ) : (
                <div className="py-5 text-sm text-white/40">
                  <KeyRound className="mx-auto mb-3 text-white/25" size={23} />
                  کد شش‌رقمی پس از واردکردن کلید نمایش داده می‌شود.
                </div>
              )}
              {copyMessage && (
                <p role="status" className="mt-3 text-[11px] text-primary/80">
                  {copyMessage}
                </p>
              )}
            </div>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-[11px] leading-6 text-white/45">
              <LockKeyhole className="mt-1 shrink-0 text-primary/70" size={15} />
              کلید شما به سرور ارسال نمی‌شود. برای امنیت بیشتر، این صفحه را روی
              دستگاه مطمئن باز کنید.
            </div>
          </section>
        ) : (
          <AdminDashboard />
        )}

        <footer className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[10px] text-white/30 sm:flex-row sm:text-xs">
          <span>نوبول؛ بی‌حاشیه و روراست برای رفقا و خانواده</span>
          <span className="flex items-center gap-2">
            <LockKeyhole size={12} />
            پرداخت و اطلاعات شفاف
          </span>
        </footer>
      </div>

      {selectedProduct && (
        <PurchaseModal
          product={selectedProduct}
          guide={getServiceGuide(
            selectedProduct.brandKey,
            selectedProduct.brand,
            selectedProduct.brandAsset.categoryLabel,
          )}
          onClose={() => setSelectedProduct(null)}
          onCopy={(value, successMessage) =>
            void copyText(value, successMessage ?? 'اطلاعات سفارش کپی شد.')
          }
          copyMessage={copyMessage}
        />
      )}
      {guideBrand && (
        <BrandGuideModal
          brand={guideBrand.brand}
          persianBrand={
            persianBrandNames[guideBrand.brandKey] ?? guideBrand.brand
          }
          guide={getServiceGuide(
            guideBrand.brandKey,
            guideBrand.brand,
            guideBrand.category,
          )}
          plans={guideBrand.plans}
          onClose={() => setGuideBrandKey('')}
          onSelectPlan={(product) => {
            setGuideBrandKey('')
            setSelectedProduct(product)
          }}
        />
      )}
    </main>
  )
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string
  label: string
}) {
  return (
    <div className="rounded-2xl border border-white/[0.1] bg-white/[0.035] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl sm:p-4">
      <div className="flex items-center gap-2 text-primary/80">
        {icon}
        <span className="text-base font-bold text-white sm:text-lg">{value}</span>
      </div>
      <p className="mt-1.5 text-[10px] text-white/40 sm:text-xs">{label}</p>
    </div>
  )
}

function BrandLogo({
  asset,
  className = 'h-10 w-10',
}: {
  asset: BrandAsset
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/[0.12] p-2 ${className}`}
      style={{
        background:
          asset.color === '000000'
            ? 'linear-gradient(145deg, #ffffff, #d4d4d8)'
            : asset.color === 'FFFFFF'
              ? 'linear-gradient(145deg, #27272a, #09090b)'
              : `linear-gradient(145deg, #${asset.color}35, #${asset.color}10)`,
        boxShadow: `0 0 24px #${asset.color}35`,
      }}
    >
      {asset.logoUrl && !failed ? (
        <img
          src={asset.logoUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Sparkles
          aria-hidden="true"
          className="h-full w-full"
          style={{ color: `#${asset.color}` }}
          strokeWidth={1.7}
        />
      )}
    </span>
  )
}

function SectionHeading({
  eyebrow,
  title,
  icon,
  detail,
}: {
  eyebrow: string
  title: string
  icon: ReactNode
  detail?: string
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[9px] font-semibold tracking-[0.18em] text-primary/65">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 flex items-center gap-2 text-base font-bold sm:text-lg">
          <span className="text-primary">{icon}</span>
          {title}
        </h2>
      </div>
      {detail && <span className="text-[10px] text-white/35">{detail}</span>}
    </div>
  )
}

function PlanRow({
  product,
  onSelect,
}: {
  product: Product
  onSelect: () => void
}) {
  const persianTitle = translateProductText(product.name)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0b1114] p-3 text-right transition hover:border-emerald-300/25 hover:bg-[#142126]"
      aria-label={`جزئیات پلن ${persianTitle}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-emerald-100 underline decoration-emerald-300/35 underline-offset-4">
          {persianTitle}
        </span>
        <span
          dir="auto"
          className="mt-1 block truncate text-[9px] text-white/30"
        >
          {product.name}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs font-bold text-white">
          {formatToman(product.price_toman)}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] ${
            product.status === 'available'
              ? 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200'
              : product.status === 'unavailable'
                ? 'border-red-300/15 bg-red-300/[0.05] text-red-200/70'
                : 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100/75'
          }`}
        >
          {stockLabel(product)}
        </span>
      </span>
    </button>
  )
}

function ServiceGuideContent({ guide }: { guide: ServiceGuide }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-white/[0.07] bg-black/25 p-3">
        <h3 className="text-[11px] font-bold text-cyan-100">
          این سرویس چیست و چه کاری انجام می‌دهد؟
        </h3>
        <p className="mt-1.5 text-[10px] leading-6 text-white/60">
          {guide.description}
        </p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-black/25 p-3">
        <h3 className="text-[11px] font-bold text-cyan-100">
          تفاوت پلن‌ها و اصطلاحات
        </h3>
        <p className="mt-1.5 text-[10px] leading-6 text-white/60">
          {guide.planDifferences}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-bold text-emerald-200">
          نکات حیاتی استفاده؛ بی‌تعارف
        </h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          {guide.tips.map((tip) => (
            <li
              key={tip}
              className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5 text-[10px] leading-6 text-white/55"
            >
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function BrandGuideModal({
  brand,
  persianBrand,
  guide,
  plans,
  onClose,
  onSelectPlan,
}: {
  brand: string
  persianBrand: string
  guide: ServiceGuide
  plans: Product[]
  onClose: () => void
  onSelectPlan: (product: Product) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-guide-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-emerald-300/20 bg-[#0b1114] p-4 shadow-[0_20px_90px_rgba(0,0,0,0.7)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.18em] text-emerald-200/70">
              راهنمای کامل سرویس و پلن‌ها
            </p>
            <h2
              id="brand-guide-title"
              className="mt-1 text-lg font-extrabold text-white"
            >
              <span dir="ltr">{brand}</span>
              <span className="px-1.5 text-white/35">|</span>
              {persianBrand}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن راهنمای برند"
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <ServiceGuideContent guide={guide} />
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold text-white">
            پلن‌های این سرویس ({new Intl.NumberFormat('fa-IR').format(plans.length)})
          </h3>
          <div className="space-y-2">
            {plans.map((product) => (
              <PlanRow
                key={product.id}
                product={product}
                onSelect={() => onSelectPlan(product)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function PurchaseModal({
  product,
  guide,
  onClose,
  onCopy,
  copyMessage,
}: {
  product: Product
  guide: ServiceGuide
  onClose: () => void
  onCopy: (value: string, successMessage?: string) => void
  copyMessage: string
}) {
  const tomanPrice = product.price_toman
  const botUrl = telegramUrl(product)
  const purchaseDetails = `NoBull order\nproduct_id: ${product.id}\nprice_toman: ${tomanPrice}`
  const persianTitle = translateProductText(product.name)
  const planBadges = getPersianProductBadges(product.name, product.description)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-primary/25 bg-[#080c0d] p-5 shadow-[0_20px_90px_rgba(0,242,255,0.1)] sm:p-7"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.18em] text-primary/70">
              NO BULL • ORDER
            </p>
            <h2 id="purchase-title" className="mt-2 text-lg font-bold">
              نهایی‌کردن سفارش
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="rounded-lg p-2 text-white/45 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{persianTitle}</span>
            <span className="rounded-full bg-primary/[0.08] px-2.5 py-1 text-[10px] text-primary">
              {stockLabel(product)}
            </span>
          </div>
          <p dir="auto" className="mt-2 text-[10px] text-white/40">
            {product.name}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-xs">
            <span className="text-white/45">شناسه محصول</span>
            <span dir="ltr" className="font-mono text-white/75">
              {product.id}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-white/45">مبلغ به تومان</span>
            <span className="font-bold text-primary">
              {formatToman(tomanPrice)}
            </span>
          </div>
          {planBadges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-3">
              {planBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[9px] text-white/55"
                >
                  {translateProductText(badge)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3">
          <p className="text-[11px] font-semibold text-emerald-100">
            روش تحویل این پلن
          </p>
          <p className="mt-1.5 text-[10px] leading-6 text-white/60">
            {getPersianDeliveryDescription(product.name, product.description)}
          </p>
          {product.description && (
            <p className="mt-2 border-t border-white/[0.07] pt-2 text-[10px] leading-6 text-white/50">
              {translateProductText(product.description)}
            </p>
          )}
        </div>
        <ServiceGuideContent guide={guide} />

        {botUrl && product.status !== 'unavailable' ? (
          <>
            <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
              <a
                href={botUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-black shadow-[0_0_22px_rgba(0,242,255,0.18)] transition hover:shadow-[0_0_32px_rgba(0,242,255,0.34)]"
              >
                <MessageCircle size={16} />
                خرید در تلگرام
                <ArrowLeft size={15} />
              </a>
              <button
                type="button"
                onClick={() =>
                  void onCopy(botUrl, 'لینک شروع خرید در تلگرام کپی شد.')
                }
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.08] px-4 text-xs font-semibold text-primary transition hover:bg-primary/[0.13]"
              >
                <Copy size={15} />
                کپی لینک
              </button>
            </div>
            {copyMessage && (
              <p role="status" className="mt-3 text-center text-[10px] text-primary/80">
                {copyMessage}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-[11px] leading-6 text-white/45">
              {product.status === 'unavailable'
                ? 'این پلن در حال حاضر ناموجود است و امکان شروع خرید ندارد.'
                : 'برای ادامه خرید، اطلاعات سفارش را برای ربات نوبول بفرستید.'}
            </p>
            {product.status !== 'unavailable' && (
              <button
                type="button"
                onClick={() => onCopy(purchaseDetails)}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.08] text-xs font-semibold text-primary transition hover:bg-primary/[0.13]"
              >
                <Copy size={15} />
                کپی شناسه و مبلغ سفارش
              </button>
            )}
            {copyMessage && (
              <p role="status" className="mt-3 text-center text-[10px] text-primary/80">
                {copyMessage}
              </p>
            )}
          </>
        )}
        {product.status === 'unknown' && (
          <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-amber-100/60">
            <CircleHelp className="mt-0.5 shrink-0" size={13} />
            موجودی لحظه‌ای تایید نشده؛ قبل از پرداخت آن را با پشتیبانی بررسی کنید.
          </p>
        )}
      </section>
    </div>
  )
}

export default App
