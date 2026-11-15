import { C } from "@/lib/theme";
import { KICKER, MONO } from "@/features/shared/components/seance/seanceUi";
import {
  cadenceDrop, compromisedRunning, runEfficiency, roxzoneRecovery, timeAboveHr, type RaceWatchAnalysis,
} from "@/lib/hyrox/raceWatch";
import { fmtClock, fmtPace } from "@/lib/seance";
import type { RunLookup } from "@/lib/hyrox/runPacing";
import { Stat } from "./raceAnalysisUi";

const runName = (key: string) => key.replace("run_", "run ");
const comma = (x: number) => x.toFixed(2).replace(".", ",");
/** Baisse de FC : « −10 » ; une FC qui remonte s'écrit « +3 ». */
const fall = (drop: number) => (drop >= 0 ? `−${drop}` : `+${Math.abs(drop)}`);

/**
 * « Ce que dit la montre » : course compromise, dérive cardiaque, récupération
 * en Roxzone, temps au-dessus de SV2, chute de cadence. La course précédente
 * n'est comparée que sur la course compromise (calculable sans sa montre).
 */
export default function RaceWatchCards({ title, analysis, above, recov, sv2, previous, attribution = null, levelP50 = null }: {
  title: string;
  /** Appareil (« Garmin Forerunner 265 ») pour la note de source, côté coach. */
  attribution?: string | null;
  analysis: RaceWatchAnalysis;
  above: ReturnType<typeof timeAboveHr>;
  recov: ReturnType<typeof roxzoneRecovery>;
  sv2: number | null;
  /** Course précédente : nom court et course compromise d'après ses temps. */
  previous: { name: string; compromised: ReturnType<typeof compromisedRunning> } | null;
  /** Médianes des runs au niveau de l'athlète (écart habituel). */
  levelP50?: RunLookup | null;
}) {
  const compromised = compromisedRunning(analysis, levelP50);
  const eff = runEfficiency(analysis);
  const cad = cadenceDrop(analysis);
  const prevC = previous?.compromised;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={KICKER}>{title}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {compromised && (
          <Stat label="Course compromise" value={String(compromised.spreadS)} unit="s/km d'écart"
            color={compromised.usualSpreadS != null && compromised.spreadS - compromised.usualSpreadS >= 10 ? C.o : undefined}
            sub={`Entre le run le plus rapide et le plus lent des runs 2 à 7${compromised.usualSpreadS != null ? ` (habituel ${compromised.usualSpreadS})` : ""} · croisière ${fmtPace(compromised.cruiseS)}${compromised.worst ? ` · pire : ${runName(compromised.worst.key)} après ${compromised.worst.after} (+${compromised.worst.sPerKm})` : ""}`}
            note={previous && prevC ? `${previous.name} : ${prevC.spreadS} s/km d'écart` : undefined} />
        )}
        {eff && (
          <Stat label="Dérive cardiaque" value={`${eff.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(eff.pct * 100))}`} unit="%"
            sub={`Mètres par battement, ${runName(eff.firstKey)} → ${runName(eff.lastKey)} : ${comma(eff.first)} → ${comma(eff.last)}`} />
        )}
        {recov && <Stat label="Récupération en Roxzone" value={fall(recov.avgDrop)} unit="bpm en 60 s" sub={`Le moins bien après ${recov.worst.station} : ${fall(recov.worst.drop)} bpm`} />}
        {above && sv2 != null && <Stat label="Au-dessus de SV2" value={fmtClock(above.totalS)} sub={`${Math.round(above.share * 100)} % du chrono au-dessus de ${sv2} bpm`} />}
        {cad && (
          <Stat label="Chute de cadence" value={`−${cad.worst.drop}`} unit="pas/min"
            sub={`${cad.worst.after ? `Run après ${cad.worst.after}` : runName(cad.worst.key)}${cad.next ? ` ; −${cad.next.drop} après ${cad.next.after ?? runName(cad.next.key)}` : ""}`}
            note={`croisière (runs 2 à 7) : ${cad.cruiseCadence} pas/min`} />
        )}
      </div>
      {attribution && (
        <div style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{attribution} + règles de calcul Agon · constats calculés, sans IA</div>
      )}
    </div>
  );
}
