import { C } from "@/lib/theme";
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
    <div className="relative flex flex-col gap-1 overflow-hidden rounded-xl border py-3 pl-[17px] pr-3.5" style={{ borderColor: `${tint}73`, background: `${tint}21` }}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tint }} />
      <div aria-hidden className="absolute inset-0 bg-[url(/maquette/theme-frise.svg)] bg-[length:auto_100%] bg-[left_center] bg-repeat-x opacity-[0.12]" />
      <div className="relative flex flex-wrap items-center gap-1.5">
        <span className="agon-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: tint }}>Thème du jour</span>
        <span className="flex-1" />
        {intensity && <TypePill color={tint}>{intensity}</TypePill>}
        {dominante && (
          <span className="agon-mono rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.10em]" style={{ color: tint, borderColor: `${tint}73` }}>
            {dominante}
          </span>
        )}
      </div>
      {title && <div className="agon-display relative text-[15px] text-agon-tx">{title}</div>}
      {note && <div className="relative whitespace-pre-wrap text-[12px] leading-[1.5] text-agon-tx2">{note}</div>}
    </div>
  );
}
