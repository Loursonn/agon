import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import type { RaceLever } from "@/lib/hyrox/raceLevers";
import { STATION_PICTO } from "./raceAnalysisShared";
import { Sources } from "./raceAnalysisUi";

const comma = (x: number) => String(x).replace(".", ",");

/**
 * « Leviers · quoi travailler » (coach, planche HyroxAnaCoachOrdi) : priorités
 * calculées, raison, proposition de travail. « Ajouter au programme » copie la
 * proposition et ouvre la Programmation de l'athlète (le coach la place).
 */
export default function RaceLevers({ title, levers, athleteId, refText, atLevel }: {
  title: string;
  levers: RaceLever[];
  athleteId: string;
  /** « Women · 1:10–1:20 » */
  refText: string;
  /** Nombre de stations au niveau de la médiane ou devant. */
  atLevel: number;
}) {
  const navigate = useNavigate();
  const maxScore = Math.max(...levers.map((l) => l.score), 1);

  const addToProgram = async (l: RaceLever) => {
    const text = `${l.label} : ${l.proposal}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Proposition copiée : colle-la dans la séance de ton choix.");
    } catch {
      toast.message(`À reprendre dans la séance : ${text}`);
    }
    navigate(`/coach/athletes/${athleteId}/programmation`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={KICKER}>{title}</span>
        <span style={{ fontSize: 12, color: C.tx3 }}>classés par priorité calculée</span>
      </div>
      {levers.length === 0 ? (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Aucun point à plus de 10 s de la médiane {refText} : rien de prioritaire sur cette course.</div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          {levers.map((l, i) => (
            <div key={l.key} style={{
              display: "grid", gridTemplateColumns: "28px 44px minmax(160px, 1.3fr) minmax(150px, 1fr) minmax(200px, 1.6fr) auto",
              gap: 14, alignItems: "center", padding: "14px 16px", borderTop: i ? `1px solid ${C.brd}` : "none",
            }}>
              <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>{i + 1}</span>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: alpha(C.o, 0.14), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <HyroxPicto station={l.station ? STATION_PICTO[l.station] ?? "autre" : "roxzone"} size={22} color={C.o} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {l.label}
                  {l.watch && <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.1em", color: C.ame, border: `1px solid ${alpha(C.ame, 0.5)}`, borderRadius: 4, padding: "1px 5px" }}>INDICE MONTRE</span>}
                </div>
                <div style={{ fontSize: 12, color: C.tx2, marginTop: 2, lineHeight: 1.4 }}>{l.reason}</div>
              </div>
              <div>
                <div style={{ ...MONO, fontSize: 12.5, color: C.tx }}>+{l.gainS} s <span style={{ color: C.tx3 }}>· poids {comma(l.weight)}</span></div>
                <div style={{ height: 4, borderRadius: 2, background: C.s2, marginTop: 6 }}>
                  <div style={{ width: `${Math.max(4, (l.score / maxScore) * 100)}%`, height: 4, borderRadius: 2, background: C.o }} />
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.45 }}>{l.proposal}</div>
              <button type="button" onClick={() => void addToProgram(l)} style={{ ...buttonStyle(i === 0 ? "primary" : "ghost"), whiteSpace: "nowrap" }}>
                Ajouter au programme
              </button>
            </div>
          ))}
        </div>
      )}
      <Sources>
        calcul Agon · priorité = secondes perdues vs médiane {refText} × poids de la station (+ écart au top 1 %)
        {atLevel > 0 ? ` · ${atLevel === 1 ? "1 autre station est" : `les ${atLevel} autres stations sont`} au niveau ou devant la médiane` : ""}
      </Sources>
    </div>
  );
}
