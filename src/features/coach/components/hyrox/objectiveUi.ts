import { CATEGORY_LABEL, type ReferenceCategory } from "@/lib/hyrox/categories";
import { C } from "@/lib/theme";

/** Catégories couvertes par la grille d'objectif (Pro doubles : estimé). Le relais est hors champ. */
export const OBJECTIVE_CATEGORIES: ReferenceCategory[] = [
  "women", "men", "women_pro", "men_pro",
  "doubles_women", "doubles_men", "doubles_mixed", "doubles_women_pro", "doubles_men_pro",
];

export const categoryLabel = (c: string): string => CATEGORY_LABEL[c as ReferenceCategory] ?? c;

/** Allure saisissable « 4:59 » (s/km). */
export const runText = (s: number): string => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export const INPUT = {
  height: 36, borderRadius: 8, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx,
  padding: "0 10px", fontSize: 13, fontFamily: "inherit",
} as const;
