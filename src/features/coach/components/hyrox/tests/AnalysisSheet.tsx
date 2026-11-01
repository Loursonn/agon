import { ArrowLeft } from "lucide-react";
import { C } from "@/lib/theme";
import {
  ALGO_VERSION, AXES, RACE_LOADS, fmtHm, fmtTime, type GridSet, type HyroxTestAnalysisRow, type StoredOutputs,
} from "@/lib/hyrox/tests";
import { useCreateHyroxAnalysis, useGridSet, useHyroxAxesDraft } from "@/features/shared/hooks/hyrox/useHyroxTests";
import HyroxRadar from "../HyroxRadar";
import AxesEditor, { AxesReadOnly } from "./AxesEditor";
import AxisDetail from "./AxisDetail";
import RunningSection from "./RunningSection";
import SledSection from "./SledSection";
import { Btn, Card, Muted, NoteBadge, SectionTitle, SourceTag } from "./ui";
import { fmtDate, kindLabel } from "./format";

const radarAxes = (o: StoredOutputs) =>
  AXES.map(a => ({ key: a.key, label: a.label === "Système cardio-respiratoire" ? "Cardio-respiratoire" : a.label, value: (o.scores.axes.find(x => x.key === a.key)?.score ?? null) == null ? null : (o.scores.axes.find(x => x.key === a.key)!.score as number) * 20 }));

export default function AnalysisSheet({
  analysis, previous, audience, athleteId, onBack, isAdmin, activeSet,
}: {
  analysis: HyroxTestAnalysisRow;
  previous?: HyroxTestAnalysisRow | null;
  audience: "coach" | "athlete";
  athleteId: string;
  onBack: () => void;
  isAdmin?: boolean;
  activeSet?: GridSet;
}) {
  const coach = audience === "coach";
  const o = analysis.outputs as unknown as StoredOutputs;
  const prevO = previous ? (previous.outputs as unknown as StoredOutputs) : null;
  const { data: set } = useGridSet(coach ? analysis.grid_version : undefined);
  const { data: draft } = useHyroxAxesDraft(analysis.id, coach);
  const recalc = useCreateHyroxAnalysis(athleteId);
  const c = o.chrono;
  const loads = RACE_LOADS[analysis.profile.category][analysis.profile.sex];
  const canRecalc = coach && isAdmin && activeSet && (activeSet.version !== analysis.grid_version || ALGO_VERSION !== analysis.algo_version);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
          <ArrowLeft size={18} color={C.tx2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{kindLabel(analysis.kind)} · {fmtDate(analysis.date)}</div>
          {coach && (
            <Muted>
              {analysis.profile.sex === "H" ? "Homme" : "Femme"} {analysis.profile.category} · calcul {analysis.algo_version} · grilles {analysis.grid_version}
              {analysis.recalculated_from ? " · recalcul" : ""} · {analysis.validated_at ? "validé" : "non validé"}
            </Muted>
          )}
        </div>
        {canRecalc && (
          <Btn
            small
            disabled={recalc.isPending}
            title="Crée une nouvelle analyse avec les mêmes données brutes ; celle-ci reste intacte."
            onClick={() => recalc.mutate({
              kind: analysis.kind, date: analysis.date, inputs: analysis.inputs, profile: analysis.profile, set: activeSet!,
              source_result_ids: analysis.source_result_ids, target_s: analysis.target_s,
              context: draft?.context ?? { competition: "A" }, recalculated_from: analysis.id,
            }, { onSuccess: onBack })}
          >
            Recalculer avec les grilles {activeSet!.version}
          </Btn>
        )}
      </div>

      {/* 1. Chrono estimé */}
      <SectionTitle right={<SourceTag source="ma méthode" />}>Chrono HYROX estimé</SectionTitle>
      {c ? (
        <Card>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: C.ac }}>{fmtHm(c.median_s)}</span>
            <span style={{ fontSize: 13, color: C.tx2 }}>fourchette {fmtHm(c.low_s)} – {fmtHm(c.high_s)}</span>
            {prevO?.chrono && (
              <span style={{ fontSize: 12, color: c.median_s <= prevO.chrono.median_s ? C.g : C.r }}>
                {c.median_s <= prevO.chrono.median_s ? "−" : "+"}{fmtTime(Math.abs(c.median_s - prevO.chrono.median_s))} depuis le {fmtDate(previous!.date)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.tx2, marginTop: 8, lineHeight: 1.6 }}>
            Course en HYROX : {fmtTime(c.run_s)} ({fmtTime(c.pace_s_per_km)} /km).{" "}
            {c.station_level ? `Niveau aux stations ${c.station_level.mean.toFixed(1).replace(".", ",")} / 5 (${c.station_level.count} tests).` : "Stations non testées : niveau moyen supposé."}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: C.tx2, background: C.s2, borderRadius: 3, padding: "3px 8px" }}>+0,5 km/h de vitesse critique : −{fmtTime(c.gain_cs_05_s)}</span>
            {c.gain_stations_1_s > 0 && <span style={{ fontSize: 11, color: C.tx2, background: C.s2, borderRadius: 3, padding: "3px 8px" }}>+1 point aux stations : −{fmtTime(c.gain_stations_1_s)}</span>}
          </div>
          <Muted style={{ marginTop: 6 }}>Estimation à partir de la course et des stations, recalée au fil des courses de nos athlètes.</Muted>
        </Card>
      ) : (
        <Muted>Pas de chrono estimé : il faut au moins 2 courses (1200 m, 6 min, 12 min).</Muted>
      )}

      {/* 2. Radar */}
      <SectionTitle>Profil sur 8 axes{prevO ? ` · comparé au ${fmtDate(previous!.date)}` : ""}</SectionTitle>
      <HyroxRadar
        height={300}
        series={[
          { name: fmtDate(analysis.date), color: C.ac, axes: radarAxes(o) },
          ...(prevO ? [{ name: fmtDate(previous!.date), color: C.b, axes: radarAxes(prevO) }] : []),
        ]}
      />

      {/* 3. Forts / faibles */}
      <SectionTitle>Points forts et points faibles</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {([["Points forts", o.insights.strengths, C.g], ["À travailler", o.insights.weaknesses, C.o]] as const).map(([t, list, col]) => (
          <Card key={t} style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: col, marginBottom: 6 }}>{t}</div>
            {list.length ? list.map(x => (
              <div key={x.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                <NoteBadge note={x.score} /><span style={{ fontSize: 12, color: C.tx }}>{x.label}</span>
              </div>
            )) : <Muted>Pas assez de tests.</Muted>}
          </Card>
        ))}
      </div>
      {o.insights.flags.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          {o.insights.flags.map(f => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: C.o, flex: 1 }}>{f.text}</span><SourceTag source={f.source} />
            </div>
          ))}
        </Card>
      )}

      {/* 4. Course */}
      <RunningSection r={o.scores.running} audience={audience} />

      {/* 5. Sleds */}
      <SledSection
        push={o.scores.sled_push} pull={o.scores.sled_pull} pushKg={loads.sled_push_kg} pullKg={loads.sled_pull_kg}
        week1Push={o.scores.week1_push} week1Pull={o.scores.week1_pull} audience={audience}
      />

      {/* 6. Détail par axe */}
      <AxisDetail scores={o.scores} profile={analysis.profile} set={set ?? null} audience={audience} />

      {/* 7. Pistes par station (règles) : coach */}
      {coach && o.rules.length > 0 && (
        <>
          <SectionTitle>Pistes par station (règles {analysis.grid_version})</SectionTitle>
          <Card>
            {o.rules.map(r => (
              <div key={r.id} style={{ borderTop: "1px solid " + C.brd, padding: "7px 0", fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ color: r.step === "sécurité" ? C.o : C.tx }}>{r.group} · {r.axis}</b>
                  {r.to_recalibrate && <span style={{ fontSize: 9, color: C.o, border: "1px solid " + C.o, borderRadius: 3, padding: "0 4px" }}>seuil à recaler</span>}
                </div>
                <div>{r.means}</div>
                <Muted>{r.rationale}</Muted>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* 8. Axes de travail */}
      {coach ? (
        <AxesEditor analysis={analysis} draft={draft} set={set ?? null} athleteId={athleteId} />
      ) : analysis.axes_validated ? (
        <AxesReadOnly axes={analysis.axes_validated} />
      ) : null}
    </div>
  );
}
