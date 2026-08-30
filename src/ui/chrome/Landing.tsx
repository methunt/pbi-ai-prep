import { useCallback, useEffect, useState } from 'react'
import {
  ChartSpline,
  FolderOpen,
  ListTree,
  Network,
  PenLine,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import {
  isSupported,
  listRecent,
  persistHandle,
  pickFolder,
  requestPermission,
  type RecentFolder,
} from '../../fs/access'
import { useStore } from '../../state/store'
import ThemeToggle from './ThemeToggle'

interface LandingProps {
  /** Called once a folder is opened (handle + permission settled). */
  onOpened: (handle: FileSystemDirectoryHandle, name: string) => void
}

/** Fielded feature card for the pitch column. */
interface Feature {
  icon: typeof ListTree
  title: string
  desc: string
  /** Tailwind tint classes (token-bound). */
  block: string
  text: string
}

const FEATURES: Feature[] = [
  {
    icon: ListTree,
    title: 'Bulk descriptions',
    desc: 'Type down 2,000 rows. Keyboard only.',
    block: 'bg-primary/12',
    text: 'text-primary',
  },
  {
    icon: Sparkles,
    title: 'Copilot instructions',
    desc: 'Synonyms, AI schema, 10k budget.',
    block: 'bg-cyan/12',
    text: 'text-cyan',
  },
  {
    icon: Network,
    title: 'Real lineage',
    desc: 'Every edge. Find what nothing uses.',
    block: 'bg-sky/12',
    text: 'text-sky',
  },
]

const TRUST = ['100% local parsing', 'Byte-exact TMDL', 'Reviewable Git diff']

/** Best-effort human engine label for the capability badge (FR-34). */
function engineName(): string {
  if (typeof navigator === 'undefined') return 'this browser'
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'this browser'
}

/** FR-34 landing: product pitch + capability badge + open-with-rationale + recents. */
export default function Landing({ onOpened }: LandingProps) {
  const permission = useStore((s) => s.permission)
  const setPermission = useStore((s) => s.setPermission)
  const [recents, setRecents] = useState<RecentFolder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = isSupported()

  const refreshRecents = useCallback(async () => {
    try {
      setRecents(await listRecent())
    } catch {
      setRecents([])
    }
  }, [])

  useEffect(() => {
    void refreshRecents()
  }, [refreshRecents])

  /** Settle a handle's write permission and push the app into the parse phase. */
  const settleAndOpen = useCallback(
    async (handle: FileSystemDirectoryHandle, name: string) => {
      await persistHandle(handle, name)
      const perm = await requestPermission(handle)()
      setPermission(perm === 'granted' ? 'granted' : 'denied')
      await refreshRecents()
      onOpened(handle, name)
    },
    [onOpened, refreshRecents, setPermission],
  )

  const openPicker = async () => {
    setBusy(true)
    setError(null)
    try {
      const picked = await pickFolder()
      await settleAndOpen(picked.handle, picked.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const openRecent = async (folder: RecentFolder) => {
    setBusy(true)
    setError(null)
    try {
      await settleAndOpen(folder.handle, folder.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mesh flex h-full w-full items-center justify-center p-6">
      <div className="grid w-full max-w-[1080px] items-stretch gap-6 lg:grid-cols-[1.15fr_.85fr]">
        {/* pitch */}
        <div className="flex flex-col justify-center">
          <div className="mb-7 flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-sky))' }}
            >
              <ChartSpline className="h-[18px] w-[18px] text-primary-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="text-[15px] font-extrabold leading-none tracking-tight">PBI AI Prep</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-foreground/55">
                Semantic model studio
              </div>
            </div>
          </div>

          <h1 className="mb-4 text-[38px] leading-[1.1] font-extrabold tracking-[-.02em]">
            Make your Power BI model
            <br />
            <span
              className="bg-gradient-to-r from-primary to-cyan bg-clip-text text-transparent"
            >
              AI-ready
            </span>{' '}
            in one pass.
          </h1>
          <p className="mb-7 max-w-[52ch] text-[14.5px] leading-relaxed text-foreground/60">
            Bulk-edit descriptions, write the Copilot instructions your business actually speaks,
            and see what every field touches — straight from a folder on your disk. Nothing
            uploaded. Nothing installed.
          </p>

          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-3.5">
                <div
                  className={`mb-2.5 flex h-7 w-7 items-center justify-center rounded-lg ${f.block} ${f.text}`}
                >
                  <f.icon className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
                </div>
                <div className="mb-0.5 text-[12.5px] font-semibold">{f.title}</div>
                <div className="text-[11.5px] leading-snug text-foreground/55">{f.desc}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-5 text-[11.5px] text-foreground/60">
            {TRUST.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald" strokeWidth={2.6} aria-hidden="true" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* open panel */}
        <div className="card elev-lg flex flex-col p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="lbl">Open a project</div>
            <ThemeToggle />
          </div>

          {/* capability badge */}
          {supported ? (
            <div
              className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-emerald/24 bg-emerald/9 p-3"
            >
              <ShieldCheck className="mt-[1px] h-4 w-4 flex-none text-emerald-600" strokeWidth={2.4} aria-hidden="true" />
              <div>
                <div className="text-[12.5px] font-semibold text-emerald">
                  {engineName()} — fully supported
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-foreground/60">
                  File System Access API available. Edits save directly to disk.
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-amber/28 bg-amber/9 p-3">
              <TriangleAlert className="mt-[1px] h-4 w-4 flex-none text-amber" strokeWidth={2.4} aria-hidden="true" />
              <div>
                <div className="text-[12.5px] font-semibold text-amber">Unsupported browser</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-foreground/60">
                  Please use Chrome, Edge, or Opera — the File System Access API is unavailable
                  here, so this tool cannot open a local folder.
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary mb-2.5 w-full justify-center !py-3 !text-[13.5px]"
            onClick={openPicker}
            disabled={!supported || busy}
          >
            <FolderOpen className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            {busy ? 'Opening…' : 'Open PBIP folder'}
          </button>
          <p className="mb-5 px-0.5 text-[11px] leading-snug text-foreground/60">
            Your browser will ask for <span className="font-semibold text-foreground">write access</span>{' '}
            so description and instruction edits save straight into your local PBIP files. Decline
            and the app stays read-only.
          </p>

          {permission === 'denied' && (
            <div className="mb-5 rounded-[10px] border border-amber/28 bg-amber/9 p-3 text-[11.5px] leading-snug text-foreground/70">
              <span className="font-semibold text-amber-600">Read-only</span> — write access was
              declined. You can still review the model; edit controls stay visible but disabled.
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-[10px] border border-amber/28 bg-amber/9 p-3 text-[11.5px] leading-snug text-foreground/70">
              {error}
            </div>
          )}

          <div className="lbl mb-2.5">Recent</div>
          {recents.length === 0 ? (
            <div className="mb-2 text-[11.5px] text-foreground/55">No recent projects yet.</div>
          ) : (
            <div className="space-y-2">
              {recents.map((folder) => (
                <button
                  key={folder.name}
                  type="button"
                  className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-primary/45"
                  onClick={() => openRecent(folder)}
                >
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <FolderOpen className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">{folder.name}</div>
                    <div className="mono text-[11px] text-foreground/55">local folder</div>
                  </div>
                  <PenLine className="h-4 w-4 flex-none text-foreground/55" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-5 text-[11px] text-foreground/55">
            <span className="mono">TMDL 4.2</span>
            <span className="opacity-40">·</span>
            <span className="mono">PBIR 2.3</span>
            <span className="opacity-40">·</span>
            <span className="mono">LSDL 4.2.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
