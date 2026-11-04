import type { Product } from '../types'

const persianNumberFormat = new Intl.NumberFormat('fa-IR')

export function formatNumber(value: number): string {
  return persianNumberFormat.format(value)
}

export function formatToman(value: number): string {
  return `${formatNumber(value)} تومان`
}

export function stockLabel(product: Product): string {
  if (product.status === 'available') {
    return product.stock === null
      ? 'موجود'
      : `${formatNumber(product.stock)} عدد موجود`
  }
  if (product.status === 'unavailable') return 'ناموجود'
  return 'استعلام موجودی'
}

export function stockToneClass(status: Product['status']): string {
  if (status === 'available') {
    return 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200'
  }
  if (status === 'unavailable') {
    return 'border-red-300/15 bg-red-300/[0.05] text-red-200/70'
  }
  return 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100/75'
}
