/**
 * Profil sportif : VC retenue (source + date) et VC proposée par les courses
 * des 90 derniers jours. Rien ne change sans le coach (« Utiliser »).
 */
import { C } from "@/lib/theme";
import { useAthleteCriticalSpeed } from "@/features/shared/hooks/useCriticalSpeed";

const SOURCE_LABEL = { test: "test", reference: "saisie", runs: "courses" } as const;
const kmh = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")} km/h`);
const frDay = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export function CriticalSpeedProposal({
  athleteId,
  onUse,
  saving,
}: {
  athleteId: string;
  onUse: (csKmh: number) => void;
  saving?: boolean;
}) {
  const { data, isLoading, isError } = useAthleteCriticalSpeed(athleteId);
  if (isLoading) return null;
  if (isError) return <div style={{ fontSize: 12, color: C.tx3, marginTop: 8 }}>Vitesse critique : lecture impossible.</div>;
  const cur = data?.current ?? null;
  const prop = data?.proposal ?? null;
  return (
    <div style={{ fontSize: 12, color: C.tx2, marginTop: 10, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <span>
        VC retenue : <b style={{ color: C.tx }}>{kmh(cur?.csKmh)}</b>
        {cur ? ` (${SOURCE_LABEL[cur.source]} du ${frDay(cur.day)})` : ""} · seuil 1 : {kmh(data?.s1Kmh)}
      </span>
      {prop && (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          Proposée par les courses des 90 derniers jours : <b style={{ color: C.tx }}>{kmh(prop.csKmh)}</b>
          <button
            type="button"
            disabled={saving}
            onClick={() => onUse(Math.round(prop.csKmh * 10) / 10)}
            style={{ border: "1px solid " + C.brd, background: "transparent", color: C.tx, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
          >
            Utiliser
          </button>
        </span>
      )}
    </div>
  );
}
