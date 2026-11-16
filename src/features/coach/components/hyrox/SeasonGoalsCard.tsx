import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { useDeleteSeasonGoal, useHyroxSeasonGoals, useSaveSeasonGoal } from "@/features/shared/hooks/hyrox/useHyroxSeasonGoals";
import type { HyroxSeasonGoal } from "@/api/hyroxObjective";
import { objectiveFromRun, runRange } from "@/lib/hyrox/objective/model";
import { parseClock } from "@/lib/hyrox/racePlan";
import { seasonFromKey, seasonOf, seasonStarting } from "@/lib/hyrox/season";
import { fmtClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";
import { INPUT, OBJECTIVE_CATEGORIES, categoryLabel, runText } from "./objectiveUi";

/**
 * « Objectif de saison » (coach, docs/HYROX_OBJECTIF_CONCEPTION.md §6) : un run
 * moyen visé par saison et par division. Il pré-remplit l'objectif des
 * prochaines courses de la saison ; l'athlète le lit dans Ma saison.
 */
export default function SeasonGoalsCard({ athleteId, defaultCategory }: { athleteId: string; defaultCategory: string }) {
  const { data: goals = [] } = useHyroxSeasonGoals(athleteId);
  const save = useSaveSeasonGoal(athleteId);
  const del = useDeleteSeasonGoal(athleteId);
  const current = seasonOf(localIsoDay()) ?? seasonStarting(new Date().getFullYear());
  const seasons = useMemo(() => {
    const next = seasonStarting(Number(current.key.slice(0, 4)) + 1);
    const keys = new Set([current.key, next.key, ...goals.map((g) => g.season)]);
    return [...keys].sort().reverse().map((k) => seasonFromKey(k)).filter((s): s is NonNullable<typeof s> => !!s);
  }, [goals, current.key]);
  const [seasonKey, setSeasonKey] = useState(current.key);
  const [division, setDivision] = useState(defaultCategory);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const rows = goals.filter((g) => g.season === seasonKey);
  const run = parseClock(text);
  const range = runRange(division);
  const preview = run != null ? objectiveFromRun(division, run) : null;
  const canSave = run != null && !!preview && !save.isPending;
  const edit = (g: HyroxSeasonGoal) => { setDivision(g.division); setText(runText(g.run_avg_s)); };
  const submit = () => {
    if (!canSave || run == null) return;
    save.mutate({ athlete_id: athleteId, season: seasonKey, division, run_avg_s: run, note: null }, { onSuccess: () => setText("") });
  };

  return (
    <section aria-label="Objectif de saison" style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={KICKER}><span style={{ color: C.ac }}>01 —</span> Objectif de saison</span>
        <select value={seasonKey} onChange={(e) => setSeasonKey(e.target.value)} aria-label="Saison" style={{ ...INPUT, height: 32 }}>
          {seasons.map((s) => <option key={s.key} value={s.key}>{s.label}{s.key === current.key ? " (en cours)" : ""}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>
        Le run moyen visé sur la saison (15 août → 14 août). Il pré-remplit l'objectif des prochaines courses de la saison ; une course déjà faite sans plan reste jugée sur son run du jour.
      </div>
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((g, i) => {
            const o = objectiveFromRun(g.division, g.run_avg_s);
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${C.brd}` : "none", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 160px", fontSize: 13.5 }}>{categoryLabel(g.division)}</span>
                <span style={{ ...MONO, fontSize: 15 }}>{runText(g.run_avg_s)} <span style={{ fontSize: 11, color: C.tx3 }}>/km</span></span>
                <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>→ {o ? fmtClock(o.totalS) : "—"}{o?.estimate ? " · estimé" : ""}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => edit(g)} style={buttonStyle()} aria-label={`Modifier ${categoryLabel(g.division)}`}><Pencil size={13} /></button>
                  {confirm === g.id
                    ? <button type="button" onClick={() => del.mutate(g.id, { onSuccess: () => setConfirm(null) })} style={{ ...buttonStyle(), color: C.r, borderColor: C.r }}>Confirmer</button>
                    : <button type="button" onClick={() => setConfirm(g.id)} style={buttonStyle()} aria-label={`Supprimer ${categoryLabel(g.division)}`}><Trash2 size={13} /></button>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Division</span>
          <select value={division} onChange={(e) => setDivision(e.target.value)} style={INPUT}>
            {OBJECTIVE_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Run moyen visé (/km)</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="4:50" inputMode="numeric" aria-label="Run moyen visé"
            style={{ ...INPUT, ...MONO, borderColor: text && !preview ? C.r : C.brdL }} />
        </label>
        <button type="button" onClick={submit} disabled={!canSave} style={buttonStyle("primary", !canSave)}>
          {rows.some((g) => g.division === division) ? "Remplacer" : "Enregistrer"}
        </button>
      </div>
      <div style={{ ...MONO, fontSize: 11.5, color: text && !preview ? C.r : C.tx3 }}>
        {preview
          ? `Objectif ${categoryLabel(division)} : ${fmtClock(preview.totalS)}${preview.estimate ? " (estimé, hors des données mesurées)" : ""}`
          : text && range ? `Run moyen entre ${runText(range.min)} et ${runText(range.max)} /km pour cette division.` : " "}
      </div>
    </section>
  );
}
