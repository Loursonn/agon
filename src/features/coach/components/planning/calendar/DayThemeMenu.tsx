/**
 * Menu rapide du thème du jour, ouvert par un clic sur l'en-tête d'un jour du
 * planning coach (semaine et mois).
 *
 * Un clic sur une intensité enregistre tout de suite. Le commentaire est la
 * « note » du thème : l'athlète la lit sous le thème de son jour. Le libellé,
 * la dominante et la couleur restent dans le panneau de la journée
 * (« Plus d'options… »).
 *
 * Le contenu est rendu dans un portail, mais les événements React remontent
 * quand même jusqu'à la case du jour : chaque clic est arrêté ici pour ne pas
 * ouvrir le panneau en même temps.
 */
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, MessageSquare, SlidersHorizontal, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { C, H } from "@/lib/theme";
import {
  DAY_THEME_INTENSITIES,
  DAY_THEME_INTENSITY_COLOR,
  DAY_THEME_INTENSITY_LABEL,
  colorForIntensityPick,
  isDayThemeDominante,
  isDayThemeEmpty,
  isDayThemeIntensity,
  safeThemeColor,
  type DayThemeIntensity,
  type DayThemeLike,
} from "@/lib/dayTheme";
import { useDeleteDayTheme, useUpsertDayTheme } from "@/features/shared/hooks/useDayThemes";
import { MONO } from "@/features/shared/components/seance/seanceUi";

const NOTE_MAX = 500;
const stop = (e: SyntheticEvent) => e.stopPropagation();

export function DayThemeMenu({
  athleteId,
  coachId,
  date,
  theme,
  onMoreOptions,
  children,
}: {
  athleteId: string;
  coachId: string;
  date: Date;
  theme: DayThemeLike | null | undefined;
  /** Ouvre le panneau de la journée (éditeur complet du thème). */
  onMoreOptions: () => void;
  /** L'en-tête du jour, qui sert de déclencheur. */
  children: ReactNode;
}) {
  const dateStr = format(date, "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [note, setNote] = useState("");
  const { mutate: upsert, isPending: saving } = useUpsertDayTheme();
  const { mutate: remove, isPending: removing } = useDeleteDayTheme();

  const themed = !isDayThemeEmpty(theme);
  const current = isDayThemeIntensity(theme?.intensity) ? theme!.intensity : null;
  const savedNote = (theme?.note ?? "").trim();

  // À chaque ouverture : on repart du commentaire enregistré, menu replié.
  useEffect(() => {
    if (!open) return;
    setCommenting(false);
    setNote(theme?.note ?? "");
  }, [open, theme?.note]);

  /** Réécrit le thème en gardant tout ce que le menu ne touche pas. */
  function save(patch: { intensity?: DayThemeIntensity; color?: string; note?: string }, close: boolean) {
    upsert(
      {
        athleteId,
        coachId,
        date: dateStr,
        label: theme?.label ?? "",
        intensity: patch.intensity ?? current,
        dominante: isDayThemeDominante(theme?.dominante) ? theme!.dominante : null,
        color: patch.color ?? safeThemeColor(theme?.color),
        note: patch.note ?? theme?.note ?? "",
      },
      { onSuccess: () => { if (close) setOpen(false); else setCommenting(false); } },
    );
  }

  function pickIntensity(k: DayThemeIntensity) {
    if (k === current) { setOpen(false); return; }
    save({ intensity: k, color: colorForIntensityPick(theme, k) }, true);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Thème du ${format(date, "EEEE d MMMM", { locale: fr })}`}
          onClick={stop}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
          style={{ cursor: "pointer", minWidth: 0 }}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-0"
        onClick={stop}
        onPointerDown={stop}
        style={{
          background: C.s1, border: "1px solid " + C.brdL, borderRadius: 12,
          boxShadow: "none", color: C.tx, overflow: "hidden",
        }}
      >
        <div style={{
          ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
          color: C.tx3, padding: "12px 14px 8px",
        }}>
          Thème · {format(date, "EEE d MMM", { locale: fr }).replace(/\./g, "")}
        </div>

        <div role="menu" style={{ display: "flex", flexDirection: "column", padding: "0 6px" }}>
          {DAY_THEME_INTENSITIES.map((k) => (
            <button
              key={k}
              role="menuitemradio"
              aria-checked={current === k}
              disabled={saving}
              onClick={() => pickIntensity(k)}
              style={{
                ...itemStyle,
                background: current === k ? C.s2 : "transparent",
                color: current === k ? C.tx : C.tx2,
                fontWeight: current === k ? 600 : 400,
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: DAY_THEME_INTENSITY_COLOR[k],
              }} />
              <span style={{ flex: 1 }}>{DAY_THEME_INTENSITY_LABEL[k]}</span>
              {current === k && <Check size={14} color={C.ac} />}
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: C.brd, margin: "6px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", padding: "0 6px 6px" }}>
          {commenting ? (
            <div style={{ padding: "4px 6px 6px", display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                onKeyDown={stop}
                maxLength={NOTE_MAX}
                rows={3}
                placeholder="Ce que l'athlète doit savoir sur cette journée"
                style={{
                  width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 64,
                  padding: "8px 10px", borderRadius: 10, fontFamily: "inherit", fontSize: 13,
                  background: C.s2, color: C.tx, border: "1px solid " + C.brd,
                }}
              />
              {!themed && (
                <div style={{ fontSize: 12, color: C.tx3 }}>
                  Choisis d'abord une intensité : le commentaire s'affiche sous le thème.
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => save({ note }, false)}
                  disabled={!themed || saving}
                  style={{
                    ...btnStyle, flex: 1,
                    background: themed ? C.ac : C.s2, color: themed ? H.noir : C.tx3,
                    border: "1px solid " + (themed ? C.ac : C.brd),
                    cursor: themed && !saving ? "pointer" : "not-allowed",
                  }}
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button onClick={() => setCommenting(false)} style={{ ...btnStyle, flex: 1 }}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCommenting(true)} style={itemStyle}>
              <MessageSquare size={14} color={C.tx3} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {savedNote ? "Modifier le commentaire" : "Ajouter un commentaire"}
                {savedNote && (
                  <span style={{
                    display: "block", fontSize: 12, color: C.tx3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {savedNote}
                  </span>
                )}
              </span>
            </button>
          )}

          <button
            onClick={() => { setOpen(false); onMoreOptions(); }}
            style={itemStyle}
          >
            <SlidersHorizontal size={14} color={C.tx3} />
            <span style={{ flex: 1 }}>Plus d'options…</span>
          </button>

          {themed && (
            <button
              onClick={() => remove({ athleteId, date: dateStr }, { onSuccess: () => setOpen(false) })}
              disabled={removing}
              style={{ ...itemStyle, color: C.r }}
            >
              <Trash2 size={14} />
              <span style={{ flex: 1 }}>Retirer le thème</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const itemStyle = {
  display: "flex", alignItems: "center", gap: 10, width: "100%",
  padding: "8px 8px", borderRadius: 8, border: "none", textAlign: "left" as const,
  background: "transparent", color: C.tx2, fontSize: 13, fontFamily: "inherit",
  cursor: "pointer",
};

const btnStyle = {
  padding: "7px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
  fontSize: 13, fontWeight: 600, background: "transparent", color: C.tx2,
  border: "1px solid " + C.brdL,
};
