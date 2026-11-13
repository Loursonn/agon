import { C } from "@/lib/theme";
import { TYPE_COLOR as PEPS } from "@/lib/peps";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";

export const FREE_COLOR  = PEPS.libre;  // patine (peps)
export const TEST_COLOR  = PEPS.test;   // rose (peps)

export const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

export const TYPE_COLOR: Record<CalEvent["type"], string> = {
  workout:       C.ac,       // or — muscu
  test:          TEST_COLOR, // bronze — tests
  competition:   PEPS.competition,        // rouge (peps) — compétitions
  energy:        C.b,        // ardoise — énergie
  free_activity: FREE_COLOR, // patine — activités libres
  life_event:    C.tx3,      // même repli qu'avant (`?? C.tx3` à l'usage)
};

export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planned:     { label: "Planifiée",  color: C.tx3 },
  in_progress: { label: "En cours",   color: C.b   },
  completed:   { label: "Complétée",  color: C.g   },
  missed:      { label: "Manquée",    color: C.r   },
  skipped:     { label: "Sautée",     color: C.o   },
};
