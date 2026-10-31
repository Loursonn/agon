/**
 * Une journée du planning, vue par un pro : séances écrites en entier
 * (blocs, exercices, séries × reps, charge, RIR), séances énergie, tests,
 * compétitions, et les fiches posées sur ce jour.
 */
import { C } from "@/lib/theme";
import type { UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";
import { CATEGORY_COLOR } from "@/features/shared/components/fiches/ficheStyles";
import { KIND_COLOR, KIND_LABEL } from "@/features/coach/components/energy/SessionPreviewModal";
import { formatBlocTiming, formatExercice } from "../../lib/formatPrescription";

const STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: "Faite", color: C.g },
  planned: { label: "Prévue", color: C.tx3 },
  missed: { label: "Manquée", color: C.r },
  skipped: { label: "Sautée", color: C.tx3 },
};

function StatusBadge({ status, rpe }: { status?: string; rpe?: number | null }) {
  const s = STATUS[status ?? "planned"] ?? STATUS.planned;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}{status === "completed" && rpe != null ? ` · RPE ${rpe}` : ""}
    </span>
  );
}

function WorkoutBlock({ event, session, occurrence, athleteId }: {
  event: UnifiedCalendarEvent; session: ProgSession | undefined; occurrence: number; athleteId: string;
}) {
  const blocs = [...(session?.blocs ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const ficheAtts = [...(session?.fiches ?? []), ...blocs.flatMap((b) => b.fiches ?? [])];
  return (
    <div style={{ borderLeft: "3px solid " + C.ac, background: C.s2, borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.tx, flex: 1, minWidth: 0 }}>{event.title}</span>
        <StatusBadge status={event.status} rpe={event.rpe} />
      </div>
      {session && occurrence > 1 && (
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>Séance n° {occurrence}</div>
      )}
      {!session && (
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>Contenu non disponible.</div>
      )}
      {blocs.map((b) => {
        const timing = formatBlocTiming(b);
        const exos = [...b.exercices].sort((x, y) => x.sort_order - y.sort_order);
        return (
          <div key={b.id} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: b.color || C.tx2, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {b.name}{timing && <span style={{ fontWeight: 500, color: C.tx3, textTransform: "none", letterSpacing: 0 }}> · {timing}</span>}
            </div>
            {b.instructions && <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic", marginTop: 2 }}>{b.instructions}</div>}
            {exos.map((ex, i) => {
              const line = formatExercice(ex, occurrence);
              const linked = ex.superset_with_next || (i > 0 && exos[i - 1].superset_with_next);
              return (
                <div key={ex.id} style={{ display: "flex", gap: 6, marginTop: 4, paddingLeft: linked ? 6 : 0, borderLeft: linked ? "2px solid " + C.brdL : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, lineHeight: 1.35 }}>{line.name}</div>
                    {line.detail && <div style={{ fontSize: 11.5, color: C.tx2, lineHeight: 1.35 }}>{line.detail}</div>}
                    {line.comment && <div style={{ fontSize: 10.5, color: C.tx3, fontStyle: "italic", lineHeight: 1.35 }}>« {line.comment} »</div>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {ficheAtts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <FicheLinks attachments={ficheAtts} week={occurrence} athleteId={athleteId} compact />
        </div>
      )}
    </div>
  );
}

function OtherEvent({ event, onOpenEnergy }: { event: UnifiedCalendarEvent; onOpenEnergy: (id: string) => void }) {
  if (event.type === "energy") {
    const kc = KIND_COLOR[event.sessionKind ?? ""] ?? C.b;
    return (
      <button
        onClick={() => event.energySessionId && onOpenEnergy(event.energySessionId)}
        style={{ textAlign: "left", width: "100%", borderLeft: "3px solid " + kc, background: C.s2, borderRadius: 4, padding: "8px 10px", border: "none", borderLeftStyle: "solid", cursor: event.energySessionId ? "pointer" : "default", fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.tx, flex: 1, minWidth: 0 }}>{event.title}</span>
          <StatusBadge status={event.status} rpe={event.rpe} />
        </div>
        <div style={{ fontSize: 11, color: kc, marginTop: 2 }}>
          {KIND_LABEL[event.sessionKind ?? ""] ?? "Énergie"}{event.energySessionId && <span style={{ color: C.tx3 }}> · voir le détail ›</span>}
        </div>
      </button>
    );
  }
  const meta: Record<string, { color: string; prefix: string }> = {
    test: { color: "#C08A4A", prefix: "Test" },
    competition: { color: C.r, prefix: "Compétition" },
    free_activity: { color: C.pat, prefix: event.sport ?? "Activité" },
    life_event: { color: C.tx3, prefix: "Événement" },
  };
  const m = meta[event.type] ?? { color: C.tx3, prefix: "" };
  const detail =
    event.type === "competition" ? [event.priority, event.location].filter(Boolean).join(" · ")
      : event.type === "free_activity" && event.duration ? `${event.duration} min`
        : event.type === "test" ? (event.completed ? "Fait" : "Prévu") : "";
  return (
    <div style={{ borderLeft: "3px solid " + m.color, background: C.s2, borderRadius: 4, padding: "7px 10px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.prefix}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tx }}>{event.title}</div>
      {detail && <div style={{ fontSize: 11, color: C.tx3 }}>{detail}</div>}
    </div>
  );
}

export interface DayCardProps {
  date: Date;
  iso: string;
  isToday: boolean;
  athleteId: string;
  events: UnifiedCalendarEvent[];
  fiches: ScheduledDoc[];
  sessionsById: Map<string, ProgSession>;
  occurrences: Map<string, number>;
  canAddFiche: boolean;
  canRemoveFiche: (f: ScheduledDoc) => boolean;
  authorLabel: (f: ScheduledDoc) => string;
  onAddFiche: () => void;
  onRemoveFiche: (f: ScheduledDoc) => void;
  onOpenFiche: (docId: string) => void;
  onOpenEnergy: (id: string) => void;
}

const DAY = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];

export function StaffDayCard(p: DayCardProps) {
  const workouts = p.events.filter((e) => e.type === "workout");
  const others = p.events.filter((e) => e.type !== "workout");
  const empty = p.events.length === 0 && p.fiches.length === 0;

  return (
    <div style={{
      background: C.s1, border: "1px solid " + (p.isToday ? C.ac + "70" : C.brd), borderRadius: 6,
      padding: 10, display: "flex", flexDirection: "column", gap: 8, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: p.isToday ? C.ac : C.tx3, letterSpacing: "0.5px" }}>{DAY[p.date.getDay()]}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: p.isToday ? C.ac : C.tx }}>{p.date.getDate()}</span>
        {p.isToday && <span style={{ fontSize: 9, fontWeight: 800, color: C.ac, border: "1px solid " + C.ac + "60", borderRadius: 3, padding: "0 4px" }}>AUJOURD'HUI</span>}
        <span style={{ flex: 1 }} />
        {p.canAddFiche && (
          <button
            onClick={p.onAddFiche}
            title="Poser une fiche sur ce jour"
            style={{ padding: "3px 8px", borderRadius: 4, border: "1px dashed " + C.brdL, background: "transparent", color: C.tx2, fontSize: 11, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            + Fiche
          </button>
        )}
      </div>

      {empty && <div style={{ fontSize: 11.5, color: C.tx3 }}>Repos</div>}

      {workouts.map((e) => (
        <WorkoutBlock
          key={e.id}
          event={e}
          session={e.sessionId ? p.sessionsById.get(e.sessionId) : undefined}
          occurrence={p.occurrences.get(e.id) ?? 1}
          athleteId={p.athleteId}
        />
      ))}
      {others.map((e) => <OtherEvent key={e.type + e.id} event={e} onOpenEnergy={p.onOpenEnergy} />)}

      {p.fiches.map((f) => {
        const color = f.doc ? CATEGORY_COLOR[f.doc.category] ?? C.b : C.tx3;
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, background: color + "14", border: "1px solid " + color + "40", borderRadius: 4, padding: "6px 8px" }}>
            <button
              onClick={() => f.doc && p.onOpenFiche(f.doc.id)}
              disabled={!f.doc}
              style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: f.doc ? "pointer" : "default", fontFamily: "inherit" }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>📄 {f.doc?.title ?? "Fiche retirée"}</div>
              <div style={{ fontSize: 10, color: C.tx3 }}>Fiche posée par {p.authorLabel(f)}</div>
              {f.note && <div style={{ fontSize: 11, color: C.tx2, marginTop: 2 }}>{f.note}</div>}
            </button>
            {p.canRemoveFiche(f) && (
              <button
                onClick={() => p.onRemoveFiche(f)}
                aria-label="Retirer la fiche de ce jour"
                title="Retirer de ce jour"
                style={{ background: "none", border: "none", color: C.tx3, fontSize: 15, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
              >×</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
