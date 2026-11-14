/**
 * Premier lancement athlète (planche Ath1Onboarding) : 3 écrans (bienvenue,
 * montre, premier wellness) puis 3 bulles d'aide sur Aujourd'hui.
 *
 * La fin est gardée sur le profil (`profiles.onboarded_at`, RPC
 * `mark_onboarded`) ; l'appareil garde l'étape en cours (retour de la page
 * d'autorisation COROS) et l'avancement des bulles d'aide.
 */

export const ONBOARDING_STEPS = 3;

const stepKey = (uid: string) => `agon:onboarding:${uid}`;
const tipsKey = (uid: string) => `agon:tips:${uid}`;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}

export function shouldShowOnboarding(o: { role: string | null | undefined; onboardedAt: string | null | undefined; viewOnly: boolean; uid: string | null | undefined }): boolean {
  if (!o.uid || o.viewOnly) return false;
  if (o.role !== "athlete" && o.role !== "coach_athlete") return false;
  if (o.onboardedAt) return false;
  return read(stepKey(o.uid)) !== "done";
}

/** Étape à reprendre (0 à 2). */
export function savedStep(uid: string): number {
  const n = Number(read(stepKey(uid)));
  return Number.isInteger(n) && n >= 0 && n < ONBOARDING_STEPS ? n : 0;
}
export function saveStep(uid: string, step: number): void {
  write(stepKey(uid), String(step));
}
/** Fin du parcours sur cet appareil ; `withTips` : les bulles d'aide suivent. */
export function finishLocally(uid: string, withTips: boolean): void {
  write(stepKey(uid), "done");
  if (withTips) write(tipsKey(uid), "0");
  try { window.dispatchEvent(new Event(TIPS_EVENT)); } catch { /* hors navigateur */ }
}

/** Émis quand les bulles d'aide changent (même onglet). */
export const TIPS_EVENT = "agon:tips";

/** `target` : valeur de l'attribut `data-tip` de l'élément montré par la bulle. */
export interface Tip { title: string; text: string; target: string }
export const TIPS: Tip[] = [
  { target: "seance", title: "Ta séance du jour", text: "Touche « Aperçu » pour voir les exercices, puis lance la séance. Ton coach reçoit tout à la fin." },
  { target: "tab-program", title: "Ton programme", text: "L’onglet Programme montre ta semaine et les séances à venir. Tu peux y déplacer une séance si besoin." },
  { target: "tab-test", title: "Tes tests", text: "L’onglet Tests garde tes valeurs et tes records. Un test prévu par ton coach s’y remplit en une minute." },
];

/** Bulle à montrer (index), ou null. */
export function pendingTip(uid: string | null | undefined): number | null {
  if (!uid) return null;
  const n = Number(read(tipsKey(uid)));
  return read(tipsKey(uid)) != null && Number.isInteger(n) && n >= 0 && n < TIPS.length ? n : null;
}
export function setTip(uid: string, index: number | null): void {
  write(tipsKey(uid), index == null || index >= TIPS.length ? "done" : String(index));
  try { window.dispatchEvent(new Event(TIPS_EVENT)); } catch { /* hors navigateur */ }
}

export interface TipPlacement {
  /** Bulle sous la cible (true) ou au-dessus. */
  below: boolean;
  /** Bord haut (below) ou bas (au-dessus, distance au bas de l'écran), en px. */
  y: number;
  left: number;
  width: number;
  /** Position de la flèche dans la bulle, en px depuis son bord gauche. */
  arrowX: number;
}

/** Où poser la bulle à côté de sa cible, sans sortir de l'écran (marge 16 px, flèche 10 px). */
export function tipPlacement(
  rect: { top: number; bottom: number; left: number; width: number },
  vw: number, vh: number, maxWidth = 360,
): TipPlacement {
  const width = Math.min(maxWidth, vw - 32);
  const cx = rect.left + rect.width / 2;
  const left = Math.min(Math.max(16, cx - width / 2), vw - 16 - width);
  const below = rect.top + rect.bottom < vh; // centre de la cible dans la moitié haute
  const y = below ? rect.bottom + 12 : vh - rect.top + 12;
  const arrowX = Math.min(Math.max(18, cx - left), width - 18);
  return { below, y, left, width, arrowX };
}
