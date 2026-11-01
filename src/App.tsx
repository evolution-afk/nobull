import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import * as OTPAuth from 'otpauth'
import { getPersianProductBadges, translateProductText } from './utils/persianTranslator'
import { resolveBrandAsset, type BrandAsset } from './utils/brandAssets'
import {
  ArrowLeft,
  ArrowUpLeft,
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
  return `https://t.me/${username}?start=${encodeURIComponent(`buy_${product.providerId}__${product.providerProductId}`)}`
}

function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | '2fa'>('catalog')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_FILTER)
  const [selectedBrand, setSelectedBrand] = useState(ALL_FILTER)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
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

  const brandGroups = useMemo(
    () =>
      [...new Set(products.map((product) => product.brandKey))].map((brandKey) => {
        const plans = products.filter((product) => product.brandKey === brandKey)
        const availablePlans = plans.filter(
          (product) => product.status === 'available',
        ).length
        return {
          brand: plans[0].brand,
          brandKey,
          asset: plans[0].brandAsset,
          availablePlans,
          lowestPrice: Math.min(...plans.map((product) => product.price_toman)),
        }
      }),
    [products],
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
      setCopyMessage('کپی خودکار در دسترس نیست؛ متن را دستی کپی کنید.')
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
            onClick={() => setActiveTab('catalog')}
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
            onClick={() => setActiveTab('2fa')}
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

            {brandGroups.length > 0 && (
              <section className="mt-8">
                <SectionHeading
                  eyebrow="BROWSE BY BRAND"
                  title="دسته‌بندی بر اساس برند"
                  icon={<Beef size={17} />}
                  detail="برندهای محبوب"
                />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {brandGroups.map(({ brand, brandKey, asset, availablePlans, lowestPrice }) => (
                    <button
                      type="button"
                      key={brandKey}
                      onClick={() => {
                        setSelectedBrand(brandKey)
                        setSelectedCategory(ALL_FILTER)
                        scrollToProducts()
                      }}
                      className={`rounded-2xl border bg-zinc-950/75 p-4 text-right transition-all hover:border-primary/45 hover:shadow-[0_0_25px_rgba(0,242,255,0.08)] ${
                        selectedBrand === brandKey
                          ? 'border-primary/50'
                          : 'border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <BrandLogo
                          asset={asset}
                          className="h-11 w-11 rounded-xl"
                        />
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-bold text-white">
                            {brand}
                          </span>
                          <span className="mt-1 block text-[10px] text-white/40">
                            {asset.categoryLabel}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 text-[10px] text-white/45">
                        <span>
                          {new Intl.NumberFormat('fa-IR').format(availablePlans)} پلن موجود
                        </span>
                        <span className="text-primary/80">
                          از {formatToman(lowestPrice)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
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
                    حذف فیلترها (نمایش همه)
                  </button>
                </div>
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
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={() => setSelectedProduct(product)}
                    />
                  ))}
                </div>
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
        ) : (
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
          onClose={() => setSelectedProduct(null)}
          onCopy={(value) => void copyText(value, 'اطلاعات سفارش کپی شد.')}
          copyMessage={copyMessage}
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

function ProductCard({
  product,
  onSelect,
}: {
  product: Product
  onSelect: () => void
}) {
  const isAvailable = product.status === 'available'
  const isUnknown = product.status === 'unknown'
  const persianTitle = translateProductText(product.name)
  const persianDescription = translateProductText(product.description)
  const badges = getPersianProductBadges(product.name, product.description)
  const durationBadge =
    badges.find((badge) => /ماهه|روزه/.test(badge)) ?? 'مدت اشتراک متنوع'
  const warrantyBadge =
    badges.find((badge) => /گارانتی/.test(badge)) ?? 'شرایط ضمانت در توضیحات'
  const deliveryBadge = 'تحویل آنی تلگرام'

  return (
    <article className="group flex min-h-[320px] flex-col rounded-2xl border border-white/5 bg-zinc-950/80 p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#00F2FF]/40 hover:shadow-[0_0_30px_rgba(0,242,255,0.08)] sm:p-5">
      <div
        className="relative mb-4 flex min-h-[88px] items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/[0.08] px-3 py-3"
        style={{
          background:
            product.brandAsset.color === '000000'
              ? 'linear-gradient(115deg, rgba(255,255,255,0.12), rgba(255,255,255,0.025))'
              : `linear-gradient(115deg, #${product.brandAsset.color}20, rgba(255,255,255,0.015))`,
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full blur-3xl"
          style={{ backgroundColor: `#${product.brandAsset.color}30` }}
        />
        <div className="relative flex min-w-0 items-center gap-3">
          <BrandLogo
            asset={product.brandAsset}
            className="h-14 w-14 rounded-2xl"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">
              {product.brand}
            </p>
            <p className="mt-1 truncate text-[10px] text-white/45">
              {product.persianCategory}
            </p>
          </div>
        </div>
        <span
          className={`relative shrink-0 rounded-full border px-2 py-1 text-[9px] ${
            isAvailable
              ? 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200/80'
              : isUnknown
                ? 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100/70'
                : 'border-white/[0.1] bg-white/[0.035] text-white/40'
          }`}
        >
          {stockLabel(product)}
        </span>
      </div>

      <h3 className="line-clamp-2 text-sm font-bold leading-6 text-white sm:text-[15px]">
        {persianTitle}
      </h3>
      <p className="mt-1 line-clamp-1 text-[10px] text-white/35" dir="auto">
        {product.name}
      </p>

      {persianDescription && (
        <p className="mt-3 line-clamp-2 min-h-9 text-[11px] leading-5 text-white/50">
          {persianDescription}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[durationBadge, warrantyBadge, deliveryBadge, ...badges]
          .filter((badge, index, list) => list.indexOf(badge) === index)
          .slice(0, 5)
          .map((badge) => (
            <span
              key={badge}
              className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] leading-4 text-white/60"
            >
              {badge}
            </span>
          ))}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div className="min-w-0">
          <p className="text-[10px] text-white/40">قیمت نهایی</p>
          <p className="mt-1 whitespace-nowrap text-base font-extrabold text-primary sm:text-lg">
            {formatToman(product.price_toman)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSelect}
          disabled={product.status === 'unavailable'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#00F2FF] px-3.5 py-2.5 text-[10px] font-bold text-black transition-all hover:bg-[#00D4E0] hover:shadow-[0_0_20px_rgba(0,242,255,0.4)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
        >
          <span>خرید آنی</span>
          <ArrowUpLeft size={13} />
        </button>
      </div>
    </article>
  )
}

function PurchaseModal({
  product,
  onClose,
  onCopy,
  copyMessage,
}: {
  product: Product
  onClose: () => void
  onCopy: (value: string) => void
  copyMessage: string
}) {
  const tomanPrice = product.price_toman
  const botUrl = telegramUrl(product)
  const purchaseDetails = `NoBull order\nproduct_id: ${product.id}\nprice_toman: ${tomanPrice}`
  const persianTitle = translateProductText(product.name)

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
        className="w-full max-w-md rounded-[26px] border border-primary/25 bg-[#080c0d] p-5 shadow-[0_20px_90px_rgba(0,242,255,0.1)] sm:p-7"
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
        </div>

        {botUrl ? (
          <a
            href={botUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-black shadow-[0_0_22px_rgba(0,242,255,0.18)] transition hover:shadow-[0_0_32px_rgba(0,242,255,0.34)]"
          >
            <MessageCircle size={16} />
            خرید در تلگرام
            <ArrowLeft size={15} />
          </a>
        ) : (
          <>
            <p className="mt-4 text-[11px] leading-6 text-white/45">
              برای ادامه خرید، اطلاعات سفارش را برای ربات نوبول بفرستید.
            </p>
            <button
              type="button"
              onClick={() => onCopy(purchaseDetails)}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.08] text-xs font-semibold text-primary transition hover:bg-primary/[0.13]"
            >
              <Copy size={15} />
              کپی شناسه و مبلغ سفارش
            </button>
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
