import { Check, Circle, Loader2, TriangleAlert } from 'lucide-react'
import { useStore, type LayerName, type ParseState } from '../../state/store'

/** A parse pipeline stage, bound to a real store layer (or the primary object load). */
interface Stage {
  id: string
  label: string
  /** The store layer that drives this stage; `'objects'` uses the primary load. */
  layer: LayerName | 'objects'
}

const STAGES: Stage[] = [
  { id: 'definition', label: 'Definition tree', layer: 'objects' },
  { id: 'objects', label: 'Model objects', layer: 'objects' },
  { id: 'lineage', label: 'Lineage graph', layer: 'lineage' },
  { id: 'report', label: 'Report layer', layer: 'report' },
]

/** Best-effort live count from a layer's committed plain-domain data. */
function countFromData(data: unknown): number {
  if (Array.isArray(data)) return data.length
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>
    if (typeof rec.count === 'number') return rec.count
    if (rec.entities && typeof rec.entities === 'object') {
      return Object.keys(rec.entities as object).length
    }
    if (rec.visualEdges && Array.isArray(rec.visualEdges)) return rec.visualEdges.length
    if (rec.edges && Array.isArray(rec.edges)) return rec.edges.length
  }
  return 0
}

/** Per-state dot glyph, matching the mockup's stage circles. */
function StateDot({ state }: { state: ParseState }) {
  if (state === 'ready') {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }
  if (state === 'parsing') {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-primary/30 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber text-foreground">
        <TriangleAlert className="h-3 w-3" strokeWidth={2.6} aria-hidden="true" />
      </span>
    )
  }
  return <Circle className="h-[18px] w-[18px] text-foreground/25" strokeWidth={2} aria-hidden="true" />
}

/**
 * FR-35 parsing stepper: four live stages (definition tree / model objects /
 * lineage graph / report layer) driven by the REAL per-layer `parseState` and
 * live counts from `layers[<layer>].data`, plus an overall progress bar.
 */
export default function ParseStepper() {
  const layers = useStore((s) => s.layers)
  const objectCount = useStore((s) => s.project.objects.length)

  const stages = STAGES.map((stage) => {
    if (stage.layer === 'objects') {
      // The definition tree and model objects BOTH derive from the primary
      // `objects` parse (AD-7), so stage 1 + 2 share its parseState and live
      // count — real progress during the load instead of a static flash.
      return {
        ...stage,
                                // The stepper only renders during the primary `objects` parse, and that
        // parse is atomic — nothing lands in the store until it finishes. So
        // while `objectCount === 0` we are DEFINITELY mid-load: force 'parsing'
        // so the spinner animates instead of a frozen idle circle + '0'. Once
        // objects land the stepper leaves the screen (App flips to the grid).
                state: (objectCount > 0 ? 'ready' : 'parsing') as ParseState,
        count: objectCount,
      }
    }
    const layer = layers[stage.layer as LayerName]
    return { ...stage, state: layer.parseState, count: countFromData(layer.data) }
  })

  const ready = stages.filter((s) => s.state === 'ready').length
  const pct = stages.length === 0 ? 0 : Math.round((ready / stages.length) * 100)

  return (
    <div className="mesh flex h-full w-full items-center justify-center p-6">
      <div className="card elev-lg w-full max-w-[420px] p-7 text-center">
        <div className="mb-5">
          <div className="mb-1 text-[15px] font-bold">Preparing your model</div>
          <div className="text-[12.5px] text-foreground/60 mono tabular-nums">
            {ready}/{stages.length} stages ready
          </div>
        </div>

        <div className="mb-6 space-y-2.5 text-left">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-2.5 text-[12.5px]">
              <StateDot state={stage.state} />
              <span>{stage.label}</span>
              <span className="ml-auto mono tabular-nums text-[11.5px] text-foreground/55">
                {formatCount(stage.count)}
              </span>
            </div>
          ))}
        </div>

        <div className="bar mb-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[11px] text-foreground/60">
          Nothing leaves your machine — parsing runs locally.
        </div>
      </div>
    </div>
  )
}

function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}
