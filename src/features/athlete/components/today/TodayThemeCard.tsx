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
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: `1px solid ${tint}73`, background: `${tint}21`, padding: "12px 14px 12px 17px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: tint }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "url(/maquette/theme-frise.svg) left center/auto 100% repeat-x", opacity: 0.12 }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: tint }}>Thème du jour</span>
        <span style={{ flex: 1 }} />
        {intensity && <TypePill color={tint}>{intensity}</TypePill>}
        {dominante && (
          <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: tint, border: `1px solid ${tint}73`, borderRadius: 999, padding: "2px 8px" }}>
            {dominante}
          </span>
        )}
      </div>
      {title && <div style={{ position: "relative", ...DISPLAY, fontSize: 15, color: C.tx }}>{title}</div>}
      {note && <div style={{ position: "relative", fontSize: 12, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note}</div>}
    </div>
  );
}
