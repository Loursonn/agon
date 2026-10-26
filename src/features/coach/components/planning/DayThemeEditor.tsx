/**
 * Éditeur du « thème du jour », côté coach, dans le drawer d'une journée.
 *
 * Le coach pose une intention : un libellé court, éventuellement une intensité
 * et une dominante prises dans des raccourcis, une couleur, une note. Les
 * raccourcis ne remplissent pas le libellé à sa place — ils s'ajoutent comme
 * badges —, sinon un clic écraserait le texte qu'il vient de taper.
 *
 * Un raccourci d'intensité propose une couleur, mais seulement tant que le
 * coach n'a pas choisi la sienne : un thème « Hard » qu'on a mis en bleu doit
 * rester bleu.
 */
import { useEffect, useMemo, useState } from "react";
import { Trash2, Check } from "lucide-react";
import { C } from "@/lib/theme";
import {
  DAY_THEME_DEFAULT_COLOR,
  DAY_THEME_DOMINANTES,
  DAY_THEME_DOMINANTE_LABEL,
  DAY_THEME_INTENSITIES,
  DAY_THEME_INTENSITY_COLOR,
  DAY_THEME_INTENSITY_LABEL,
  DAY_THEME_LABEL_MAX,
  DAY_THEME_PALETTE,
  dayThemeChipLabel,
  isDayThemeDominante,
  isDayThemeIntensity,
  normalizeDayThemeLabel,
  normalizeHexColor,
  recentDayThemeSuggestions,
  safeThemeColor,
  textColorOn,
  type DayThemeDominante,
  type DayThemeIntensity,
  type DayThemeSuggestion,
} from "@/lib/dayTheme";
import {
  useDayTheme,
  useDeleteDayTheme,
  useRecentDayThemes,
  useUpsertDayTheme,
} from "@/features/shared/hooks/useDayThemes";
import { DayThemeBanner } from "@/features/shared/components/DayThemePill";

const NOTE_MAX = 500;

export function DayThemeEditor({
  athleteId,
  coachId,
  date,
}: {
  athleteId: string;
  coachId: string;
  /** Date ISO `yyyy-MM-dd`. */
  date: string;
}) {
  const { data: theme } = useDayTheme(athleteId, date);
  const { data: recentRows } = useRecentDayThemes(coachId);
  const { mutate: upsert, isPending: saving } = useUpsertDayTheme();
  const { mutate: remove, isPending: removing } = useDeleteDayTheme();

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [intensity, setIntensity] = useState<DayThemeIntensity | null>(null);
  const [dominante, setDominante] = useState<DayThemeDominante | null>(null);
  const [color, setColor] = useState(DAY_THEME_DEFAULT_COLOR);
  const [note, setNote] = useState("");
  /** Le coach a touché la palette → les raccourcis ne proposent plus de couleur. */
  const [colorTouched, setColorTouched] = useState(false);

  // Recharge le formulaire quand on change de jour ou quand la ligne arrive :
  // sans ça le drawer afficherait le thème de la veille sur la date d'aujourd'hui.
  useEffect(() => {
    setEditing(false);
    setLabel(theme?.label ?? "");
    setIntensity(isDayThemeIntensity(theme?.intensity) ? theme!.intensity : null);
    setDominante(isDayThemeDominante(theme?.dominante) ? theme!.dominante : null);
    setColor(safeThemeColor(theme?.color));
    setNote(theme?.note ?? "");
    setColorTouched(!!theme);
  }, [date, theme]);

  const draft = { label, intensity, dominante, color, note };
  const hasContent = normalizeDayThemeLabel(label) !== "" || !!intensity || !!dominante;

  const recent = useMemo(() => recentDayThemeSuggestions(recentRows), [recentRows]);
  /** La couleur courante sort-elle de la palette ? Alors c'est une couleur perso. */
  const isCustomColor = !(DAY_THEME_PALETTE as readonly string[]).includes(color);

  function pickIntensity(k: DayThemeIntensity) {
    const next = intensity === k ? null : k;
    setIntensity(next);
    if (next && !colorTouched) setColor(DAY_THEME_INTENSITY_COLOR[next]);
  }

  /** Rejoue un thème déjà posé : contenu repris tel quel, date inchangée. */
  function applySuggestion(s: DayThemeSuggestion) {
    setLabel(s.label);
    setIntensity(s.intensity);
    setDominante(s.dominante);
    setColor(s.color);
    // La couleur vient du thème rejoué : un raccourci d'intensité ne doit pas
    // l'écraser derrière le dos du coach.
    setColorTouched(true);
  }

  function handleSave() {
    if (!hasContent) return;
    upsert(
      { athleteId, coachId, date, label, intensity, dominante, color, note },
      { onSuccess: () => setEditing(false) },
    );
  }

  // ── Replié : le thème existant, ou l'invitation à en poser un ──────────────
  if (!editing) {
    return (
      <section>
        <div style={headingStyle}>Thème du jour</div>
        {theme ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DayThemeBanner theme={theme} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(true)} style={{ ...btnStyle, flex: 1 }}>
                Modifier
              </button>
              <button
                onClick={() => remove({ athleteId, date })}
                disabled={removing}
                title="Retirer le thème de ce jour"
                style={{
                  ...btnStyle, width: 34, padding: 0,
                  color: C.r, borderColor: C.r + "60",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ ...btnStyle, width: "100%" }}>
            + Donner un thème à cette journée
          </button>
        )}
      </section>
    );
  }

  // ── Déplié : le formulaire ─────────────────────────────────────────────────
  return (
    <section>
      <div style={headingStyle}>Thème du jour</div>
      <div style={{
        background: C.s2, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Aperçu : le coach voit ce que l'athlète lira, contraste compris. */}
        {hasContent && <DayThemeBanner theme={draft} />}

        {/* Récents en premier : ce qu'il repose chaque semaine, en un clic. */}
        {recent.length > 0 && (
          <div>
            <div style={fieldLabelStyle}>Tes thèmes récents</div>
            <div style={chipRowStyle}>
              {recent.map((s, i) => (
                <button
                  key={`${s.label}|${s.intensity}|${s.dominante}|${s.color}|${i}`}
                  onClick={() => applySuggestion(s)}
                  title="Reprendre ce thème"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 500,
                    padding: "4px 9px", borderRadius: 5,
                    cursor: "pointer", fontFamily: "inherit",
                    background: C.s1, color: C.tx2,
                    border: "1px solid " + C.brd, whiteSpace: "nowrap",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: s.color, flexShrink: 0,
                  }} />
                  {dayThemeChipLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label style={fieldLabelStyle} htmlFor="day-theme-label">
            Libellé
            <span style={{ color: C.tx3, fontWeight: 500 }}>
              {" "}{normalizeDayThemeLabel(label).length}/{DAY_THEME_LABEL_MAX}
            </span>
          </label>
          <input
            id="day-theme-label"
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, DAY_THEME_LABEL_MAX))}
            maxLength={DAY_THEME_LABEL_MAX}
            placeholder="Jambes lourdes, Seuil, Repos complet…"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={fieldLabelStyle}>Intensité</div>
          <div style={chipRowStyle}>
            {DAY_THEME_INTENSITIES.map((k) => (
              <ChoiceChip
                key={k}
                label={DAY_THEME_INTENSITY_LABEL[k]}
                active={intensity === k}
                onClick={() => pickIntensity(k)}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabelStyle}>Dominante</div>
          <div style={chipRowStyle}>
            {DAY_THEME_DOMINANTES.map((k) => (
              <ChoiceChip
                key={k}
                label={DAY_THEME_DOMINANTE_LABEL[k]}
                active={dominante === k}
                onClick={() => setDominante(dominante === k ? null : k)}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabelStyle}>Couleur</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAY_THEME_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); setColorTouched(true); }}
                aria-label={`Couleur ${c}`}
                aria-pressed={color === c}
                style={{
                  width: 24, height: 24, borderRadius: 5, cursor: "pointer",
                  background: c, fontFamily: "inherit",
                  border: color === c ? "2px solid " + C.tx : "1px solid " + C.brd,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: textColorOn(c), padding: 0,
                }}
              >
                {color === c && <Check size={13} />}
              </button>
            ))}

            {/*
              Couleur perso : un `input[type=color]` natif, donc le sélecteur du
              système plutôt qu'une roue maison. La pastille montre la couleur
              courante dès qu'elle sort de la palette, pour que le coach voie
              qu'il est en perso sans ouvrir le sélecteur.
            */}
            <label
              title="Couleur personnalisée"
              style={{
                position: "relative",
                width: 24, height: 24, borderRadius: 5, cursor: "pointer",
                background: isCustomColor
                  ? color
                  : "conic-gradient(#ef4444,#eab308,#22c55e,#06b6d4,#3b82f6,#ec4899,#ef4444)",
                border: isCustomColor ? "2px solid " + C.tx : "1px solid " + C.brd,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: textColorOn(color), boxSizing: "border-box",
              }}
            >
              {isCustomColor && <Check size={13} />}
              <input
                type="color"
                value={color}
                aria-label="Couleur personnalisée"
                onChange={(e) => {
                  const next = normalizeHexColor(e.target.value);
                  if (!next) return;
                  setColor(next);
                  setColorTouched(true);
                }}
                style={{
                  position: "absolute", width: 0, height: 0,
                  opacity: 0, pointerEvents: "none",
                }}
              />
            </label>
          </div>
        </div>

        <div>
          <label style={fieldLabelStyle} htmlFor="day-theme-note">
            Note <span style={{ color: C.tx3, fontWeight: 500 }}>(facultatif)</span>
          </label>
          <textarea
            id="day-theme-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder="Ce que l'athlète doit garder en tête ce jour-là"
            style={{ ...inputStyle, resize: "vertical" as const, minHeight: 48 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={!hasContent || saving}
            title={hasContent ? undefined : "Il faut au moins un libellé, une intensité ou une dominante"}
            style={{
              ...btnStyle, flex: 1,
              background: hasContent ? C.ac : C.s1,
              color: hasContent ? "#000" : C.tx3,
              borderColor: hasContent ? C.ac : C.brd,
              cursor: hasContent && !saving ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button onClick={() => setEditing(false)} style={{ ...btnStyle, flex: 1 }}>
            Annuler
          </button>
        </div>
      </div>
    </section>
  );
}

function ChoiceChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: 11, fontWeight: active ? 700 : 500,
        padding: "4px 9px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
        background: active ? C.ac + "22" : C.s1,
        color: active ? C.ac : C.tx2,
        border: "1px solid " + (active ? C.ac : C.brd),
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

const headingStyle = {
  fontSize: 10, fontWeight: 700, color: C.ac,
  textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 8,
};

const fieldLabelStyle = {
  display: "block", fontSize: 10, fontWeight: 700, color: C.tx3,
  textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5,
};

const chipRowStyle = { display: "flex", gap: 5, flexWrap: "wrap" as const };

const inputStyle = {
  width: "100%", padding: "7px 9px", borderRadius: 4,
  background: C.s1, border: "1px solid " + C.brd, color: C.tx,
  fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const,
};

const btnStyle = {
  padding: "7px 10px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
  fontSize: 12, fontWeight: 600,
  background: C.s1, color: C.tx2, border: "1px solid " + C.brdL,
};
