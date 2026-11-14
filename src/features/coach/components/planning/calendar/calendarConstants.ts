import { Dumbbell, Zap, FlaskConical, Target } from "lucide-react";
import { C, H } from "@/lib/theme";
import { TYPE_COLOR as PEPS } from "@/lib/peps";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { PlanningCardState } from "@/lib/planningCard";

export const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const FREE_COLOR    = PEPS.libre;  // patine (peps)
export const TEST_COLOR    = PEPS.test;   // rose (peps)
export const BIO_COLOR     = C.g;   // olivier (DA)
export const BIO_BANK_ID   = "bio-mensurations";
export const BIO_TITLE     = "Mensurations / Photos";

export const LIFE_EVENT_COLOR = H.grisBleu;

export const TYPE_COLOR: Record<CalEvent["type"], string> = {
  workout:       C.ac,            // or — muscu
  test:          TEST_COLOR,      // bronze — tests
  competition:   PEPS.competition,             // rouge (peps) — compétitions
  energy:        C.b,             // ardoise — énergie
  free_activity: FREE_COLOR,      // patine — activités libres
  life_event:    LIFE_EVENT_COLOR, // gris — événements vie
};

export const TYPE_BG: Record<CalEvent["type"], string> = {
  workout:       C.acS,
  test:          TEST_COLOR + "20",
  competition:   C.rS,
  energy:        C.bS,
  free_activity: FREE_COLOR + "20",
  life_event:    LIFE_EVENT_COLOR + "20",
};

export const STATUS_OPACITY: Record<string, number> = {
  planned:     1,
  in_progress: 1,
  completed:   0.6,
  missed:      0.4,
  skipped:     0.5,
};

/** Repère montre sur une séance du mois (P34) : à confirmer (or) ou réalisée (vert). */
export const WATCH_MARK: Partial<Record<PlanningCardState, { color: string; title: string }>> = {
  toConfirm: { color: C.ac, title: "Activité de montre à confirmer" },
  done:      { color: C.g,  title: "Réalisée (montre)" },
  syncing:   { color: C.b,  title: "Synchro en cours" },
};

export const CARD_KIND_LABEL: Record<CalEvent["type"], string> = {
  workout: "Musculation", energy: "Énergie", test: "Test", competition: "Compétition", free_activity: "Activité", life_event: "",
};
export const CARD_MONO = "'Geist Mono', ui-monospace, monospace";

export type BankItemType = "workout" | "energy" | "specifique" | "test" | "biometric";

export const BANK_TYPE_LABEL: Record<BankItemType, string> = {
  workout: "Musculation", energy: "Énergie", specifique: "Spécifique", test: "Test", biometric: "Biométrie",
};

export const ENERGY_KIND_COLOR: Record<string, string> = {
  vo2: C.ac, tempo: C.b, seuil: H.ambre,
  footing: H.emeraude, fartlek: H.rougeVif, autre: H.gris, custom: H.gris,
};
export const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

export type BankTab = "workout" | "energy" | "specifique" | "tests";

export const BANK_TABS: { key: BankTab; label: string; Icon: typeof Dumbbell; color: string }[] = [
  { key: "workout",    label: "Muscu",      Icon: Dumbbell,     color: C.ac },
  { key: "energy",     label: "Énergie",    Icon: Zap,          color: C.ac },
  { key: "specifique", label: "Spécifique", Icon: Target,       color: H.miel },
  { key: "tests",      label: "Tests",      Icon: FlaskConical, color: TEST_COLOR },
];
