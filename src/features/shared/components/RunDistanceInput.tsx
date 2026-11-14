import { cn } from "@/lib/utils";
import { type ActivityType, ACTIVITY_LABEL, type RunDistanceValue } from "./runDistance";

/**
 * Fin de séance énergie / spécifique : activité réellement faite + distance
 * réalisée (comptée dans le volume de course si « Course »). Facultatif.
 */
export function RunDistanceInput({ value, onChange }: {
  value: RunDistanceValue;
  onChange: (v: RunDistanceValue) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3">
        Activité réalisée
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((a) => {
          const active = value.activity === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...value, activity: a })}
              className={cn(
                "cursor-pointer rounded-[4px] border px-3 py-1.5 font-[inherit] text-[12px] font-semibold",
                active ? "border-agon-accent bg-agon-accent-doux text-agon-accent" : "border-agon-brd-l bg-transparent text-agon-tx3",
              )}
            >
              {ACTIVITY_LABEL[a]}
            </button>
          );
        })}
      </div>
      {value.activity === "course" && (
        <label className="flex items-center gap-2">
          <span className="flex-1 text-[12px] text-agon-tx2">Distance courue</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.km}
            onChange={(e) => onChange({ ...value, km: e.target.value })}
            placeholder="0"
            className="w-20 rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 py-2 text-right font-[inherit] text-[14px] font-bold text-agon-tx [outline:none]"
          />
          <span className="text-[12px] text-agon-tx3">km</span>
        </label>
      )}
    </div>
  );
}
