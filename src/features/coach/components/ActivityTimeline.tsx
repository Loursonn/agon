import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityItem } from "@/features/shared/hooks/useRecentActivity";

const TYPE_META: Record<string, { icon: string; color: string }> = {
  session:  { icon: "musculation", color: "#FFC933" },   // primary violet
  wellness: { icon: "coeur", color: "#66F03C" },   // success vert
  pr:       { icon: "trophee", color: "#FF9500" },   // tertiary orange
};

interface ActivityTimelineProps {
  activities: ActivityItem[];
  loading?: boolean;
  onAthleteClick?: (athleteId: string) => void;
}

/**
 * Vertical timeline of the last N coach-level activity events.
 * Timestamps in French via date-fns/locale fr.
 */
export function ActivityTimeline({
  activities, loading = false, onAthleteClick,
}: ActivityTimelineProps) {
  return (
    <div
      style={{
        background: C.s1,
        border: "1px solid " + C.brd,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid " + C.brd,
          fontSize: 12,
          fontWeight: 700,
          color: C.tx,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span></span>
        <span>Activité récente</span>
      </div>

      {/* Items */}
      <div style={{ padding: "6px 0" }}>
        {loading ? (
          <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Skeleton style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: C.s2 }} />
                <div style={{ flex: 1 }}>
                  <Skeleton style={{ height: 13, width: "70%", borderRadius: 4, background: C.s2, marginBottom: 4 }} />
                  <Skeleton style={{ height: 11, width: "40%", borderRadius: 4, background: C.s2 }} />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div style={{ padding: "24px 16px", fontSize: 12, color: C.tx3, textAlign: "center" }}>
            Aucune activité récente pour l'instant 
          </div>
        ) : (
          activities.map((item, i) => {
            const meta = TYPE_META[item.type] ?? { icon: "•", color: C.tx3 };
            const timeAgo = formatDistanceToNow(item.updatedAt, {
              addSuffix: true,
              locale: fr,
            });
            return (
              <div
                key={item.id}
                style={{
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: i < activities.length - 1 ? "1px solid " + C.brd : "none",
                  cursor: onAthleteClick ? "pointer" : "default",
                  transition: "background 150ms",
                }}
                onClick={() => onAthleteClick?.(item.athleteId)}
                onMouseEnter={(e) => {
                  if (onAthleteClick) (e.currentTarget as HTMLElement).style.background = C.s2;
                }}
                onMouseLeave={(e) => {
                  if (onAthleteClick) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {/* Icon dot */}
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: meta.color + "20",
                    border: "1px solid " + meta.color + "40",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {meta.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>{timeAgo}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
