import { cn } from "@/lib/utils";
import { INTENSITY_COLOR, TYPE_COLOR, dayTint } from "@/lib/peps";
import { DAY_THEME_INTENSITY_LABEL, dayThemeFullLabel, type DayThemeLike } from "@/lib/dayTheme";
import type { DayProgram } from "@/features/shared/hooks/useWeekProgram";

const DOW = ["L", "M", "M", "J", "V", "S", "D"];

export interface WeekStripDay {
  day: DayProgram;
  theme: DayThemeLike | null;
  /** Pastilles de la journée : une par séance, couleur du type (vert si faite). */
  dots: string[];
  /** Tout ce qui était prévu est fait. */
  allDone: boolean;
  /** Rien de prévu ce jour-là. */
  empty: boolean;
  isCompetition: boolean;
}

/**
 * Semaine de l'accueil athlète (maquette « Aujourd'hui ») : 7 cases teintées
 * par l'intensité du thème, barre haute, pastilles par type, aujourd'hui
 * cerclé d'or ; ✓ sous les jours faits. Légende des intensités dessous.
 */
export function TodayWeekStrip({
  days,
  today,
  onSelect,
}: {
  days: WeekStripDay[];
  today: string;
  onSelect: (day: DayProgram) => void;
}) {
  const usedIntensities = new Set(days.map((d) => d.theme?.intensity).filter(Boolean) as string[]);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[repeat(7,1fr)] gap-1.5">
        {days.map(({ day, theme, dots, allDone, empty, isCompetition }) => {
          const isToday = day.date === today;
          const tint = isCompetition ? TYPE_COLOR.competition : dayTint(theme);
          const label = dayThemeFullLabel(theme);
          return (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span className={cn("agon-mono text-[10px]", isToday ? "text-agon-accent" : "text-agon-tx3")}>{DOW[day.dow]}</span>
              <button
                type="button"
                onClick={() => onSelect(day)}
                title={label || undefined}
                aria-label={`${new Date(day.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}${label ? " · " + label : ""}`}
                className={cn(
                  "relative flex h-[46px] w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-[8px] p-0 font-[inherit]",
                  isToday ? "border-[1.5px] border-agon-accent" : tint ? "border" : "border border-agon-brd",
                  !tint && "bg-agon-s1",
                )}
                style={tint ? { background: tint + "24", ...(isToday ? {} : { borderColor: tint + "59" }) } : undefined}
              >
                {tint && <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: tint }} />}
                <span className={cn("agon-mono text-[14px]", empty ? "text-agon-tx3" : "text-agon-tx")}>{new Date(day.date + "T12:00:00").getDate()}</span>
                <span className="flex h-[5px] gap-[3px]" aria-hidden>
                  {dots.slice(0, 4).map((c, i) => (
                    <span key={i} className="size-[5px] rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </button>
              <span className={cn("agon-mono h-3 text-[10px]", allDone ? "text-agon-type-fait" : "text-agon-tx3")}>
                {allDone ? "✓" : empty ? "—" : ""}
              </span>
            </div>
          );
        })}
      </div>
      {usedIntensities.size > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {(Object.keys(INTENSITY_COLOR) as Array<keyof typeof DAY_THEME_INTENSITY_LABEL>).map((k) => (
            <span key={k} className="agon-mono flex items-center gap-[5px] text-[10px] text-agon-tx3">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: INTENSITY_COLOR[k] }} />
              {DAY_THEME_INTENSITY_LABEL[k] === "Récup active" ? "Récup" : DAY_THEME_INTENSITY_LABEL[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
