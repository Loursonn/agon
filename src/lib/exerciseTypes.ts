/**
 * Taxonomie des types d'exercices (exercises.ex_type).
 * Valeurs DB stables (legacy : muscu / halterophilie / plio / mobilite),
 * labels français affichés partout.
 */

export const EX_TYPES = [
  { value: "muscu",         label: "Musculaire" },
  { value: "halterophilie", label: "Haltérophilie" },
  { value: "mobilite",      label: "Mobilité" },
  { value: "plio",          label: "Pliométrie & Sauts" },
  { value: "vitesse",       label: "Vitesse" },
] as const;

export type ExType = typeof EX_TYPES[number]["value"];

export const EX_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  EX_TYPES.map((t) => [t.value, t.label])
);

export const EX_TYPE_COLOR: Record<string, string> = {
  muscu:         "#FFC933",
  halterophilie: "#F060C0",
  plio:          "#FF9500",
  mobilite:      "#2EE6C5",
  vitesse:       "#33B5FF",
};

export function exTypeLabel(v: string | null | undefined): string {
  return v ? EX_TYPE_LABEL[v] ?? v : "";
}

export function exTypeColor(v: string | null | undefined): string {
  return EX_TYPE_COLOR[v ?? ""] ?? "#8E8780";
}
