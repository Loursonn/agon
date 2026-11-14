import { useEffect, useState, type ReactNode } from "react";
import { GitMerge, Pencil, RotateCcw, Scissors, Sparkles } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { fmtClock, fmtInt, fmtKm, fmtPaceOrSpeed, SERIES_COLORS, zoneColor } from "@/lib/seance";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import { ZonePill } from "./SeanceChart";
import { LapExercisePicker, type LapType } from "./LapExercisePicker";
import type { LapEditorActions } from "./SeanceLapEditor";
import { MONO, buttonStyle } from "./seanceUi";

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
          Touche un tour pour le choisir. Glisse une poignée dorée pour déplacer une limite. Pince pour zoomer.
        </div>
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
                  <span style={{ display: "block", fontSize: 13, color: on ? C.ac : C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.names[i]}</span>
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
        <div style={{ borderTop: `1px solid ${C.brdL}`, background: C.s2, padding: "12px 12px calc(14px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12, borderRadius: "18px 18px 0 0" }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            <Action icon={<Scissors size={18} />} label="Couper" onClick={p.onCut} />
            <Action icon={<GitMerge size={18} />} label="Fusionner" onClick={p.onMerge} disabled={p.selected >= p.laps.length - 1} />
            {p.hyrox && p.onResetProposal
              ? <Action icon={<Sparkles size={18} />} label="Proposition Agon" onClick={p.onResetProposal} />
              : <Action icon={<Pencil size={18} />} label="Renommer" onClick={() => setRenaming(true)} />}
            <Action icon={<RotateCcw size={18} />} label="Tours montre" onClick={p.onResetWatch} />
          </div>

          {/* Limites du tour et coupe saisies à la main (min s), comme « Début / Fin » à l'ordinateur. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            <MinSecField label="Début" value={lap.startS} disabled={p.selected === 0} onCommit={(v) => p.onSetBounds(v, lap.endS)} />
            <MinSecField label="Fin" value={lap.endS} disabled={p.selected === p.laps.length - 1} onCommit={(v) => p.onSetBounds(lap.startS, v)} />
            <MinSecField label="Couper à" value={cut} onCommit={p.onCutAtChange} accent />
          </div>
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
