// PrepForAi (Task 7.4) — the Prep-for-AI surface shell.
//
// Renders the AI KPI row, the FR-38 sub-tab selector below it, and the two
// views: 'AI instructions' (full-height editor + read-only verified-answers
// rail) and 'AI schema & synonyms' (table-level explorer). All LSDL edits go
// through the journal with the write-planner's sanctioned fields
// (customInstructions / synonyms / lsdlVisibility). Read-only (permission !==
// 'granted') disables every write (visible, never hidden).
import { useMemo, useState } from 'react'
import { CheckCircle2, EyeOff, Network, PenLine, Tags } from 'lucide-react'
import { useStore } from '../../state/store'
import KpiCard from '../chrome/KpiCard'
import type { LSDL } from '../../parse/lsdl-reader'
import type { ReportParse } from '../../parse/pbir-reader'
import type { FieldJournalRecord } from '../../domain/journal'
import SubTabSelector from './SubTabSelector'
import InstructionsEditor from './InstructionsEditor'
import VerifiedRail from './VerifiedRail'
import SchemaExplorer from './SchemaExplorer'
import {
  EMPTY_LSDL,
  INSTRUCTIONS_OBJECT_ID,
  buildAiRows,
  liveTerms,
  type AiSubTab,
} from './lsdlModel'

export default function PrepForAi() {
  const layers = useStore((s) => s.layers)
  const project = useStore((s) => s.project)
  const pristine = useStore((s) => s.pristine)
  const journal = useStore((s) => s.journal)
  const [active, setActive] = useState<AiSubTab>('instr')

  const lsdl = (layers.lsdl.data as LSDL | undefined) ?? EMPTY_LSDL
  const report = layers.report.data as ReportParse | undefined

  const rows = useMemo(
    () => buildAiRows(lsdl, project.objects, pristine, journal),
    [lsdl, project.objects, pristine, journal],
  )

  const kpi = useMemo(() => {
    const included = rows.filter((r) => !r.hidden).length
    const excluded = rows.length - included
    const synonyms = rows.reduce((acc, r) => acc + liveTerms(r.terms).length, 0)
    const stagedInstructions = journal.find(
      (r): r is FieldJournalRecord =>
        r.kind === 'field' &&
        r.objectId === INSTRUCTIONS_OBJECT_ID &&
        r.field === 'customInstructions',
    )
    const budget =
      stagedInstructions !== undefined && typeof stagedInstructions.new === 'string'
        ? stagedInstructions.new.length
        : lsdl.customInstructions.length
    return { included, total: rows.length, excluded, synonyms, budget }
  }, [rows, journal, lsdl.customInstructions])

  const verifiedAnswers = report?.verifiedAnswers ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Premium AI KPI row */}
      <div className="grid flex-none grid-cols-2 gap-3 px-4 pb-3 pt-3.5 lg:grid-cols-5">
        <KpiCard
          label="AI reach"
          tone="cyan"
          icon={<Network className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />}
          value={
            <span>
              {kpi.included}
              <span className="text-[15px] font-semibold text-foreground/60">/{kpi.total}</span>
            </span>
          }
          definition="Fields Copilot is allowed to see and query."
          progress={kpi.total === 0 ? 0 : Math.round((kpi.included / kpi.total) * 100)}
        />
        <KpiCard
          label="Budget"
          tone="blue"
          icon={<PenLine className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />}
          value={kpi.budget.toLocaleString()}
          definition="Characters used of the 10,000 Copilot limit."
        />
        <KpiCard
          label="Synonyms"
          tone="sky"
          icon={<Tags className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />}
          value={kpi.synonyms}
          definition="Business terms you authored, per field, max 20."
        />
        <KpiCard
          label="Excluded"
          tone="amber"
          icon={<EyeOff className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />}
          value={kpi.excluded}
          definition="Deliberately hidden so Copilot cannot guess with them."
        />
        <KpiCard
          label="Verified"
          tone="emerald"
          icon={<CheckCircle2 className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />}
          value={verifiedAnswers.length}
          definition="Frozen question-to-visual pairs authored in Power BI."
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <SubTabSelector
        active={active}
        onChange={setActive}
        schemaCount={{ included: kpi.included, total: kpi.total }}
      />

      <div className="mx-4 mb-3 flex min-h-0 flex-1 flex-col">
        <div
          id="ai-panel-instr"
          role="tabpanel"
          aria-label="AI instructions"
          className={active === 'instr' ? 'grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-4' : 'hidden'}
        >
          <InstructionsEditor lsdl={lsdl} />
          <VerifiedRail verifiedAnswers={verifiedAnswers} />
        </div>
        <div
          id="ai-panel-schema"
          role="tabpanel"
          aria-label="AI schema and synonyms"
          className={active === 'schema' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
        >
          <SchemaExplorer lsdl={lsdl} />
        </div>
      </div>
    </div>
  )
}
