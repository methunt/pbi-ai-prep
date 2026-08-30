// VerifiedRail (FR-18) — the read-only rail to the right of the AI instructions
// editor. It lists the frozen question-to-visual pairs authored in Power BI
// (read from the report layer's VerifiedAnswers/definitions/<guid>/definition.json),
// so the user never writes instructions that contradict them. Always read-only —
// these are authored in Power BI, never edited here. Empty state when the
// report carries none.
import { CheckCircle2 } from 'lucide-react'
import type { VerifiedAnswer } from '../../parse/pbir-reader'

interface VerifiedRailProps {
  verifiedAnswers: VerifiedAnswer[]
}

export default function VerifiedRail({ verifiedAnswers }: VerifiedRailProps) {
  return (
    <div className="card flex min-h-0 flex-col overflow-hidden" style={{ borderRadius: '1rem' }}>
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
        <div
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
          style={{
            background: 'color-mix(in srgb, var(--color-emerald) 12%, transparent)',
            color: 'var(--color-emerald)',
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-none">Verified answers</h3>
          <div className="mt-1 text-[11px] text-foreground/60">
            {verifiedAnswers.length} · read-only
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-border overflow-auto">
        {verifiedAnswers.length === 0 ? (
          <div className="px-3.5 py-4 text-[11.5px] leading-snug text-foreground/55">
            No verified answers yet. Pairs authored in Power BI appear here so your
            instructions do not contradict them.
          </div>
        ) : (
          verifiedAnswers.map((answer) => (
            <div key={answer.guid} className="px-3.5 py-3">
              <div className="text-[12.5px] font-semibold leading-snug">{answer.prompt}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-foreground/60">
                {answer.visualType !== undefined ? (
                  <span className="pill pill-flat t-cyan !text-[10px]">{answer.visualType}</span>
                ) : (
                  <span className="pill pill-flat t-slate !text-[10px]">visual</span>
                )}
                {answer.otherPrompts > 0 && <span>+{answer.otherPrompts} prompts</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border px-3.5 py-2.5 text-[10.5px] leading-snug text-foreground/60">
        Authored in Power BI. Shown here so instructions do not contradict them.
      </div>
    </div>
  )
}
