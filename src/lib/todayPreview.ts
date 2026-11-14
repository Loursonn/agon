import type { ExerciceParams, ParamValue } from "@/features/coach/components/programmation/types";
import { formatSetsReps } from "@/lib/formatSetsReps";

/**
 * Aperçu d'une séance de musculation sur l'accueil athlète (maquette
 * « Aujourd'hui · aperçu ») : une ligne par exercice, « 5 × 3 · 120 kg ».
 * Jamais de volume ni de tonnage.
 */

function globalValue<T>(pv: ParamValue<T> | undefined): T | undefined {
  return pv && pv.mode === "global" ? pv.value : undefined;
}

const fmtNum = (n: number) => String(n).replace(".", ",");

/** Charge ou RIR visé, s'il est le même pour toutes les séries : « 120 kg », « 75 % », « RIR 2 ». */
export function prescriptionLoad(p: ExerciceParams | null | undefined): string | null {
  if (!p) return null;
  const charge = globalValue(p.charge);
  if (charge != null && charge > 0) {
    if (p.charge_unit === "kg") return `${fmtNum(charge)} kg`;
    if (p.charge_unit === "%RM") return `${fmtNum(charge)} %`;
  }
  const rir = globalValue(p.rir);
  if (rir != null) return `RIR ${fmtNum(rir)}`;
  return null;
}

/** Ligne d'aperçu : « 5 × 3 · 120 kg », « 3 × 45 s », « Libre ». */
export function prescriptionLine(mode: "classique" | "methode" | "libre", p: ExerciceParams | null | undefined): string {
  if (mode === "libre" || !p) return mode === "libre" ? "Libre" : "";
  const base = formatSetsReps(p);
  const load = prescriptionLoad(p);
  return load ? `${base} · ${load}` : base;
}

/** Lettre d'un bloc (A, B, C…) d'après son rang. */
export function blocLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : "·";
}
