/**
 * Bilan morpho-anatomique du profil sportif : le profil de leviers en un coup
 * d'œil, puis seulement ce qui sert à programmer (mouvements avantagés ou à
 * adapter, muscles prioritaires). Les observations se saisissent dans l'onglet
 * « Observations » du bloc Mensurations & photos. Calculs : src/lib/morpho.ts.
 */
import { useMemo, type CSSProperties } from "react";
import { ArrowUpRight, Wrench, Minus } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { KICK, MONO } from "@/features/shared/components/ordi/OrdiUi";
import { useMeasurementLogs } from "@/features/shared/hooks/useMeasurements";
import { latestValues } from "@/lib/biometry";
import { ALL_MEASUREMENT_FIELDS, type MeasurementKey } from "@/features/shared/types/measurements";
import {
  boneAnalysis, morphoRatios, musclePriorities, programmingAdvice,
  type AdviceStatus, type Length, type MorphoLengths, type SegmentVerdict,
} from "@/lib/morpho";
import { useMorphoObservations } from "./useMorphoObservations";

const LONG = C.b;
const COURT = C.o;
const lenColor = (l: Length | null | undefined) => (l === "long" ? LONG : l === "court" ? COURT : C.brdL);

const STATUS: Record<AdviceStatus, { label: string; color: string; Icon: typeof ArrowUpRight }> = {
  avantage: { label: "Avantagé", color: C.g, Icon: ArrowUpRight },
  adapter:  { label: "À adapter", color: C.o, Icon: Wrench },
  neutre:   { label: "Neutre", color: C.tx3, Icon: Minus },
};

const pick = (vals: { key: MeasurementKey; value: number | null }[], k: MeasurementKey) => vals.find((x) => x.key === k)?.value ?? null;

/** Petite silhouette : buste, bras (humérus + avant-bras), jambes (fémur + tibia). */
function MiniSilhouette({ bones }: { bones: SegmentVerdict[] }) {
  const v = Object.fromEntries(bones.map((b) => [b.key, b.length])) as Record<string, Length | null>;
  const seg = (x1: number, y1: number, x2: number, y2: number, l: Length | null, w: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={lenColor(l)} strokeWidth={w} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 120 220" aria-hidden style={{ width: 96, height: "auto", flexShrink: 0 }}>
      <circle cx={60} cy={20} r={11} fill="none" stroke={C.tx3} strokeWidth={2.5} />
      <rect x={44} y={36} width={32} height={66} rx={12} fill={alpha(lenColor(v.buste), 0.3)} stroke={lenColor(v.buste)} strokeWidth={2} />
      {seg(42, 42, 26, 86, v.humerus, 8)}{seg(26, 86, 20, 122, v.avant_bras, 7)}
      {seg(78, 42, 94, 86, v.humerus, 8)}{seg(94, 86, 100, 122, v.avant_bras, 7)}
      {seg(52, 106, 49, 158, v.femurs, 10)}{seg(49, 158, 48, 210, v.tibias, 8)}
      {seg(68, 106, 71, 158, v.femurs, 10)}{seg(71, 158, 72, 210, v.tibias, 8)}
    </svg>
  );
}

const card: CSSProperties = { background: C.s1, border: "1px solid " + C.brd, borderRadius: 16 };

export function MorphoAnatomySection({ athleteId }: { athleteId: string }) {
  const { data: logs = [] } = useMeasurementLogs(athleteId);
  const { obs } = useMorphoObservations(athleteId);

  const lengths = useMemo<MorphoLengths>(() => {
    const vals = latestValues(logs, ALL_MEASUREMENT_FIELDS);
    return {
      height: pick(vals, "height_cm"), wingspan: pick(vals, "wingspan_cm"),
      humerus: pick(vals, "arm_length_cm"), forearm: pick(vals, "forearm_length_cm"),
      leg: pick(vals, "leg_standing_cm"), tibia: pick(vals, "shank_length_cm"),
    };
  }, [logs]);

  const ratios = morphoRatios(lengths);
  const bones = boneAnalysis(lengths, obs);
  const known = bones.filter((b) => b.length && b.key !== "buste" && b.key !== "tibias" && b.key !== "avant_bras");
  const advice = programmingAdvice(bones);
  const { priorites, atouts } = musclePriorities(obs);
  const missing = [...new Set(bones.filter((b) => !b.length && b.missing && b.missing !== "observation à l'œil").map((b) => b.missing!))];

  if (!bones.some((b) => b.length)) {
    return (
      <div style={{ ...card, padding: 18, fontSize: 13, color: C.tx2 }} data-testid="morpho-section">
        Pas encore de bilan : planifie une biométrie <strong style={{ color: C.tx }}>avancée</strong> (envergure, longueurs de bras, d'avant-bras, de jambe debout et de tibia), puis renseigne l'onglet Observations des mensurations.
      </div>
    );
  }

  const stats: { label: string; value: string; sub: string }[] = [
    { label: "Envergure", value: ratios.spanDiff == null ? "—" : `${ratios.spanDiff > 0 ? "+" : ""}${ratios.spanDiff} cm`, sub: "vs taille" },
    { label: "Jambe", value: ratios.legPct == null ? "—" : `${ratios.legPct} %`, sub: "de la taille" },
    { label: "Tibia / fémur", value: ratios.tibiaFemurPct == null ? "—" : `${ratios.tibiaFemurPct} %`, sub: ratios.femur ? `fémur ${ratios.femur} cm` : "" },
    { label: "Avant-bras / humérus", value: ratios.forearmHumerusPct == null ? "—" : `${ratios.forearmHumerusPct} %`, sub: "" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="morpho-section">
      {/* Profil de leviers */}
      <div style={{ ...card, padding: 18, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", background: `linear-gradient(135deg, ${alpha(C.ac, 0.1)}, ${C.s1} 55%)` }}>
        <MiniSilhouette bones={bones} />
        <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ ...KICK, color: C.ac }}>Profil de leviers</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {known.map((b) => (
                <span key={b.key} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12.5, color: C.tx, background: alpha(lenColor(b.length), 0.16), border: "1px solid " + alpha(lenColor(b.length), 0.5) }}>
                  {b.verdict}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ padding: "8px 10px", borderRadius: 10, background: alpha(C.s2, 0.7) }}>
                <div style={{ fontSize: 11, color: C.tx3 }}>{s.label}</div>
                <div style={{ ...MONO, fontSize: 17, color: C.tx }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: 10.5, color: C.tx3 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
          {missing.length > 0 && <div style={{ fontSize: 11.5, color: C.tx3 }}>À mesurer : {missing.join(" · ")}.</div>}
        </div>
      </div>

      {/* Mouvements */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {advice.map((a) => {
          const st = STATUS[a.status];
          return (
            <div key={a.key} style={{ ...card, padding: 14, borderTop: `3px solid ${st.color}`, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{a.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: st.color }}>
                  <st.Icon size={13} /> {st.label}
                </span>
              </div>
              {a.because.length > 0 && <div style={{ fontSize: 11.5, color: C.tx3 }}>{a.because.join(" · ")}</div>}
              {a.conseils.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                  {a.conseils.map((c) => <li key={c} style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.45 }}>{c}</li>)}
                </ul>
              ) : (
                <div style={{ fontSize: 12.5, color: C.tx3 }}>Rien de particulier : programmation standard.</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Muscles */}
      {(priorites.length > 0 || atouts.length > 0) && (
        <div style={{ ...card, padding: 14, display: "flex", flexWrap: "wrap", gap: 16 }}>
          <MuscleList title="Priorités de volume" hint="muscles courts : volume ciblé, prudence en étirement maximal" color={COURT} names={priorites.map((p) => p.muscle.label)} />
          <MuscleList title="Atouts" hint="muscles longs : gros potentiel, charge et amplitude" color={LONG} names={atouts.map((p) => p.muscle.label)} />
        </div>
      )}
    </div>
  );
}

function MuscleList({ title, hint, color, names }: { title: string; hint: string; color: string; names: string[] }) {
  return (
    <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.tx3 }}>{hint}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {names.length ? names.map((n) => (
          <span key={n} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12.5, color: C.tx, background: alpha(color, 0.14), border: "1px solid " + alpha(color, 0.45) }}>{n}</span>
        )) : <span style={{ fontSize: 12.5, color: C.tx3 }}>—</span>}
      </div>
    </div>
  );
}
