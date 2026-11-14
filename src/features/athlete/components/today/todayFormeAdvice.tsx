import { AgonIcon } from "@/components/ui/AgonIcon";
import { Dumbbell, Zap } from "lucide-react";
import { C } from "@/lib/theme";

// ── Forme advice ──────────────────────────────────────────────────────────────

export const FORM_FIELDS_ICONS: Record<string, React.ReactNode> = {
  fatigue: <AgonIcon name="fatigue" size={16} />,
  sommeil: <AgonIcon name="sommeil" size={16} />,
  stress:  <AgonIcon name="stress" size={16} />,
  energie: <Zap size={16} />,
  doms:    <Dumbbell size={16} />,
};

// Chaque note du wellness va de 1 à 5, 5 = le mieux (voir WELL_ITEMS dans lib/wellness).
// Seuil d'alerte aligné sur getAlerts : 2 ou moins.
export type FormeTip = { text: string; tone: "bad" | "good" };
export const FORM_FIELDS: Array<{ key: string; label: string; advice: (v: number) => FormeTip | null }> = [
  { key: "fatigue", label: "Récupération",
    advice: (v) => v <= 2 ? { text: "Grande fatigue détectée. Priorise le sommeil et réduis l'intensité cette semaine.", tone: "bad" }
      : v >= 4 ? { text: "Bonne récupération. Tu peux pousser plus fort.", tone: "good" } : null },
  { key: "sommeil", label: "Sommeil",
    advice: (v) => v <= 2 ? { text: "Sommeil insuffisant. Vise 7-9h et couche-toi avant minuit.", tone: "bad" } : null },
  { key: "stress",  label: "Stress",
    advice: (v) => v <= 2 ? { text: "Stress élevé : évite les séances HIIT, préfère l'endurance légère.", tone: "bad" } : null },
  { key: "energie", label: "Énergie",
    advice: (v) => v <= 2 ? { text: "Énergie basse : vérifie tes apports glucidiques avant les séances.", tone: "bad" } : null },
  { key: "doms",    label: "Courbatures",
    advice: (v) => v <= 2 ? { text: "Courbatures importantes. Privilégie du travail léger ou une séance d'activation.", tone: "bad" } : null },
];

export function getFormeAdvice(wellness: Record<string, number> | null): Array<{ icon: React.ReactNode; label: string; text: string; color: string }> {
  if (!wellness) return [];
  const tips: Array<{ icon: React.ReactNode; label: string; text: string; color: string }> = [];
  for (const f of FORM_FIELDS) {
    const v = wellness[f.key] as number | undefined;
    if (v == null) continue;
    const tip = f.advice(v);
    if (!tip) continue;
    tips.push({ icon: FORM_FIELDS_ICONS[f.key], label: f.label, text: tip.text, color: tip.tone === "bad" ? C.o : C.g });
  }
  return tips;
}
