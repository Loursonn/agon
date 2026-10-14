/**
 * Shared skeleton components.
 * Use these instead of spinners or "Loading..." text.
 * All use shadcn Skeleton (animate-pulse) with dark theme colors.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { C } from "@/lib/theme";

// ── PageSkeleton ──────────────────────────────────────────────────────────────
/** Full-page loading state — header + 3 content blocks */
export function PageSkeleton() {
  return (
    <div style={{ padding: "24px 24px 48px", maxWidth: 1100, margin: "0 auto" }}>
      <Skeleton className="h-7 w-48 mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />
      <Skeleton className="h-4 w-32 mb-8" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-4 w-24 mb-3" style={{ background: "rgba(255,255,255,0.04)" }} />
      <ListSkeleton rows={5} />
    </div>
  );
}

// ── CardSkeleton ──────────────────────────────────────────────────────────────
/** Single metric/info card loading state */
export function CardSkeleton() {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.06)",
        background: C.s1,
      }}
    >
      <Skeleton className="h-3 w-20 mb-3" style={{ background: "rgba(255,255,255,0.06)" }} />
      <Skeleton className="h-8 w-16 mb-2" style={{ background: "rgba(255,255,255,0.08)" }} />
      <Skeleton className="h-3 w-28" style={{ background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}

// ── TableSkeleton ─────────────────────────────────────────────────────────────
/** Table/list with header row loading state */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.06)",
        background: C.s1,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ background: "rgba(255,255,255,0.06)", width: i === 0 ? "70%" : "50%" }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: "12px 16px",
            borderBottom: r < rows - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4" style={{ background: "rgba(255,255,255,0.05)", width: c === 0 ? "80%" : "60%" }} />
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
    <div
      style={{
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.06)",
        background: C.s1,
        padding: 16,
      }}
    >
      <Skeleton className="h-3 w-28 mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />
      <Skeleton className="h-3 w-16 mb-4" style={{ background: "rgba(255,255,255,0.04)" }} />
      <Skeleton style={{ height, borderRadius: 4, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

// ── ListSkeleton ──────────────────────────────────────────────────────────────
/** Vertical list of items loading state */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.06)",
            background: C.s1,
          }}
        >
          <Skeleton
            className="rounded-full shrink-0"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.06)" }}
          />
          <div style={{ flex: 1 }}>
            <Skeleton className="h-3.5 mb-1.5" style={{ background: "rgba(255,255,255,0.07)", width: `${60 + (i % 3) * 10}%` }} />
            <Skeleton className="h-3" style={{ background: "rgba(255,255,255,0.04)", width: `${40 + (i % 2) * 15}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
