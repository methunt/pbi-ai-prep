// FR-10 pagination: 50/page, ellipsis pager, prev/next, "Showing X–Y of Z".
// The ellipsis windowing algorithm mirrors the mockup's renderPager.
export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

interface PageItem {
  kind: 'num' | 'dots'
  value: number
}

function pageList(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, k) => ({ kind: 'num', value: k + 1 }))
  }
  const items: PageItem[] = [{ kind: 'num', value: 1 }]
  let lo = Math.max(2, page - 1)
  let hi = Math.min(pageCount - 1, page + 1)
  if (page <= 3) {
    lo = 2
    hi = 4
  }
  if (page >= pageCount - 2) {
    lo = pageCount - 3
    hi = pageCount - 1
  }
  if (lo > 2) items.push({ kind: 'dots', value: -1 })
  for (let p = lo; p <= hi; p++) items.push({ kind: 'num', value: p })
  if (hi < pageCount - 1) items.push({ kind: 'dots', value: -2 })
  items.push({ kind: 'num', value: pageCount })
  return items
}

export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clamped = Math.min(Math.max(1, page), pageCount)
  const start = total ? (clamped - 1) * pageSize : 0
  const end = Math.min(start + pageSize, total)

  const prevDisabled = clamped <= 1
  const nextDisabled = clamped >= pageCount

  const items = pageList(clamped, pageCount)

  const num = (p: number) => (
    <button
      key={p}
      type="button"
      className={`pgbtn${p === clamped ? ' cur' : ''}`}
      aria-label={`Page ${p}`}
      aria-current={p === clamped ? 'page' : undefined}
      onClick={() => onPageChange(p)}
    >
      {p}
    </button>
  )

  return (
    <div className="flex items-center gap-3 px-3.5 py-2">
      <span className="tabular text-[11.5px] text-foreground/55" aria-live="polite">
        Showing <b className="text-foreground">{total ? start + 1 : 0}–{end}</b> of{' '}
        <b className="text-foreground">{total.toLocaleString()}</b>
      </span>
      <div className="ml-auto flex items-center gap-1" role="navigation" aria-label="Pagination">
        {pageCount > 1 && (
          <>
            <button
              type="button"
              className="pgbtn"
              aria-label="Previous page"
              disabled={prevDisabled}
              onClick={() => onPageChange(clamped - 1)}
            >
              ‹
            </button>
            {items.map((it) =>
              it.kind === 'dots' ? (
                <span key={it.value} className="pgdots" aria-hidden="true">
                  …
                </span>
              ) : (
                num(it.value)
              ),
            )}
            <button
              type="button"
              className="pgbtn"
              aria-label="Next page"
              disabled={nextDisabled}
              onClick={() => onPageChange(clamped + 1)}
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  )
}
