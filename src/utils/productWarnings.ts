import {
  parseProductWarnings,
  type ProductWarning,
  type ProductWarningLevel,
} from '../../functions/api/_shared/warningParser'

const WARNING_LEVELS: ReadonlySet<string> = new Set<ProductWarningLevel>([
  'critical',
  'warning',
  'info',
  'success',
])

const LEVEL_ORDER: Record<ProductWarningLevel, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
}

function asWarning(value: unknown): ProductWarning | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const level = typeof record.level === 'string' ? record.level : ''
  const titleFa = typeof record.title_fa === 'string' ? record.title_fa : ''
  const titleEn = typeof record.title_en === 'string' ? record.title_en : ''
  if (!id || !titleFa || !WARNING_LEVELS.has(level)) return null

  return {
    id,
    level: level as ProductWarningLevel,
    title_fa: titleFa,
    title_en: titleEn,
  }
}

function sortBySeverity(warnings: ProductWarning[]): ProductWarning[] {
  return warnings.sort(
    (first, second) => LEVEL_ORDER[first.level] - LEVEL_ORDER[second.level],
  )
}

/**
 * Reads the warnings produced by the catalog API and de-duplicates them.
 * When a response carries no warnings (an older cached payload, or a catalog
 * served without the shared parser), the description is parsed locally with
 * the exact same rules so the UI never silently loses activation conditions.
 */
export function normalizeProductWarnings(
  payloadWarnings: unknown,
  description: string,
): ProductWarning[] {
  if (!Array.isArray(payloadWarnings)) {
    return parseProductWarnings(description)
  }

  const seen = new Set<string>()
  const warnings: ProductWarning[] = []
  for (const item of payloadWarnings) {
    const warning = asWarning(item)
    if (!warning || seen.has(warning.id)) continue
    seen.add(warning.id)
    warnings.push(warning)
  }

  return warnings.length > 0
    ? sortBySeverity(warnings)
    : parseProductWarnings(description)
}
