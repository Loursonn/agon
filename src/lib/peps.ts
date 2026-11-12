import { token } from "@/lib/theme";

/**
 * Direction « peps » (canvas Agon, validée le 12/11) : une couleur fixe par
 * type de séance, de bloc et de macro. Les valeurs vivent dans
 * src/styles/tokens.css ; ce module est le seul endroit où les composants les lisent.
 */

export type SessionType = "muscu" | "energie" | "hyrox" | "test" | "competition" | "fait" | "libre";

export const TYPE_COLOR: Record<SessionType, string> = {
  muscu:       token("--agon-type-muscu"),
  energie:     token("--agon-type-energie"),
  hyrox:       token("--agon-type-hyrox"),
  test:        token("--agon-type-test"),
  competition: token("--agon-type-competition"),
  fait:        token("--agon-type-fait"),
  libre:       token("--agon-type-libre"),
};

export const TYPE_LABEL: Record<SessionType, string> = {
  muscu: "Musculation",
  energie: "Énergie",
  hyrox: "HYROX",
  test: "Test",
  competition: "Compétition",
  fait: "Fait",
  libre: "Séance libre",
};

/** Rouge vif « peps » : compétition, zone 3, bouton danger. */
export const ROUGE = token("--agon-rouge");

/** Couleurs des macros (glucides, lipides, protéines). */
export const MACRO_COLOR = {
  g: token("--agon-macro-g"),
  l: token("--agon-macro-l"),
  p: token("--agon-macro-p"),
} as const;

/** Dominantes de tests : HYROX rose, Biométrie bleu (12/11). */
export const DOMINANTE_COLOR = {
  hyrox: token("--agon-dominante-hyrox"),
  bio: token("--agon-dominante-bio"),
} as const;

/**
 * Palette proposée pour un nouveau bloc : les 5 types de bloc dans l'ordre
 * (Mvt principal, Hypertrophie, Besoin, Assoc., Core), puis 3 couleurs vives.
 */
export const BLOC_PALETTE: readonly string[] = [
  token("--agon-bloc-perf"),
  token("--agon-bloc-esth"),
  token("--agon-bloc-besoin"),
  token("--agon-bloc-assoc"),
  token("--agon-bloc-core"),
  token("--agon-vert-vif"),
  token("--agon-terracotta-vif"),
  token("--agon-ocre-vif"),
];

/**
 * Ancienne palette des blocs (avant le 12/11), encore enregistrée en base sur
 * les blocs existants. Chaque teinte a son équivalent « peps ».
 */
const LEGACY_BLOC: Record<string, string> = {
  "#F97316": token("--agon-bloc-core"),      // orange
  "#22C55E": token("--agon-vert-vif"),       // vert
  "#EF4444": token("--agon-terracotta-vif"), // rouge
  "#3B9EFF": token("--agon-bloc-besoin"),    // bleu
  "#FACC15": token("--agon-or-vif"),         // jaune
  "#EC4899": token("--agon-bloc-esth"),      // rose
  "#14B8A6": token("--agon-bloc-assoc"),     // turquoise
};

/** Couleur affichée d'un bloc : sa couleur enregistrée (convertie si ancienne), sinon celle de son rang. */
export function blocColor(stored: string | null | undefined, index: number): string {
  if (stored) return LEGACY_BLOC[stored.toUpperCase()] ?? stored;
  return BLOC_PALETTE[((index % BLOC_PALETTE.length) + BLOC_PALETTE.length) % BLOC_PALETTE.length];
}

/** Type « peps » d'un événement du planning (types de useUnifiedCalendar). */
export function typeOfEvent(type: string, opts: { hyrox?: boolean } = {}): SessionType {
  if (type === "workout") return "muscu";
  if (type === "energy") return opts.hyrox ? "hyrox" : "energie";
  if (type === "test") return "test";
  if (type === "competition") return "competition";
  return "libre";
}
