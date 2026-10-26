/**
 * Affichage du « thème du jour » : une pastille (cases de calendrier) et un
 * bandeau (bandeau athlète, drawer).
 *
 * Les deux lisent la même ligne `day_themes` et tirent leurs couleurs de
 * `dayThemeColors`, jamais d'un `color: "#fff"` codé en dur — sinon un thème
 * jaune devient invisible. Un thème vide ne rend rien : c'est le composant qui
 * décide de disparaître, pas chaque appelant.
 */
import { C } from "@/lib/theme";
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
        style={{
          width: 6, height: 6, borderRadius: 3,
          background: bg, flexShrink: 0, display: "inline-block",
        }}
      />
    );
  }

  return (
    <span
      title={hint}
      style={{
        display: "block", maxWidth: "100%",
        fontSize: 9, fontWeight: 700, lineHeight: 1.3,
        padding: "1px 4px", borderRadius: 3,
        background: bg, color: fg,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
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
      style={{
        borderRadius: 6, overflow: "hidden",
        border: "1px solid " + C.brdL, background: C.s2,
        borderLeft: "3px solid " + bg,
        padding: "8px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
          padding: "2px 6px", borderRadius: 4, background: bg, color: fg, flexShrink: 0,
        }}>
          Thème du jour
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.tx }}>{label}</span>
        {badges.map((b) => (
          <span key={b} style={{
            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
            background: C.s1, color: C.tx2, border: "1px solid " + C.brd,
          }}>
            {b}
          </span>
        ))}
      </div>
      {note && (
        <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap" }}>
          {note}
        </div>
      )}
    </div>
  );
}
