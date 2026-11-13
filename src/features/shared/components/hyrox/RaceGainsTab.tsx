import { C } from "@/lib/theme";
import { CARD, KICKER, MONO } from "@/features/shared/components/seance/seanceUi";
import type { raceGains } from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";
import { fmtDuration } from "./raceAnalysisShared";
import { Sources, Stat } from "./raceAnalysisUi";
import RaceGainsCascade from "./RaceGainsCascade";

/** Liste lisible : « SkiErg, rameur et burpees ». */
function joinFr(xs: string[]): string {
  const l = xs.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1)));
  return l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}`;
}

/** Onglet « Gains » : où gagner du temps, en revenant à la médiane du niveau. */
export default function RaceGainsTab({ gains, atLevel, division, bracketText, timeSource, startLabel }: {
  gains: ReturnType<typeof raceGains> | null;
  /** Stations déjà au niveau de la médiane ou devant. */
  atLevel: string[];
  division: string;
  /** Tranche de chrono des médianes (« 1:10–1:20 »). */
  bracketText: string;
  timeSource: string;
  /** Libellé de la barre de départ (nom court de la course). */
  startLabel: string;
}) {
  const ref = `${division} · ${bracketText}`;
  if (!gains) return <div style={{ fontSize: 13, color: C.tx3 }}>Références HYROX en cours de chargement…</div>;
  if (gains.items.length === 0) {
    return <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Partout au niveau de la médiane {ref} ou devant : rien à rattraper sur cette course.</div>;
  }
  const total = gains.currentS - gains.possibleS;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Ton chrono" value={fmtClock(gains.currentS)} />
        <Stat label="Possible" value={fmtClock(gains.possibleS)} />
      </div>
      <div style={{ fontSize: 13, color: C.tx2 }}>
        {fmtDuration(total)} à gagner sur {gains.items.length} point{gains.items.length > 1 ? "s" : ""}, en revenant à la médiane de ton niveau.
      </div>
      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={KICKER}>Du chrono actuel au possible</span>
        <RaceGainsCascade currentS={gains.currentS} possibleS={gains.possibleS} items={gains.items} startLabel={startLabel} />
        {gains.items.map((g) => (
          <div key={g.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", borderTop: `1px solid ${C.brd}`, paddingTop: 8 }}>
            <div>
              <div style={{ fontSize: 13 }}>{g.label}</div>
              <div style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>
                {g.key === "runs" ? "au-dessus de la médiane" : `${fmtClock(g.athleteS)} · médiane ${fmtClock(g.medianS)}`}
              </div>
            </div>
            <span style={{ ...MONO, fontSize: 13, color: C.o }}>−{Math.round(g.gainS)} s</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>
          Médiane {ref}, comme le radar.{atLevel.length > 0 ? ` ${joinFr(atLevel)} : déjà au niveau ou devant.` : ""}
        </div>
      </div>
      <Sources>temps : {timeSource} · médianes : références HYROX ({ref}) · aucune donnée montre</Sources>
    </div>
  );
}
