export interface BrandAsset {
  name: string
  slug: string
  color: string
  categoryLabel: string
}

interface BrandDefinition {
  name: string
  slug: string
  color: string
  categoryLabel: string
  aliases?: string[]
}

const definitions: BrandDefinition[] = [
  { name: 'ChatGPT', slug: 'openai', color: '10A37F', categoryLabel: 'هوش مصنوعی', aliases: ['chat gpt', 'chatgpt'] },
  { name: 'OpenAI', slug: 'openai', color: '10A37F', categoryLabel: 'هوش مصنوعی', aliases: ['open ai'] },
  { name: 'Claude', slug: 'claude', color: 'D97757', categoryLabel: 'هوش مصنوعی', aliases: ['anthropic'] },
  { name: 'Gemini', slug: 'gemini', color: '8E75FF', categoryLabel: 'هوش مصنوعی', aliases: ['google gemini'] },
  { name: 'Google', slug: 'google', color: '4285F4', categoryLabel: 'ابزار دیجیتال' },
  { name: 'Grok', slug: 'grok', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی', aliases: ['xai', 'x ai'] },
  { name: 'Cursor', slug: 'cursor', color: '00D8E8', categoryLabel: 'برنامه‌نویسی' },
  { name: 'Notion', slug: 'notion', color: '000000', categoryLabel: 'ابزار دیجیتال' },
  { name: 'Perplexity', slug: 'perplexity', color: '20B8CD', categoryLabel: 'هوش مصنوعی' },
  { name: 'CapCut', slug: 'capcut', color: 'FFFFFF', categoryLabel: 'طراحی و تدوین' },
  { name: 'Canva', slug: 'canva', color: '00C4CC', categoryLabel: 'طراحی و تدوین' },
  { name: 'YouTube', slug: 'youtube', color: 'FF0033', categoryLabel: 'سرگرمی' },
  { name: 'Spotify', slug: 'spotify', color: '1ED760', categoryLabel: 'سرگرمی' },
  { name: 'Adobe', slug: 'adobe', color: 'EB1000', categoryLabel: 'طراحی و تدوین' },
  { name: 'Microsoft', slug: 'microsoft', color: '00A4EF', categoryLabel: 'ابزار دیجیتال' },
  { name: 'Figma', slug: 'figma', color: 'F24E1E', categoryLabel: 'طراحی و تدوین' },
  { name: 'Grammarly', slug: 'grammarly', color: '15C39A', categoryLabel: 'ابزار نوشتاری' },
  { name: 'Duolingo', slug: 'duolingo', color: '58CC02', categoryLabel: 'آموزش' },
  { name: 'ElevenLabs', slug: 'elevenlabs', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی' },
  { name: 'Lovable', slug: 'lovable', color: 'FF4F87', categoryLabel: 'برنامه‌نویسی' },
  { name: 'Coursera', slug: 'coursera', color: '0056D2', categoryLabel: 'آموزش' },
  { name: 'Bolt', slug: 'bolt', color: 'FFFFFF', categoryLabel: 'برنامه‌نویسی', aliases: ['bolt.new'] },
  { name: 'Gamma', slug: 'gamma', color: 'FFFFFF', categoryLabel: 'طراحی و تدوین' },
  { name: 'Kling', slug: 'klingai', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی', aliases: ['kling ai'] },
  { name: 'Leonardo', slug: 'leonardo', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی', aliases: ['leonardo ai'] },
  { name: 'QuillBot', slug: 'quillbot', color: '499557', categoryLabel: 'ابزار نوشتاری' },
  { name: 'Replit', slug: 'replit', color: 'F26207', categoryLabel: 'برنامه‌نویسی' },
  { name: 'Apple', slug: 'apple', color: 'FFFFFF', categoryLabel: 'ابزار دیجیتال' },
  { name: 'Amazon', slug: 'amazon', color: 'FF9900', categoryLabel: 'ابزار دیجیتال' },
  { name: 'Autodesk', slug: 'autodesk', color: '0696D7', categoryLabel: 'طراحی و تدوین' },
  { name: 'Discord', slug: 'discord', color: '5865F2', categoryLabel: 'شبکه و ارتباطات' },
  { name: 'Facebook', slug: 'facebook', color: '0866FF', categoryLabel: 'شبکه و ارتباطات', aliases: ['meta'] },
  { name: 'Framer', slug: 'framer', color: 'FFFFFF', categoryLabel: 'طراحی و تدوین' },
  { name: 'HBO', slug: 'hbo', color: 'FFFFFF', categoryLabel: 'سرگرمی', aliases: ['max'] },
  { name: 'HeyGen', slug: 'heygen', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی' },
  { name: 'JetBrains', slug: 'jetbrains', color: 'FFFFFF', categoryLabel: 'برنامه‌نویسی' },
  { name: 'LinkedIn', slug: 'linkedin', color: '0A66C2', categoryLabel: 'شبکه و ارتباطات' },
  { name: 'Midjourney', slug: 'midjourney', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی' },
  { name: 'Netflix', slug: 'netflix', color: 'E50914', categoryLabel: 'سرگرمی' },
  { name: 'NordVPN', slug: 'nordvpn', color: '4687FF', categoryLabel: 'حریم خصوصی', aliases: ['nord vpn'] },
  { name: 'Proton', slug: 'proton', color: '6D4AFF', categoryLabel: 'حریم خصوصی', aliases: ['proton vpn', 'protonmail'] },
  { name: 'PureVPN', slug: 'purevpn', color: 'FF6C2C', categoryLabel: 'حریم خصوصی', aliases: ['pure vpn'] },
  { name: 'Surfshark', slug: 'surfshark', color: '1786F9', categoryLabel: 'حریم خصوصی' },
  { name: 'Runway', slug: 'runway', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی', aliases: ['runwayml'] },
  { name: 'Suno', slug: 'suno', color: 'FFFFFF', categoryLabel: 'هوش مصنوعی' },
  { name: 'Telegram', slug: 'telegram', color: '26A5E4', categoryLabel: 'شبکه و ارتباطات' },
  { name: 'TradingView', slug: 'tradingview', color: '2962FF', categoryLabel: 'مالی و بازار' },
  { name: 'Udemy', slug: 'udemy', color: 'A435F0', categoryLabel: 'آموزش' },
  { name: 'Zoom', slug: 'zoom', color: '0B5CFF', categoryLabel: 'شبکه و ارتباطات' },
  { name: 'ExpressVPN', slug: 'expressvpn', color: 'DA3940', categoryLabel: 'حریم خصوصی' },
  { name: 'VeePN', slug: 'veepn', color: 'FF6B35', categoryLabel: 'حریم خصوصی' },
  { name: 'Tidal', slug: 'tidal', color: 'FFFFFF', categoryLabel: 'سرگرمی' },
  { name: 'Crunchyroll', slug: 'crunchyroll', color: 'F47521', categoryLabel: 'سرگرمی' },
  { name: 'Disney+', slug: 'disneyplus', color: '113CCF', categoryLabel: 'سرگرمی', aliases: ['disney plus'] },
  { name: 'Xbox', slug: 'xbox', color: '107C10', categoryLabel: 'سرگرمی' },
  { name: 'PlayStation', slug: 'playstation', color: '003791', categoryLabel: 'سرگرمی' },
  { name: 'GitHub', slug: 'github', color: 'FFFFFF', categoryLabel: 'برنامه‌نویسی' },
  { name: 'GitHub Copilot', slug: 'githubcopilot', color: 'FFFFFF', categoryLabel: 'برنامه‌نویسی', aliases: ['copilot'] },
  { name: 'Windsurf', slug: 'codeium', color: '00A8E8', categoryLabel: 'برنامه‌نویسی' },
]

const brands = definitions
  .map((definition) => ({
    ...definition,
    aliases: [definition.name, ...(definition.aliases ?? [])],
  }))
  .sort((left, right) => {
    const leftLength = Math.max(...left.aliases.map((alias) => alias.length))
    const rightLength = Math.max(...right.aliases.map((alias) => alias.length))
    return rightLength - leftLength
  })

const fallbackBrand: BrandAsset = {
  name: 'سایر',
  slug: 'category-tools',
  color: '00F2FF',
  categoryLabel: 'اشتراک دیجیتال',
}

function matchesAlias(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text)
}

export function resolveBrandAsset(...values: string[]): BrandAsset {
  const searchableText = values.filter(Boolean).join(' ')
  const match = brands.find((brand) =>
    brand.aliases.some((alias) => matchesAlias(searchableText, alias)),
  )

  if (!match) {
    const categoryText = searchableText.toLocaleLowerCase()
    if (/ai|هوش مصنوعی|artificial intelligence/.test(categoryText)) {
      return { ...fallbackBrand, slug: 'category-ai', categoryLabel: 'هوش مصنوعی' }
    }
    if (/vpn|security|privacy|امنیت|حریم خصوصی/.test(categoryText)) {
      return { ...fallbackBrand, slug: 'category-privacy', categoryLabel: 'حریم خصوصی' }
    }
    if (/music|video|stream|موسیقی|ویدیو|سرگرمی/.test(categoryText)) {
      return { ...fallbackBrand, slug: 'category-media', categoryLabel: 'سرگرمی' }
    }
    if (/design|graphic|creative|طراحی|گرافیک/.test(categoryText)) {
      return { ...fallbackBrand, slug: 'category-design', categoryLabel: 'طراحی و تدوین' }
    }
    if (/code|developer|programming|برنامه.?نویسی/.test(categoryText)) {
      return { ...fallbackBrand, slug: 'category-code', categoryLabel: 'برنامه‌نویسی' }
    }
    if (/education|learning|course|آموزش/.test(categoryText)) {
      return { ...fallbackBrand, slug: 'category-learning', categoryLabel: 'آموزش' }
    }
    return fallbackBrand
  }
  return {
    name: match.name,
    slug: match.slug,
    color: match.color,
    categoryLabel: match.categoryLabel,
  }
}

export function getKnownBrandAssets(): BrandAsset[] {
  return brands.map(({ name, slug, color, categoryLabel }) => ({
    name,
    slug,
    color,
    categoryLabel,
  }))
}
