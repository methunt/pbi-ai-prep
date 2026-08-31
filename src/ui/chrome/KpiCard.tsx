import type { ReactNode } from 'react'

/** The blue-family accent tone for a KPI card (tokens only, no hardcoded RGB). */
export type KpiTone = 'blue' | 'sky' | 'cyan' | 'emerald' | 'amber'

export interface KpiCardProps {
  /** Uppercase tracking label, e.g. "Backlog". */
  label: string
  /** The live figure (number or node). */
  value: ReactNode
  /** One line of plain-English meaning (FR-37). */
  definition: string
  /** Blue-family tone; drives the icon tint, hover border, and top gradient bar. */
  tone: KpiTone
  /** Accent glyph shown in the tinted icon chip. */
  icon?: ReactNode
  /** 0..100 — renders the optional inline progress bar. */
  progress?: number | null
  /** Extra layout classes (e.g. grid span for the wide Coverage card). */
  className?: string
  /** When set, the card acts as a button (e.g. Pending edits opens review). */
  onClick?: () => void
}

/** Literal Tailwind class strings per tone (scanner picks them up verbatim). */
const TONES: Record<KpiTone, { icon: string; border: string; bar: string }> = {
  blue: {
    icon: 'bg-primary/10 text-primary',
    border: 'hover:border-primary/35',
    bar: 'from-primary to-primary/15',
  },
  sky: {
    icon: 'bg-sky/10 text-sky',
    border: 'hover:border-sky/35',
    bar: 'from-sky to-sky/15',
  },
  cyan: {
    icon: 'bg-cyan/10 text-cyan',
    border: 'hover:border-cyan/35',
    bar: 'from-cyan to-cyan/15',
  },
  emerald: {
    icon: 'bg-emerald/10 text-emerald',
    border: 'hover:border-emerald/35',
    bar: 'from-emerald to-emerald/15',
  },
  amber: {
    icon: 'bg-amber/10 text-amber',
    border: 'hover:border-amber/35',
    bar: 'from-amber to-amber/15',
  },
}

/** One KPI stat card: accent chip + uppercase label + big figure + one-line gloss. */
export default function KpiCard({
  label,
  value,
  definition,
  tone,
  icon,
  progress = null,
  className = '',
  onClick,
}: KpiCardProps) {
  const t = TONES[tone]
  const body = (
    <>
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${t.bar}`} aria-hidden="true" />
      <div className="mb-2.5 flex items-start justify-between">
        {icon ? (
          <div className={`flex h-[34px] w-[34px] items-center justify-center rounded-[9px] ${t.icon}`}>
            {icon}
          </div>
        ) : (
          <div className="h-[34px] w-[34px]" aria-hidden="true" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-foreground/55">
          {label}
        </span>
      </div>
      <div className="text-[26px] font-extrabold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11px] leading-snug text-foreground/60">{definition}</div>
      {progress != null && (
        <div className="bar mt-2" role="presentation">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
    </>
  )
  if (onClick !== undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-card p-3.5 text-left text-foreground transition-all ${t.border}`}
      >
        {body}
      </button>
    )
  }
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-card p-3.5 transition-all ${t.border} ${className}`}
    >
      {body}
    </div>
  )
}
