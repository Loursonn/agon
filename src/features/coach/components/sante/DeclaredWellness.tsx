import { addDays, localIsoDay } from "@shared/domain/dates";
import { wellnessBand, wellnessScore } from "@shared/domain/wellness";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { feltSummary } from "@/lib/coachWellness";
import { feltMeasuredRows, type FeltKey } from "@/lib/santeCoach";
import { TONE_COLOR } from "@/lib/wellness";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { DayBars, SanteKicker } from "./SanteParts";

const NOTES: Array<{ key: "fatigue" | FeltKey | "doms" | "envie"; label: string }> = [
  { key: "fatigue", label: "Récupération" },
  { key: "sommeil", label: "Sommeil" },
  { key: "stress", label: "Sérénité" },
  { key: "energie", label: "Énergie" },
  { key: "doms", label: "Fraîcheur musc." },
  { key: "envie", label: "Envie" },
];

/** Fenêtre partagée avec le graphique « Ressenti et mesuré » (même requête). */
export const SANTE_WELLNESS_DAYS = 35;

/**
 * « 03 — Wellness déclaré » (planche CoachOrdiASante) : note du jour /100 et
 * palier, habitude, les 6 réponses (« ≠ montre » quand la mesure contredit
 * le ressenti), score des 7 derniers jours.
 */
export function DeclaredWellness({ athleteId, firstName, n, onOpenWellness }: { athleteId: string; firstName: string; n: number; onOpenWellness?: () => void }) {
  const day = localIsoDay();
  const { data: wh = {} } = useWellnessHistory(athleteId, { from: addDays(day, -SANTE_WELLNESS_DAYS), includeArchived: false });
  const { data: health = [] } = useHealthWindow(athleteId, day);
  const entry = wh[day] ?? null;
  const score = wellnessScore(entry);
  const band = wellnessBand(score);
  const habit = feltSummary(wh, day).scoreHabit;
  const gaps = new Set(feltMeasuredRows(health, wh, day).filter((r) => r.agr === "ecart").map((r) => r.def.key));
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(day, i - 6); return { day: d, v: wellnessScore(wh[d] ?? null) }; });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
      <SanteKicker n={n}>Wellness déclaré</SanteKicker>
      <div style={{ borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {!entry ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>{firstName} n’a pas encore rempli son wellness aujourd’hui.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.tx3 }}>Saisi par {firstName} aujourd’hui</span>
              {band && <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: TONE_COLOR[band.tone], border: `1px solid ${alpha(TONE_COLOR[band.tone], 0.5)}`, borderRadius: 999, padding: "2px 9px" }}>{band.label}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ ...MONO, fontSize: 30, lineHeight: 1 }}>{score ?? "—"}</span>
              <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>/ 100</span>
              <span style={{ fontSize: 12, color: C.tx3 }}>habitude {habit == null ? "—" : Math.round(habit)}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
              {NOTES.map(({ key, label }) => {
                const v = key === "envie" ? entry.envie : entry.items[key];
                const gap = key !== "envie" && gaps.has(key as FeltKey);
                return (
                  <div key={key} style={{ borderRadius: 10, background: C.s2, padding: "8px 10px", border: `1px solid ${gap ? alpha(C.o, 0.5) : "transparent"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11.5, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                      {gap && <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", color: C.o, whiteSpace: "nowrap" }}>≠ MONTRE</span>}
                    </div>
                    <div style={{ ...MONO, fontSize: 17, marginTop: 2 }}>{v ?? "—"}<span style={{ fontSize: 11, color: C.tx3 }}>/5</span></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div>
          <div style={{ fontSize: 11.5, color: C.tx3, marginBottom: 6 }}>Wellness · 7 j</div>
          <DayBars pts={week} color={C.ac} h={36} />
        </div>
        {onOpenWellness && (
          <button type="button" onClick={onOpenWellness} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
            Voir le wellness détaillé ›
          </button>
        )}
      </div>
    </section>
  );
}
