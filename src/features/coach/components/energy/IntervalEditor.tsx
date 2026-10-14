/**
 * IntervalEditor — Sheet (drawer right) d'édition d'un EnergyInterval.
 */
import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { C } from "@/lib/theme";
import type { EnergyInterval, IntervalRole, EnergyDuration, EnergyTarget } from "@/types/energy";
import { genId } from "@/lib/energy/treeUtils";
import { paceBounds } from "@/lib/energy/paceCompat";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES: { value: IntervalRole; label: string }[] = [
  { value: "warmup",   label: "Échauffement" },
  { value: "work",     label: "Effort" },
  { value: "recovery", label: "Récupération" },
  { value: "rest",     label: "Repos" },
  { value: "cooldown", label: "Retour au calme" },
  { value: "open",     label: "Libre" },
];

const DURATION_KINDS = [
  { value: "time",       label: "Temps" },
  { value: "distance",   label: "Distance (m)" },
  { value: "calories",   label: "Calories (kcal)" },
  { value: "lap_button", label: "Bouton Lap" },
] as const;

const TARGET_KINDS = [
  { value: "none",            label: "Aucune" },
  { value: "hr_zone",         label: "Zone FC" },
  { value: "hr_pct",          label: "% FC max" },
  { value: "hr_bpm",          label: "FC (bpm)" },
  { value: "pace",            label: "Allure" },
  { value: "pace_test_pct",   label: "% d'un test (allure)" },
  { value: "power",           label: "Puissance (W)" },
  { value: "power_test_pct",  label: "% d'un test (puissance)" },
  { value: "cadence",         label: "Cadence" },
  { value: "text",            label: "Texte libre" },
] as const;

const EQUIPMENT_OPTIONS = [
  { value: "none",      label: "Aucun" },
  { value: "rameur",    label: "Rameur" },
  { value: "skierg",    label: "SkiErg" },
  { value: "bikeerg",   label: "BikeErg" },
  { value: "velo",      label: "Vélo" },
  { value: "course",    label: "Course" },
  { value: "elliptique",label: "Elliptique" },
  { value: "corde",     label: "Corde à sauter" },
  { value: "autre",     label: "Autre" },
] as const;

const PACE_TEST_METRICS = ["VMA", "VC", "PMA", "FTP", "Allure 10K", "Allure semi", "Allure marathon"];
const POWER_TEST_METRICS = ["PMA", "FTP", "PC30", "PC5"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMMSS(raw: string): number {
  const parts = raw.split(":");
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  return parseInt(raw, 10) || 0;
}

function toMMSS(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const inp = {
  base: {
    background: C.s2,
    border: `1px solid ${C.brd}`,
    borderRadius: 6,
    color: C.tx,
    fontSize: 13,
    padding: "6px 10px",
    width: "100%",
    fontFamily: "inherit",
    outline: "none",
  } as React.CSSProperties,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RangeInputs({
  min, max, unit,
  onMin, onMax,
}: {
  min: number; max: number; unit?: string;
  onMin: (v: number) => void; onMax: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="number" style={{ ...inp.base, width: 80 }}
        value={min} onChange={(e) => onMin(Number(e.target.value))}
        placeholder="min"
      />
      <span style={{ color: C.tx3, fontSize: 12 }}>–</span>
      <input
        type="number" style={{ ...inp.base, width: 80 }}
        value={max} onChange={(e) => onMax(Number(e.target.value))}
        placeholder="max"
      />
      {unit && <span style={{ color: C.tx3, fontSize: 12 }}>{unit}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interval: EnergyInterval | null;
  onSave: (interval: EnergyInterval) => void;
  athleteId?: string;
  title?: string;
}

export default function IntervalEditor({ open, onOpenChange, interval, onSave, title }: Props) {
  const [role, setRole] = useState<IntervalRole>("work");
  const [durKind, setDurKind] = useState<EnergyDuration["kind"]>("time");
  const [durValue, setDurValue] = useState<string>("1:00");
  const [targetKind, setTargetKind] = useState<EnergyTarget["kind"]>("none");
  const [equipment, setEquipment] = useState("none");
  const [notes, setNotes] = useState("");

  // target field state
  const [hrZone, setHrZone] = useState<1|2|3|4|5>(3);
  const [rangeMin, setRangeMin] = useState(0);
  const [rangeMax, setRangeMax] = useState(0);
  const [paceUnit, setPaceUnit] = useState<"min_per_km"|"kmh">("min_per_km");
  const [cadenceUnit, setCadenceUnit] = useState<"spm"|"rpm">("spm");
  const [testMetric, setTestMetric] = useState("VMA");
  const [textValue, setTextValue] = useState("");

  // Sync from prop
  useEffect(() => {
    if (!interval) return;
    setRole(interval.role);
    setEquipment(interval.equipment ?? "none");
    setNotes(interval.notes ?? "");

    // Duration
    const d = interval.duration;
    setDurKind(d.kind);
    if (d.kind === "time") setDurValue(toMMSS(d.value ?? 0));
    else setDurValue(String(d.value ?? 0));

    // Target
    const t = interval.target;
    setTargetKind(t.kind);
    if (t.kind === "hr_zone") setHrZone(t.zone);
    if (t.kind === "hr_pct" || t.kind === "hr_bpm" || t.kind === "power") {
      setRangeMin(t.min); setRangeMax(t.max);
    }
    if (t.kind === "pace") {
      const { min, max } = paceBounds(t);
      setRangeMin(min); setRangeMax(max); setPaceUnit(t.unit);
    }
    if (t.kind === "pace_test_pct" || t.kind === "power_test_pct") {
      setRangeMin(t.min); setRangeMax(t.max); setTestMetric(t.test_metric);
    }
    if (t.kind === "cadence") {
      setRangeMin(t.min); setRangeMax(t.max); setCadenceUnit(t.unit);
    }
    if (t.kind === "text") setTextValue(t.value);
  }, [interval, open]);

  function buildDuration(): EnergyDuration {
    if (durKind === "time") return { kind: "time", value: parseMMSS(durValue) };
    if (durKind === "lap_button") return { kind: "lap_button" };
    return { kind: durKind, value: Number(durValue) || 0 };
  }

  function buildTarget(): EnergyTarget {
    switch (targetKind) {
      case "hr_zone": return { kind: "hr_zone", zone: hrZone };
      case "hr_pct":  return { kind: "hr_pct", min: rangeMin, max: rangeMax };
      case "hr_bpm":  return { kind: "hr_bpm", min: rangeMin, max: rangeMax };
      case "pace":    return { kind: "pace", min_s_per_unit: rangeMin, max_s_per_unit: rangeMax, unit: paceUnit };
      case "pace_test_pct":  return { kind: "pace_test_pct", test_metric: testMetric, min: rangeMin, max: rangeMax };
      case "power":          return { kind: "power", min: rangeMin, max: rangeMax };
      case "power_test_pct": return { kind: "power_test_pct", test_metric: testMetric, min: rangeMin, max: rangeMax };
      case "cadence":        return { kind: "cadence", min: rangeMin, max: rangeMax, unit: cadenceUnit };
      case "text":           return { kind: "text", value: textValue };
      default:               return { kind: "none" };
    }
  }

  function handleSave() {
    onSave({
      type: "interval",
      id: interval?.id ?? genId(),
      role,
      duration: buildDuration(),
      target: buildTarget(),
      equipment: equipment !== "none" ? equipment : undefined,
      notes: notes || undefined,
    });
    onOpenChange(false);
  }

  const label = (t: string) => (
    <div style={{ fontSize: 11, color: C.tx3, marginBottom: 4, marginTop: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {t}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto" style={{ background: C.s1, borderLeft: `1px solid ${C.brd}`, padding: "20px 20px" }}>
        <SheetHeader style={{ marginBottom: 4 }}>
          <SheetTitle style={{ color: C.tx, fontSize: 16 }}>
            {title ?? "Éditer l'intervalle"}
          </SheetTitle>
        </SheetHeader>

        {/* Role */}
        {label("Rôle")}
        <Select value={role} onValueChange={(v) => setRole(v as IntervalRole)}>
          <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Equipment */}
        {label("Matériel")}
        <Select value={equipment} onValueChange={setEquipment}>
          <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx }}>
            <SelectValue placeholder="Aucun" />
          </SelectTrigger>
          <SelectContent>
            {EQUIPMENT_OPTIONS.map((eq) => (
              <SelectItem key={eq.value} value={eq.value}>{eq.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Duration */}
        {label("Durée")}
        <Select value={durKind} onValueChange={(v) => {
          const next = v as EnergyDuration["kind"];
          setDurKind(next);
          // Reset value when switching kind to avoid format mismatch
          if (next === "time") setDurValue("1:00");
          else if (next === "distance") setDurValue("400");
          else if (next === "calories") setDurValue("200");
          else setDurValue("");
        }}>
          <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_KINDS.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {durKind !== "lap_button" && (
          <div style={{ marginTop: 6 }}>
            <input
              type={durKind === "time" ? "text" : "number"}
              style={inp.base}
              value={durValue}
              onChange={(e) => setDurValue(e.target.value)}
              placeholder={durKind === "time" ? "mm:ss ou h:mm:ss" : durKind === "distance" ? "400" : "200"}
              min={durKind !== "time" ? 0 : undefined}
            />
            {durKind === "time" && (
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>Format MM:SS ou H:MM:SS (ex: 1:30, 1:05:00)</div>
            )}
            {durKind === "distance" && (
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>Distance en mètres</div>
            )}
            {durKind === "calories" && (
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>Calories en kcal</div>
            )}
          </div>
        )}

        {/* Target */}
        {label("Cible d'intensité")}
        <Select value={targetKind} onValueChange={(v) => setTargetKind(v as EnergyTarget["kind"])}>
          <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_KINDS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Target fields */}
        <div style={{ marginTop: 8 }}>
          {targetKind === "hr_zone" && (
            <Select value={String(hrZone)} onValueChange={(v) => setHrZone(Number(v) as 1|2|3|4|5)}>
              <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5].map((z) => (
                  <SelectItem key={z} value={String(z)}>Zone {z}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(targetKind === "hr_pct") && (
            <RangeInputs min={rangeMin} max={rangeMax} unit="% FCmax" onMin={setRangeMin} onMax={setRangeMax} />
          )}
          {(targetKind === "hr_bpm") && (
            <RangeInputs min={rangeMin} max={rangeMax} unit="bpm" onMin={setRangeMin} onMax={setRangeMax} />
          )}
          {targetKind === "pace" && (
            <>
              <Select value={paceUnit} onValueChange={(v) => setPaceUnit(v as "min_per_km"|"kmh")} >
                <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx, marginBottom: 6 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="min_per_km">min/km</SelectItem>
                  <SelectItem value="kmh">km/h</SelectItem>
                </SelectContent>
              </Select>
              {paceUnit === "min_per_km" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text" style={{ ...inp.base, width: 80 }}
                    value={toMMSS(rangeMin)}
                    onChange={(e) => setRangeMin(parseMMSS(e.target.value))}
                    placeholder="4:00"
                  />
                  <span style={{ color: C.tx3, fontSize: 12 }}>–</span>
                  <input
                    type="text" style={{ ...inp.base, width: 80 }}
                    value={toMMSS(rangeMax)}
                    onChange={(e) => setRangeMax(parseMMSS(e.target.value))}
                    placeholder="5:00"
                  />
                  <span style={{ color: C.tx3, fontSize: 12 }}>min/km</span>
                </div>
              ) : (
                <RangeInputs min={rangeMin} max={rangeMax} unit="km/h" onMin={setRangeMin} onMax={setRangeMax} />
              )}
            </>
          )}
          {(targetKind === "pace_test_pct" || targetKind === "power_test_pct") && (
            <>
              <Select value={testMetric} onValueChange={setTestMetric}>
                <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(targetKind === "pace_test_pct" ? PACE_TEST_METRICS : POWER_TEST_METRICS).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div style={{ marginTop: 6 }}>
                <RangeInputs min={rangeMin} max={rangeMax} unit="%" onMin={setRangeMin} onMax={setRangeMax} />
              </div>
            </>
          )}
          {targetKind === "power" && (
            <RangeInputs min={rangeMin} max={rangeMax} unit="W" onMin={setRangeMin} onMax={setRangeMax} />
          )}
          {targetKind === "cadence" && (
            <>
              <RangeInputs min={rangeMin} max={rangeMax} onMin={setRangeMin} onMax={setRangeMax} />
              <Select value={cadenceUnit} onValueChange={(v) => setCadenceUnit(v as "spm"|"rpm")}>
                <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brd}`, color: C.tx, marginTop: 6 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spm">pas/min (spm)</SelectItem>
                  <SelectItem value="rpm">tours/min (rpm)</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {targetKind === "text" && (
            <input
              style={inp.base}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Ex: Ressenti 7/10"
            />
          )}
        </div>

        {/* Notes */}
        {label("Notes (optionnel)")}
        <textarea
          style={{ ...inp.base, minHeight: 60, resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Consignes additionnelles…"
        />

        <SheetFooter style={{ marginTop: 20, display: "flex", gap: 8, flexDirection: "row", justifyContent: "flex-end" }}>
          <button
            onClick={() => onOpenChange(false)}
            style={{ padding: "8px 16px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Valider
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
