import { useState } from "react";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHr,
  formatPace,
  provenanceFallback,
  provenanceOf,
  providerAttribution,
  sportLabel,
} from "@/lib/activityDisplay";
import {
  useProviderActivities,
  type ProviderActivity,
} from "@/features/shared/hooks/useProviderActivities";
import { useRunningVolume, type RunMatch } from "@/features/shared/hooks/useRunningVolume";
import { useGearTotals } from "@/features/shared/hooks/useGearTotals";
import { RemoveActivityButton } from "@/features/shared/components/RemoveActivityButton";

/**
 * Sorties remontées par une montre ou importées depuis un fichier.
 *
 * Même composant pour l'athlète et pour son coach : ce sont les mêmes données,
 * et la base décide déjà ce que chacun peut lire. Deux affichages divergeraient,
 * et l'athlète finirait par ne plus savoir ce que son coach voit.
 *
 * Chaque ligne s'ouvre sur la provenance de ses chiffres. C'est la partie qui
 * paraît superflue et qui ne l'est pas : un GPX n'a ni durée de mouvement ni
 * dénivelé mesuré, donc l'écart avec l'application du fabricant est inévitable.
 * Sans cette explication, la seule conclusion possible est « Agon se trompe ».
 */

const MOIS_COURTS = 2;

export function ProviderActivityList({
  athleteId,
  limit,
  titre = "Sorties enregistrées",
}: {
  athleteId: string | undefined;
  limit?: number;
  titre?: string;
}) {
  const { data: activities, isLoading, error } = useProviderActivities(athleteId, { limit });
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Séance prévue à laquelle chaque sortie se rattache : même calcul que le volume.
  const plusAncienne = activities && activities.length > 0 ? activities[activities.length - 1].localDate : undefined;
  const { matchByActivity } = useRunningVolume(athleteId, [], plusAncienne);

  if (!athleteId) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.5px] text-agon-tx3">
          {titre}
        </div>
        {activities && activities.length > 0 && (
          <div className="text-[10px] text-agon-tx3">
            {activities.length} sortie{activities.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {isLoading && <div className="text-[11px] text-agon-tx3">Chargement…</div>}

      {error && (
        <div className="rounded-[6px] border border-agon-erreur/[0.188] bg-agon-erreur-doux px-2.5 py-2 text-[11px] text-agon-erreur">
          Lecture impossible : {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {activities && activities.length === 0 && (
        <div className="text-[11px] leading-normal text-agon-tx3">
          Aucune sortie pour l'instant. Elles arrivent par une montre connectée, ou par l'import de
          fichiers d'activité.
        </div>
      )}

      {activities && activities.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {activities.map((a) => (
            <Ligne
              key={a.id}
              athleteId={athleteId}
              activity={a}
              seance={matchByActivity.get(a.id)}
              ouverte={ouverte === a.id}
              onToggle={() => setOuverte((id) => (id === a.id ? null : a.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Une sortie : l'essentiel sur une ligne, la provenance au dépli. */
function Ligne({
  athleteId,
  activity: a,
  seance,
  ouverte,
  onToggle,
}: {
  athleteId: string;
  activity: ProviderActivity;
  /** Séance prévue du même jour à laquelle cette sortie est rattachée */
  seance?: RunMatch;
  ouverte: boolean;
  onToggle: () => void;
}) {
  const provenances = provenanceOf(a.details);

  /*
    Les mesures affichées dépendent de ce que la sortie contient, et non du
    sport : une « natation » sans distance et un renforcement avec cardio
    existent tous les deux. Une case vide en dit plus qu'un zéro, mais une
    rangée de quatre cases vides ne dit rien du tout — on n'affiche donc que ce
    qui a une valeur.
  */
  const mesures: Array<{ label: string; valeur: string }> = [];
  if (a.durationS !== null) mesures.push({ label: "Durée", valeur: formatDuration(a.durationS) });
  if (a.distanceM !== null) mesures.push({ label: "Distance", valeur: formatDistance(a.distanceM) });
  if (a.avgPaceSPerKm !== null) mesures.push({ label: "Allure", valeur: formatPace(a.avgPaceSPerKm) });
  if (a.elevationGainM !== null) mesures.push({ label: "D+", valeur: formatElevation(a.elevationGainM) });
  if (a.avgHr !== null || a.maxHr !== null) mesures.push({ label: "FC", valeur: formatHr(a.avgHr, a.maxHr) });
  if (a.calories !== null) mesures.push({ label: "kcal", valeur: String(a.calories) });
  if (a.rpe != null) mesures.push({ label: "RPE", valeur: `${a.rpe}/10` });

  return (
    <div className="overflow-hidden rounded-[4px] border border-agon-brd bg-agon-s2">
      <button
        onClick={onToggle}
        className="flex w-full cursor-pointer flex-col gap-1.5 border-none bg-transparent px-[11px] py-[9px] text-left font-[inherit]"
      >
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-agon-tx">
            {a.title ?? sportLabel(a.sport)}
            {a.title && <span className="font-normal text-agon-tx3"> · {sportLabel(a.sport)}</span>}
          </span>
          {a.commute && (
            <span className="shrink-0 rounded-[8px] border border-agon-brd px-1.5 py-px text-[9px] text-agon-tx3">
              Trajet
            </span>
          )}
          <span className="shrink-0 text-[10px] text-agon-tx3">
            {formatActivityDate(a.localDate)}
          </span>
          <span className="shrink-0 rounded-[8px] border border-agon-brd px-1.5 py-px text-[9px] text-agon-tx3">
            {/* « Garmin [modèle] » : attribution exigée par les conditions Garmin. */}
            {providerAttribution(a.source, a.deviceName)}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-3.5 gap-y-1">
          {mesures.map((m) => (
            <span key={m.label} className="text-[11px] text-agon-tx2">
              <span className="text-agon-tx3">{m.label} </span>
              {m.valeur}
            </span>
          ))}
        </div>

        {/* Renvoi vers la séance prévue : les deux blocs restent séparés, ils se citent. */}
        {seance && (
          <div className="truncate text-[10px] text-agon-succes">
            Séance prévue : {seance.plannedLabel}
          </div>
        )}
      </button>

      {ouverte && (
        <div className="flex flex-col gap-[5px] border-t border-agon-brd px-[11px] py-[9px]">
          <div className="text-[10px] text-agon-tx3">
            Départ{" "}
            {new Date(a.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {new Date(a.startedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>

          {a.description && (
            <div className="whitespace-pre-wrap text-[11px] leading-[1.45] text-agon-tx2">{a.description}</div>
          )}
          {a.gear && (
            <div className="text-[11px] text-agon-tx2">
              <span className="text-agon-tx3">Matériel : </span>
              {a.gear}
            </div>
          )}
          {a.sources && a.sources.includes("strava_archive") && (
            <div className="text-[10px] text-agon-tx3">Complétée par l'archive Strava de l'athlète</div>
          )}

          {provenances.length > 0 ? (
            <>
              <div className="mt-0.5 text-[10px] text-agon-tx3">D'où viennent ces chiffres</div>
              {provenances.map((p) => (
                <div key={p.label} className="text-[11px] leading-[1.45] text-agon-tx2">
                  <span className="text-agon-tx3">{p.label} : </span>
                  {p.text}
                </div>
              ))}
            </>
          ) : (
            <div className="text-[11px] leading-[1.45] text-agon-tx2">
              {provenanceFallback(a.source, a.deviceName)}
            </div>
          )}
          <RemoveActivityButton athleteId={athleteId} activityId={a.id} sources={a.sources} />
        </div>
      )}
    </div>
  );
}

/**
 * Volume des dernières semaines, par sport.
 *
 * Volontairement court : trois chiffres par sport et rien d'autre. Un graphique
 * de plus à côté de ceux du suivi inviterait à comparer deux séries qui ne
 * mesurent pas la même chose — ce que la montre a enregistré n'est pas ce que le
 * coach avait programmé.
 */
export function ProviderActivitySummary({
  athleteId,
  semaines = MOIS_COURTS * 4,
}: {
  athleteId: string | undefined;
  semaines?: number;
}) {
  const { data: activities } = useProviderActivities(athleteId, { limit: 200 });
  // Historique importé sans sortie récente : le matériel reste affiché.
  if (!activities || activities.length === 0) return <GearTotals athleteId={athleteId} />;

  const depuis = new Date();
  depuis.setDate(depuis.getDate() - semaines * 7);
  const borne = depuis.toISOString().slice(0, 10);

  const parSport = new Map<string, { n: number; durationS: number; distanceM: number }>();
  // Provenances des sorties comptées : un total qui inclut des données Garmin
  // doit le dire (« Garmin [modèle] »), comme chaque ligne.
  const provenances = new Set<string>();
  for (const a of activities) {
    if (a.localDate < borne) continue;
    const clef = a.sport ?? "autre";
    const acc = parSport.get(clef) ?? { n: 0, durationS: 0, distanceM: 0 };
    acc.n++;
    provenances.add(providerAttribution(a.source, a.deviceName));
    acc.durationS += a.durationS ?? 0;
    acc.distanceM += a.distanceM ?? 0;
    parSport.set(clef, acc);
  }

  if (parSport.size === 0) return <GearTotals athleteId={athleteId} />;

  const lignes = [...parSport.entries()].sort((a, b) => b[1].durationS - a[1].durationS);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] text-agon-tx3">
        {semaines} dernières semaines
      </div>
      {lignes.map(([sport, acc]) => (
        <div key={sport} className="flex items-baseline gap-2 text-[11px]">
          <span className="min-w-0 flex-1 font-semibold text-agon-tx">{sportLabel(sport)}</span>
          <span className="text-agon-tx2">{acc.n} sortie{acc.n > 1 ? "s" : ""}</span>
          <span className="text-agon-tx2">{formatDuration(acc.durationS)}</span>
          {acc.distanceM > 0 && <span className="text-agon-tx2">{formatDistance(acc.distanceM)}</span>}
        </div>
      ))}
      <div className="text-[10px] text-agon-tx3">
        Sources : {[...provenances].sort().join(", ")}
      </div>
      <GearTotals athleteId={athleteId} />
    </div>
  );
}

/** Kilométrage par matériel (chaussures, vélo), d'après le matériel noté sur les sorties. */
function GearTotals({ athleteId }: { athleteId: string | undefined }) {
  const { data } = useGearTotals(athleteId);
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="text-[10px] text-agon-tx3">Matériel (km cumulés)</div>
      {data.slice(0, 8).map((g) => (
        <div key={g.name} className="flex items-baseline gap-2 text-[11px]">
          <span className="min-w-0 flex-1 truncate text-agon-tx">
            {g.name}
          </span>
          <span className="text-agon-tx2">{g.outings} sortie{g.outings > 1 ? "s" : ""}</span>
          <span className="text-agon-tx2">{g.distanceM > 0 ? formatDistance(g.distanceM) : "—"}</span>
        </div>
      ))}
    </div>
  );
}
