import type {
  ProductWarning,
  ProductWarningLevel,
} from '../functions/api/_shared/warningParser'
import type { BrandAsset } from './utils/brandAssets'

export type { ProductWarning, ProductWarningLevel }

export type StockStatus = 'available' | 'unavailable' | 'unknown'

export interface Product {
  id: string
  providerId: string
  providerProductId: string
  name: string
  persianName: string
  brand: string
  brandKey: string
  brandAsset: BrandAsset
  category: string
  persianCategory: string
  description: string
  persianDescription: string
  price_toman: number
  usdt_rate_used: number | null
  stock: number | null
  status: StockStatus
  purchaseUrl: string | null
  featured: boolean
  warnings: ProductWarning[]
}

export interface ServiceGuide {
  title: string
  summary: string
  description: string
  planDifferences: string
  tips: string[]
}

export interface BrandGroup {
  brand: string
  brandKey: string
  asset: BrandAsset
  category: string
  plans: Product[]
  availablePlans: number
  lowestPlan: Product
}

export interface VpnPlan {
  id: string
  plan_code: string
  name: string
  name_en: string | null
  quota_gb: number
  duration_days: number | null
  price_amount: number
  price_currency: string
  max_speed_mbps: number | null
}

export interface VpnServer {
  code: string
  name: string
  protocol_default: string
}

export interface VpnCheckoutResult {
  username: string
  password: string
  configUrl: string | null
  orderId: string
  orderReference: string
  expiresAt: string | null
  planId: string
  planTitle: string
  quotaGb: number
  durationDays: number
  serverCode: string
  serverName: string
  walletBalanceToman: number
}

export interface VpnUsageSnapshot {
  used_gb: number
  quota_gb: number
  remaining_gb: number
  bytes_total: number | null
  bytes_used: number | null
  live: boolean
}

export interface VpnSubscription {
  id: number
  plan_id: string
  plan_name: string
  plan_name_en: string | null
  status: string
  start_date: string | null
  expiry_date: string | null
  quota_limit_gb: number
  quota_used_gb: number
  radius_username: string
  server_code: string
  provision_status: string | null
  usage: VpnUsageSnapshot
}
