import { X } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { localISO } from "@/lib/date";
import { COMPETITION_META, priorityLabel, type Competition, type CompetitionType } from "@/types/planning";
import { CompetitionDayCard } from "./CompetitionDayCard";

/** Liste de toutes les compétitions de l'athlète : à venir puis passées (avec bilan). */
export function AllCompetitionsSheet({ competitions, viewOnly, onClose }: {
  competitions: Competition[];
  viewOnly?: boolean;
  onClose: () => void;
}) {
  const today = localISO();
  const upcoming = competitions.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = competitions.filter((c) => c.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 560, maxHeight: "88vh",
        background: C.bg, borderRadius: "6px 6px 0 0", border: "1px solid " + C.brd,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Mes compétitions</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              {upcoming.length} à venir · {past.length} passée{past.length > 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          ><X size={14} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          {competitions.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: C.tx3 }}>Aucune compétition</div>
          )}

          {upcoming.length > 0 && (
            <section>
              <SectionTitle>À venir</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upcoming.map((c) => {
                  const meta = COMPETITION_META[c.type as CompetitionType] ?? COMPETITION_META.autre;
                  const days = differenceInCalendarDays(parseISO(c.date), parseISO(today));
                  return (
                    <div key={c.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", borderRadius: 6,
                      background: C.s1, border: "1px solid " + (c.priority === "A" ? C.coach + "50" : C.brd),
                    }}>
                      <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: days <= 7 ? C.coach : C.tx }}>
                          {days === 0 ? "J" : `J-${days}`}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{c.name}</span>
                          <PriorityBadge priority={c.priority} />
                        </div>
                        <div style={{ fontSize: 11, color: C.tx3, marginTop: 3 }}>
                          {meta.label} · {format(parseISO(c.date), "EEE d MMM yyyy", { locale: fr })}
                          {c.location ? ` · ${c.location}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <SectionTitle>Passées</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {past.map((c) => (
                  <CompetitionDayCard
                    key={c.id}
                    competition={{
                      id: c.id, name: c.name, type: c.type, date: c.date,
                      location: c.location, priority: c.priority,
                      athlete_comment: c.athlete_comment ?? null,
                    }}
                    viewOnly={viewOnly}
                    showDate
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
      background: priority === "A" ? C.coachS : C.oS,
      color: priority === "A" ? C.coach : C.o,
    }}>
      {priorityLabel(priority)}
    </span>
  );
}
