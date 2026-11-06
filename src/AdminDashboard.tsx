import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  BarChart3,
  Check,
  Download,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  Megaphone,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Star,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { translateProductText } from './utils/persianTranslator'

interface AdminOrder {
  orderId: string
  createdAt: number
  updatedAt: number
  completedAt?: number
  status: string
  userId: string
  username: string
  firstName: string
  productId: string
  productTitle: string
  brand: string
  provider: string
  priceUsd: number
  usdtRate: number
  appliedMarginPercent: number
  priceToman: number
  estimatedProfitToman: number
  reference: string
}

interface AdminCustomer {
  chatId: string
  username: string
  firstName: string
  firstSeenAt: number
  lastActiveAt: number
  totalOrders: number
  completedOrders: number
  totalSpentToman: number
  wallet?: {
    balanceToman: number
    totalSpentToman: number
    ordersCount: number
  }
}

interface SalesSummary {
  revenueToman: number
  netProfitToman: number
  completedOrders: number
  pendingOrders: number
}

interface AdminCatalogProduct {
  id?: string
  provider_product_id?: string
  name?: string
  persian_name?: string
  brand?: string
  persian_brand?: string
  description?: string
  persian_description?: string
  price_usd?: number
  usdt_rate_used?: number
  price_toman?: number
  appliedMarginPercent?: number
  buyCostToman?: number
  featured?: boolean
  hidden?: boolean
  stock?: number | string | null
  in_stock?: boolean
  status?: string
}

interface ProviderWallet {
  provider: string
  configured: boolean
  balance: number | null
  currency: string | null
  testCredit: number | string | boolean | null
  testCreditActive: boolean | null
  checkedAt: number
  error: string | null
}

interface AdminData {
  orders: AdminOrder[]
  customers: AdminCustomer[]
  walletConfigured?: boolean
  analytics: {
    sales: Record<'today' | 'last7Days' | 'last30Days' | 'allTime', SalesSummary>
    topProducts: Array<{
      title: string
      brand: string
      count: number
      revenueToman: number
    }>
    topBrands: Array<{ brand: string; count: number; revenueToman: number }>
    totalBotSubscribers: number
  }
  pricing: {
    usdtMode: 'auto' | 'manual'
    manualRate: number
    fixedFeeToman: number
    cardNumber: string
    cardHolder: string
    profitMarginTiers: number[]
    productOverrides: Record<string, ProductOverride>
    discountCodes: PromoCode[]
  }
  catalog: {
    products: AdminCatalogProduct[]
    rate: number | null
    error: string | null
  }
  providerWallet: ProviderWallet
}

interface ProductOverride {
  customMarginPercent?: number
  customPriceToman?: number
  featured?: boolean
  hidden?: boolean
  description?: string
}

interface PromoCode {
  code: string
  type: 'percent' | 'fixed_toman'
  value: number
  maxUses: number
  usedCount: number
  active: boolean
  expiresAt?: string
  description?: string
}

type AdminTab =
  | 'sales'
  | 'customers'
  | 'pricing'
  | 'catalog'
  | 'discounts'
  | 'broadcast'

const tierLabels = [
  'کمتر از ۱ دلار',
  '۱ تا کمتر از ۲ دلار',
  '۲ تا کمتر از ۳ دلار',
  '۳ تا کمتر از ۵ دلار',
  '۵ تا کمتر از ۸ دلار',
  '۸ تا کمتر از ۱۲ دلار',
  '۱۲ دلار و بیشتر',
]
const EMPTY_ORDERS: AdminOrder[] = []
const EMPTY_CUSTOMERS: AdminCustomer[] = []
const EMPTY_PRODUCTS: AdminCatalogProduct[] = []

const tabLabels: Array<{ key: AdminTab; title: string }> = [
  { key: 'sales', title: 'داشبورد و گزارش فروش' },
  { key: 'customers', title: 'مشتریان و کاربران' },
  { key: 'pricing', title: 'قیمت‌گذاری و سود پلکانی' },
  { key: 'catalog', title: 'پیش‌نمایش زنده محصولات' },
  { key: 'discounts', title: 'کدهای تخفیف (Promo Codes)' },
  { key: 'broadcast', title: 'ارسال پیام همگانی (Broadcast)' },
]

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(Number.isFinite(value) ? value : 0)
}

function formatToman(value: number): string {
  return `${formatNumber(value)} تومان`
}

function formatDate(value: number): string {
  return value
    ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
    : '—'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_receipt':
      return 'در انتظار رسید'
    case 'waiting_review':
      return 'در انتظار بررسی رسید'
    case 'processing':
      return 'در حال پردازش'
    case 'completed':
      return 'تکمیل شده'
    case 'rejected':
      return 'لغو شده'
    default:
      return status
  }
}

function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: unknown[][]): void {
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fieldClass(): string {
  return 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-300/40'
}

function AdminDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem('nobull-admin-session') ?? '')
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(() =>
    Boolean(sessionStorage.getItem('nobull-admin-session')),
  )
  const [data, setData] = useState<AdminData | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>('sales')
  const [query, setQuery] = useState('')
  const [orderStatus, setOrderStatus] = useState('all')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pricing, setPricing] = useState<AdminData['pricing'] | null>(null)
  const [refreshingBalance, setRefreshingBalance] = useState(false)
  const [walletDrafts, setWalletDrafts] = useState<Record<string, string>>({})
  const [productDrafts, setProductDrafts] = useState<
    Record<string, { margin: string; price: string; description: string }>
  >({})
  const [promoDraft, setPromoDraft] = useState({
    code: '',
    type: 'percent' as PromoCode['type'],
    value: '10',
    maxUses: '100',
    active: true,
    expiresAt: '',
    description: '',
  })
  const [editingPromoCode, setEditingPromoCode] = useState('')
  const [broadcastDraft, setBroadcastDraft] = useState({
    message: '',
    audience: 'all' as 'all' | 'buyers',
    buttonText: '',
    buttonUrl: '',
  })
  const [broadcastResult, setBroadcastResult] = useState<{
    sentCount: number
    failedCount: number
    totalTargeted: number
  } | null>(null)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    fetch('/api/admin', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = (await response.json()) as AdminData & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'دریافت اطلاعات پنل ناموفق بود.')
        return payload
      })
      .then((payload) => {
        setData(payload)
        setPricing(payload.pricing)
        setError('')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        const message = cause instanceof Error ? cause.message : 'ارتباط با پنل ناموفق بود.'
        setError(message)
        if (/نشست|session|unauthorized/i.test(message)) {
          sessionStorage.removeItem('nobull-admin-session')
          setToken('')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [token, refreshKey])

  const orders = data?.orders ?? EMPTY_ORDERS
  const customers = data?.customers ?? EMPTY_CUSTOMERS
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return orders.filter((order) => {
      const matchesStatus = orderStatus === 'all' || order.status === orderStatus
      const text = `${order.productTitle} ${order.brand} ${order.username} ${order.firstName} ${order.userId} ${order.reference}`
        .toLocaleLowerCase()
      return matchesStatus && (!normalized || text.includes(normalized))
    })
  }, [orders, orderStatus, query])
  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return customers.filter((customer) =>
      `${customer.firstName} ${customer.username} ${customer.chatId}`
        .toLocaleLowerCase()
        .includes(normalized),
    )
  }, [customers, query])
  const filteredCatalog = useMemo(() => {
    const normalized = catalogQuery.trim().toLocaleLowerCase()
    return (data?.catalog.products ?? EMPTY_PRODUCTS).filter((product) =>
      `${product.persian_name ?? ''} ${product.persian_brand ?? ''} ${product.name ?? ''} ${product.brand ?? ''} ${product.id ?? ''}`
        .toLocaleLowerCase()
        .includes(normalized),
    )
  }, [catalogQuery, data?.catalog.products])

  const post = async (body: Record<string, unknown>, authenticated = true) => {
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payload = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'عملیات ناموفق بود.')
    }
    return payload
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = await post(
        loginMethod === 'password'
          ? { action: 'login', method: 'password', password }
          : { action: 'login', method: 'otp', code: otp },
        false,
      )
      if (typeof payload.token !== 'string') throw new Error('پاسخ ورود معتبر نیست.')
      sessionStorage.setItem('nobull-admin-session', payload.token)
      setToken(payload.token)
      setPassword('')
      setOtp('')
      setNotice('ورود موفق بود.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ورود ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const requestOtp = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = await post({ action: 'request-otp' }, false)
      setNotice(typeof payload.message === 'string' ? payload.message : 'کد ارسال شد.')
      setLoginMethod('otp')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارسال کد ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const refreshProviderBalance = async () => {
    setRefreshingBalance(true)
    try {
      const response = await fetch('/api/admin?resource=balance', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = (await response.json()) as { providerWallet?: ProviderWallet; error?: string }
      if (!response.ok || !payload.providerWallet) {
        throw new Error(payload.error || 'به‌روزرسانی موجودی ناموفق بود.')
      }
      setData((current) =>
        current ? { ...current, providerWallet: payload.providerWallet! } : current,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'به‌روزرسانی موجودی ناموفق بود.')
    } finally {
      setRefreshingBalance(false)
    }
  }

  const logout = () => {
    sessionStorage.removeItem('nobull-admin-session')
    setToken('')
    setData(null)
    setNotice('')
  }

  const decideOrder = async (order: AdminOrder, decision: 'approve' | 'reject') => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({ action: 'decide-order', orderId: order.orderId, decision })
      setNotice(decision === 'approve' ? 'سفارش برای تأمین‌کننده ثبت شد.' : 'سفارش رد شد.')
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'به‌روزرسانی سفارش ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const adjustWallet = async (customer: AdminCustomer, direction: 1 | -1) => {
    const amount = Number(walletDrafts[customer.chatId] ?? '')
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) {
      setError('مبلغ شارژ یا برداشت باید عدد صحیحی بین ۱ تا ۱٬۰۰۰٬۰۰۰٬۰۰۰ تومان باشد.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({
        action: 'adjust-wallet',
        chatId: customer.chatId,
        amountToman: amount * direction,
        reason: direction > 0 ? 'شارژ کیف پول توسط مدیر' : 'کاهش موجودی توسط مدیر',
      })
      setWalletDrafts((current) => ({ ...current, [customer.chatId]: '' }))
      setNotice('موجودی کیف پول با موفقیت به‌روزرسانی شد.')
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعدیل کیف پول انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  const savePricing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pricing) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({ action: 'save-pricing', ...pricing })
      setNotice('تنظیمات ذخیره شد؛ قیمت کاتالوگ با نرخ و سود جدید به‌روزرسانی می‌شود.')
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره تنظیمات ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const saveProductOverride = async (
    product: AdminCatalogProduct,
    field: 'margin' | 'price',
  ) => {
    const productId = product.id
    if (!productId) return
    const draft = productDrafts[productId] ?? {
      margin: String(product.appliedMarginPercent ?? 0),
      price: String(product.price_toman ?? 0),
      description: '',
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({
        action: 'save-product-override',
        productId,
        ...(field === 'margin'
          ? { customMarginPercent: Number(draft.margin) }
          : { customPriceToman: Number(draft.price) }),
      })
      setNotice('قیمت و حاشیه سود اختصاصی محصول ذخیره شد.')
      setProductDrafts((current) => {
        const next = { ...current }
        delete next[productId]
        return next
      })
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره قیمت محصول ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const saveProductDescription = async (
    product: AdminCatalogProduct,
    description: string,
  ) => {
    const productId = product.id
    if (!productId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({
        action: 'save-product-override',
        productId,
        description: description.trim(),
      })
      setNotice('توضیحات اختصاصی محصول ذخیره شد.')
      setProductDrafts((current) => {
        const next = { ...current }
        delete next[productId]
        return next
      })
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره توضیحات محصول ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const resetProductPricing = async (product: AdminCatalogProduct) => {
    if (!product.id) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({ action: 'reset-product-pricing', productId: product.id })
      setNotice('قیمت محصول به سود پلکانی پیش‌فرض برگشت.')
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بازنشانی قیمت ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const setProductFlag = async (
    product: AdminCatalogProduct,
    flag: 'featured' | 'hidden',
    value: boolean,
  ) => {
    if (!product.id) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({
        action: 'set-product-flag',
        productId: product.id,
        flag,
        value,
      })
      setNotice(flag === 'featured'
        ? value ? 'محصول به پیشنهادهای ویژه اسلایدر اضافه شد.' : 'پیشنهاد ویژه برداشته شد.'
        : value ? 'محصول از فروشگاه پنهان شد.' : 'محصول دوباره در فروشگاه نمایش داده می‌شود.')
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره وضعیت محصول ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const savePromoCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({
        action: 'save-discount',
        code: promoDraft.code,
        type: promoDraft.type,
        value: Number(promoDraft.value),
        maxUses: Number(promoDraft.maxUses),
        active: promoDraft.active,
        expiresAt: promoDraft.expiresAt
          ? new Date(promoDraft.expiresAt).toISOString()
          : '',
        description: promoDraft.description,
      })
      setNotice('کد تخفیف ذخیره شد.')
      setPromoDraft({
        code: '',
        type: 'percent',
        value: '10',
        maxUses: '100',
        active: true,
        expiresAt: '',
        description: '',
      })
      setEditingPromoCode('')
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره کد تخفیف ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const editPromoCode = (code: PromoCode) => {
    setEditingPromoCode(code.code)
    setPromoDraft({
      code: code.code,
      type: code.type,
      value: String(code.value),
      maxUses: String(code.maxUses),
      active: code.active,
      expiresAt: code.expiresAt
        ? new Date(code.expiresAt).toISOString().slice(0, 16)
        : '',
      description: code.description ?? '',
    })
  }

  const deletePromoCode = async (code: string) => {
    if (!window.confirm(`کد تخفیف ${code} حذف شود؟`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await post({ action: 'delete-discount', code })
      setNotice(`کد ${code} حذف شد.`)
      setRefreshKey((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حذف کد تخفیف ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const sendBroadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    setBroadcastResult(null)
    try {
      const result = await post({
        action: 'send_broadcast',
        ...broadcastDraft,
      })
      if (
        typeof result.sentCount !== 'number' ||
        typeof result.failedCount !== 'number' ||
        typeof result.totalTargeted !== 'number'
      ) {
        throw new Error('پاسخ ارسال پیام همگانی معتبر نیست.')
      }
      setBroadcastResult({
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        totalTargeted: result.totalTargeted,
      })
      setNotice('ارسال پیام همگانی پایان یافت.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارسال پیام همگانی ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <section dir="rtl" className="mx-auto mt-10 max-w-lg rounded-3xl border border-white/10 bg-[#0b1114] p-6 shadow-2xl sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200">
          <LockKeyhole size={25} />
        </div>
        <h1 className="mt-4 text-center text-2xl font-extrabold">ورود امن مدیر</h1>
        <p className="mt-2 text-center text-sm leading-7 text-white/45">
          نشست مدیریت پس از ۱۲ ساعت منقضی می‌شود. هیچ رمز یا کلید محرمانه‌ای در مرورگر ذخیره نمی‌شود.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1">
          <button type="button" onClick={() => setLoginMethod('password')} className={`rounded-lg px-3 py-2 text-xs ${loginMethod === 'password' ? 'bg-emerald-300/10 text-emerald-100' : 'text-white/45'}`}>
            رمز مدیر
          </button>
          <button type="button" onClick={() => setLoginMethod('otp')} className={`rounded-lg px-3 py-2 text-xs ${loginMethod === 'otp' ? 'bg-emerald-300/10 text-emerald-100' : 'text-white/45'}`}>
            کد تلگرام
          </button>
        </div>
        <form onSubmit={(event) => void handleLogin(event)} className="mt-4 space-y-3">
          {loginMethod === 'password' ? (
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass()}
              placeholder="رمز عبور پنل"
              required
            />
          ) : (
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className={fieldClass()}
              placeholder="کد شش‌رقمی تلگرام"
              maxLength={6}
              required
            />
          )}
          {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
          {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-200 disabled:opacity-50">
            {busy ? 'در حال بررسی…' : 'ورود به پنل'}
          </button>
        </form>
        <button type="button" onClick={() => void requestOtp()} disabled={busy} className="mt-3 w-full rounded-xl border border-white/10 px-4 py-3 text-xs text-white/65 transition hover:border-emerald-300/25 hover:text-white disabled:opacity-50">
          دریافت کد ورود در تلگرام
        </button>
      </section>
    )
  }

  return (
    <section dir="rtl" className="mt-8 rounded-3xl border border-white/[0.08] bg-[#080d0f]/95 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-emerald-200/65">NOBULL • ADMIN</p>
          <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">مدیریت فروشگاه</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => {
            setBusy(true)
            setRefreshKey((current) => current + 1)
          }} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 hover:text-white disabled:opacity-50">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> تازه‌سازی
          </button>
          <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 hover:border-red-300/20 hover:text-red-100">
            <LogOut size={14} /> خروج
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/15 bg-red-300/[0.05] p-3 text-sm text-red-100">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] p-3 text-sm text-emerald-100">{notice}</p>}
      <nav className="mt-5 flex gap-2 overflow-x-auto pb-2">
        {tabLabels.map(({ key, title }) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)} className={`shrink-0 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${activeTab === key ? 'border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-100' : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white'}`}>
            {title}
          </button>
        ))}
      </nav>
      {!data ? (
        <div className="mt-10 py-12 text-center text-sm text-white/45">در حال بارگذاری داده‌های مدیریت…</div>
      ) : activeTab === 'sales' ? (
        <div className="mt-5 space-y-5">
          <ProviderWalletCard
            wallet={data.providerWallet}
            refreshing={refreshingBalance}
            onRefresh={() => void refreshProviderBalance()}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ['today', 'امروز'],
              ['last7Days', '۷ روز اخیر'],
              ['last30Days', '۳۰ روز اخیر'],
              ['allTime', 'همه زمان‌ها'],
            ] as const).map(([key, title]) => {
              const summary = data.analytics.sales[key]
              return (
                <article key={key} className="rounded-2xl border border-white/[0.08] bg-[#0c1316] p-4">
                  <h2 className="text-sm font-bold text-emerald-100">{title}</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                    <div><dt className="text-white/40">فروش کل</dt><dd className="mt-1 font-bold">{formatToman(summary.revenueToman)}</dd></div>
                    <div><dt className="text-white/40">سود خالص</dt><dd className="mt-1 font-bold text-emerald-200">{formatToman(summary.netProfitToman)}</dd></div>
                    <div><dt className="text-white/40">سفارش تکمیل</dt><dd className="mt-1">{formatNumber(summary.completedOrders)}</dd></div>
                    <div><dt className="text-white/40">در انتظار</dt><dd className="mt-1">{formatNumber(summary.pendingOrders)}</dd></div>
                  </dl>
                </article>
              )
            })}
          </div>
          <p className="text-xs text-white/50">کل اعضای ثبت‌شده ربات: <strong className="text-white">{formatNumber(data.analytics.totalBotSubscribers)}</strong></p>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b1114] p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold"><BarChart3 size={16} className="text-emerald-200" /> پرفروش‌ترین محصولات</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.analytics.topProducts.map((item) => (
                <span key={`${item.brand}-${item.title}`} className="rounded-xl border border-white/[0.07] px-3 py-2 text-xs text-white/65">
                  {translateProductText(item.brand)} · {translateProductText(item.title)} · {formatNumber(item.count)} سفارش
                </span>
              ))}
              {!data.analytics.topProducts.length && <span className="text-xs text-white/35">هنوز سفارش تکمیل‌شده‌ای ثبت نشده است.</span>}
            </div>
            <h3 className="mt-4 text-xs font-semibold text-white/65">برندهای پرفروش</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.analytics.topBrands.map((item) => (
                <span key={item.brand} className="rounded-xl border border-emerald-300/10 px-3 py-2 text-[11px] text-emerald-100/80">
                  {translateProductText(item.brand)} · {formatNumber(item.count)} سفارش · {formatToman(item.revenueToman)}
                </span>
              ))}
              {!data.analytics.topBrands.length && <span className="text-xs text-white/35">داده‌ای برای برندها وجود ندارد.</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">سفارش‌ها</h2>
            <button type="button" onClick={() => downloadCsv('nobull-orders.csv', [
              ['شناسه', 'تاریخ', 'وضعیت', 'نام خریدار', 'نام کاربری', 'Chat ID', 'محصول', 'برند', 'هزینه دلار', 'قیمت تومان', 'سود تومان'],
              ...filteredOrders.map((order) => [order.orderId, formatDate(order.createdAt), statusLabel(order.status), order.firstName, order.username, order.userId, translateProductText(order.productTitle), translateProductText(order.brand), order.priceUsd, order.priceToman, order.estimatedProfitToman]),
            ])} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 hover:text-white"><Download size={14} /> خروجی اکسل (CSV) سفارش‌ها</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <label className="relative"><Search className="absolute right-3 top-3 text-white/35" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldClass()} pr-9`} placeholder="جست‌وجو در سفارش‌ها…" /></label>
            <select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)} className={fieldClass()}>
              <option value="all">همه وضعیت‌ها</option>
              <option value="pending_receipt">در انتظار رسید</option>
              <option value="waiting_review">در انتظار بررسی رسید</option>
              <option value="completed">تکمیل شده</option>
              <option value="rejected">لغو شده</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[1050px] text-right text-xs">
              <thead className="bg-white/[0.035] text-white/45"><tr>{['تاریخ / خریدار', 'محصول', 'هزینه USD', 'قیمت نهایی', 'سود تخمینی', 'وضعیت / اقدام'].map((title) => <th key={title} className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="align-top text-white/75">
                    <td className="p-3"><div>{formatDate(order.createdAt)}</div><div className="mt-1">{order.firstName || 'کاربر'} {order.username && `@${order.username}`}</div><div className="mt-1 font-mono text-[10px] text-white/35">{order.userId}</div></td>
                    <td className="p-3">{translateProductText(order.productTitle)}<div className="mt-1 text-[10px] text-white/40">{translateProductText(order.brand)} · {order.reference}</div></td>
                    <td className="p-3">${order.priceUsd.toFixed(2)}<div className="mt-1 text-[10px] text-white/40">نرخ {formatNumber(order.usdtRate)}</div></td>
                    <td className="p-3">{formatToman(order.priceToman)}<div className="mt-1 text-[10px] text-white/40">سود {formatNumber(order.appliedMarginPercent)}٪</div></td>
                    <td className="p-3 text-emerald-200">{formatToman(order.estimatedProfitToman)}</td>
                    <td className="p-3"><span className="rounded-full border border-white/10 px-2 py-1 text-[10px]">{statusLabel(order.status)}</span>{(order.status === 'waiting_review' || order.status === 'pending_receipt') && <div className="mt-2 flex gap-2"><button type="button" onClick={() => void decideOrder(order, 'approve')} disabled={busy || order.status !== 'waiting_review'} className="inline-flex items-center gap-1 rounded-lg bg-emerald-300/10 px-2 py-1.5 text-[10px] text-emerald-100 disabled:opacity-40"><Check size={12} /> تأیید</button><button type="button" onClick={() => void decideOrder(order, 'reject')} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-red-300/[0.07] px-2 py-1.5 text-[10px] text-red-100 disabled:opacity-40"><X size={12} /> رد</button></div>}</td>
                  </tr>
                ))}
                {!filteredOrders.length && <tr><td colSpan={6} className="p-8 text-center text-white/35">سفارشی مطابق فیلترها نیست.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'customers' ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold"><Users size={17} className="text-emerald-200" /> CRM مشتریان ({formatNumber(customers.length)})</h2>
            <button type="button" onClick={() => downloadCsv('nobull-customers.csv', [
              ['نام', 'نام کاربری', 'Chat ID', 'تاریخ عضویت', 'کل سفارش‌ها', 'سفارش تکمیل', 'مجموع خرید تومان', 'موجودی کیف پول', 'نشان مشتری'],
              ...filteredCustomers.map((customer) => [customer.firstName, customer.username ? `@${customer.username}` : '', customer.chatId, formatDate(customer.firstSeenAt), customer.totalOrders, customer.completedOrders, customer.totalSpentToman, customer.wallet?.balanceToman ?? 0, customer.completedOrders > 0 && customer.totalSpentToman >= 10_000_000 ? 'VIP' : customer.completedOrders > 0 ? 'خریدار' : 'عضو ربات']),
            ])} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 hover:text-white"><Download size={14} /> خروجی اکسل (CSV) مشتریان</button>
          </div>
          <label className="relative block"><Search className="absolute right-3 top-3 text-white/35" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldClass()} pr-9`} placeholder="جست‌وجو نام، نام کاربری یا شناسه…" /></label>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            {!data?.walletConfigured && <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-xs leading-6 text-amber-100/70">کیف پول غیرفعال است؛ ابتدا binding پایگاه داده D1 با نام NOBULL_WALLET_DB را تنظیم و migration را اجرا کنید.</p>}
            <table className="w-full min-w-[1100px] text-right text-xs">
              <thead className="bg-white/[0.035] text-white/45"><tr>{['مشتری', 'Chat ID', 'عضویت', 'سفارش‌ها', 'مجموع خرید', 'موجودی کیف پول', 'تعدیل کیف پول (تومان)', 'نشان'].map((title) => <th key={title} className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredCustomers.map((customer) => {
                  const badge = customer.completedOrders > 0 && customer.totalSpentToman >= 10_000_000 ? 'VIP' : customer.completedOrders > 0 ? 'خریدار' : 'عضو ربات'
                  return <tr key={customer.chatId} className="text-white/70"><td className="p-3">{customer.firstName || '—'}<div className="mt-1 text-white/40">{customer.username ? `@${customer.username}` : 'بدون نام کاربری'}</div></td><td dir="ltr" className="p-3 text-right font-mono">{customer.chatId}</td><td className="p-3">{formatDate(customer.firstSeenAt)}</td><td className="p-3">{formatNumber(customer.totalOrders)} کل · {formatNumber(customer.completedOrders)} تکمیل</td><td className="p-3">{formatToman(customer.totalSpentToman)}</td><td className="p-3">{formatToman(customer.wallet?.balanceToman ?? 0)}</td><td className="p-3"><div className="flex items-center gap-1"><input aria-label={`مبلغ تعدیل کیف پول ${customer.firstName}`} type="number" min="1" max="1000000000" step="1" disabled={busy || !data?.walletConfigured} value={walletDrafts[customer.chatId] ?? ''} onChange={(event) => setWalletDrafts((current) => ({ ...current, [customer.chatId]: event.target.value }))} className="w-28 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-300/40" placeholder="مبلغ" /><button type="button" disabled={busy || !data?.walletConfigured} onClick={() => void adjustWallet(customer, 1)} className="rounded-lg bg-emerald-300/10 px-2 py-1.5 text-[10px] text-emerald-100 disabled:opacity-40">شارژ</button><button type="button" disabled={busy || !data?.walletConfigured} onClick={() => void adjustWallet(customer, -1)} className="rounded-lg bg-red-300/[0.07] px-2 py-1.5 text-[10px] text-red-100 disabled:opacity-40">کاهش</button></div></td><td className="p-3"><span className="rounded-full border border-emerald-300/15 px-2 py-1 text-emerald-100">{badge}</span></td></tr>
                })}
                {!filteredCustomers.length && <tr><td colSpan={8} className="p-8 text-center text-white/35">مشتری‌ای پیدا نشد.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'pricing' ? (
        <form onSubmit={(event) => void savePricing(event)} className="mt-5 space-y-5">
          {pricing && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/55">حالت نرخ تتر<select className={`${fieldClass()} mt-2`} value={pricing.usdtMode} onChange={(event) => setPricing({ ...pricing, usdtMode: event.target.value as 'auto' | 'manual' })}><option value="auto">خودکار از بازار</option><option value="manual">دستی</option></select></label>
              <label className="text-xs text-white/55">نرخ دستی (تومان)<input type="number" min="1000" max="100000000" className={`${fieldClass()} mt-2`} value={pricing.manualRate} onChange={(event) => setPricing({ ...pricing, manualRate: Number(event.target.value) })} /></label>
              <label className="text-xs text-white/55">کارمزد ثابت (تومان)<input type="number" min="0" className={`${fieldClass()} mt-2`} value={pricing.fixedFeeToman} onChange={(event) => setPricing({ ...pricing, fixedFeeToman: Number(event.target.value) })} /></label>
              <label className="text-xs text-white/55">شماره کارت<input dir="ltr" inputMode="numeric" className={`${fieldClass()} mt-2 text-left`} value={pricing.cardNumber} onChange={(event) => setPricing({ ...pricing, cardNumber: event.target.value })} /></label>
              <label className="text-xs text-white/55 sm:col-span-2">نام صاحب کارت<input className={`${fieldClass()} mt-2`} value={pricing.cardHolder} onChange={(event) => setPricing({ ...pricing, cardHolder: event.target.value })} /></label>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0b1114] p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Settings2 size={16} className="text-emerald-200" /> حاشیه سود هفت‌گانه بر اساس قیمت پایه دلاری</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {tierLabels.map((label, index) => <label key={label} className="text-xs text-white/55">{label}<div className="mt-2 flex items-center gap-2"><input type="number" min="0" max="1000" step="0.1" required className={fieldClass()} value={pricing.profitMarginTiers[index] ?? 0} onChange={(event) => setPricing({ ...pricing, profitMarginTiers: pricing.profitMarginTiers.map((value, tier) => tier === index ? Number(event.target.value) : value) })} /><span>%</span></div></label>)}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-white/35">بازه مجاز هر پله: ۰ تا ۱۰۰۰٪. پس از ذخیره، قیمت‌های کاتالوگ با تنظیم جدید محاسبه می‌شوند.</p>
            </div>
            <button disabled={busy} className="rounded-xl bg-emerald-300 px-5 py-3 text-sm font-bold text-black disabled:opacity-50">ذخیره تنظیمات و تازه‌سازی قیمت کاتالوگ</button>
          </>}
        </form>
      ) : activeTab === 'catalog' ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-bold">ممیزی زنده قیمت محصولات</h2><p className="mt-1 text-xs text-white/40">نرخ فعلی: {data.catalog.rate ? `${formatNumber(data.catalog.rate)} تومان` : 'نامشخص'} · {formatNumber(filteredCatalog.length)} محصول</p></div>
            <label className="relative w-full sm:max-w-sm"><Search className="absolute right-3 top-3 text-white/35" size={15} /><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} className={`${fieldClass()} pr-9`} placeholder="جست‌وجوی محصول یا برند…" /></label>
          </div>
          {data.catalog.error && <p className="text-xs text-amber-100">{data.catalog.error}</p>}
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[1750px] text-right text-xs">
              <thead className="bg-white/[0.035] text-white/45"><tr>{['نام محصول و برند', 'توضیحات اختصاصی (Local Description)', 'قیمت خرید دلاری', 'قیمت خرید به تومان و ریال', 'درصد سود', 'قیمت فروش نهایی', 'سود خالص هر فروش', 'پیشنهاد ویژه / نمایش', 'موجودی'].map((title) => <th key={title} className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredCatalog.map((product) => {
                  const stock = Number(product.stock)
                  const inStock = typeof product.in_stock === 'boolean' ? product.in_stock : Number.isFinite(stock) ? stock > 0 : null
                  const productId = product.id ?? ''
                  const draft = productDrafts[productId] ?? {
                    margin: String(product.appliedMarginPercent ?? 0),
                    price: String(product.price_toman ?? 0),
                    description: data.pricing.productOverrides[productId]?.description ?? '',
                  }
                  const buyCostToman = Number(product.buyCostToman ?? 0)
                  const salePrice = Number(product.price_toman ?? 0)
                  return <tr key={productId || product.provider_product_id} className={`align-top text-white/70 ${product.hidden ? 'opacity-55' : ''}`}>
                    <td className="p-3"><div className="max-w-52 font-semibold">{product.persian_name || translateProductText(product.name || 'محصول')}</div><div className="mt-1 text-[10px] text-white/40">{product.persian_brand || translateProductText(product.brand || '—')} · {product.provider_product_id ?? product.id}</div></td>
                    <td className="w-72 p-3"><label className="sr-only" htmlFor={`description-${productId}`}>توضیحات اختصاصی {product.persian_name || translateProductText(product.name || '')}</label><textarea id={`description-${productId}`} rows={3} maxLength={4000} value={draft.description} onChange={(event) => setProductDrafts((current) => ({ ...current, [productId]: { ...draft, description: event.target.value } }))} placeholder={product.persian_description || translateProductText(product.description || '') || 'توضیحات اختصاصی این محصول…'} className="w-full resize-y rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40" /><button type="button" onClick={() => void saveProductDescription(product, draft.description)} disabled={busy || !productId} className="mt-2 block rounded-lg bg-emerald-300/10 px-2.5 py-1.5 text-[10px] text-emerald-100 disabled:opacity-40">ذخیره توضیحات</button></td>
                    <td dir="ltr" className="p-3 text-right">${Number(product.price_usd ?? 0).toFixed(2)}</td>
                    <td className="p-3"><div>{formatToman(buyCostToman)}</div><div className="mt-1 text-[10px] text-white/40">{formatNumber(Math.round(buyCostToman * 10))} ریال</div><div className="mt-1 text-[9px] text-white/30">نرخ تتر: {formatNumber(Number(product.usdt_rate_used ?? 0))} تومان</div></td>
                    <td className="w-32 p-3"><label className="sr-only" htmlFor={`margin-${productId}`}>درصد سود {product.persian_name || translateProductText(product.name || '')}</label><div className="flex items-center gap-1"><input id={`margin-${productId}`} type="number" min="0" max="1000" step="0.1" value={draft.margin} onChange={(event) => setProductDrafts((current) => ({ ...current, [productId]: { ...draft, margin: event.target.value } }))} className="w-24 rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-white" /><span>%</span></div><button type="button" onClick={() => void saveProductOverride(product, 'margin')} disabled={busy || !productId} className="mt-2 block rounded-lg bg-emerald-300/10 px-2.5 py-1.5 text-[10px] text-emerald-100 disabled:opacity-40">ذخیره سود</button></td>
                    <td className="w-40 p-3"><label className="sr-only" htmlFor={`price-${productId}`}>قیمت فروش نهایی {product.persian_name || translateProductText(product.name || '')}</label><input id={`price-${productId}`} type="number" min="1000" max="1000000000" step="1000" value={draft.price} onChange={(event) => setProductDrafts((current) => ({ ...current, [productId]: { ...draft, price: event.target.value } }))} className="w-36 rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm font-bold text-white" /><button type="button" onClick={() => void saveProductOverride(product, 'price')} disabled={busy || !productId} className="mt-2 block rounded-lg bg-emerald-300/10 px-2.5 py-1.5 text-[10px] text-emerald-100 disabled:opacity-40">ذخیره فوری</button></td>
                    <td className={`p-3 font-semibold ${salePrice >= buyCostToman + data.pricing.fixedFeeToman ? 'text-emerald-200' : 'text-red-200'}`}>{formatToman(salePrice - Math.round(buyCostToman) - data.pricing.fixedFeeToman)}</td>
                    <td className="p-3"><div className="flex flex-col items-start gap-2"><button type="button" onClick={() => void setProductFlag(product, 'featured', !product.featured)} disabled={busy || !productId} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] ${product.featured ? 'border-amber-300/25 bg-amber-300/10 text-amber-100' : 'border-white/10 text-white/50'}`}><Star size={12} />{product.featured ? 'پیشنهاد ویژه: روشن' : 'پیشنهاد ویژه (اسلایدر)'}</button><button type="button" onClick={() => void setProductFlag(product, 'hidden', !product.hidden)} disabled={busy || !productId} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-white/55">{product.hidden ? <Eye size={12} /> : <EyeOff size={12} />}{product.hidden ? 'نمایش محصول' : 'پنهان‌کردن'}</button><button type="button" onClick={() => void resetProductPricing(product)} disabled={busy || !productId} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-white/45 disabled:opacity-40">بازگشت به سود پلکانی</button></div></td>
                    <td className="p-3">{inStock === null ? 'نامشخص' : inStock ? 'موجود' : 'ناموجود'}</td>
                  </tr>
                })}
                {!filteredCatalog.length && <tr><td colSpan={9} className="p-8 text-center text-white/35">محصولی یافت نشد.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'discounts' ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
          <form onSubmit={(event) => void savePromoCode(event)} className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0b1114] p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold"><Tag size={16} className="text-emerald-200" />{editingPromoCode ? 'ویرایش کد تخفیف' : 'ساخت کد تخفیف'}</h2>
            <label className="block text-xs text-white/55">نام کد<input required maxLength={20} pattern="[A-Za-z0-9_-]{2,20}" readOnly={Boolean(editingPromoCode)} className={`${fieldClass()} mt-1.5 read-only:opacity-55`} value={promoDraft.code} onChange={(event) => setPromoDraft({ ...promoDraft, code: event.target.value.toUpperCase() })} placeholder="مثلاً NOBULL10" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-white/55">نوع تخفیف<select className={`${fieldClass()} mt-1.5`} value={promoDraft.type} onChange={(event) => setPromoDraft({ ...promoDraft, type: event.target.value as PromoCode['type'] })}><option value="percent">درصدی</option><option value="fixed_toman">مبلغ ثابت (تومان)</option></select></label>
              <label className="text-xs text-white/55">مقدار تخفیف<input required type="number" min="1" max={promoDraft.type === 'percent' ? 100 : 1000000000} className={`${fieldClass()} mt-1.5`} value={promoDraft.value} onChange={(event) => setPromoDraft({ ...promoDraft, value: event.target.value })} /></label>
            </div>
            <label className="block text-xs text-white/55">حداکثر دفعات استفاده<input required type="number" min="1" max="1000000" className={`${fieldClass()} mt-1.5`} value={promoDraft.maxUses} onChange={(event) => setPromoDraft({ ...promoDraft, maxUses: event.target.value })} /></label>
            <label className="block text-xs text-white/55">تاریخ انقضا (اختیاری)<input type="datetime-local" className={`${fieldClass()} mt-1.5`} value={promoDraft.expiresAt} onChange={(event) => setPromoDraft({ ...promoDraft, expiresAt: event.target.value })} /></label>
            <label className="block text-xs text-white/55">توضیح (اختیاری)<input maxLength={120} className={`${fieldClass()} mt-1.5`} value={promoDraft.description} onChange={(event) => setPromoDraft({ ...promoDraft, description: event.target.value })} /></label>
            <label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={promoDraft.active} onChange={(event) => setPromoDraft({ ...promoDraft, active: event.target.checked })} />فعال باشد</label>
            <div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-bold text-black disabled:opacity-50">ذخیره کد</button><button type="button" onClick={() => { setEditingPromoCode(''); setPromoDraft({ code: '', type: 'percent', value: '10', maxUses: '100', active: true, expiresAt: '', description: '' }) }} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-white/55">پاک‌کردن فرم</button></div>
          </form>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[700px] text-right text-xs">
              <thead className="bg-white/[0.035] text-white/45"><tr>{['کد', 'تخفیف', 'مصرف‌شده / سقف', 'انقضا', 'وضعیت', 'عملیات'].map((title) => <th key={title} className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.pricing.discountCodes.map((code) => <tr key={code.code} className="text-white/70"><td className="p-3"><strong dir="ltr">{code.code}</strong>{code.description && <div className="mt-1 text-[10px] text-white/40">{code.description}</div>}</td><td className="p-3">{code.type === 'percent' ? `${formatNumber(code.value)}٪` : formatToman(code.value)}</td><td className="p-3">{formatNumber(code.usedCount)} / {formatNumber(code.maxUses)}</td><td className="p-3">{code.expiresAt ? formatDate(Date.parse(code.expiresAt)) : 'بدون انقضا'}</td><td className="p-3"><button type="button" onClick={() => void post({ action: 'save-discount', ...code }).then(() => setRefreshKey((current) => current + 1)).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'تغییر وضعیت ناموفق بود.'))} disabled={busy} className={`rounded-full border px-2 py-1 text-[10px] ${code.active ? 'border-emerald-300/20 text-emerald-100' : 'border-white/10 text-white/40'}`}>{code.active ? 'فعال' : 'غیرفعال'}</button></td><td className="p-3"><div className="flex gap-2"><button type="button" onClick={() => editPromoCode(code)} className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px]">ویرایش</button><button type="button" onClick={() => void deletePromoCode(code.code)} disabled={busy} aria-label={`حذف ${code.code}`} className="rounded-lg border border-red-300/15 p-1.5 text-red-200"><Trash2 size={13} /></button></div></td></tr>)}
                {!data.pricing.discountCodes.length && <tr><td colSpan={6} className="p-8 text-center text-white/35">هنوز کد تخفیفی ثبت نشده است.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void sendBroadcast(event)} className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0b1114] p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold"><Megaphone size={16} className="text-emerald-200" /> ارسال پیام Markdown تلگرام</h2>
            <label className="block text-xs text-white/55">متن پیام<textarea required maxLength={4096} rows={10} className={`${fieldClass()} mt-1.5 resize-y`} value={broadcastDraft.message} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, message: event.target.value })} placeholder="متن فارسی پیام را بنویسید؛ Markdown و ایموجی پشتیبانی می‌شود." /></label>
            <p className="text-[10px] text-white/35">{formatNumber(broadcastDraft.message.length)} از ۴۰۹۶ نویسه</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-white/55">مخاطبان<select className={`${fieldClass()} mt-1.5`} value={broadcastDraft.audience} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, audience: event.target.value as 'all' | 'buyers' })}><option value="all">همه کاربران ربات</option><option value="buyers">فقط خریداران</option></select></label>
              <div className="text-xs text-white/45 sm:self-end sm:pb-3">{broadcastDraft.audience === 'all' ? 'برای همه کاربران ثبت‌شده ربات ارسال می‌شود.' : 'فقط برای کاربرانی که سفارش تکمیل‌شده دارند ارسال می‌شود.'}</div>
            </div>
            <details className="rounded-xl border border-white/[0.07] p-3">
              <summary className="cursor-pointer text-xs text-white/65">افزودن دکمه درون‌خطی (اختیاری)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-white/55">عنوان دکمه<input maxLength={64} className={`${fieldClass()} mt-1.5`} value={broadcastDraft.buttonText} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, buttonText: event.target.value })} placeholder="🛒 مشاهده فروشگاه" /></label>
                <label className="text-xs text-white/55">لینک HTTPS<input type="url" className={`${fieldClass()} mt-1.5`} value={broadcastDraft.buttonUrl} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, buttonUrl: event.target.value })} placeholder="https://t.me/..." /></label>
              </div>
            </details>
            <button disabled={busy || !broadcastDraft.message.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-bold text-black disabled:opacity-50"><Send size={15} />ارسال همگانی</button>
          </div>
          <aside className="space-y-3">
            <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-6 text-amber-100/70">ارسال به تعداد زیاد ممکن است زمان ببرد. خطای ارسال برای هر کاربر جداگانه مدیریت می‌شود و کاربرانی که ربات را مسدود کرده‌اند از فهرست حذف می‌شوند.</div>
            {broadcastResult && <div role="status" className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4"><h3 className="text-sm font-bold text-emerald-100">گزارش ارسال</h3><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between"><dt>هدف‌گذاری‌شده</dt><dd>{formatNumber(broadcastResult.totalTargeted)}</dd></div><div className="flex justify-between"><dt>ارسال موفق</dt><dd className="text-emerald-200">{formatNumber(broadcastResult.sentCount)}</dd></div><div className="flex justify-between"><dt>ناموفق</dt><dd className="text-amber-100">{formatNumber(broadcastResult.failedCount)}</dd></div></dl></div>}
          </aside>
        </form>
      )}
    </section>
  )
}

function ProviderWalletCard({
  wallet,
  refreshing,
  onRefresh,
}: {
  wallet: ProviderWallet
  refreshing: boolean
  onRefresh: () => void
}) {
  const testCreditLabel =
    wallet.testCredit === null
      ? wallet.testCreditActive === true
        ? 'حالت آزمایشی فعال'
        : 'اطلاعات اعتبار آزمایشی ارائه نشده'
      : typeof wallet.testCredit === 'boolean'
        ? wallet.testCredit
          ? 'اعتبار آزمایشی فعال'
          : 'اعتبار آزمایشی غیرفعال'
        : `اعتبار آزمایشی: ${wallet.testCredit} ${wallet.currency ?? 'واحد'}`

  return (
    <article className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-[linear-gradient(115deg,rgba(8,40,43,0.82),rgba(10,17,20,0.96)_55%,rgba(13,25,30,0.96))] p-4 shadow-[0_12px_42px_rgba(0,242,255,0.06)] sm:p-5">
      <div className="pointer-events-none absolute -left-8 -top-12 h-40 w-40 rounded-full bg-cyan-300/[0.07] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.14em] text-cyan-100/60">DANTE HUB • LIVE WALLET</p>
          <h2 className="mt-1 text-base font-extrabold text-white sm:text-lg">
            اعتبار کیف پول ارائه‌دهنده (Dante Hub)
          </h2>
          <p className="mt-1 text-[10px] text-white/40">
            آخرین بررسی: {wallet.checkedAt ? formatDate(wallet.checkedAt) : 'هنوز بررسی نشده'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-200/[0.06] px-3 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-200/[0.12] disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          بروزرسانی موجودی
        </button>
      </div>
      <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] text-white/45">موجودی زنده</p>
          <p className="mt-1 text-xl font-extrabold text-cyan-100">
            {wallet.balance === null
              ? '—'
              : `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 4 }).format(wallet.balance)} ${wallet.currency ?? 'USD'}`}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] text-white/45">اعتبار / کلید آزمایشی</p>
          <p className={`mt-1 text-sm font-bold ${wallet.testCreditActive ? 'text-emerald-200' : 'text-white/75'}`}>
            {testCreditLabel}
          </p>
          <p className="mt-1 text-[10px] text-white/35">
            {wallet.testCreditActive === null
              ? wallet.configured
                ? 'وضعیت آزمایشی از پاسخ ارائه‌دهنده مشخص نشده است.'
                : 'کلید Dante Hub پیکربندی نشده است.'
              : wallet.testCreditActive
                ? 'حساب یا اعتبار آزمایشی از پاسخ ارائه‌دهنده تشخیص داده شد.'
                : 'اعتبار آزمایشی فعالی گزارش نشده است.'}
          </p>
        </div>
      </div>
      {wallet.error && (
        <p role="status" className="relative mt-3 rounded-lg border border-amber-200/10 bg-amber-100/[0.04] px-3 py-2 text-[11px] leading-5 text-amber-100/80">
          {wallet.error} اطلاعات فروشگاه همچنان در دسترس است.
        </p>
      )}
    </article>
  )
}

export default AdminDashboard
