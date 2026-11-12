import { cn } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { Tag } from "@/ui/Tag";

export interface CycleLite {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  /** Chargement des cycles ou création en cours. */
  loading: boolean;
  activeCycle: CycleLite | null;
  cyclesList: CycleLite[];
  todayISO: string;
  currentWeek: number;
  totalWeeks: number;
  deloadWeek: number;
  /** Bloc hérité, affiché quand aucun cycle n'existe encore. */
  legacyName?: string;
  legacyStartDate?: string;
  viewOnly?: boolean;
  canCreateCycle: boolean;
  onSelect: (cycle: CycleLite) => void;
  onCreateCycle: () => void;
}

const formatDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

/** Bandeau du cycle ouvert : statut, dates, semaine en cours, sélecteur de cycle. */
export function CycleBanner({
  loading, activeCycle, cyclesList, todayISO, currentWeek, totalWeeks, deloadWeek,
  legacyName, legacyStartDate, viewOnly, canCreateCycle, onSelect, onCreateCycle,
}: Props) {
  // Un cycle dont la date de fin est passée n'est plus « en cours ».
  const cycleEnded = !!activeCycle && activeCycle.end_date < todayISO;
  const statusLabel = !activeCycle
    ? ""
    : activeCycle.end_date < todayISO ? "Cycle passé"
    : activeCycle.start_date > todayISO ? "Cycle à venir"
    : "Cycle en cours";

  return (
    <section className="mb-agon-lg rounded-lg border border-agon-info/30 bg-agon-s1 px-agon-lg py-agon-md font-ui text-agon-tx">
      {loading ? (
        <div className="flex items-center gap-agon-md">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-agon-coach border-t-transparent" />
          <span className="text-agon-sm text-agon-tx3">Création du cycle…</span>
        </div>
      ) : activeCycle ? (
        <div className="flex flex-col gap-agon-md md:flex-row md:items-center md:gap-agon-xl">
          <div className="flex min-w-0 flex-1 items-center gap-agon-md">
            <div className="min-w-0 flex-1">
              <div className={cn("mb-agon-xs text-agon-xs font-semibold uppercase tracking-wide", cycleEnded ? "text-agon-tx3" : "text-agon-info")}>
                {statusLabel}
              </div>
              <div className="truncate text-agon-lg font-extrabold">{activeCycle.name}</div>
              <div className="mt-agon-2xs text-agon-xs text-agon-tx3">
                {formatDate(activeCycle.start_date)} → {formatDate(activeCycle.end_date)}
                {cycleEnded ? " · terminé" : activeCycle.start_date > todayISO ? " · à venir" : ` · S${currentWeek}/${totalWeeks}`}
              </div>
            </div>
            {deloadWeek > 0 && <Tag tone="info">Deload S{deloadWeek}</Tag>}
          </div>

          {cyclesList.length > 1 && (
            <select
              aria-label="Cycle affiché"
              value={activeCycle.id}
              onChange={(e) => { const c = cyclesList.find((x) => x.id === e.target.value); if (c) onSelect(c); }}
              className="h-10 w-full rounded-md border border-agon-brd-l bg-agon-s2 px-agon-md font-ui text-agon-lg text-agon-tx md:max-w-md md:text-agon-sm"
            >
              {cyclesList.map((c) => {
                const status = c.end_date < todayISO ? "Passé" : c.start_date > todayISO ? "À venir" : "En cours";
                return (
                  <option key={c.id} value={c.id}>
                    {status} · {c.name} ({formatDate(c.start_date)} → {formatDate(c.end_date)})
                  </option>
                );
              })}
            </select>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-agon-md">
          <div className="min-w-0 flex-1">
            <div className="truncate text-agon-base font-bold">{legacyName || "Cycle sans nom"}</div>
            {legacyStartDate ? (
              <div className="mt-agon-2xs text-agon-xs text-agon-tx3">Début {formatDate(legacyStartDate)} · {totalWeeks} semaines</div>
            ) : (
              <div className="mt-agon-2xs text-agon-xs text-agon-alerte">Date de début manquante</div>
            )}
          </div>
          {!viewOnly && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!canCreateCycle}
              className="shrink-0 border-agon-coach/40 bg-agon-coach-doux text-agon-coach hover:text-agon-coach"
              onClick={onCreateCycle}
            >
              Créer le cycle
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
