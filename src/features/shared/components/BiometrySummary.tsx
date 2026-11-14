import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { BIOMETRY_FIELDS, MYJUMP_FIELDS, type MeasurementLog } from "@/features/shared/types/measurements";
import { latestValues, type LatestValue } from "@/lib/biometry";

/**
 * Dernières valeurs de biométrie et des deux mesures MyJump (à recopier dans
 * l'app MyJump). Lu par l'athlète (tiroir Mensurations) et par le coach
 * (Profil sportif). Une valeur jamais mesurée s'affiche « — ».
 */
export function BiometrySummary({ logs }: { logs: readonly MeasurementLog[] }) {
  const groups: [string, LatestValue[]][] = [
    ["Biométrie", latestValues(logs, BIOMETRY_FIELDS)],
    ["MyJump", latestValues(logs, MYJUMP_FIELDS)],
  ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="biometry-summary">
      {groups.map(([title, values]) => (
        <div key={title} className="rounded-[6px] border border-agon-brd bg-agon-s1 px-3.5 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-agon-tx3">{title}</div>
          <div className="flex flex-col gap-1.5">
            {values.map((v) => (
              <div key={v.key} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-[12px] text-agon-tx2">{v.label}</span>
                <span className="text-[14px] font-bold text-agon-tx">{v.value != null ? `${v.value} cm` : "—"}</span>
                <span className="w-[52px] text-right text-[10px] text-agon-tx3">
                  {v.date ? format(new Date(v.date + "T12:00:00"), "d MMM yy", { locale: fr }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
