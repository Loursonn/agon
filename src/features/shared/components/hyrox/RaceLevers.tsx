import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import type { LeverView } from "@/lib/hyrox/objective/levers";
import { CASCADE_COLOR, WATCH_PILL, leverPicto } from "./raceAnalysisShared";
import { Sources } from "./raceAnalysisUi";

/**
 * « Leviers · quoi travailler » (coach, planche HyroxAnaCoachOrdi) : leviers
 * « meilleure stratégie » contre l'objectif (docs/HYROX_OBJECTIF_CONCEPTION.md
 * §9), classés par secondes, avec la proposition de travail et l'axe du dernier
 * bilan de tests validé. « Ajouter au programme » copie la proposition et ouvre
 * la Programmation de l'athlète (le coach la place).
 */
export default function RaceLevers({ title, levers, athleteId, objectiveText, onObjective }: {
  title: string;
  levers: LeverView[];
  athleteId: string;
  /** « objectif 1:22:45 (run moyen 5:00) ». */
  objectiveText: string;
  /** Stations dans l'objectif ou devant. */
  onObjective: number;
}) {
  const navigate = useNavigate();
  const ranked = [...levers].sort((a, b) => b.gainS - a.gainS);
  const max = Math.max(1, ...ranked.map((l) => l.gainS));

  const addToProgram = async (l: LeverView) => {
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
        <span style={{ fontSize: 12, color: C.tx3 }}>classés par secondes à gagner</span>
      </div>
      {ranked.length === 0 ? (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Aucun point à plus de 10 s de l'{objectiveText} : rien de prioritaire sur cette course.</div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          {ranked.map((l, i) => {
            const color = CASCADE_COLOR[l.group];
            return (
              <div key={l.key} style={{
                display: "grid", gridTemplateColumns: "28px 44px minmax(180px, 1.4fr) minmax(120px, 0.8fr) minmax(200px, 1.6fr) auto",
                gap: 14, alignItems: "center", padding: "14px 16px", borderTop: i ? `1px solid ${C.brd}` : "none",
              }}>
                <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>{i + 1}</span>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: alpha(color, 0.16), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <HyroxPicto station={leverPicto(l.key)} size={22} color={color} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {l.label}
                    {l.hint && <span style={WATCH_PILL}>INDICE MONTRE</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.tx2, marginTop: 2, lineHeight: 1.4 }}>{l.detail}</div>
                  {l.hint && <div style={{ fontSize: 12, color: C.tx2, marginTop: 2, lineHeight: 1.4 }}>{l.hint}</div>}
                </div>
                <div>
                  <div style={{ ...MONO, fontSize: 12.5, color: C.tx }}>−{l.gainS} s <span style={{ color: C.tx3 }}>· {l.group === "strategie" ? "stratégie" : "capacité"}</span></div>
                  <div style={{ height: 4, borderRadius: 2, background: C.s2, marginTop: 6 }}>
                    <div style={{ width: `${Math.max(4, (l.gainS / max) * 100)}%`, height: 4, borderRadius: 2, background: color }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.45 }}>
                  {l.proposal ?? <span style={{ color: C.tx2 }}>Allure de course : voir les axes du bilan de tests.</span>}
                  {l.axis && <div style={{ fontSize: 12, color: C.tx2, marginTop: 4 }}>Déjà dans ses axes : <span style={{ color: C.tx }}>{l.axis.axis}</span></div>}
                </div>
                {l.proposal ? (
                  <button type="button" onClick={() => void addToProgram(l)} style={{ ...buttonStyle(i === 0 ? "primary" : "ghost"), whiteSpace: "nowrap" }}>
                    Ajouter au programme
                  </button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      )}
      <Sources>
        calcul Agon · secondes perdues au-delà de la tolérance, comptées une seule fois · {objectiveText}
        {ranked.some((l) => l.axis) ? " · axes : dernier bilan de tests validé" : ""}
        {onObjective > 0 ? ` · ${onObjective === 1 ? "1 station est" : `${onObjective} stations sont`} dans l'objectif ou devant` : ""}
      </Sources>
    </div>
  );
}
