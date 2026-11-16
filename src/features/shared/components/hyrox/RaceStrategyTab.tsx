import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, MONO } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { cascadeSteps, type LeverView } from "@/lib/hyrox/objective/levers";
import type { StrategyResult } from "@/lib/hyrox/objective/strategy";
import { fmtClock } from "@/lib/seance";
import { CASCADE_COLOR, WATCH_PILL, fmtDuration, leverPicto } from "./raceAnalysisShared";
import { Sources, Stat } from "./raceAnalysisUi";
import RaceGainsCascade from "./RaceGainsCascade";

const GROUPS = [
  { key: "strategie", title: "Stratégie", sub: "gagnable le jour de la course, sans gagner en forme" },
  { key: "capacite", title: "Capacité", sub: "à construire à l'entraînement" },
] as const;

function LeverRow({ l, coach }: { l: LeverView; coach: boolean }) {
  const color = CASCADE_COLOR[l.group];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", borderTop: `1px solid ${C.brd}`, paddingTop: 10 }}>
      <span style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: alpha(color, 0.16), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <HyroxPicto station={leverPicto(l.key)} size={19} color={color} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{l.label}</span>
          <span style={{ ...MONO, fontSize: 13.5, color: C.o, flex: "none" }}>−{l.gainS} s</span>
        </div>
        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>{l.detail}</div>
        {l.hint && (
          <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={WATCH_PILL}>INDICE MONTRE</span>{l.hint}
          </div>
        )}
        {l.proposal && <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.45 }}>À travailler : {l.proposal}</div>}
        {coach && l.axis && (
          <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>Déjà dans ses axes (bilan de tests) : <span style={{ color: C.tx }}>{l.axis.axis}</span></div>
        )}
      </div>
    </div>
  );
}

/**
 * Onglet « Stratégie » : « Et avec une meilleure stratégie ? »
 * (docs/HYROX_OBJECTIF_CONCEPTION.md §9). Du chrono réalisé au chrono
 * possible, levier par levier, en secondes, contre l'objectif de la course.
 */
export default function RaceStrategyTab({ strategy, levers, coach, onObjective, objectiveText, timeSource, startLabel, watchLinked }: {
  strategy: StrategyResult | null;
  levers: LeverView[];
  coach: boolean;
  /** Stations dans l'objectif ou devant. */
  onObjective: number;
  /** « objectif 1:22:45 (run moyen 5:00) ». */
  objectiveText: string;
  timeSource: string;
  /** Libellé de la barre de départ (nom court de la course). */
  startLabel: string;
  /** Une activité de montre est liée à la course. */
  watchLinked: boolean;
}) {
  if (!strategy) return <div style={{ fontSize: 13, color: C.tx3 }}>Pas d'objectif pour cette course : il manque des temps de run.</div>;
  if (levers.length === 0) {
    return <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Partout dans l'objectif ou devant ({objectiveText}) : rien à rattraper sur cette course.</div>;
  }
  const sum = (g: string) => levers.filter((l) => l.group === g).reduce((n, l) => n + l.gainS, 0);
  const strat = sum("strategie");
  const cap = sum("capacite");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...KICKER, color: C.ac }}>Et avec une meilleure stratégie ?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Ton chrono" value={fmtClock(strategy.currentS)} />
        <Stat label="Possible" value={fmtClock(strategy.possibleS)} color={C.ac} />
      </div>
      <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
        {fmtDuration(strategy.currentS - strategy.possibleS)} à gagner en revenant à l'objectif
        {strat > 0 && cap > 0 ? ` : ${fmtDuration(strat)} de stratégie, ${fmtDuration(cap)} de capacité.` : strat > 0 ? ", tout en stratégie." : ", tout en capacité."}
      </div>
      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={KICKER}>Du chrono actuel au possible</span>
        <RaceGainsCascade currentS={strategy.currentS} possibleS={strategy.possibleS} items={cascadeSteps(levers)} startLabel={startLabel} />
      </div>
      {GROUPS.map((g) => {
        const ls = levers.filter((l) => l.group === g.key);
        if (!ls.length) return null;
        return (
          <section key={g.key} aria-label={g.title} style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ ...KICKER, color: CASCADE_COLOR[g.key] }}>{g.title} · {g.sub}</span>
              <span style={{ ...MONO, fontSize: 12.5, color: C.tx2 }}>−{fmtDuration(sum(g.key))}</span>
            </div>
            {ls.map((l) => <LeverRow key={l.key} l={l} coach={coach} />)}
          </section>
        );
      })}
      <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>
        Contre l'{objectiveText}. Chaque seconde de retard n'est comptée qu'une fois ; un point sous 10 s n'est pas cité.
        {onObjective > 0 ? ` ${onObjective === 1 ? "1 station est" : `${onObjective} stations sont`} déjà dans l'objectif ou devant.` : ""}
      </div>
      <Sources>temps : {timeSource} · {objectiveText}{!watchLinked ? " · aucune donnée montre" : levers.some((l) => l.hint) ? " · montre : indices (FC, cadence), jamais chiffrés à part" : " · montre : aucun indice sur ces leviers"}</Sources>
    </div>
  );
}
