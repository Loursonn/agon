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
