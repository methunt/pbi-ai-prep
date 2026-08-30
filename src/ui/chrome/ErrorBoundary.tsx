// A render-time exception anywhere in a wrapped subtree used to unmount that
// whole subtree with NO visible feedback — the header/KPI bar (separate
// components) kept rendering while the grid/prep/lineage body went silently
// blank. Wrap each tab's body so a crash surfaces as a readable error instead
// of vanishing.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown in the fallback so the crash site is obvious without devtools. */
  label: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- the one legitimate console use: surfacing an otherwise-silent crash.
    console.error(`[${this.props.label}] render crashed:`, error, info.componentStack)
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <TriangleAlert className="h-8 w-8 text-destructive" strokeWidth={2} aria-hidden="true" />
        <div className="text-[13px] font-bold">{this.props.label} hit an unexpected error</div>
        <div className="max-w-[520px] text-[12px] text-foreground/60">
          {error.message} — open devtools console for the full stack. Your project data is
          untouched; nothing has been saved to disk.
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={this.reset}>
          Try again
        </button>
      </div>
    )
  }
}
