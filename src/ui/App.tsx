import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Boxes,
  ChartSpline,
  FolderOpen,
  ListTree,
  Network,
  PenLine,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import Landing from './chrome/Landing'
import ParseStepper from './chrome/ParseStepper'
import ThemeToggle from './chrome/ThemeToggle'
import KpiCard, { type KpiTone } from './chrome/KpiCard'
import ObjectGrid from './grid/ObjectGrid'
import PrepForAi from './prep/PrepForAi'
import LineageCanvas from './lineage/LineageCanvas'
import { useStore, type Kpi, type TabId } from '../state/store'

const TAB_IDS: TabId[] = ['desc', 'ai', 'rel']

interface TabDef {
  id: TabId
  label: string
  icon: LucideIcon
}

const TABS: TabDef[] = [
  { id: 'desc', label: 'Description & Update', icon: ListTree },
  { id: 'ai', label: 'Prep for AI', icon: Sparkles },
  { id: 'rel', label: 'Relationships', icon: Network },
]

interface DescCard {
  label: string
  tone: KpiTone
  icon: LucideIcon
  text: string
}

// FR-37 Description-tab KPI set (wired to the store + graph). The Prep-for-AI
// and Relationships card sets are left as hooks — they land in 7.4 / 7.5.
const DESC_CARDS: DescCard[] = [
  {
    label: 'Objects',
    tone: 'blue',
    icon: Boxes,
    text: 'Every table, column, measure and calc item in the model.',
  },
  {
    label: 'Backlog',
    tone: 'amber',
    icon: TriangleAlert,
    text: 'No description yet. Copilot reads descriptions first.',
  },
  {
    label: 'Unused',
    tone: 'sky',
    icon: Trash2,
    text: 'Zero downstream references anywhere in the lineage graph.',
  },
  {
    label: 'Pending edits',
    tone: 'cyan',
    icon: PenLine,
    text: 'Edits staged this session, not yet written to disk.',
  },
  {
    label: 'Coverage',
    tone: 'emerald',
    icon: ShieldCheck,
    text: 'Share of objects that already carry a description.',
  },
]

// Dev-only seam so the render-smoke / e2e harness can load a fixture project
// through the store (production behaviour is unchanged: no project → landing).
if (import.meta.env.DEV) {
  // Named cast: cross-boundary global (window) augmentation for the harness.
  const devWindow = window as typeof window & { __pbiStore?: typeof useStore }
  devWindow.__pbiStore = useStore
}

interface AppShellProps {
  readOnly: boolean
  projectName: string
  kpi: Kpi
  activeTab: TabId
  setActiveTab(tab: TabId): void
  tabRefs: { current: Record<TabId, HTMLButtonElement | null> }
}

/**
 * The app shell once a project is loaded. DEFINED AT MODULE SCOPE: defining it
 * inside App would mint a fresh component type on every App render, which
 * unmounts and remounts the whole shell on any store write — resetting the
 * prep sub-tab and the schema explorer's expansion on every edit.
 */
function AppShell({ readOnly, projectName, kpi, activeTab, setActiveTab, tabRefs }: AppShellProps) {
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: TabId) => {
    const idx = TAB_IDS.indexOf(id)
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % TAB_IDS.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TAB_IDS.length) % TAB_IDS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TAB_IDS.length - 1
    else return
    e.preventDefault()
    const target = TAB_IDS[next]
    setActiveTab(target)
    tabRefs.current[target]?.focus()
  }

  const kpiValue = (id: keyof typeof kpi) => kpi[id]
  const cardValue = (card: DescCard) => {
    switch (card.tone) {
      case 'blue':
        return kpiValue('total')
      case 'amber':
        return kpiValue('missingDescription')
      case 'sky':
        return kpiValue('unused')
      case 'cyan':
        return kpiValue('pendingEdits')
      case 'emerald':
        return (
          <>
            {kpi.coverage}
            <span className="text-[15px] font-semibold text-foreground/55">%</span>
          </>
        )
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="flex h-[52px] flex-none items-center gap-3 border-b border-border bg-card px-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-sky))' }}
          >
            <ChartSpline className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
          </div>
          <span className="hidden text-[13.5px] font-bold tracking-tight sm:block">PBI AI Prep</span>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <button type="button" className="chip gap-2 !bg-secondary !border-transparent">
          <FolderOpen className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          <span className="max-w-[190px] truncate text-[12px] font-semibold text-foreground">
            {projectName}
          </span>
          <span className="pill t-emerald ml-0.5 !text-[10px]">live</span>
        </button>

        <nav className="mx-auto flex items-center gap-1" role="tablist" aria-label="Model surfaces">
          {TABS.map((tab) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className="tab"
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => onTabKeyDown(e, tab.id)}
              >
                <tab.icon className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
                {tab.label}
                {tab.id === 'desc' && (
                  <span className="mono pill pill-flat t-slate !text-[10px]">{kpiValue('total')}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${readOnly ? 'text-amber' : 'text-foreground/55'}`}>
            {readOnly ? 'Read-only' : `${kpi.pendingEdits} pending`}
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={readOnly}>
            <Save className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
            Save
          </button>
          <ThemeToggle />
        </div>
      </header>

      {readOnly && (
        <div className="flex items-center gap-2 border-b border-amber/24 bg-amber/9 px-4 py-2 text-[11.5px] text-foreground/70">
          <TriangleAlert className="h-3.5 w-3.5 flex-none text-amber" aria-hidden="true" />
          Write access was declined — the model is read-only. Save and edit controls are
          disabled; everything stays visible for review.
        </div>
      )}

      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {/* Description & Update */}
        <section
          role="tabpanel"
          id="panel-desc"
          aria-labelledby="tab-desc"
          hidden={activeTab !== 'desc'}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="grid flex-none grid-cols-2 gap-3 px-4 pt-3.5 pb-3 lg:grid-cols-5">
            {DESC_CARDS.map((card, i) => (
              <KpiCard
                key={card.label}
                label={card.label}
                tone={card.tone}
                icon={<card.icon className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />}
                value={cardValue(card)}
                definition={card.text}
                progress={card.tone === 'emerald' ? kpi.coverage : null}
                className={i === 4 ? 'col-span-2 lg:col-span-1' : ''}
              />
            ))}
          </div>
          <ObjectGrid />
        </section>

        {/* Prep for AI */}
        <section
          role="tabpanel"
          id="panel-ai"
          aria-labelledby="tab-ai"
          hidden={activeTab !== 'ai'}
          className="flex min-h-0 flex-1 flex-col"
        >
          <PrepForAi />
        </section>

        {/* Relationships */}
        <section
          role="tabpanel"
          id="panel-rel"
          aria-labelledby="tab-rel"
          hidden={activeTab !== 'rel'}
          className="flex min-h-0 flex-1 flex-col"
        >
          <LineageCanvas />
        </section>
      </main>

      <footer className="flex h-8 flex-none items-center gap-3 border-t border-border bg-card px-4 text-[11px] text-foreground/55">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
          chromium · file-system-access
        </span>
        <span className="opacity-40">·</span>
        <span className="mono">TMDL 4.2.0</span>
        <span className="opacity-40">·</span>
        <span className="mono">UTF-8 · CRLF</span>
        <span className="ml-auto mono">v1.0.0</span>
      </footer>
    </div>
  )
}

export default function App() {
  const projectName = useStore((s) => s.project.name)
  const kpi = useStore((s) => s.kpi)
  const permission = useStore((s) => s.permission)
  const layers = useStore((s) => s.layers)

  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const [phase, setPhase] = useState<'landing' | 'parse'>('landing')
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    desc: null,
    ai: null,
    rel: null,
  })

  const hasProject = projectName !== ''
  const layersActive = Object.values(layers).some((l) => l.parseState !== 'idle')
  const readOnly = permission === 'denied'

  // Once a project is loaded the app shell owns the screen; if it is later
  // cleared the phase returns to the landing (parse pending state is transient).
  useEffect(() => {
    if (hasProject && phase === 'parse') setPhase('landing')
  }, [hasProject, phase])

  const openFolder = () => setPhase('parse')

  let body
  if (hasProject) {
    body = (
      <AppShell
        readOnly={readOnly}
        projectName={projectName}
        kpi={kpi}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tabRefs={tabRefs}
      />
    )
  } else if (phase === 'parse' || layersActive) {
    body = <ParseStepper />
  } else {
    body = <Landing onOpened={openFolder} />
  }

  return body
}
