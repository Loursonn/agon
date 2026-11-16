import type { CSSProperties, ReactNode } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { fmtClock, fmtInt, fmtKm, fmtPaceOrSpeed, SERIES_COLORS, zoneColor } from "@/lib/seance";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import { cellEditFromText, isManualLap, LAP_PHASES, phaseLabel, type CellEdit, type LapPhase, type TableField } from "@/lib/lapEdits";
import type { LapMetrics } from "@shared/domain/lapMetrics";
import { ZonePill } from "./SeanceChart";
import { LapCellInput } from "./LapCellInput";
import { MONO, PHASE_COLOR } from "./seanceUi";

/** Mode « Modifier tours » : toutes les cases s'écrivent, sauf la FC (données de la montre). */
export interface LapsTableEdit {
  onCell: (i: number, edit: CellEdit) => void;
  onDelete: (i: number) => void;
  onAddAfter: (i: number) => void;
  canDelete: (i: number) => boolean;
  canSetDuration: (i: number) => boolean;
}

interface Props {
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  total: LapMetrics | null;
  zonesN: number;
  active: number | null;
  onSelect: (i: number) => void;
  /** Vélo : vitesse (km/h) au lieu de l'allure. */
  speed?: boolean;
  edit?: LapsTableEdit;
}

const COLS = "40px minmax(120px,1.6fr) repeat(10, minmax(54px, 1fr)) 96px 52px";
const COLS_EDIT = "40px minmax(150px,1.6fr) repeat(10, minmax(62px, 1fr)) 128px 44px 60px";
const head = (speed: boolean, editing: boolean) => [
  "N°", "Nom", "Temps", "Distance", speed ? "Vit. moy." : "Allure moy.", speed ? "Vit. max" : "Allure max",
  "FC moy.", "FC max", "Cad. moy.", "Cad. max", "D+", "D−", "Type", "Zone", ...(editing ? [""] : []),
];

/** Pastille du type de tour (Échauffement, Effort, Récup, Retour au calme). */
export function PhasePill({ phase, short = true }: { phase: LapPhase | null | undefined; short?: boolean }) {
  const label = phaseLabel(phase, short);
  if (!label || !phase) return <span style={{ ...MONO, color: C.tx3, fontSize: 11 }}>—</span>;
  const c = PHASE_COLOR[phase];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, background: alpha(c, 0.14), border: `1px solid ${alpha(c, 0.45)}`, color: c, fontSize: 11, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

/** Tableau des tours (ordinateur) : une ligne par tour, cliquable (zoom du graphique) ; modifiable en mode « Modifier tours ». */
export function SeanceLapsTable({ laps, names, total, zonesN, active, onSelect, speed = false, edit }: Props) {
  const editing = !!edit;
  const HEAD = head(speed, editing);
  const cols = editing ? COLS_EDIT : COLS;
  const pace = (v: number | null | undefined) => fmtPaceOrSpeed(v, speed);
  const cell: CSSProperties = { ...MONO, fontSize: 12.5, textAlign: "right", whiteSpace: "nowrap" };
  const hrColor = (m: LapMetrics) => (m.meanZone ? zoneColor(m.meanZone, zonesN) : C.tx);
  const commit = (i: number, field: TableField, text: string) => {
    if (!edit) return false;
    const e = cellEditFromText(field, text, { speed, durationS: laps[i].metrics.durationS });
    if (!e) return false;
    edit.onCell(i, e);
    return true;
  };
  const hr = (v: string, color: string) => (
    <span style={{ ...cell, color, display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }} title={editing ? "FC : donnée de la montre, non modifiable" : undefined}>
      {editing && <Lock size={10} color={C.tx3} />}
      {v}
    </span>
  );

  return (
    <div style={{ border: `1px solid ${C.brd}`, borderRadius: 12, overflow: "hidden", background: C.s1 }} role="table">
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.brd}` }} role="row">
        {HEAD.map((h, i) => (
          <span key={i} style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.tx3, textAlign: i < 2 ? "left" : i >= 12 ? "center" : "right" }}>
            {h}
          </span>
        ))}
      </div>
      {laps.map((l, i) => {
        const m = l.metrics;
        const on = active === i;
        const o = l.original ?? {};
        const man = isManualLap(l);
        const distEdited = l.distanceOverrideM != null;
        return (
          <div
            key={`${l.startS}-${i}`}
            role="row"
            tabIndex={0}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => !editing && (e.key === "Enter" || e.key === " ") && onSelect(i)}
            style={{
              display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "0 14px", minHeight: editing ? 48 : 44,
              borderTop: i ? `1px solid ${C.brd}` : "none", cursor: "pointer",
              background: on ? alpha(C.ac, 0.1) : man ? alpha(C.tx, 0.025) : "transparent", boxShadow: on ? `inset 3px 0 0 ${C.ac}` : "none",
            }}
          >
            <span style={{ ...MONO, fontSize: 11, color: on ? C.ac : C.tx3 }}>{i + 1}</span>
            {editing ? (
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <LapCellInput label={`Nom du tour ${i + 1}`} value={l.name ?? ""} placeholder={names[i]} align="left" onCommit={(t) => commit(i, "name", t)} />
                {man && <span style={{ fontSize: 10.5, color: C.tx3 }}>Tapé à la main · sans montre</span>}
              </span>
            ) : (
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 13, color: on ? C.ac : C.tx, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names[i]}</span>
                {man && <span style={{ fontSize: 10.5, color: C.tx3 }}>Tapé à la main</span>}
              </span>
            )}
            {editing ? (
              <>
                <LapCellInput label={`Temps du tour ${i + 1}`} value={fmtClock(m.durationS)} disabled={!edit.canSetDuration(i)} onCommit={(t) => commit(i, "duration", t)} />
                <LapCellInput label={`Distance du tour ${i + 1} (km)`} value={m.distanceM != null ? fmtKm(m.distanceM, 2) : ""} inputMode="decimal"
                  edited={distEdited} before={o.distanceM != null ? `${fmtKm(o.distanceM, 2)} km` : "—"} onCommit={(t) => commit(i, "distance", t)} />
                <LapCellInput label={`${speed ? "Vitesse" : "Allure"} moyenne du tour ${i + 1}`} value={pace(m.avgPaceSPerKm)}
                  edited={distEdited} before={pace(o.avgPaceSPerKm)} onCommit={(t) => commit(i, "pace", t)} />
                <LapCellInput label={`${speed ? "Vitesse" : "Allure"} max du tour ${i + 1}`} value={pace(m.maxPaceSPerKm)}
                  edited={"maxPaceSPerKm" in o} before={pace(o.maxPaceSPerKm)} onCommit={(t) => commit(i, "maxPace", t)} />
                {hr(fmtInt(m.avgHr), hrColor(m))}
                {hr(fmtInt(m.maxHr), C.tx2)}
                <LapCellInput label={`Cadence moyenne du tour ${i + 1}`} value={fmtInt(m.avgCadence)} inputMode="numeric"
                  edited={"avgCadence" in o} before={fmtInt(o.avgCadence)} onCommit={(t) => commit(i, "avgCadence", t)} />
                <LapCellInput label={`Cadence max du tour ${i + 1}`} value={fmtInt(m.maxCadence)} inputMode="numeric"
                  edited={"maxCadence" in o} before={fmtInt(o.maxCadence)} onCommit={(t) => commit(i, "maxCadence", t)} />
                <LapCellInput label={`D+ du tour ${i + 1}`} value={fmtInt(m.ascentM)} inputMode="numeric"
                  edited={"ascentM" in o} before={fmtInt(o.ascentM)} onCommit={(t) => commit(i, "ascent", t)} />
                <LapCellInput label={`D− du tour ${i + 1}`} value={fmtInt(m.descentM)} inputMode="numeric"
                  edited={"descentM" in o} before={fmtInt(o.descentM)} onCommit={(t) => commit(i, "descent", t)} />
                <PhaseSelect value={l.lapType ?? null} label={`Type du tour ${i + 1}`} onChange={(v) => edit.onCell(i, { field: "phase", value: v })} />
                <span style={{ textAlign: "center" }}><ZonePill zone={m.meanZone} n={zonesN} /></span>
                <span style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
                  <IconBtn label={`Ajouter un tour tapé à la main après le tour ${i + 1}`} onClick={() => edit.onAddAfter(i)}><Plus size={14} /></IconBtn>
                  <IconBtn label={`Supprimer le tour ${i + 1}`} disabled={!edit.canDelete(i)} onClick={() => edit.onDelete(i)}><Trash2 size={14} /></IconBtn>
                </span>
              </>
            ) : (
              <>
                <span style={{ ...cell, fontWeight: 600 }}>{fmtClock(m.durationS)}</span>
                <span style={cell}>{m.distanceM != null ? `${fmtKm(m.distanceM, 2)} km` : "—"}</span>
                <span style={{ ...cell, color: SERIES_COLORS.pace }}>{pace(m.avgPaceSPerKm)}</span>
                <span style={{ ...cell, color: C.tx2 }}>{pace(m.maxPaceSPerKm)}</span>
                {hr(fmtInt(m.avgHr), hrColor(m))}
                {hr(fmtInt(m.maxHr), C.tx2)}
                <span style={cell}>{fmtInt(m.avgCadence)}</span>
                <span style={{ ...cell, color: C.tx2 }}>{fmtInt(m.maxCadence)}</span>
                <span style={cell}>{fmtInt(m.ascentM)}</span>
                <span style={{ ...cell, color: C.tx2 }}>{fmtInt(m.descentM)}</span>
                <span style={{ textAlign: "center" }}><PhasePill phase={l.lapType} /></span>
                <span style={{ textAlign: "center" }}><ZonePill zone={m.meanZone} n={zonesN} /></span>
              </>
            )}
          </div>
        );
      })}
      {total && (
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "0 14px", minHeight: 44, borderTop: `1px solid ${C.brdL}`, background: alpha(C.tx, 0.02) }} role="row">
          <span />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
          <span style={{ ...cell, fontWeight: 600 }}>{fmtClock(total.durationS)}</span>
          <span style={cell}>{total.distanceM != null ? `${fmtKm(total.distanceM, 2)} km` : "—"}</span>
          <span style={{ ...cell, color: SERIES_COLORS.pace }}>{pace(total.avgPaceSPerKm)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{pace(total.maxPaceSPerKm)}</span>
          <span style={cell}>{fmtInt(total.avgHr)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{fmtInt(total.maxHr)}</span>
          <span style={cell}>{fmtInt(total.avgCadence)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{fmtInt(total.maxCadence)}</span>
          <span style={cell}>{fmtInt(total.ascentM)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{fmtInt(total.descentM)}</span>
          <span />
          <span />
          {editing && <span />}
        </div>
      )}
    </div>
  );
}

/** Choix du type de tour. */
export function PhaseSelect({ value, onChange, label, big }: { value: LapPhase | null; onChange: (v: LapPhase | null) => void; label: string; big?: boolean }) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange((e.target.value || null) as LapPhase | null)}
      style={{
        height: big ? 40 : 30, width: "100%", minWidth: 0, padding: "0 6px", borderRadius: 7, background: C.s2,
        border: `1px solid ${value ? alpha(PHASE_COLOR[value], 0.6) : C.brdL}`, color: value ? PHASE_COLOR[value] : C.tx3,
        fontSize: big ? 15 : 12, fontFamily: "inherit", outline: "none",
      }}
    >
      <option value="">— Type</option>
      {LAP_PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 7,
        border: `1px solid ${C.brd}`, background: "transparent", color: disabled ? C.tx3 : C.tx2, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
