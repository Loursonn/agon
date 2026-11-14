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
import { cn } from "@/lib/utils";
import type { EnergyInterval, IntervalRole, EnergyDuration, EnergyTarget } from "@/types/energy";
import { genId } from "@/lib/energy/treeUtils";
import { paceBounds } from "@/lib/energy/paceCompat";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { paceFromTimeOverDistance, timeForDistance, LAP_M } from "@/lib/energy/paceEquivalents";

/** Unités de saisie d'une allure dans l'éditeur. Toutes stockées en s/km. */
type PaceInputUnit = "min_per_km" | "kmh" | "lap_400" | "rep_distance";

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

const INPUT = "w-full rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-1.5 text-[13px] text-agon-tx outline-none";
const TRIGGER = "border-agon-brd bg-agon-s2 text-agon-tx";
const UNIT = "text-[12px] text-agon-tx3";
const HINT = "mt-0.5 text-[10px] text-agon-tx3";

// ── Sub-components ────────────────────────────────────────────────────────────

function RangeInputs({
  min, max, unit,
  onMin, onMax,
}: {
  min: number; max: number; unit?: string;
  onMin: (v: number) => void; onMax: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" className={cn(INPUT, "w-20")}
        value={min} onChange={(e) => onMin(Number(e.target.value))}
        placeholder="min"
      />
      <span className={UNIT}>–</span>
      <input
        type="number" className={cn(INPUT, "w-20")}
        value={max} onChange={(e) => onMax(Number(e.target.value))}
        placeholder="max"
      />
      {unit && <span className={UNIT}>{unit}</span>}
    </div>
  );
}

/** Saisie d'un temps sur une distance connue, converti en secondes par km. */
function TimeRangeInputs({
  min, max, meters, unit, onMin, onMax,
}: {
  min: number; max: number; meters: number; unit: string;
  onMin: (v: number) => void; onMax: (v: number) => void;
}) {
  const toText = (sPerKm: number) => (sPerKm > 0 ? toMMSS(timeForDistance(sPerKm, meters)) : "");
  const fromText = (raw: string) =>
    meters === 1000 ? parseMMSS(raw) : paceFromTimeOverDistance(parseMMSS(raw), meters);
  return (
    <div className="flex items-center gap-2">
      <input
        type="text" className={cn(INPUT, "w-20")}
        value={toText(min)} onChange={(e) => onMin(fromText(e.target.value))}
        placeholder="4:00"
      />
      <span className={UNIT}>–</span>
      <input
        type="text" className={cn(INPUT, "w-20")}
        value={toText(max)} onChange={(e) => onMax(fromText(e.target.value))}
        placeholder="5:00"
      />
      <span className={UNIT}>{unit}</span>
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
  // Unité de *saisie*. « tour » et « distance de la rép. » ne sont que des vues :
  // tout est converti en secondes par km avant stockage.
  const [paceUnit, setPaceUnit] = useState<PaceInputUnit>("min_per_km");
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

  const repDistanceM = durKind === "distance" ? Number(durValue) || null : null;
  // Le coach peut retirer la distance après avoir choisi « temps sur la distance ».
  const paceInput: PaceInputUnit = paceUnit === "rep_distance" && !repDistanceM ? "min_per_km" : paceUnit;

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
      case "pace":    return { kind: "pace", min_s_per_unit: rangeMin, max_s_per_unit: rangeMax, unit: paceInput === "kmh" ? "kmh" : "min_per_km" };
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
    <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-agon-tx3">
      {t}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto border-l border-agon-brd bg-agon-s1 p-5">
        <SheetHeader className="mb-1">
          <SheetTitle className="text-[16px] leading-7 text-agon-tx">
            {title ?? "Éditer l'intervalle"}
          </SheetTitle>
        </SheetHeader>

        {/* Role */}
        {label("Rôle")}
        <Select value={role} onValueChange={(v) => setRole(v as IntervalRole)}>
          <SelectTrigger className={TRIGGER}>
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
          <SelectTrigger className={TRIGGER}>
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
          <SelectTrigger className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_KINDS.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {durKind !== "lap_button" && (
          <div className="mt-1.5">
            <input
              type={durKind === "time" ? "text" : "number"}
              className={INPUT}
              value={durValue}
              onChange={(e) => setDurValue(e.target.value)}
              placeholder={durKind === "time" ? "mm:ss ou h:mm:ss" : durKind === "distance" ? "400" : "200"}
              min={durKind !== "time" ? 0 : undefined}
            />
            {durKind === "time" && (
              <div className={HINT}>Format MM:SS ou H:MM:SS (ex: 1:30, 1:05:00)</div>
            )}
            {durKind === "distance" && (
              <div className={HINT}>Distance en mètres</div>
            )}
            {durKind === "calories" && (
              <div className={HINT}>Calories en kcal</div>
            )}
          </div>
        )}

        {/* Target */}
        {label("Cible d'intensité")}
        <Select value={targetKind} onValueChange={(v) => setTargetKind(v as EnergyTarget["kind"])}>
          <SelectTrigger className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_KINDS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Target fields */}
        <div className="mt-2">
          {targetKind === "hr_zone" && (
            <Select value={String(hrZone)} onValueChange={(v) => setHrZone(Number(v) as 1|2|3|4|5)}>
              <SelectTrigger className={TRIGGER}>
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
              <Select value={paceInput} onValueChange={(v) => setPaceUnit(v as PaceInputUnit)} >
                <SelectTrigger className={cn(TRIGGER, "mb-1.5")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="min_per_km">min/km</SelectItem>
                  <SelectItem value="kmh">km/h</SelectItem>
                  <SelectItem value="lap_400">Temps au tour (400 m)</SelectItem>
                  {repDistanceM ? (
                    <SelectItem value="rep_distance">Temps sur {repDistanceM} m</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              {paceInput === "kmh" ? (
                <RangeInputs min={rangeMin} max={rangeMax} unit="km/h" onMin={setRangeMin} onMax={setRangeMax} />
              ) : (
                <TimeRangeInputs
                  min={rangeMin}
                  max={rangeMax}
                  meters={paceInput === "lap_400" ? LAP_M : paceInput === "rep_distance" ? repDistanceM! : 1000}
                  unit={paceInput === "min_per_km" ? "min/km" : paceInput === "lap_400" ? "au tour" : `sur ${repDistanceM} m`}
                  onMin={setRangeMin}
                  onMax={setRangeMax}
                />
              )}
              <div className="mt-1.5">
                <PaceEquivalents
                  target={{ kind: "pace", min_s_per_unit: rangeMin, max_s_per_unit: rangeMax, unit: paceInput === "kmh" ? "kmh" : "min_per_km" }}
                  repDistanceM={repDistanceM}
                  fontSize={10}
                />
              </div>
            </>
          )}
          {(targetKind === "pace_test_pct" || targetKind === "power_test_pct") && (
            <>
              <Select value={testMetric} onValueChange={setTestMetric}>
                <SelectTrigger className={TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(targetKind === "pace_test_pct" ? PACE_TEST_METRICS : POWER_TEST_METRICS).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-1.5">
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
                <SelectTrigger className={cn(TRIGGER, "mt-1.5")}>
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
              className={INPUT}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Ex: Ressenti 7/10"
            />
          )}
        </div>

        {/* Notes */}
        {label("Notes (optionnel)")}
        <textarea
          className={cn(INPUT, "min-h-[60px] resize-y")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Consignes additionnelles…"
        />

        <SheetFooter className="mt-5 flex flex-row justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded border border-agon-brd bg-transparent px-4 py-2 text-[13px] text-agon-tx2"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="cursor-pointer rounded bg-agon-or-vif px-4 py-2 text-[13px] font-semibold text-agon-ink"
          >
            Valider
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
