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
