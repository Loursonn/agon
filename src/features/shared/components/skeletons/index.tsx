/**
 * Shared skeleton components.
 * Use these instead of spinners or "Loading..." text.
 * All use shadcn Skeleton (animate-pulse) with dark theme colors.
 */
import { Skeleton } from "@/components/ui/skeleton";

const PANEL = "border border-agon-tx/[0.06] bg-agon-s1";

// ── PageSkeleton ──────────────────────────────────────────────────────────────
/** Full-page loading state — header + 3 content blocks */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12 pt-6">
      <Skeleton className="mb-2 h-7 w-48 bg-agon-tx/[0.06]" />
      <Skeleton className="mb-8 h-4 w-32 bg-agon-tx/[0.04]" />
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="mb-3 h-4 w-24 bg-agon-tx/[0.04]" />
      <ListSkeleton rows={5} />
    </div>
  );
}

// ── CardSkeleton ──────────────────────────────────────────────────────────────
/** Single metric/info card loading state */
export function CardSkeleton() {
  return (
    <div className={`${PANEL} rounded-[6px] p-4`}>
      <Skeleton className="mb-3 h-3 w-20 bg-agon-tx/[0.06]" />
      <Skeleton className="mb-2 h-8 w-16 bg-agon-tx/[0.08]" />
      <Skeleton className="h-3 w-28 bg-agon-tx/[0.04]" />
    </div>
  );
}

// ── TableSkeleton ─────────────────────────────────────────────────────────────
/** Table/list with header row loading state */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  const grid = { gridTemplateColumns: `repeat(${cols}, 1fr)` };
  return (
    <div className={`${PANEL} overflow-hidden rounded-[6px]`}>
      {/* Header */}
      <div className="grid gap-3 border-b border-agon-tx/[0.06] px-4 py-3" style={grid}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3 bg-agon-tx/[0.06] ${i === 0 ? "w-[70%]" : "w-1/2"}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={`grid gap-3 px-4 py-3 ${r < rows - 1 ? "border-b border-agon-tx/[0.04]" : ""}`}
          style={grid}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 bg-agon-tx/[0.05] ${c === 0 ? "w-4/5" : "w-3/5"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── ChartSkeleton ─────────────────────────────────────────────────────────────
/** Chart/graph area loading state */
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className={`${PANEL} rounded-[6px] p-4`}>
      <Skeleton className="mb-2 h-3 w-28 bg-agon-tx/[0.06]" />
      <Skeleton className="mb-4 h-3 w-16 bg-agon-tx/[0.04]" />
      <Skeleton className="rounded-[4px] bg-agon-tx/[0.05]" style={{ height }} />
    </div>
  );
}

// ── ListSkeleton ──────────────────────────────────────────────────────────────
/** Vertical list of items loading state */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${PANEL} flex items-center gap-3 rounded-[4px] px-4 py-3`}>
          <Skeleton className="size-9 shrink-0 rounded-full bg-agon-tx/[0.06]" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-3.5 bg-agon-tx/[0.07]" style={{ width: `${60 + (i % 3) * 10}%` }} />
            <Skeleton className="h-3 bg-agon-tx/[0.04]" style={{ width: `${40 + (i % 2) * 15}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
