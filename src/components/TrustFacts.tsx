import { KeyRound, PackageCheck, Tag, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

interface Fact {
  icon: ReactNode
  value: string
  label: string
}

const facts: Fact[] = [
  {
    icon: <PackageCheck size={19} aria-hidden="true" />,
    value: '+۶۸',
    label: 'برند معتبر',
  },
  {
    icon: <Zap size={19} aria-hidden="true" />,
    value: 'آنی',
    label: 'تحویل در تلگرام',
  },
  {
    icon: <Tag size={19} aria-hidden="true" />,
    value: 'تومانی',
    label: 'قیمت رفاقتی',
  },
  {
    icon: <KeyRound size={19} aria-hidden="true" />,
    value: 'داخلی',
    label: 'ابزار کد ۲ مرحله‌ای',
  },
]

export function TrustFacts() {
  return (
    <section
      aria-label="مزیت‌های خرید از نوبول"
      className="mt-6 grid border-y border-white/10 sm:grid-cols-2 lg:grid-cols-4"
    >
      {facts.map((fact, index) => {
        const classes = [
          'flex items-center gap-3 px-5 py-4 lg:h-20 lg:py-0',
          index % 2 === 1 ? 'border-s border-white/[0.06]' : '',
          index >= 2 ? 'border-t border-white/[0.06] lg:border-t-0' : '',
          index > 0 ? 'lg:border-s lg:border-white/[0.06]' : 'lg:ps-1',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={fact.label} className={classes}>
            <span className="text-primary/85">{fact.icon}</span>
            <div>
              <p className="text-[17px] font-extrabold leading-7">{fact.value}</p>
              <p className="text-xs leading-5 text-white/45">{fact.label}</p>
            </div>
          </div>
        )
      })}
    </section>
  )
}
