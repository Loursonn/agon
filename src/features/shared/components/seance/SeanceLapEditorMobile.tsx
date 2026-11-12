import { useEffect, useState, type ReactNode } from "react";
import { GitMerge, Minus, Pencil, Plus, RotateCcw, Scissors, Sparkles } from "lucide-react";
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
        <button type="button" onClick={p.onCancel} style={{ ...buttonStyle(), border: "none" }}>Annuler</button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{p.hyrox ? "Ajuster les tours" : "Modifier les tours"}</span>
        <button type="button" onClick={p.onSave} disabled={p.saving || !p.dirty} style={{ ...buttonStyle("primary"), height: 34, opacity: p.dirty ? 1 : 0.5 }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.tx2, flex: 1 }}>Couper à</span>
            <StepBtn onClick={() => p.onCutAtChange(cut - 1)}><Minus size={16} /></StepBtn>
            <span style={{ ...MONO, fontSize: 18, minWidth: 92, textAlign: "center" }}>
              {Math.floor(cut / 60)} <span style={{ fontSize: 11, color: C.tx3 }}>min</span> {String(cut % 60).padStart(2, "0")} <span style={{ fontSize: 11, color: C.tx3 }}>s</span>
            </span>
            <StepBtn onClick={() => p.onCutAtChange(cut + 1)}><Plus size={16} /></StepBtn>
          </div>
          <div style={{ fontSize: 11, color: C.tx3 }}>− / + = 1 seconde ; ou touche la courbe pour placer la coupe.</div>
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

function StepBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      {children}
    </button>
  );
}
