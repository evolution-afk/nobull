import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  BarChart3,
  Check,
  Download,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react'

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
  brand?: string
  price_usd?: number
  usdt_rate_used?: number
  price_toman?: number
  appliedMarginPercent?: number
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
  }
  catalog: {
    products: AdminCatalogProduct[]
    rate: number | null
    error: string | null
  }
  providerWallet: ProviderWallet
}

type AdminTab = 'sales' | 'customers' | 'pricing' | 'catalog'

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
      `${product.name ?? ''} ${product.brand ?? ''} ${product.id ?? ''}`
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
                  {item.brand} · {item.title} · {formatNumber(item.count)} سفارش
                </span>
              ))}
              {!data.analytics.topProducts.length && <span className="text-xs text-white/35">هنوز سفارش تکمیل‌شده‌ای ثبت نشده است.</span>}
            </div>
            <h3 className="mt-4 text-xs font-semibold text-white/65">برندهای پرفروش</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.analytics.topBrands.map((item) => (
                <span key={item.brand} className="rounded-xl border border-emerald-300/10 px-3 py-2 text-[11px] text-emerald-100/80">
                  {item.brand} · {formatNumber(item.count)} سفارش · {formatToman(item.revenueToman)}
                </span>
              ))}
              {!data.analytics.topBrands.length && <span className="text-xs text-white/35">داده‌ای برای برندها وجود ندارد.</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">سفارش‌ها</h2>
            <button type="button" onClick={() => downloadCsv('nobull-orders.csv', [
              ['شناسه', 'تاریخ', 'وضعیت', 'نام خریدار', 'نام کاربری', 'Chat ID', 'محصول', 'برند', 'هزینه دلار', 'قیمت تومان', 'سود تومان'],
              ...filteredOrders.map((order) => [order.orderId, formatDate(order.createdAt), statusLabel(order.status), order.firstName, order.username, order.userId, order.productTitle, order.brand, order.priceUsd, order.priceToman, order.estimatedProfitToman]),
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
                    <td className="p-3">{order.productTitle}<div className="mt-1 text-[10px] text-white/40">{order.brand} · {order.reference}</div></td>
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
              ['نام', 'نام کاربری', 'Chat ID', 'تاریخ عضویت', 'کل سفارش‌ها', 'سفارش تکمیل', 'مجموع خرید تومان', 'نشان مشتری'],
              ...filteredCustomers.map((customer) => [customer.firstName, customer.username ? `@${customer.username}` : '', customer.chatId, formatDate(customer.firstSeenAt), customer.totalOrders, customer.completedOrders, customer.totalSpentToman, customer.completedOrders > 0 && customer.totalSpentToman >= 10_000_000 ? 'VIP' : customer.completedOrders > 0 ? 'خریدار' : 'عضو ربات']),
            ])} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 hover:text-white"><Download size={14} /> خروجی اکسل (CSV) مشتریان</button>
          </div>
          <label className="relative block"><Search className="absolute right-3 top-3 text-white/35" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldClass()} pr-9`} placeholder="جست‌وجو نام، نام کاربری یا شناسه…" /></label>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead className="bg-white/[0.035] text-white/45"><tr>{['مشتری', 'Chat ID', 'عضویت', 'سفارش‌ها', 'مجموع خرید', 'نشان'].map((title) => <th key={title} className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredCustomers.map((customer) => {
                  const badge = customer.completedOrders > 0 && customer.totalSpentToman >= 10_000_000 ? 'VIP' : customer.completedOrders > 0 ? 'خریدار' : 'عضو ربات'
                  return <tr key={customer.chatId} className="text-white/70"><td className="p-3">{customer.firstName || '—'}<div className="mt-1 text-white/40">{customer.username ? `@${customer.username}` : 'بدون نام کاربری'}</div></td><td dir="ltr" className="p-3 text-right font-mono">{customer.chatId}</td><td className="p-3">{formatDate(customer.firstSeenAt)}</td><td className="p-3">{formatNumber(customer.totalOrders)} کل · {formatNumber(customer.completedOrders)} تکمیل</td><td className="p-3">{formatToman(customer.totalSpentToman)}</td><td className="p-3"><span className="rounded-full border border-emerald-300/15 px-2 py-1 text-emerald-100">{badge}</span></td></tr>
                })}
                {!filteredCustomers.length && <tr><td colSpan={6} className="p-8 text-center text-white/35">مشتری‌ای پیدا نشد.</td></tr>}
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
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-bold">ممیزی زنده قیمت محصولات</h2><p className="mt-1 text-xs text-white/40">نرخ فعلی: {data.catalog.rate ? `${formatNumber(data.catalog.rate)} تومان` : 'نامشخص'} · {formatNumber(filteredCatalog.length)} محصول</p></div>
            <label className="relative w-full sm:max-w-sm"><Search className="absolute right-3 top-3 text-white/35" size={15} /><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} className={`${fieldClass()} pr-9`} placeholder="جست‌وجوی محصول یا برند…" /></label>
          </div>
          {data.catalog.error && <p className="text-xs text-amber-100">{data.catalog.error}</p>}
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[850px] text-right text-xs">
              <thead className="bg-white/[0.035] text-white/45"><tr>{['محصول / برند', 'هزینه USD', 'نرخ تبدیل', 'حاشیه سود', 'قیمت نهایی تومان', 'وضعیت موجودی'].map((title) => <th key={title} className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredCatalog.map((product) => {
                  const stock = Number(product.stock)
                  const inStock = typeof product.in_stock === 'boolean' ? product.in_stock : Number.isFinite(stock) ? stock > 0 : null
                  return <tr key={`${product.id}-${product.provider_product_id}`} className="text-white/70"><td className="p-3">{product.name || 'محصول'}<div className="mt-1 text-[10px] text-white/40">{product.brand || '—'}</div></td><td dir="ltr" className="p-3 text-right">${Number(product.price_usd ?? 0).toFixed(2)}</td><td className="p-3">{formatNumber(Number(product.usdt_rate_used ?? 0))}</td><td className="p-3">{formatNumber(Number(product.appliedMarginPercent ?? 0))}٪</td><td className="p-3 font-bold">{formatToman(Number(product.price_toman ?? 0))}</td><td className="p-3">{inStock === null ? 'نامشخص' : inStock ? 'موجود' : 'ناموجود'}</td></tr>
                })}
                {!filteredCatalog.length && <tr><td colSpan={6} className="p-8 text-center text-white/35">محصولی یافت نشد.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
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
