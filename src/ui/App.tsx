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
import ThemeToggle from './chrome/ThemeToggle'
import ErrorBoundary from './chrome/ErrorBoundary'
import KpiCard, { type KpiTone } from './chrome/KpiCard'
import ObjectGrid from './grid/ObjectGrid'
import PrepForAi from './prep/PrepForAi'
import LineageCanvas from './lineage/LineageCanvas'
import { useStore, type Kpi, type TabId } from '../state/store'
import { loadProject } from '../fs/load'
import { saveWrites, reloadConflicts, bindRootHandle } from '../state/save'
import type { SaveOutcome } from '../state/save'

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
  const permission = useStore((s) => s.permission)
  const journal = useStore((s) => s.journal)
  const [saving, setSaving] = useState(false)
  const [saveOutcome, setSaveOutcome] = useState<SaveOutcome | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)

  const saveDisabled = permission !== 'granted' || journal.length === 0 || saving

  const handleSave = async (overwrite = false): Promise<void> => {
    setSaving(true)
    setSavedNotice(false)
    try {
      const outcome = await saveWrites({ overwrite })
      if (outcome.status === 'success') {
        setSaveOutcome(null)
        setSavedNotice(true)
        window.setTimeout(() => setSavedNotice(false), 2500)
      } else {
        setSaveOutcome(outcome)
      }
    } catch (err) {
      setSaveOutcome({
        status: 'error',
        written: [],
        conflicts: [],
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReload = async (): Promise<void> => {
    if (saveOutcome?.status !== 'conflict') return
    await reloadConflicts(saveOutcome.conflicts)
    setSaveOutcome(null)
  }

  const handleRetryPermission = async (): Promise<void> => {
    if (saveOutcome?.status !== 'permission') return
    const retry = saveOutcome.retryRequestPermission
    if (!retry) return
    setSaveOutcome(null)
    const status = await retry()
    if (status === 'granted') void handleSave(false)
  }

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
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saveDisabled}
            onClick={() => void handleSave(false)}
          >
            <Save className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </button>
          <ThemeToggle />
        </div>
        {savedNotice && (
          <span className="pill t-emerald !text-[10px]" role="status" aria-live="polite">
            Saved
          </span>
        )}
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
          <ErrorBoundary label="Description & Update">
            <ObjectGrid />
          </ErrorBoundary>
        </section>

        {/* Prep for AI */}
        <section
          role="tabpanel"
          id="panel-ai"
          aria-labelledby="tab-ai"
          hidden={activeTab !== 'ai'}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ErrorBoundary label="Prep for AI">
            <PrepForAi />
          </ErrorBoundary>
        </section>

        {/* Relationships */}
        <section
          role="tabpanel"
          id="panel-rel"
          aria-labelledby="tab-rel"
          hidden={activeTab !== 'rel'}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ErrorBoundary label="Relationships">
            <LineageCanvas />
          </ErrorBoundary>
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
        <span className="opacity-40">·</span>
        <span className="mono">MIT · parsers: lineage-tracer, pbip-documenter</span>
        <span className="ml-auto mono">v1.0.0</span>
      </footer>

      {saveOutcome?.status === 'conflict' && (
        <div className="mesh fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="card elev-lg w-full max-w-[460px] p-6">
            <div className="mb-1 text-[15px] font-bold">Files changed on disk</div>
            <div className="mb-3 text-[12.5px] leading-snug text-foreground/60">
              These files changed outside this session since they were loaded. Reload discards
              only that file&apos;s pending edits; Write anyway overwrites the on-disk change.
            </div>
            <ul className="mb-4 max-h-[180px] space-y-1 overflow-auto">
              {saveOutcome.conflicts.map((f) => (
                <li key={f} className="mono truncate text-[11.5px] text-foreground/80">{f}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => void handleReload()}>
                Reload from disk
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSaveOutcome(null)
                  void handleSave(true)
                }}
              >
                Write anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {saveOutcome?.status === 'permission' && (
        <div className="mesh fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="card elev-lg w-full max-w-[460px] p-6">
            <div className="mb-1 text-[15px] font-bold">Write access needed</div>
            <div className="mb-3 text-[12.5px] leading-snug text-foreground/60">
              {saveOutcome.message ?? 'Re-request read/write permission to finish saving.'}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setSaveOutcome(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleRetryPermission()}>
                Grant access &amp; retry
              </button>
            </div>
          </div>
        </div>
      )}

      {saveOutcome?.status === 'error' && (
        <div className="mesh fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="card elev-lg w-full max-w-[460px] p-6">
            <div className="mb-1 text-[15px] font-bold">Could not save</div>
            <div className="mb-4 text-[12.5px] leading-snug text-foreground/60">{saveOutcome.message}</div>
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" onClick={() => setSaveOutcome(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const openFolder = async (handle: FileSystemDirectoryHandle, name: string) => {
    setPhase('parse')
    setLoadError(null)
    try {
      // Bind the picked handle so the Save orchestrator can read/check/write.
      bindRootHandle(handle)
      // Walk the picked PBIP tree and request the workerized `objects` parse.
      // The broker commits the parsed project via setProject (AD-7); the grid
      // renders once the store has it. The parse itself runs OFF the main thread
      // (FR-8) and any per-file errors still load the remaining files (FR-5).
      await loadProject(handle, name)
    } catch (err) {
      // FR-2 rejection (no semantic model) or a hard worker failure — surface a
      // readable error and return to the landing.
      setLoadError(err instanceof Error ? err.message : String(err))
      setPhase('landing')
    }
  }

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
  } else if (loadError) {
    body = (
      <div className="mesh flex h-full w-full items-center justify-center p-6">
        <div className="card elev-lg w-full max-w-[420px] p-7 text-center">
          <TriangleAlert
            className="mx-auto mb-3 h-6 w-6 text-amber"
            strokeWidth={2.4}
            aria-hidden="true"
          />
          <div className="mb-1 text-[15px] font-bold">Could not open this folder</div>
          <div className="mb-4 text-[12.5px] leading-snug text-foreground/60">{loadError}</div>
          <button type="button" className="btn btn-primary" onClick={() => setLoadError(null)}>
            Back to Open
          </button>
        </div>
      </div>
    )
  } else if (phase === 'parse' || layersActive) {
    body = <Landing onOpened={openFolder} loading />
  } else {
    body = <Landing onOpened={openFolder} />
  }

  return body
}
