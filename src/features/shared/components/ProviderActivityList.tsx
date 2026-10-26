import { useState } from "react";
import { C } from "@/lib/theme";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHr,
  formatPace,
  provenanceOf,
  sourceLabel,
  sportLabel,
} from "@/lib/activityDisplay";
import {
  useProviderActivities,
  type ProviderActivity,
} from "@/features/shared/hooks/useProviderActivities";

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

  if (!athleteId) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {titre}
        </div>
        {activities && activities.length > 0 && (
          <div style={{ fontSize: 10, color: C.tx3 }}>
            {activities.length} sortie{activities.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {isLoading && <div style={{ fontSize: 11, color: C.tx3 }}>Chargement…</div>}

      {error && (
        <div style={{ fontSize: 11, color: C.r, background: C.rS, border: "1px solid " + C.r + "30", borderRadius: 6, padding: "8px 10px" }}>
          Lecture impossible : {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {activities && activities.length === 0 && (
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
          Aucune sortie pour l'instant. Elles arrivent par une montre connectée, ou par l'import de
          fichiers d'activité.
        </div>
      )}

      {activities && activities.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activities.map((a) => (
            <Ligne
              key={a.id}
              activity={a}
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
  activity: a,
  ouverte,
  onToggle,
}: {
  activity: ProviderActivity;
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

  return (
    <div style={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 4, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "9px 11px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sportLabel(a.sport)}
          </span>
          <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>
            {formatActivityDate(a.localDate)}
          </span>
          <span
            style={{
              fontSize: 9,
              color: C.tx3,
              border: "1px solid " + C.brd,
              borderRadius: 8,
              padding: "1px 6px",
              flexShrink: 0,
            }}
          >
            {sourceLabel(a.source)}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
          {mesures.map((m) => (
            <span key={m.label} style={{ fontSize: 11, color: C.tx2 }}>
              <span style={{ color: C.tx3 }}>{m.label} </span>
              {m.valeur}
            </span>
          ))}
        </div>
      </button>

      {ouverte && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 10, color: C.tx3 }}>
            Départ{" "}
            {new Date(a.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {new Date(a.startedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>

          {provenances.length > 0 ? (
            <>
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>D'où viennent ces chiffres</div>
              {provenances.map((p) => (
                <div key={p.label} style={{ fontSize: 11, color: C.tx2, lineHeight: 1.45 }}>
                  <span style={{ color: C.tx3 }}>{p.label} : </span>
                  {p.text}
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.45 }}>
              Chiffres lus directement dans le fichier de la montre, sans recalcul.
            </div>
          )}
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
  if (!activities || activities.length === 0) return null;

  const depuis = new Date();
  depuis.setDate(depuis.getDate() - semaines * 7);
  const borne = depuis.toISOString().slice(0, 10);

  const parSport = new Map<string, { n: number; durationS: number; distanceM: number }>();
  for (const a of activities) {
    if (a.localDate < borne) continue;
    const clef = a.sport ?? "autre";
    const acc = parSport.get(clef) ?? { n: 0, durationS: 0, distanceM: 0 };
    acc.n++;
    acc.durationS += a.durationS ?? 0;
    acc.distanceM += a.distanceM ?? 0;
    parSport.set(clef, acc);
  }

  if (parSport.size === 0) return null;

  const lignes = [...parSport.entries()].sort((a, b) => b[1].durationS - a[1].durationS);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, color: C.tx3 }}>
        {semaines} dernières semaines
      </div>
      {lignes.map(([sport, acc]) => (
        <div key={sport} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11 }}>
          <span style={{ color: C.tx, fontWeight: 600, flex: 1, minWidth: 0 }}>{sportLabel(sport)}</span>
          <span style={{ color: C.tx2 }}>{acc.n} sortie{acc.n > 1 ? "s" : ""}</span>
          <span style={{ color: C.tx2 }}>{formatDuration(acc.durationS)}</span>
          {acc.distanceM > 0 && <span style={{ color: C.tx2 }}>{formatDistance(acc.distanceM)}</span>}
        </div>
      ))}
    </div>
  );
}
