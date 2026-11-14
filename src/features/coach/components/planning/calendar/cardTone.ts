import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { PlanningCardState } from "@/lib/planningCard";
import { isBiometric } from "./calendarUtils";

/**
 * Couleurs des cartes et pastilles du planning, en classes Tailwind de la charte
 * (écrites en entier pour que Tailwind les génère). « Spécifique » = HYROX,
 * événement de vie = pierre (au lieu des gris H.*).
 */
export type CardTone = "accent" | "info" | "energie" | "hyrox" | "test" | "competition" | "libre" | "vie" | "succes" | "erreur";

/** Ton d'une séance selon son type (carte Semaine). */
export function eventTone(event: CalEvent): CardTone {
  if (event.type === "energy") return event.sessionKind === "specifique" ? "hyrox" : "info";
  if (isBiometric(event)) return "succes";
  return TYPE_TONE[event.type];
}

export const TYPE_TONE: Record<CalEvent["type"], CardTone> = {
  workout: "accent", test: "test", competition: "competition", energy: "info", free_activity: "libre", life_event: "vie",
};

/** Carte Semaine : aplat 12 %, liseré 33 % (20 % si manquée), barre et pastille pleines. */
export const CARD_TONE: Record<CardTone, { tint: string; edge: string; edgeMissed: string; solid: string; text: string }> = {
  accent:      { tint: "bg-agon-accent/[0.12]",           edge: "border-agon-accent/[0.33]",           edgeMissed: "border-agon-accent/20",           solid: "bg-agon-accent",           text: "text-agon-accent" },
  info:        { tint: "bg-agon-info/[0.12]",             edge: "border-agon-info/[0.33]",             edgeMissed: "border-agon-info/20",             solid: "bg-agon-info",             text: "text-agon-info" },
  energie:     { tint: "bg-agon-type-energie/[0.12]",     edge: "border-agon-type-energie/[0.33]",     edgeMissed: "border-agon-type-energie/20",     solid: "bg-agon-type-energie",     text: "text-agon-type-energie" },
  hyrox:       { tint: "bg-agon-type-hyrox/[0.12]",       edge: "border-agon-type-hyrox/[0.33]",       edgeMissed: "border-agon-type-hyrox/20",       solid: "bg-agon-type-hyrox",       text: "text-agon-type-hyrox" },
  test:        { tint: "bg-agon-type-test/[0.12]",        edge: "border-agon-type-test/[0.33]",        edgeMissed: "border-agon-type-test/20",        solid: "bg-agon-type-test",        text: "text-agon-type-test" },
  competition: { tint: "bg-agon-type-competition/[0.12]", edge: "border-agon-type-competition/[0.33]", edgeMissed: "border-agon-type-competition/20", solid: "bg-agon-type-competition", text: "text-agon-type-competition" },
  libre:       { tint: "bg-agon-type-libre/[0.12]",       edge: "border-agon-type-libre/[0.33]",       edgeMissed: "border-agon-type-libre/20",       solid: "bg-agon-type-libre",       text: "text-agon-type-libre" },
  vie:         { tint: "bg-agon-pierre/[0.12]",           edge: "border-agon-pierre/[0.33]",           edgeMissed: "border-agon-pierre/20",           solid: "bg-agon-pierre",           text: "text-agon-pierre" },
  succes:      { tint: "bg-agon-succes/[0.12]",           edge: "border-agon-succes/[0.33]",           edgeMissed: "border-agon-succes/20",           solid: "bg-agon-succes",           text: "text-agon-succes" },
  erreur:      { tint: "bg-agon-erreur/[0.12]",           edge: "border-agon-erreur/[0.33]",           edgeMissed: "border-agon-erreur/20",           solid: "bg-agon-erreur",           text: "text-agon-erreur" },
};

/** Pastille du mois : texte + liseré gauche de la couleur, fond léger (≈ 12,5 %). */
export const CHIP_TONE: Record<CardTone, { fg: string; tint: string }> = {
  accent:      { fg: "border-agon-accent text-agon-accent",                     tint: "bg-agon-accent-doux" },
  info:        { fg: "border-agon-info text-agon-info",                         tint: "bg-agon-info/[0.125]" },
  energie:     { fg: "border-agon-type-energie text-agon-type-energie",         tint: "bg-agon-type-energie/[0.125]" },
  hyrox:       { fg: "border-agon-type-hyrox text-agon-type-hyrox",             tint: "bg-agon-type-hyrox/[0.125]" },
  test:        { fg: "border-agon-type-test text-agon-type-test",               tint: "bg-agon-type-test/[0.125]" },
  competition: { fg: "border-agon-type-competition text-agon-type-competition", tint: "bg-agon-erreur-doux" },
  libre:       { fg: "border-agon-type-libre text-agon-type-libre",             tint: "bg-agon-type-libre/[0.125]" },
  vie:         { fg: "border-agon-pierre text-agon-pierre",                     tint: "bg-agon-pierre/[0.125]" },
  succes:      { fg: "border-agon-succes text-agon-succes",                     tint: "bg-agon-succes/[0.125]" },
  erreur:      { fg: "border-agon-erreur text-agon-erreur",                     tint: "bg-agon-erreur-doux" },
};

/** Repère montre (à confirmer, réalisée, synchro). */
export const WATCH_TONE: Partial<Record<PlanningCardState, string>> = {
  toConfirm: "text-agon-accent",
  done: "text-agon-succes",
  syncing: "text-agon-info",
};
