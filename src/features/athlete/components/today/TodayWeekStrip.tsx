import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map(({ day, theme, dots, allDone, empty, isCompetition }) => {
          const isToday = day.date === today;
          const tint = isCompetition ? TYPE_COLOR.competition : dayTint(theme);
          const label = dayThemeFullLabel(theme);
          return (
            <div key={day.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ ...MONO, fontSize: 10, color: isToday ? C.ac : C.tx3 }}>{DOW[day.dow]}</span>
              <button
                type="button"
                onClick={() => onSelect(day)}
                title={label || undefined}
                aria-label={`${new Date(day.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}${label ? " · " + label : ""}`}
                style={{
                  position: "relative", overflow: "hidden", width: "100%", height: 46, borderRadius: 8, padding: 0,
                  border: isToday ? `1.5px solid ${C.ac}` : `1px solid ${tint ? tint + "59" : C.brd}`,
                  background: tint ? tint + "24" : C.s1,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {tint && <span aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: tint }} />}
                <span style={{ ...MONO, fontSize: 14, color: empty ? C.tx3 : C.tx }}>{new Date(day.date + "T12:00:00").getDate()}</span>
                <span style={{ display: "flex", gap: 3, height: 5 }} aria-hidden>
                  {dots.slice(0, 4).map((c, i) => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />
                  ))}
                </span>
              </button>
              <span style={{ ...MONO, fontSize: 10, height: 12, color: allDone ? TYPE_COLOR.fait : C.tx3 }}>
                {allDone ? "✓" : empty ? "—" : ""}
              </span>
            </div>
          );
        })}
      </div>
      {usedIntensities.size > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
          {(Object.keys(INTENSITY_COLOR) as Array<keyof typeof DAY_THEME_INTENSITY_LABEL>).map((k) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, ...MONO, fontSize: 10, color: C.tx3 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: INTENSITY_COLOR[k] }} />
              {DAY_THEME_INTENSITY_LABEL[k] === "Récup active" ? "Récup" : DAY_THEME_INTENSITY_LABEL[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
