/**
 * Affichage du « thème du jour » : une pastille (cases de calendrier) et un
 * bandeau (bandeau athlète, drawer).
 *
 * Les deux lisent la même ligne `day_themes` et tirent leurs couleurs de
 * `dayThemeColors`, jamais d'un blanc codé en dur — sinon un thème
 * jaune devient invisible. Un thème vide ne rend rien : c'est le composant qui
 * décide de disparaître, pas chaque appelant.
 */
import {
  DAY_THEME_DOMINANTE_LABEL,
  DAY_THEME_INTENSITY_LABEL,
  dayThemeChipLabel,
  dayThemeColors,
  isDayThemeDominante,
  isDayThemeEmpty,
  isDayThemeIntensity,
  type DayThemeLike,
} from "@/lib/dayTheme";

/** Pastille compacte, pour une case de calendrier. */
export function DayThemePill({
  theme,
  dot = false,
  title,
}: {
  theme: DayThemeLike | null | undefined;
  /** Vue mois dense : seul un point coloré tient dans la case. */
  dot?: boolean;
  title?: string;
}) {
  if (isDayThemeEmpty(theme)) return null;
  const { bg, fg } = dayThemeColors(theme);
  const label = dayThemeChipLabel(theme);
  const hint = title ?? label;

  if (dot) {
    return (
      <span
        title={hint}
        aria-label={`Thème du jour : ${label}`}
        className="inline-block size-1.5 shrink-0 rounded-[3px]"
        style={{ background: bg }}
      />
    );
  }

  return (
    <span
      title={hint}
      className="block max-w-full truncate rounded-[3px] px-1 py-px text-[9px] font-bold leading-[1.3]"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

/**
 * Bandeau du jour, pour les écrans qui ont de la place. Les badges intensité et
 * dominante restent séparés : le coach les a choisis séparément.
 */
export function DayThemeBanner({
  theme,
  showNote = true,
}: {
  theme: DayThemeLike | null | undefined;
  showNote?: boolean;
}) {
  if (isDayThemeEmpty(theme)) return null;
  const { bg, fg } = dayThemeColors(theme);
  const label = dayThemeChipLabel(theme);
  const intensity = isDayThemeIntensity(theme?.intensity) ? theme!.intensity : null;
  const dominante = isDayThemeDominante(theme?.dominante) ? theme!.dominante : null;
  // Le libellé libre peut déjà être repris d'un raccourci : on évite le doublon.
  const badges = [
    intensity ? DAY_THEME_INTENSITY_LABEL[intensity] : null,
    dominante ? DAY_THEME_DOMINANTE_LABEL[dominante] : null,
  ].filter((b): b is string => !!b && b !== label);
  const note = showNote ? (theme?.note ?? "").trim() : "";

  return (
    <div
      className="overflow-hidden rounded-[6px] border border-l-[3px] border-agon-brd-l bg-agon-s2 px-3 py-2"
      style={{ borderLeftColor: bg }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.5px]"
          style={{ background: bg, color: fg }}
        >
          Thème du jour
        </span>
        <span className="text-[13px] font-extrabold text-agon-tx">{label}</span>
        {badges.map((b) => (
          <span key={b} className="rounded-[4px] border border-agon-brd bg-agon-s1 px-1.5 py-0.5 text-[10px] font-bold text-agon-tx2">
            {b}
          </span>
        ))}
      </div>
      {note && (
        <div className="mt-1.5 whitespace-pre-wrap text-[11px] leading-[1.5] text-agon-tx2">
          {note}
        </div>
      )}
    </div>
  );
}
