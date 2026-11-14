import { TYPE_COLOR } from "@/lib/peps";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import { C, alpha } from "@/lib/theme";
import { DASH, fmtClock, fmtInt, fmtKm, fmtPaceOrSpeed, fmtUpDown, plannedLabel, SERIES_COLORS, zoneColor, type LapKind } from "@/lib/seance";
import { doneValue } from "@/lib/seanceHyrox";
import type { DetailLap, DetailLapWithMetrics } from "@/lib/activityDetail";
import { ZonePill } from "./SeanceChart";
import { StationIcon } from "./StationIcon";
import { MONO, pillStyle } from "./seanceUi";

interface Props {
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  kinds: readonly LapKind[];
  blocks: readonly ExpectedBlock[] | null;
  hyrox: boolean;
  zonesN: number;
  open: number | null;
  onOpen: (i: number | null) => void;
  onPatch?: (i: number, patch: Partial<Pick<DetailLap, "reps" | "distanceOverrideM" | "loadKg" | "comment">>) => void;
  /** Vélo : vitesse (km/h) au lieu de l'allure. */
  speed?: boolean;
}

/** Tours au téléphone : lignes compactes qui s'ouvrent pour le détail (et la correction HYROX). */
export function SeanceLapsMobile({ laps, names, kinds, blocks, hyrox, zonesN, open, onOpen, onPatch, speed = false }: Props) {
  return (
    <div style={{ borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, overflow: "hidden" }}>
      {laps.map((l, i) => {
        const m = l.metrics;
        const on = open === i;
        const kind = kinds[i];
        const b = l.plannedBlockRef ? blocks?.find((x) => x.ref === l.plannedBlockRef) ?? null : null;
        const done = doneValue(l, kind, b);
        return (
          <div
            key={`${l.startS}-${i}`}
            style={{
              padding: "0 12px", borderTop: i ? `1px solid ${C.brd}` : "none",
              // Planche HyroxToursTel : les stations HYROX teintées à 8 % de la couleur HYROX.
              background: on ? alpha(C.ac, 0.1) : l.needsReview ? alpha(C.ac, 0.04) : hyrox && kind === "station" ? alpha(TYPE_COLOR.hyrox, 0.08) : "transparent",
              boxShadow: on || l.needsReview ? `inset 3px 0 0 ${C.ac}` : "none",
            }}
          >
            <button
              type="button"
              onClick={() => onOpen(on ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 52, width: "100%", border: "none", background: "transparent", color: C.tx, padding: 0, textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}
            >
              <span style={{ ...MONO, fontSize: 11, color: on ? C.ac : C.tx3, width: 16 }}>{i + 1}</span>
              {hyrox && <StationIcon name={kind === "run" ? "Course" : names[i]} size={16} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, color: on ? C.ac : C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontStyle: l.status === "proposed" ? "italic" : "normal" }}>
                  {names[i]} {l.needsReview && <span style={{ ...pillStyle(C.ac), height: 17, fontSize: 9 }}>À vérifier</span>}
                </span>
                <span style={{ ...MONO, display: "block", fontSize: 11, color: C.tx2, whiteSpace: "nowrap" }}>
                  {hyrox ? (
                    <>prévu {plannedLabel(b)} · <span style={{ color: C.tx }}>fait {done.text}</span></>
                  ) : (
                    <>
                      {fmtClock(m.durationS)} · {m.distanceM != null ? `${fmtKm(m.distanceM, 2)} km` : DASH} ·{" "}
                      <span style={{ color: SERIES_COLORS.pace }}>{fmtPaceOrSpeed(m.avgPaceSPerKm, speed)}{speed ? " km/h" : ""}</span>
                    </>
                  )}
                </span>
              </span>
              {hyrox ? (
                <span style={{ ...MONO, fontSize: 12.5, fontWeight: 600 }}>{fmtClock(m.durationS)}</span>
              ) : (
                <>
                  <span style={{ ...MONO, fontSize: 12.5, width: 30, textAlign: "right", color: m.meanZone ? zoneColor(m.meanZone, zonesN) : C.tx }}>{fmtInt(m.avgHr)}</span>
                  <ZonePill zone={m.meanZone} n={zonesN} />
                </>
              )}
              {on ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />}
            </button>
            {!on && l.comment && (
              <div style={{ fontSize: 12, color: C.tx2, padding: "0 0 10px 26px", marginTop: -4 }}>« {l.comment} »</div>
            )}

            {on && !hyrox && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "2px 0 12px 26px" }}>
                <Fig k={speed ? "Vitesse max" : "Allure max"} v={fmtPaceOrSpeed(m.maxPaceSPerKm, speed)} />
                <Fig k="FC max" v={fmtInt(m.maxHr)} />
                <Fig k="Cadence moy." v={fmtInt(m.avgCadence)} />
                <Fig k="Cadence max" v={fmtInt(m.maxCadence)} />
                <Fig k="D+ / D−" v={m.ascentM != null ? `${fmtUpDown(m.ascentM, m.descentM)} m` : DASH} />
                <Fig k="Distance" v={m.distanceM != null ? `${fmtKm(m.distanceM, 2)} km` : DASH} />
              </div>
            )}
            {on && hyrox && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "2px 0 14px 26px" }}>
                {/* Station : la planche (HyroxToursTel) ne garde que reps, charge et commentaire. */}
                {(kind !== "station" || !onPatch) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    <Fig k="FC moy." v={fmtInt(m.avgHr)} />
                    <Fig k="FC max" v={fmtInt(m.maxHr)} />
                    <Fig k="Zone" v={m.meanZone ? `Z${m.meanZone}` : DASH} />
                  </div>
                )}
                {kind === "station" && onPatch && done.field && (
                  <Stepper
                    label={done.field === "reps" ? `Reps faites${b?.reps ? ` (prévu ${b.reps})` : ""}` : `Distance faite${b?.distanceM ? ` (prévu ${b.distanceM} m)` : ""}`}
                    value={done.value}
                    unit={done.field === "reps" ? "" : "m"}
                    step={1}
                    warn={b != null && done.value != null && done.value !== (done.field === "reps" ? b.reps : b.distanceM)}
                    onChange={(v) => onPatch(i, { [done.field!]: v })}
                  />
                )}
                {kind === "station" && onPatch && (
                  <Stepper label="Charge" value={l.loadKg ?? b?.loadKg ?? null} unit="kg" step={1} onChange={(v) => onPatch(i, { loadKg: v })} />
                )}
                {kind === "station" && onPatch ? (
                  <textarea
                    key={l.comment ?? ""}
                    aria-label={`${names[i]} : commentaire`}
                    defaultValue={l.comment ?? ""}
                    maxLength={500}
                    rows={2}
                    placeholder="Ajouter un commentaire sur cette station…"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (l.comment ?? null)) onPatch(i, { comment: v }); }}
                    style={{ padding: "8px 10px", borderRadius: 10, background: C.bg, border: `1px solid ${alpha(C.ac, 0.33)}`, color: C.tx, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }}
                  />
                ) : l.comment ? (
                  <div style={{ fontSize: 12, color: C.tx2 }}>« {l.comment} »</div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Fig({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.tx3 }}>{k}</div>
      <div style={{ ...MONO, fontSize: 13 }}>{v}</div>
    </div>
  );
}

/** Champ − / + au pouce (reps, charge). */
export function Stepper({ label, value, unit, step, onChange, warn }: { label: string; value: number | null; unit: string; step: number; onChange: (v: number) => void; warn?: boolean }) {
  const v = value ?? 0;
  const btn = { width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } as const;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: 1, fontSize: 12, color: C.tx2 }}>{label}</span>
      <button type="button" style={btn} onClick={() => onChange(Math.max(0, v - step))} aria-label={`${label} moins`}><Minus size={16} /></button>
      <span style={{ ...MONO, minWidth: 54, textAlign: "center", fontSize: 15, color: warn ? C.o : C.tx }}>{value != null ? `${value}${unit ? ` ${unit}` : ""}` : DASH}</span>
      <button type="button" style={btn} onClick={() => onChange(v + step)} aria-label={`${label} plus`}><Plus size={16} /></button>
    </div>
  );
}
