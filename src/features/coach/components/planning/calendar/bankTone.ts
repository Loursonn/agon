import type { TestCategory } from "@/features/shared/types/tests";
import type { BankItemType, BankTab } from "./calendarConstants";

/**
 * Classes Tailwind par type d'élément de la banque du planning (couleurs de la
 * charte). Écrites en entier pour que Tailwind les génère. « Spécifique » prend
 * la couleur HYROX de la charte (--agon-type-hyrox).
 */
export const BANK_TONE: Record<BankItemType, { bar: string; card: string; chip: string; dragging: string }> = {
  workout:    { bar: "bg-agon-accent",    card: "border-agon-accent/[0.33] bg-agon-accent/[0.12]",       chip: "border-agon-accent/25 bg-agon-accent-doux text-agon-accent",              dragging: "border-agon-accent/25 bg-agon-accent text-agon-tx" },
  energy:     { bar: "bg-agon-info",      card: "border-agon-info/[0.33] bg-agon-info/[0.12]",           chip: "border-agon-info/25 bg-agon-info-doux text-agon-info",                    dragging: "border-agon-info/25 bg-agon-info text-agon-tx" },
  specifique: { bar: "bg-agon-type-hyrox", card: "border-agon-type-hyrox/[0.33] bg-agon-type-hyrox/[0.12]", chip: "border-agon-type-hyrox/25 bg-agon-type-hyrox/[0.125] text-agon-type-hyrox", dragging: "border-agon-type-hyrox/25 bg-agon-type-hyrox text-agon-tx" },
  test:       { bar: "bg-agon-type-test", card: "border-agon-type-test/[0.33] bg-agon-type-test/[0.12]", chip: "border-agon-type-test/25 bg-agon-type-test/[0.125] text-agon-type-test", dragging: "border-agon-type-test/25 bg-agon-type-test text-agon-tx" },
  biometric:  { bar: "bg-agon-succes",    card: "border-agon-succes/[0.33] bg-agon-succes/[0.12]",       chip: "border-agon-succes/25 bg-agon-succes/[0.125] text-agon-succes",           dragging: "border-agon-succes/25 bg-agon-succes text-agon-tx" },
};

/** Pastille de catégorie du bandeau « Programmer », sélectionnée. */
export const BANK_TAB_ON: Record<BankTab, string> = {
  workout:    "border-agon-accent/60 bg-agon-accent/[0.14] font-semibold text-agon-accent",
  energy:     "border-agon-info/60 bg-agon-info/[0.14] font-semibold text-agon-info",
  specifique: "border-agon-type-hyrox/60 bg-agon-type-hyrox/[0.14] font-semibold text-agon-type-hyrox",
  tests:      "border-agon-type-test/60 bg-agon-type-test/[0.14] font-semibold text-agon-type-test",
};

/** Catégorie de la colonne « Programmer » du mois, sélectionnée (aplat 10 %, liseré 44 %). */
export const BANK_SIDE_TAB_ON: Record<BankTab, string> = {
  workout:    "border-agon-accent/[0.44] bg-agon-accent/10 font-bold text-agon-accent",
  energy:     "border-agon-accent/[0.44] bg-agon-accent/10 font-bold text-agon-accent",
  specifique: "border-agon-type-hyrox/[0.44] bg-agon-type-hyrox/10 font-bold text-agon-type-hyrox",
  tests:      "border-agon-type-test/[0.44] bg-agon-type-test/10 font-bold text-agon-type-test",
};

/** Libellé du type de séance d'énergie (VO₂, seuil…) : couleurs de la charte. */
export const ENERGY_KIND_TEXT: Record<string, string> = {
  vo2: "text-agon-accent", tempo: "text-agon-info", seuil: "text-agon-alerte",
  footing: "text-agon-succes", fartlek: "text-agon-erreur", autre: "text-agon-pierre", custom: "text-agon-pierre",
};

/** Catégorie de tests repliable : texte, et liseré 31 % + aplat 6 % une fois ouverte. */
export const TEST_CAT_TONE: Record<TestCategory | "hyrox" | "autres", { text: string; open: string }> = {
  bilan_articulaire: { text: "text-agon-info",   open: "border-agon-info/[0.314] bg-agon-info/[0.063]" },
  endurance:         { text: "text-agon-succes", open: "border-agon-succes/[0.314] bg-agon-succes/[0.063]" },
  force:             { text: "text-agon-erreur", open: "border-agon-erreur/[0.314] bg-agon-erreur/[0.063]" },
  explosivite:       { text: "text-agon-alerte", open: "border-agon-alerte/[0.314] bg-agon-alerte/[0.063]" },
  vitesse:           { text: "text-agon-accent", open: "border-agon-accent/[0.314] bg-agon-accent/[0.063]" },
  hyrox:             { text: "text-agon-type-hyrox", open: "border-agon-type-hyrox/[0.314] bg-agon-type-hyrox/[0.063]" },
  autres:            { text: "text-agon-tx3",    open: "border-agon-tx3/[0.314] bg-agon-tx3/[0.063]" },
};
