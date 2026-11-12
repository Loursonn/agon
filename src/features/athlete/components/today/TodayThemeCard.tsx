import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { dayTint } from "@/lib/peps";
import {
  DAY_THEME_DOMINANTE_LABEL,
  DAY_THEME_INTENSITY_LABEL,
  isDayThemeDominante,
  isDayThemeEmpty,
  isDayThemeIntensity,
  normalizeDayThemeLabel,
  type DayThemeLike,
} from "@/lib/dayTheme";
import { TypePill } from "./TypePill";

/**
 * Thème du jour posé par le coach (maquette « Aujourd'hui ») : carte teintée
 * de l'intensité, pastille pleine pour l'intensité, contour pour la
 * dominante, titre et consigne.
 */
export function TodayThemeCard({ theme }: { theme: DayThemeLike | null | undefined }) {
  if (!theme || isDayThemeEmpty(theme)) return null;
  const tint = dayTint(theme) ?? C.ac;
  const intensity = isDayThemeIntensity(theme.intensity) ? DAY_THEME_INTENSITY_LABEL[theme.intensity] : null;
  const dominante = isDayThemeDominante(theme.dominante) ? DAY_THEME_DOMINANTE_LABEL[theme.dominante] : null;
  const title = normalizeDayThemeLabel(theme.label) || dominante || intensity || "";
  const note = (theme.note ?? "").trim();
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${tint}73`, background: `${tint}1F`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3, marginRight: 4 }}>Thème du jour</span>
        {intensity && <TypePill color={tint}>{intensity}</TypePill>}
        {dominante && (
          <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: tint, border: `1px solid ${tint}`, borderRadius: 999, padding: "2px 8px" }}>
            {dominante}
          </span>
        )}
      </div>
      {title && <div style={{ ...DISPLAY, fontSize: 18, color: C.tx }}>{title}</div>}
      {note && <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note}</div>}
    </div>
  );
}
