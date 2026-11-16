import { useEffect, useState, type ReactNode } from "react";
import { GitMerge, Lock, Pencil, Plus, RotateCcw, Scissors, Sparkles, Trash2 } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { fmtClock, fmtInt, fmtKm, fmtPaceOrSpeed, SERIES_COLORS, zoneColor } from "@/lib/seance";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import { cellEditFromText, isManualLap, LAP_PHASES, type TableField } from "@/lib/lapEdits";
import { LapCellInput } from "./LapCellInput";
import { PhasePill } from "./SeanceLapsTable";
import { ZonePill } from "./SeanceChart";
import { LapExercisePicker, type LapType } from "./LapExercisePicker";
import type { LapEditorActions } from "./SeanceLapEditor";
import { KICKER, MONO, PHASE_COLOR, buttonStyle } from "./seanceUi";

interface Props extends LapEditorActions {
  hyrox: boolean;
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  selected: number;
  onSelect: (i: number) => void;
  cutAtS: number | null;
  saving: boolean;
  dirty: boolean;
  zonesN: number;
  /** Le graphique (même composant qu'en lecture, en mode édition). */
  chart: ReactNode;
  /** Vélo : vitesse (km/h) au lieu de l'allure. */
  speed?: boolean;
}

/** « Modifier les tours » au téléphone : plein écran, utilisable au pouce. */
export function SeanceLapEditorMobile(p: Props) {
  const lap = p.laps[p.selected];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(lap?.name ?? "");
  const [type, setType] = useState<LapType>("station");
  useEffect(() => {
    setName(lap?.name ?? "");
    setRenaming(false);
    setType(/transition|roxzone/i.test(lap?.name ?? "") ? "transition" : /course|run/i.test(lap?.name ?? "") ? "run" : "station");
  }, [p.selected, lap?.name]);
  const cut = p.cutAtS ?? (lap ? Math.round((lap.startS + lap.endS) / 2) : 0);
  const [tab, setTab] = useState<"values" | "bounds">("values");
  const man = lap ? isManualLap(lap) : false;
  const speed = !!p.speed;
  const commit = (field: TableField, text: string) => {
    if (!lap) return false;
    const e = cellEditFromText(field, text, { speed, durationS: lap.metrics.durationS });
    if (!e) return false;
    p.onCell(p.selected, e);
    return true;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, padding: "0 12px", borderBottom: `1px solid ${C.brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <button type="button" onClick={p.onCancel} style={{ ...buttonStyle(), border: "none", color: C.tx2 }}>Annuler</button>
        {/* Planches HyroxAjusterTel / SeanceModifierToursTel : titre large, « OK » en texte or. */}
        <span style={{ fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", fontWeight: 400, fontSize: 15, letterSpacing: "0.06em" }}>
          {p.hyrox ? "Ajuster les tours" : "Modifier les tours"}
        </span>
        <button type="button" onClick={p.onSave} disabled={p.saving || !p.dirty} style={{
          ...buttonStyle(), border: "none", height: 34, padding: "0 4px", fontSize: 15, fontWeight: 600,
          color: p.dirty ? C.ac : C.tx3, cursor: p.dirty ? "pointer" : "default",
        }}>
          {p.saving ? "…" : "OK"}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: C.tx2 }}>
          Touche un tour pour le choisir. Glisse une poignée dorée pour déplacer une limite. Pince, ou + / −, pour zoomer.
        </div>
        {/* Même rangée qu'en lecture : le choix Temps / Distance se pose à droite du titre. */}
        <div style={KICKER}>Graphique de la séance</div>
        {p.chart}

        <div style={{ borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, overflow: "hidden" }}>
          {p.laps.map((l, i) => {
            const on = i === p.selected;
            return (
              <button
                key={`${l.startS}-${i}`}
                type="button"
                onClick={() => p.onSelect(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "0 12px", border: "none",
                  borderTop: i ? `1px solid ${C.brd}` : "none", background: on ? alpha(C.ac, 0.1) : "transparent",
                  boxShadow: on ? `inset 3px 0 0 ${C.ac}` : "none", color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <span style={{ ...MONO, fontSize: 11, width: 16, color: on ? C.ac : C.tx3 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: on ? C.ac : C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.names[i]}</span>
                    {l.lapType && <PhasePill phase={l.lapType} />}
                    {isManualLap(l) && <span style={{ fontSize: 10.5, color: C.tx3, whiteSpace: "nowrap" }}>à la main</span>}
                  </span>
                  <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>
                    {fmtClock(l.metrics.durationS)}
                    {l.metrics.distanceM != null && ` · ${fmtKm(l.metrics.distanceM, 2)} km`}
                    {l.metrics.avgPaceSPerKm != null && <> · <span style={{ color: SERIES_COLORS.pace }}>{fmtPaceOrSpeed(l.metrics.avgPaceSPerKm, !!p.speed)}{p.speed ? " km/h" : ""}</span></>}
                  </span>
                </span>
                <span style={{ ...MONO, fontSize: 12.5, color: l.metrics.meanZone ? zoneColor(l.metrics.meanZone, p.zonesN) : C.tx }}>{fmtInt(l.metrics.avgHr)}</span>
                <ZonePill zone={l.metrics.meanZone} n={p.zonesN} />
              </button>
            );
          })}
        </div>
        <div style={{ height: 8 }} />
      </div>

      {lap && (
        <div style={{ borderTop: `1px solid ${C.brdL}`, background: C.s2, padding: "12px 12px calc(14px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12, borderRadius: "18px 18px 0 0", maxHeight: p.hyrox ? undefined : "56vh", overflowY: p.hyrox ? undefined : "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>Tour {p.selected + 1} · {p.names[p.selected]}</span>
            <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>
              {fmtClock(lap.metrics.durationS)}{lap.metrics.distanceM != null && ` · ${fmtKm(lap.metrics.distanceM, 2)} km`}
            </span>
          </div>

          {p.hyrox ? (
            <LapExercisePicker compact type={type} onType={setType} onPick={(n, id) => p.onApplyExercise?.(n, id, type)} />
          ) : renaming ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                style={{ flex: 1, height: 44, padding: "0 12px", borderRadius: 10, background: C.bg, border: `1px solid ${C.ac}`, color: C.tx, fontSize: 16, fontFamily: "inherit", outline: "none" }} />
              <button type="button" style={{ ...buttonStyle("primary"), height: 44 }} onClick={() => { p.onRename(name.trim()); setRenaming(false); }}>OK</button>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: `repeat(${p.hyrox ? 4 : 3}, 1fr)`, gap: 6 }}>
            <Action icon={<Scissors size={18} />} label="Couper" onClick={p.onCut} disabled={man} />
            <Action icon={<GitMerge size={18} />} label="Fusionner" onClick={p.onMerge} disabled={man || p.selected >= p.laps.length - 1} />
            {!p.hyrox && <Action icon={<Trash2 size={18} />} label="Supprimer" onClick={() => p.onDelete()} disabled={!p.canDelete()} />}
            {!p.hyrox && <Action icon={<Plus size={18} />} label="Tour à la main" onClick={() => p.onAddManual()} />}
            {p.hyrox && p.onResetProposal
              ? <Action icon={<Sparkles size={18} />} label="Proposition Agon" onClick={p.onResetProposal} />
              : <Action icon={<Pencil size={18} />} label="Renommer" onClick={() => setRenaming(true)} />}
            <Action icon={<RotateCcw size={18} />} label="Tours montre" onClick={p.onResetWatch} />
          </div>

          {!p.hyrox && !man && (
            <div role="tablist" style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: C.bg, alignSelf: "flex-start" }}>
              {([["values", "Valeurs du tour"], ["bounds", "Limites et coupe"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{
                  height: 30, padding: "0 12px", borderRadius: 8, border: "none", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
                  background: tab === k ? C.s1 : "transparent", color: tab === k ? C.tx : C.tx3,
                }}>{label}</button>
              ))}
            </div>
          )}

          {!p.hyrox && (man || tab === "values") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {man && <div style={{ fontSize: 12, color: C.tx2 }}>Tour tapé à la main (montre oubliée ou arrêtée) : pas de FC, le reste se tape ici.</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                {LAP_PHASES.map((ph) => {
                  const on = lap.lapType === ph.id;
                  const c = PHASE_COLOR[ph.id];
                  return (
                    <button key={ph.id} type="button" aria-pressed={on} onClick={() => p.onCell(p.selected, { field: "phase", value: on ? null : ph.id })} style={{
                      height: 36, borderRadius: 10, border: `1px solid ${on ? c : C.brdL}`, background: on ? alpha(c, 0.16) : "transparent",
                      color: on ? c : C.tx2, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", padding: "0 2px",
                    }}>{ph.short}</button>
                  );
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <Field label="Durée (min:s)">
                  <LapCellInput big label="Durée" value={fmtClock(lap.metrics.durationS)} disabled={!p.canSetDuration()} inputMode="numeric" onCommit={(t) => commit("duration", t)} />
                </Field>
                <Field label="Distance (km)">
                  <LapCellInput big label="Distance (km)" value={lap.metrics.distanceM != null ? fmtKm(lap.metrics.distanceM, 2) : ""} inputMode="decimal"
                    edited={lap.distanceOverrideM != null} before={lap.original?.distanceM != null ? `${fmtKm(lap.original.distanceM, 2)} km` : "—"} onCommit={(t) => commit("distance", t)} />
                </Field>
                <Field label={speed ? "Vitesse moy. (km/h)" : "Allure moy. (/km)"}>
                  <LapCellInput big label={speed ? "Vitesse moyenne" : "Allure moyenne"} value={fmtPaceOrSpeed(lap.metrics.avgPaceSPerKm, speed)}
                    edited={lap.distanceOverrideM != null} before={fmtPaceOrSpeed(lap.original?.avgPaceSPerKm, speed)} onCommit={(t) => commit("pace", t)} />
                </Field>
                <Field label={speed ? "Vitesse max (km/h)" : "Allure max (/km)"}>
                  <LapCellInput big label={speed ? "Vitesse max" : "Allure max"} value={fmtPaceOrSpeed(lap.metrics.maxPaceSPerKm, speed)}
                    edited={!!lap.original && "maxPaceSPerKm" in lap.original} before={fmtPaceOrSpeed(lap.original?.maxPaceSPerKm, speed)} onCommit={(t) => commit("maxPace", t)} />
                </Field>
                <Field label="Cadence moy.">
                  <LapCellInput big label="Cadence moyenne" value={fmtInt(lap.metrics.avgCadence)} inputMode="numeric"
                    edited={!!lap.original && "avgCadence" in lap.original} before={fmtInt(lap.original?.avgCadence)} onCommit={(t) => commit("avgCadence", t)} />
                </Field>
                <Field label="Cadence max">
                  <LapCellInput big label="Cadence max" value={fmtInt(lap.metrics.maxCadence)} inputMode="numeric"
                    edited={!!lap.original && "maxCadence" in lap.original} before={fmtInt(lap.original?.maxCadence)} onCommit={(t) => commit("maxCadence", t)} />
                </Field>
                <Field label="D+ (m)">
                  <LapCellInput big label="D+" value={fmtInt(lap.metrics.ascentM)} inputMode="numeric"
                    edited={!!lap.original && "ascentM" in lap.original} before={fmtInt(lap.original?.ascentM)} onCommit={(t) => commit("ascent", t)} />
                </Field>
                <Field label="D− (m)">
                  <LapCellInput big label="D−" value={fmtInt(lap.metrics.descentM)} inputMode="numeric"
                    edited={!!lap.original && "descentM" in lap.original} before={fmtInt(lap.original?.descentM)} onCommit={(t) => commit("descent", t)} />
                </Field>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.tx3 }}>
                <Lock size={12} />
                <span>FC {fmtInt(lap.metrics.avgHr)} moy. · {fmtInt(lap.metrics.maxHr)} max : données de la montre, non modifiables.</span>
              </div>
            </div>
          )}

          {/* Limites du tour et coupe saisies à la main (min s), comme « Début / Fin » à l'ordinateur. */}
          {!man && (p.hyrox || tab === "bounds") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
              <MinSecField label="Début" value={lap.startS} disabled={p.selected === 0} onCommit={(v) => p.onSetBounds(v, lap.endS)} />
              <MinSecField label="Fin" value={lap.endS} disabled={p.selected === p.laps.length - 1} onCommit={(v) => p.onSetBounds(lap.startS, v)} />
              <MinSecField label="Couper à" value={cut} onCommit={p.onCutAtChange} accent />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Action({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 4px", borderRadius: 12,
        border: `1px solid ${C.brdL}`, background: "transparent", color: disabled ? C.tx3 : C.tx, fontSize: 11, fontFamily: "inherit", cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/** Temps en minutes + secondes, chacun dans son champ (clavier numérique). Validé à la sortie du champ. */
function MinSecInputs({ value, onCommit, disabled, accent }: { value: number; onCommit: (v: number) => void; disabled?: boolean; accent?: boolean }) {
  const [min, setMin] = useState(String(Math.floor(value / 60)));
  const [sec, setSec] = useState(String(value % 60).padStart(2, "0"));
  useEffect(() => { setMin(String(Math.floor(value / 60))); setSec(String(value % 60).padStart(2, "0")); }, [value]);
  const commit = () => {
    const m = Number(min || 0);
    const sc = Number(sec || 0);
    if (!Number.isInteger(m) || !Number.isInteger(sc) || m < 0 || sc < 0 || sc > 59) {
      setMin(String(Math.floor(value / 60)));
      setSec(String(value % 60).padStart(2, "0"));
      return;
    }
    const v = m * 60 + sc;
    if (v !== value) onCommit(v);
  };
  const box = (val: string, set: (v: string) => void, label: string, w: number) => (
    <input
      aria-label={label}
      value={val}
      disabled={disabled}
      inputMode="numeric"
      onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={{ ...MONO, width: w, height: 36, padding: 0, borderRadius: 8, background: C.bg, border: `1px solid ${accent ? alpha(C.ac, 0.6) : C.brdL}`, color: disabled ? C.tx3 : C.tx, fontSize: 16, textAlign: "center", outline: "none" }}
    />
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {box(min, setMin, "minutes", 38)}<span style={{ fontSize: 15, color: C.tx3 }}>:</span>
      {box(sec, setSec, "secondes", 34)}
    </span>
  );
}

function MinSecField({ label, value, onCommit, disabled, accent }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean; accent?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, opacity: disabled ? 0.5 : 1, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: accent ? C.ac : C.tx3 }}>{label} <span style={{ color: C.tx3 }}>(min:s)</span></span>
      <MinSecInputs value={value} onCommit={onCommit} disabled={disabled} accent={accent} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: C.tx3 }}>{label}</span>
      {children}
    </label>
  );
}
