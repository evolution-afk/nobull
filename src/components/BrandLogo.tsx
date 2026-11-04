import type { ReactNode } from 'react'
import type { BrandAsset } from '../utils/brandAssets'

function brandMark(slug: string): ReactNode {
  switch (slug) {
    case 'openai':
      return (
        <path
          d="M12 3.2a4 4 0 0 1 3.9 3.1 4 4 0 0 1 3.4 5.2 4 4 0 0 1-1 6.4 4 4 0 0 1-6.2 2.2 4 4 0 0 1-6.6-2.1 4 4 0 0 1-2.7-5.8 4 4 0 0 1 2.9-6.1A4 4 0 0 1 12 3.2Zm0 3.1-3.3 1.9v3.7l3.3 1.9 3.3-1.9V8.2L12 6.3Zm-5.1 3-2.3 1.3v3.8l3.3 1.9 2.3-1.2v-1.2l-3.3-1.9V9.3Zm10.2 0v1.2l-3.3 1.9v1.2l2.3 1.2 3.3-1.9v-3.8l-2.3-1.3Zm-7.5 5.7-3.3 1.9v3.8l2.3 1.3 3.3-1.9v-1.2l-2.3-1.3v-2.6Zm7.5 0-3.3 1.9v2.6l-2.3 1.3v1.2l3.3 1.9 2.3-1.3v-3.8l-.1-.1Z"
          fill="currentColor"
        />
      )
    case 'claude':
      return (
        <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M12 2.5v4M12 17.5v4M2.5 12h4m11 0h4M5.3 5.3l2.8 2.8m7.8 7.8 2.8 2.8m0-13.4-2.8 2.8m-7.8 7.8-2.8 2.8" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        </g>
      )
    case 'grok':
      return (
        <path
          d="M5 4 19 20M19 4 5 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      )
    case 'cursor':
      return (
        <path
          d="M5 3.5 19.5 13l-6.7 1.2-3.2 5.7L5 3.5Z"
          fill="currentColor"
          stroke="white"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )
    case 'perplexity':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M4 5h5v5H4zM15 5h5v5h-5zM4 14h5v5H4zM15 14h5v5h-5zM9 7.5h6M6.5 10v4m11-4v4M9 16.5h6" />
          <path d="m9 10 3 2 3-2m-6 4 3-2 3 2" />
        </g>
      )
    case 'midjourney':
      return (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 19 8 6l4 9 4-9 5 13M5 14h14" />
          <circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none" />
        </g>
      )
    case 'gemini':
      return (
        <path
          d="M12 2.5c1.2 4.7 2.8 7 9.5 9.5-6.7 2.5-8.3 4.8-9.5 9.5-1.2-4.7-2.8-7-9.5-9.5 6.7-2.5 8.3-4.8 9.5-9.5Z"
          fill="currentColor"
        />
      )
    case 'google':
      return (
        <g fill="none" strokeWidth="3.2">
          <path d="M20 12a8 8 0 1 1-2.4-5.7" stroke="#4285F4" />
          <path d="M17.6 6.3 20 8.5" stroke="#34A853" />
          <path d="M4.6 7.2A8 8 0 0 1 17.6 6.3" stroke="#EA4335" />
          <path d="M4.6 16.8A8 8 0 0 1 3.2 12" stroke="#FBBC05" />
        </g>
      )
    case 'canva':
      return (
        <text
          x="12"
          y="19"
          textAnchor="middle"
          fontSize="19"
          fontWeight="700"
          fontStyle="italic"
          fill="currentColor"
        >
          C
        </text>
      )
    case 'spotify':
      return (
        <g>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path
            d="M6.2 9.1c4.2-1.3 8.5-.8 11.6 1"
            fill="none"
            stroke="#071012"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M7.1 12c3.4-1 7-.6 9.7.9M8 14.8c2.7-.7 5.3-.4 7.5.8"
            fill="none"
            stroke="#071012"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </g>
      )
    case 'youtube':
      return (
        <g>
          <rect x="2.5" y="5" width="19" height="14" rx="4" fill="currentColor" />
          <path d="m10 8.5 5.5 3.5-5.5 3.5v-7Z" fill="#fff" />
        </g>
      )
    case 'netflix':
      return <path d="M5 3h4l6 12V3h4v18l-4 .2L9 9v12H5V3Z" fill="currentColor" />
    case 'apple':
      return (
        <path
          d="M16.5 3.3c-.1 1.5-1 2.9-2.2 3.7-1 .7-2.3 1.1-3.5 1 .1-1.4.8-2.7 1.8-3.6 1-.9 2.5-1.4 3.9-1.1ZM19.7 16.8c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.4 3.1-4.1 3.1-1.5 0-1.9-1-4-.9-2 .1-2.5 1-4 .9-1.7-.1-3-1.6-4-3-2.8-4-3.1-8.7-1.3-11.2 1.3-1.8 3.4-2.8 5.3-2.8 1.7 0 2.8 1 4.1 1 1.3 0 2.1-1 4.3-1 1.7 0 3.5.9 4.8 2.3-4.2 2.3-3.6 8.2.4 8.9Z"
          fill="currentColor"
          transform="translate(2 0) scale(.83)"
        />
      )
    case 'telegram':
      return (
        <path
          d="m3 11.4 17.7-7.1c.8-.3 1.5.2 1.2 1.5l-3 14.2c-.2 1-.8 1.3-1.6.8l-4.8-3.5-2.3 2.3c-.3.3-.5.5-1 .5l.4-4.9 9-8.1c.4-.4-.1-.6-.6-.2L7 13.8l-4.7-1.5c-1-.3-1-1 .7-1Z"
          fill="currentColor"
        />
      )
    case 'capcut':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 7h5l11 10h-5L4 7Zm0 10h5L20 7h-5L4 17Z" />
        </g>
      )
    case 'tradingview':
      return (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 19V5m0 14h18M6 15l4-4 3 2 5-7" />
          <path d="M15 6h3v3" />
        </g>
      )
    case 'jetbrains':
      return (
        <g>
          <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" fill="currentColor" />
          <path d="M7 8h3v3H7zm7 0h3v3h-3zm-7 6h10v2H7z" fill="#101114" />
        </g>
      )
    case 'linkedin':
      return (
        <g fill="currentColor">
          <rect x="3" y="8" width="4" height="13" rx="1" />
          <circle cx="5" cy="4.5" r="2" />
          <path d="M10 8h4v1.8c.7-1.3 2-2.2 3.8-2.2 3.2 0 4.2 2.1 4.2 5.4V21h-4v-5.9c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21h-4V8Z" />
        </g>
      )
    case 'grammarly':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="9" />
          <path d="M17 10a5.5 5.5 0 1 0 0 4h-4" strokeLinecap="round" />
        </g>
      )
    case 'duolingo':
      return (
        <g>
          <path d="M4 7c0-2 3-4 8-4s8 2 8 4v7c0 5-3 8-8 8s-8-3-8-8V7Z" fill="currentColor" />
          <path
            d="M8 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 16c2.7 2 5.3 2 8 0"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      )
    case 'discord':
      return (
        <g>
          <path
            d="M6 5c4-2 8-2 12 0l3 13c-2 2-4 3-6 3l-1-2c1-.3 2-.7 3-1.4-3.3 1.5-6.7 1.5-10 0 1 .7 2 1.1 3 1.4l-1 2c-2 0-4-1-6-3L6 5Z"
            fill="currentColor"
          />
          <circle cx="9" cy="12" r="1.4" fill="#fff" />
          <circle cx="15" cy="12" r="1.4" fill="#fff" />
        </g>
      )
    case 'nordvpn':
    case 'expressvpn':
      return (
        <path
          d="M12 2 20 5v6c0 5.3-3.2 9-8 11-4.8-2-8-5.7-8-11V5l8-3Zm0 3.2L7 7v4c0 3.6 1.8 6.2 5 7.9 3.2-1.7 5-4.3 5-7.9V7l-5-1.8Z"
          fill="currentColor"
        />
      )
    case 'category-ai':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v10M7 12h10M8.5 8.5l7 7m0-7-7 7" />
        </g>
      )
    case 'category-code':
      return (
        <path
          d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-14-4 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'category-design':
      return (
        <path
          d="m4 16 11-11 4 4L8 20H4v-4Zm9-9 4 4M4 20l5-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )
    case 'category-media':
      return (
        <g>
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
        </g>
      )
    case 'category-privacy':
      return (
        <path
          d="M12 2 20 5v6c0 5.3-3.2 9-8 11-4.8-2-8-5.7-8-11V5l8-3Zm-3 10 2 2 4-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'category-learning':
      return (
        <path
          d="M3 5c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2V5Zm9 2v14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      )
    default:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <path d="m8 12 2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
  }
}

export function BrandLogo({
  asset,
  className = 'h-10 w-10',
}: {
  asset: BrandAsset
  className?: string
}) {
  const color = `#${asset.color}`

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/[0.12] p-2 ${className}`}
      style={{
        background:
          asset.color === '000000'
            ? 'linear-gradient(145deg, #ffffff, #d4d4d8)'
            : `linear-gradient(145deg, ${color}35, ${color}10)`,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-full w-full overflow-visible"
        style={{ color }}
      >
        {brandMark(asset.slug)}
      </svg>
    </span>
  )
}
