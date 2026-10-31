import { C } from "@/lib/theme";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { computeTotals, expandIntervals } from "@/lib/energy";
import { formatS } from "@/lib/energy/formatTarget";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import {
  dayThemeText,
  ENERGY_KIND_LABEL,
  energyStepLines,
  paramsText,
} from "@/lib/coachApiDraftText";
import type { DraftOp, ExerciceParamsShape, ProgSessionShape, WeekOp } from "@shared/coachApiOps.ts";
import type { EnergySessionShape } from "@shared/coachApiEnergy.ts";

const dayLabel = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function durationMin(steps: EnergySessionShape["intervals"]): string | null {
  const root: EnergyGroup = { type: "group", id: "__root__", role: "open", repeat: 1, children: steps as unknown as EnergyStep[] };
  const s = computeTotals(expandIntervals(root)).durationS;
  return s > 0 ? formatS(s) : null;
}

const sectionTitle = { fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px", margin: "10px 0 6px" };

/**
 * Aperçu d'une semaine proposée : jour par jour, ce que l'athlète verra
 * (thème, séances), puis le contenu des séances créées. Le thème qu'un jour
 * avait déjà est montré barré : appliquer le remplace.
 */
export function WeekDraftPreview({ athleteId, ops, prog }: {
  athleteId: string;
  ops: DraftOp[];
  prog: ProgSessionShape[] | undefined;
}) {
  const week = ops as WeekOp[];
  const dates = [...new Set(week.flatMap((o) => ("date" in o ? [o.date] : [])))].sort();
  const { data: existing = [] } = useDayThemesRange(athleteId, dates[0], dates[dates.length - 1]);

  const created = week.flatMap((o) => (o.op === "create_session" ? [o.session] : []));
  const createdEnergy = week.flatMap((o) => (o.op === "create_energy_session" ? [o.energy] : []));
  const sessionName = (id: string) =>
    prog?.find((s) => s.id === id)?.name ?? created.find((s) => s.id === id)?.name ?? "séance supprimée";
  const isNew = (id: string) => created.some((s) => s.id === id) || createdEnergy.some((e) => e.id === id);

  return (
    <div style={{ marginBottom: 10 }}>
      {dates.map((date) => {
        const theme = week.find((o): o is Extract<WeekOp, { op: "set_day_theme" }> => o.op === "set_day_theme" && o.date === date);
        const before = existing.find((t) => t.date === date);
        const replaced = theme && before && dayThemeText(before) && dayThemeText(before) !== dayThemeText(theme);
        const items = week.flatMap((o) => {
          if (o.op === "place_session" && o.date === date) return [{ name: sessionName(o.session_id), kind: "Muscu", isNew: isNew(o.session_id) }];
          if (o.op === "place_energy_session" && o.date === date) return [{ name: o.name, kind: "Énergie", isNew: isNew(o.energy_session_id) }];
          return [];
        });
        return (
          <div key={date} style={{ borderTop: "1px solid " + C.brd, padding: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, textTransform: "capitalize" }}>{dayLabel(date)}</span>
              {theme && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.tx, borderLeft: `3px solid ${theme.color}`, paddingLeft: 6 }}>
                  {dayThemeText(theme)}
                </span>
              )}
            </div>
            {replaced && (
              <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 3 }}>
                Remplace <span style={{ textDecoration: "line-through" }}>{dayThemeText(before)}</span>
              </div>
            )}
            {items.length > 0 && (
              <ul style={{ margin: "4px 0 0", padding: "0 0 0 16px" }}>
                {items.map((it, i) => (
                  <li key={i} style={{ fontSize: 12, color: C.tx, lineHeight: 1.5 }}>
                    <span style={{ color: C.tx3 }}>{it.kind} · </span>{it.name}
                    {it.isNew && <span style={{ color: C.coach, fontSize: 10, fontWeight: 700 }}> NOUVELLE</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {created.length > 0 && <div style={sectionTitle}>Séances de musculation créées</div>}
      {created.map((s) => (
        <details key={s.id} style={{ fontSize: 12, color: C.tx, marginBottom: 6 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>{s.name}</summary>
          {s.blocs.map((b) => (
            <div key={b.id} style={{ margin: "4px 0 0 12px" }}>
              <div style={{ color: C.tx2, fontWeight: 600 }}>{b.name}</div>
              {b.instructions && <div style={{ color: C.tx3, fontStyle: "italic" }}>{b.instructions}</div>}
              <ul style={{ margin: "2px 0 0", padding: "0 0 0 16px" }}>
                {b.exercices.map((e) => (
                  <li key={e.id} style={{ lineHeight: 1.45 }}>
                    {e.exercise_name}{e.exercise_id ? "" : " (hors bibliothèque)"} :{" "}
                    {e.mode === "libre" ? `« ${e.libre_text ?? ""} »` : paramsText(e.params as ExerciceParamsShape)}
                    {e.comment && <span style={{ color: C.tx3 }}> — {e.comment}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ))}

      {createdEnergy.length > 0 && <div style={sectionTitle}>Séances énergétiques créées</div>}
      {createdEnergy.map((e) => {
        const dur = durationMin(e.intervals);
        return (
          <details key={e.id} style={{ fontSize: 12, color: C.tx, marginBottom: 6 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {e.name} <span style={{ color: C.tx3, fontWeight: 400 }}>· {ENERGY_KIND_LABEL[e.session_kind] ?? e.session_kind}{dur ? ` · ~${dur}` : ""}</span>
            </summary>
            {e.notes && <div style={{ color: C.tx3, fontStyle: "italic", margin: "4px 0 0 12px" }}>{e.notes}</div>}
            <div style={{ margin: "4px 0 0 12px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {energyStepLines(e.intervals).join("\n")}
            </div>
          </details>
        );
      })}
    </div>
  );
}
