import { Check } from 'lucide-react'
import type { ServiceGuide } from '../types'

export function ServiceGuideContent({ guide }: { guide: ServiceGuide }) {
  return (
    <div className="mt-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[14px] border border-white/[0.06] bg-black/30 p-4">
          <h3 className="text-[13px] font-bold text-primary/85">
            این سرویس چیست و چه کاری انجام می‌دهد؟
          </h3>
          <p className="mt-2 text-[13px] leading-7 text-white/75">
            {guide.description}
          </p>
        </div>
        <div className="rounded-[14px] border border-white/[0.06] bg-black/30 p-4">
          <h3 className="text-[13px] font-bold text-primary/85">
            تفاوت پلن‌ها و اصطلاحات
          </h3>
          <p className="mt-2 text-[13px] leading-7 text-white/75">
            {guide.planDifferences}
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {guide.tips.map((tip) => (
          <li key={tip} className="flex items-start gap-2">
            <Check size={14} className="mt-1 shrink-0 text-emerald-200" aria-hidden="true" />
            <span className="text-[12.5px] leading-6 text-white/70">{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
