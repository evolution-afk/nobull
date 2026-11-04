# NoBull (نوبول) — homepage content inventory

Source of truth: `src/App.tsx`, `src/utils/brandAssets.ts`, `src/utils/persianTranslator.ts`, `tailwind.config.js`.
Persian, RTL, dark black ground, single cyan accent `#00F2FF`, font Vazirmatn.
Logo image: `/api/local/images/public/logo.jpg` (neon cyan bull head + NoBull wordmark, square).

Do not invent new Persian marketing copy. Use the strings below. Do not add eyebrows / kickers
("NO BULL • OUR PROMISE", "PLANS BY SERVICE", "SELECTED PLANS", "CURATED FOR YOU" are decoration — drop them).
Never use literal glyph icons: no `↗` `▼` `▶` `🔥` `·` `—` as iconography or separators. Use real icons.

## Icons
Lucide webfont: `https://cdn.jsdelivr.net/npm/lucide-static@1.48.0/font/lucide.css`, class form `<i class="icon-search"></i>`.
Needed: icon-search, icon-shopping-bag, icon-package-check, icon-key-round, icon-lock, icon-shield-check,
icon-tag, icon-circle-help, icon-chevron-down, icon-chevron-left, icon-chevron-right, icon-arrow-up-left,
icon-check, icon-zap, icon-clock, icon-copy, icon-message-circle, icon-circle-check, icon-filter.
Brand marks must be drawn as inline SVG `<symbol>`s in one hidden sprite per node and referenced with `<use>`
(monochrome, `currentColor`, inside a tinted rounded square like the real app's BrandLogo).
Brands needed: chatgpt/openai, claude, gemini, spotify, youtube, netflix, canva, cursor, midjourney, nordvpn, notion, capcut.

## Header
- Wordmark: `NoBull` + `| نوبول`
- Tagline: بی‌حاشیه و روراست؛ اشتراک‌های هوش مصنوعی و دیجیتال ویژه رفقا و خانواده
- Trust chip with shield icon: خرید امن و شفاف

## Nav tabs (catalog is the active tab)
1. کاتالوگ اشتراک‌ها — icon-shopping-bag
2. حساب کاربری و خریدهای من — icon-package-check
3. دریافت کد دو مرحله‌ای (2FA) — icon-key-round
4. پنل مدیریت — icon-lock

## Hero
- H1: اشتراک مناسب خودت را پیدا کن.
- Paragraph: قیمت شفاف، موجودی به‌روز و تحویل راحت برای رفقا و خانواده.
- Four facts (field values, never sentences): +۶۸ برند معتبر · آنی تحویل در تلگرام · تومانی قیمت رفاقتی · داخلی ابزار کد ۲ مرحله‌ای
  (icon hints: package-check, zap, tag/banknote, key-round. No "·" separator: use layout/spacing.)

## Featured offer (currently featured product record)
- Heading: پیشنهادی ویژه: فعال‌سازی روی اکانت شخصی شما (icon-tag, not a flame emoji)
- Explanatory copy (must stay visible): محصولات دارای کد، کلید فعال‌سازی، دعوت‌نامه یا تحویل شخصی؛ روش، مدت و ضمانت هر محصول را پیش از سفارش بررسی کنید.
- Record: mark=ChatGPT, brand=ChatGPT, title=ChatGPT Plus — ۱ ماهه، کد فعال‌سازی شخصی
  price=۴۸۰٬۰۰۰ تومان, availability=موجود, selected flag=پیشنهاد منتخب نوبول
- Primary action: جزئیات و خرید
- Carousel: icon-chevron-right / icon-chevron-left buttons, counter ۳ از ۲۴ پیشنهاد, text link مشاهده همه محصولات

## Honesty note (complete, verbatim, never truncated or collapsed)
Heading: صداقت بی‌رحمانه، قیمت واقعی، بدون حاشیه.  (icon-circle-help, NOT a shield)
Paragraph 1:
این اکانت‌ها همه از آفرهای کشورهای مختلف و ارزان تهیه می‌شوند. به دلیل محدودیت‌های جغرافیایی و رعایت نکردن مواردی مثل استفاده از آی‌پی کثیف یا تحریم‌های ریجنی، احتمال غیرفعال شدن برخی اکانت‌ها وجود دارد؛ اما در صورت رعایت نکات، اکثراً بدون مشکل و بدون ساسپند کار می‌کنند. در کل، خرید این اکانت‌ها در زمره خدمات بازار خاکستری قرار دارد و دارای ریسک مسدودی است. اگر امکان تهیه کارت بانکی بین‌المللی و خرید قانونی را دارید، حتماً از روش قانونی اقدام کنید؛ اما اگر مثل ما شرایط ارزی سختی دارید، حداقل با قیمت منطقی خرید کنید.
Paragraph 2:
هیچ‌گونه گارانتیِ دروغین و تضمین صددرصدی از سوی نوبول وجود ندارد؛ به همین دلیل است که قیمت‌ها بسیار پایین و اقتصادی تعیین شده‌اند تا برای شما دوستان عزیز ارزش خرید داشته باشد. توجه داشته باشید که این محصولات دقیقاً همان خدماتی است که خیلی‌ها با چند برابر قیمت، تحت عنوان «ساخت تیم خودمان» یا با گارانتی‌های ساختگی به شما می‌فروشند، در حالی که همه از همین سرچشمه تأمین می‌شوند. هدف ما این است که امکان تهیه این اکانت‌ها به صورت ریالی، با مناسب‌ترین قیمت و اخذ کمترین کارمزد و سود ممکن، برای شما رفقای عزیز فراهم شود.

## Discovery controls
- Brand shortcut chips (mark + latin name), selected state on ChatGPT:
  ChatGPT, Claude, Gemini, Spotify, YouTube, Netflix, Canva, Cursor, Midjourney, NordVPN
- Search field, placeholder: جست‌وجوی برند یا اشتراک...
- Category filters with counts (total ۳۱۲):
  همه دسته‌ها ۳۱۲ · هوش مصنوعی ۹۴ · برنامه‌نویسی ۴۱ · موسیقی و ویدیو ۳۷ · طراحی و گرافیک ۵۲ · امنیت و VPN ۲۸ · آموزش و ابزارها ۶۰

## Brand cards (two-column grid, one card expanded in the default state)
Each collapsed card: brand mark, latin + Persian name, plan count, lowest plan name, one-line summary,
«شروع قیمت از» + starting price, guide action (icon-arrow-up-left), footer expand control
«مشاهده همه پلن‌های {فارسی}» with icon-chevron-down.

| latin | Persian | plans | from | summary |
|---|---|---|---|---|
| ChatGPT | چت‌جی‌پی‌تی | ۶ پلن | ۲۴۰٬۰۰۰ تومان | دستیار هوش مصنوعی برای نوشتن، تحلیل، یادگیری و ایده‌پردازی. |
| Claude | کلود | ۴ پلن | ۲۹۰٬۰۰۰ تومان | دستیار هوش مصنوعی مناسب متن‌های طولانی و کدنویسی. |
| Gemini | جمینای | ۵ پلن | ۱۹۰٬۰۰۰ تومان | دستیار هوش مصنوعی گوگل برای تحقیق، نوشتن و کار با محتوا. |
| Cursor | کرسر | ۳ پلن | ۳۵۰٬۰۰۰ تومان | ویرایشگر کد با دستیار هوش مصنوعی برای توسعه نرم‌افزار. |
| Spotify | اسپاتیفای | ۳ پلن | ۹۵٬۰۰۰ تومان | پخش موسیقی و پادکست با امکانات پریمیوم. |
| Netflix | نتفلیکس | ۳ پلن | ۱۸۰٬۰۰۰ تومان | تماشای آنلاین فیلم و سریال؛ کتابخانه محتوا منطقه‌ای است. |
| Canva | کانوا | ۴ پلن | ۱۲۰٬۰۰۰ تومان | ساخت آسان طرح، ارائه، پوستر و محتوای شبکه‌های اجتماعی. |
| Midjourney | میدجرنی | ۲ پلن | ۵۹۰٬۰۰۰ تومان | تولید تصویر با هوش مصنوعی از روی توضیح متنی. |

Lowest plan names for the collapsed card line: ChatGPT Plus — ۱ ماهه · Claude Pro — ۱ ماهه ·
Google AI Pro — ۱ ماهه · Cursor Pro — ۱ ماهه · Spotify Premium — ۱ ماهه · Netflix — ۱ ماهه · Canva Pro — ۱ ساله · Midjourney Basic — ۱ ماهه.
(The current app joins name and summary with a dash-light separator; a thin rule or two lines is better than a "—" glyph.)

## Expanded plan rows (ChatGPT card, ۴ rows)
Fields: title, delivery/activation method, price, availability chip. Never a sentence.

1. ChatGPT Plus — ۱ ماهه | کد فعال‌سازی روی اکانت شخصی | ۴۸۰٬۰۰۰ تومان | موجود
2. ChatGPT Plus — ۱ ماهه | دعوت‌نامه ایمیل شخصی | ۳۹۰٬۰۰۰ تومان | موجود
3. ChatGPT Plus — ۱ ماهه | اشتراکی | ۲۴۰٬۰۰۰ تومان | ۲ عدد موجود
4. ChatGPT Pro — ۱ ماهه | کد فعال‌سازی روی اکانت شخصی | ۲٬۸۵۰٬۰۰۰ تومان | استعلام موجودی

## Service guide panel (shown when a brand or category is selected — ChatGPT state)
Heading: معرفی سرویس و نکات استفاده: ChatGPT و سرویس‌های OpenAI
- این سرویس چیست و چه کاری انجام می‌دهد؟ → ChatGPT یک دستیار گفت‌وگومحور هوش مصنوعی است. می‌توانید برای پیش‌نویس و ویرایش متن، ترجمه، توضیح مفاهیم، تحلیل فایل و داده، برنامه‌ریزی و کمک در کدنویسی از آن استفاده کنید.
- تفاوت پلن‌ها و اصطلاحات → پلن‌های پولی معمولاً به مدل‌ها و سقف استفاده بیشتری دسترسی می‌دهند. «کد فعال‌سازی» را روی حساب شخصی خودتان وارد می‌کنید؛ «دعوتی» با ایمیل شما به فضای یک پلن اضافه می‌شود؛ «اشتراکی» به معنی استفاده مشترک است.
- نکات استفاده (3 short items): ورود و دسترسی به قابلیت‌ها به نوع پلن و منطقه حساب بستگی دارد؛ قبل از خرید توضیحات همان محصول را بخوانید. / برای کاهش خطاهای ورود، از IP تمیز و ثابت استفاده کنید و مرتب کشور اتصال را عوض نکنید. / اشتراکی، دعوتی یا شخصی بودن را از عنوان و جزئیات همان پلن بررسی کنید.

## Footer
- نوبول؛ بی‌حاشیه و روراست برای رفقا و خانواده
- icon-lock + پرداخت و اطلاعات شفاف
