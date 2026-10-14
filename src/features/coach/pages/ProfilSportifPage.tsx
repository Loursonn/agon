/**
 * ProfilSportifPage
 *
 * Références de performance + zones FC ajustables + métriques personnalisées.
 * Route : /coach/athletes/:athleteId/profil-sportif
 */
import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WellnessData } from "@/features/shared/types/athlete";
import { toast } from "sonner";
import { Plus, Pencil, X, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MeasurementComparison from "@/features/coach/components/MeasurementComparison";
import CategoryProfiles from "@/features/coach/components/CategoryProfiles";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { WeightChart } from "@/components/athlete/StatsCharts";
import { PRLogsSection } from "@/features/coach/components/PRLogsSection";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "cardio" | "puissance" | "vitesse" | "corpo" | "custom";

interface MetricDef {
  key: string;
  label: string;
  unit: string;
  description: string;
  min?: number;
  max?: number;
  step?: number;
  category: Category;
}

// ── Predefined metrics ────────────────────────────────────────────────────────

const METRICS: MetricDef[] = [
  { key: "FCmax",   label: "FC max",   unit: "bpm",       description: "Fréquence cardiaque maximale",      min: 100, max: 230, step: 1,   category: "cardio"    },
  { key: "FCseuil", label: "FC seuil", unit: "bpm",       description: "FC au seuil lactique (~85% FCmax)", min: 80,  max: 220, step: 1,   category: "cardio"    },
  { key: "FCrepos", label: "FC repos", unit: "bpm",       description: "Fréquence cardiaque de repos",      min: 30,  max: 100, step: 1,   category: "cardio"    },
  { key: "VMA",     label: "VMA",      unit: "km/h",      description: "Vitesse Maximale Aérobie",          min: 8,   max: 30,  step: 0.1, category: "vitesse"   },
  { key: "Vmax",    label: "Vmax",     unit: "km/h",      description: "Vitesse maximale atteinte (sprint)", min: 10,  max: 45,  step: 0.1, category: "vitesse"   },
  { key: "VC",      label: "VC",       unit: "km/h",      description: "Vitesse Critique", min: 8, max: 28, step: 0.1, category: "vitesse"   },
  { key: "FTP",     label: "FTP",      unit: "W",         description: "Functional Threshold Power (vélo)", min: 50,  max: 600, step: 5,   category: "puissance" },
  { key: "PMA",     label: "PMA",      unit: "W",         description: "Puissance Maximale Aérobie",        min: 50,  max: 900, step: 5,   category: "puissance" },
  // Note: "poids" est dérivé automatiquement depuis le wellness (moyenne 3 dernières saisies)
];

const PREDEFINED_KEYS = new Set(METRICS.map((m) => m.key));

const CATEGORY_COLOR: Record<Category, string> = {
  cardio:    "#EF4444",
  vitesse:   "#33B5FF",
  puissance: "#F59E0B",
  corpo:     "#10B981",
  custom:    "#FFC933",
};

// ── Zone FC computations ──────────────────────────────────────────────────────

interface FcZoneDef { label: string; color: string; zoneKey: string }

const FC_ZONES_DEF: FcZoneDef[] = [
  { label: "Z1 — Récupération", color: "#22C55E", zoneKey: "FCzone_Z1_max" },
  { label: "Z2 — Endurance",    color: "#84CC16", zoneKey: "FCzone_Z2_max" },
  { label: "Z3 — Tempo",        color: "#EAB308", zoneKey: "FCzone_Z3_max" },
  { label: "Z4 — Seuil",        color: "#F97316", zoneKey: "FCzone_Z4_max" },
  { label: "Z5 — VO₂max",       color: "#EF4444", zoneKey: "FCzone_Z5_max" },
];

function computeDefaultFcZones(fcmax: number, fcrep = 0) {
  const fcr = fcrep || 0;
  const reserve = fcmax - fcr;
  const k = (pct: number) => fcrep ? Math.round(fcr + reserve * pct) : Math.round(fcmax * pct);
  return [k(0.60), k(0.70), k(0.80), k(0.90), fcmax];
}

function vmaZones(vma: number) {
  const p = (pct: number) => {
    const kmh = vma * pct;
    const s = 3600 / kmh;
    const m = Math.floor(s / 60);
    const ss = Math.round(s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };
  return [
    { label: "Z1 — Footing",   min: p(0.65), max: p(0.72), color: "#22C55E" },
    { label: "Z2 — Endurance", min: p(0.72), max: p(0.82), color: "#84CC16" },
    { label: "Z3 — Tempo",     min: p(0.82), max: p(0.89), color: "#EAB308" },
    { label: "Z4 — Seuil",     min: p(0.89), max: p(0.95), color: "#F97316" },
    { label: "Z5 — VMA",       min: p(0.95), max: p(1.05), color: "#EF4444" },
  ];
}

function ftpZones(ftp: number) {
  const w = (pct: number) => Math.round(ftp * pct);
  return [
    { label: "Z1 — Récupération", range: `< ${w(0.55)} W`,                        color: "#22C55E" },
    { label: "Z2 — Endurance",    range: `${w(0.55)}–${w(0.75)} W`,               color: "#84CC16" },
    { label: "Z3 — Tempo",        range: `${w(0.75)}–${w(0.90)} W`,               color: "#EAB308" },
    { label: "Z4 — Seuil",        range: `${w(0.90)}–${w(1.05)} W`,               color: "#F97316" },
    { label: "Z5 — VO₂max",       range: `${w(1.05)}–${w(1.20)} W`,               color: "#EF4444" },
  ];
}

// ── DB hooks ──────────────────────────────────────────────────────────────────

type RefsMap = Record<string, { value: number; date: string; id: string; unit: string; metric_type?: string | null }>;

function useAthleteRefs(athleteId: string) {
  return useQuery<RefsMap>({
    queryKey: ["athlete-refs-full", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_logs")
        .select("id, metric_name, value, unit, date, metric_type")
        .eq("athlete_id", athleteId)
        .eq("is_active_reference", true);
      if (error) throw error;
      const map: RefsMap = {};
      for (const row of data ?? []) {
        map[row.metric_name] = { value: row.value, date: row.date, id: row.id, unit: row.unit, metric_type: row.metric_type };
      }
      return map;
    },
    staleTime: 30_000,
  });
}

function useUpsertRef(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      metricName, value, unit, metricType = "reference",
    }: { metricName: string; value: number; unit: string; metricType?: string }) => {
      await supabase
        .from("performance_logs")
        .update({ is_active_reference: false })
        .eq("athlete_id", athleteId)
        .eq("metric_name", metricName)
        .eq("is_active_reference", true);

      const { error } = await supabase.from("performance_logs").insert({
        athlete_id: athleteId,
        metric_name: metricName,
        metric_type: metricType,
        value,
        unit,
        date: new Date().toISOString().slice(0, 10),
        is_active_reference: true,
        created_by: user?.id ?? null,
        coach_validated: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["athlete-refs-full", athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-references", athleteId] });
      toast.success("Référence mise à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });
}

function useDeleteRef(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["athlete-refs-full", athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-references", athleteId] });
      toast.success("Donnée supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

function useLastWeights(athleteId: string) {
  return useQuery<{ avg: number; lastDate: string; count: number } | null>({
    queryKey: ["last-weights-wellness", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_data")
        .select("value")
        .eq("athlete_id", athleteId)
        .eq("key", "asp:wh")
        .maybeSingle();
      if (error) throw error;
      const history = data?.value as Record<string, WellnessData> | null;
      if (!history) return null;
      const entries = Object.entries(history)
        .filter(([, v]) => v?.poids != null && (v.poids as number) > 0)
        .sort(([a], [b]) => b.localeCompare(a)) // desc by date
        .slice(0, 3);
      if (entries.length === 0) return null;
      const avg = entries.reduce((s, [, v]) => s + (v.poids as number), 0) / entries.length;
      return { avg: Math.round(avg * 10) / 10, lastDate: entries[0][0], count: entries.length };
    },
    staleTime: 60_000,
  });
}

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  metric, currentValue, currentDate, onSave, onDelete, saving,
  derivedValue, derivedLabel,
}: {
  metric: MetricDef;
  currentValue?: number;
  currentDate?: string;
  onSave: (value: number) => void;
  onDelete?: () => void;
  saving: boolean;
  derivedValue?: number;   // valeur auto-calculée affichée quand rien n'est saisi
  derivedLabel?: string;   // badge ex. "auto 85%"
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const color = CATEGORY_COLOR[metric.category];
  const showDerived = currentValue == null && derivedValue != null;

  function handleSave() {
    const v = parseFloat(draft);
    if (isNaN(v) || v <= 0) { toast.error("Valeur invalide"); return; }
    onSave(v);
    setEditing(false);
  }

  return (
    <div
      style={{
        background: C.s1, border: "1px solid " + C.brd, borderRadius: 6,
        padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
        transition: "border-color 150ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color + "50")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.brd)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
            {metric.label}
          </div>
          <div style={{ fontSize: 10, color: C.tx3 }}>{metric.description}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {!editing && (
            <button
              onClick={() => { setDraft((currentValue ?? derivedValue)?.toString() ?? ""); setEditing(true); }}
              style={{
                padding: "3px 8px", borderRadius: 6, border: "1px solid " + C.brdL,
                background: "transparent", color: C.tx3, fontSize: 11,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {currentValue != null ? <Pencil size={11} /> : <Plus size={11} />}
            </button>
          )}
          {onDelete && currentValue != null && !editing && (
            <button
              onClick={onDelete}
              style={{
                padding: "3px 8px", borderRadius: 6, border: "1px solid " + C.r + "30",
                background: "transparent", color: C.r, fontSize: 11,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            min={metric.min}
            max={metric.max}
            step={metric.step ?? 1}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 4,
              border: "1px solid " + color + "60", background: C.s2,
              color: C.tx, fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none",
            }}
          />
          <span style={{ fontSize: 12, color: C.tx3 }}>{metric.unit}</span>
          <button onClick={handleSave} disabled={saving} style={{ padding: "7px 12px", borderRadius: 4, border: "none", background: color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <Check size={13} />
          </button>
          <button onClick={() => setEditing(false)} style={{ padding: "7px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            <X size={13} />
          </button>
        </div>
      ) : currentValue != null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{currentValue}</span>
          <span style={{ fontSize: 12, color: C.tx3 }}>{metric.unit}</span>
          {currentDate && (
            <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>
              {new Date(currentDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      ) : showDerived ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.tx2 }}>{derivedValue}</span>
          <span style={{ fontSize: 12, color: C.tx3 }}>{metric.unit}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color, background: color + "1A", padding: "2px 6px", borderRadius: 5, marginLeft: "auto", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {derivedLabel ?? "auto"}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.tx3, fontStyle: "italic" }}>Non renseigné</div>
      )}
    </div>
  );
}

// ── WeightDerivedCard ─────────────────────────────────────────────────────────

/** Parse robuste : gère "2026-06-01", "2026-6-1", ou un timestamp ISO. Retourne null si invalide. */
function safeDate(s?: string | null): Date | null {
  if (!s) return null;
  let iso = s;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T12:00:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

type StrategyKey = "maintenance" | "seche" | "prise_de_masse";
const STRATEGY_LABEL: Record<StrategyKey, string> = {
  maintenance: "Maintenance", seche: "Sèche", prise_de_masse: "Prise de masse",
};
const STRATEGY_COLOR: Record<StrategyKey, string> = {
  maintenance: C.b, seche: C.r, prise_de_masse: C.g,
};

function WeightDerivedCard({ athleteId, strategy }: { athleteId: string; strategy?: StrategyKey | null }) {
  const { data, isLoading } = useLastWeights(athleteId);
  const color = CATEGORY_COLOR.corpo;

  return (
    <div
      style={{
        background: C.s1, border: "1px solid " + C.brd, borderRadius: 6,
        padding: "16px", display: "flex", flexDirection: "column", gap: 12,
        alignItems: "center", justifyContent: "center", textAlign: "center",
        opacity: isLoading ? 0.6 : 1,
        height: "100%", boxSizing: "border-box",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color + "50")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.brd)}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Poids
      </div>

      {data ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: C.tx, lineHeight: 1 }}>{data.avg}</span>
            <span style={{ fontSize: 14, color: C.tx3 }}>kg</span>
          </div>
          <div style={{ fontSize: 9, color: C.tx3 }}>
            moy. {data.count} dernières
            {safeDate(data.lastDate) && " · " + safeDate(data.lastDate)!.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.tx3, fontStyle: "italic" }}>
          {isLoading ? "…" : "Aucune saisie de poids"}
        </div>
      )}

      {/* Stratégie nutrition actuelle */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Stratégie
        </div>
        {strategy ? (
          <span style={{
            fontSize: 12, fontWeight: 700, color: STRATEGY_COLOR[strategy],
            background: STRATEGY_COLOR[strategy] + "1A", border: "1px solid " + STRATEGY_COLOR[strategy] + "40",
            padding: "4px 12px", borderRadius: 6,
          }}>
            {STRATEGY_LABEL[strategy]}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>Non définie</span>
        )}
      </div>
    </div>
  );
}

// ── VraDerivedCard ────────────────────────────────────────────────────────────

function VraDerivedCard({ vmax, vma }: { vmax?: number; vma?: number }) {
  const color = CATEGORY_COLOR.vitesse;
  const vra = vmax != null && vma != null ? Math.round((vmax - vma) * 10) / 10 : null;

  return (
    <div
      style={{
        background: C.s1, border: "1px solid " + C.brd, borderRadius: 6,
        padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color + "50")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.brd)}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
          VRA
        </div>
        <div style={{ fontSize: 10, color: C.tx3 }}>Vitesse de Réserve Anaérobie — Vmax − VMA</div>
      </div>
      {vra != null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{vra}</span>
          <span style={{ fontSize: 12, color: C.tx3 }}>km/h</span>
          <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>
            {vmax} − {vma}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.tx3, fontStyle: "italic" }}>
          {vmax == null && vma == null
            ? "Renseigne Vmax et VMA"
            : vmax == null ? "Renseigne Vmax" : "Renseigne VMA"}
        </div>
      )}
    </div>
  );
}

// ── FC Zone Editor ────────────────────────────────────────────────────────────

function FcZoneEditor({
  fcmax, fcrep, storedZones, onSaveZones, saving,
}: {
  fcmax: number;
  fcrep?: number;
  storedZones: Record<string, number>;
  onSaveZones: (zones: Record<string, number>) => void;
  saving: boolean;
}) {
  const defaults = computeDefaultFcZones(fcmax, fcrep);
  const defaultZ0 = fcrep ?? 50;
  const [custom, setCustom] = useState<boolean>(Object.keys(storedZones).length > 0);
  const [draftZ0, setDraftZ0] = useState<string>(() =>
    (storedZones["FCzone_Z0_min"] ?? defaultZ0).toString()
  );
  const [drafts, setDrafts] = useState<string[]>(() =>
    FC_ZONES_DEF.map((z, i) => (storedZones[z.zoneKey] ?? defaults[i]).toString())
  );

  function setDraft(i: number, val: string) {
    setDrafts((prev) => prev.map((d, j) => (j === i ? val : d)));
  }

  function handleSave() {
    const z0 = parseFloat(draftZ0);
    const vals = drafts.map((d) => parseFloat(d));
    if (isNaN(z0) || z0 < 0 || vals.some(isNaN) || vals.some((v) => v <= 0)) { toast.error("Valeurs invalides"); return; }
    const zones: Record<string, number> = { FCzone_Z0_min: z0 };
    FC_ZONES_DEF.forEach((z, i) => { zones[z.zoneKey] = vals[i]; });
    onSaveZones(zones);
  }

  function resetToDefaults() {
    setDraftZ0(defaultZ0.toString());
    setDrafts(defaults.map(String));
    const zones: Record<string, number> = { FCzone_Z0_min: defaultZ0 };
    FC_ZONES_DEF.forEach((z, i) => { zones[z.zoneKey] = defaults[i]; });
    onSaveZones(zones);
  }

  const displayVals = custom
    ? drafts.map((d) => parseFloat(d) || 0)
    : defaults;

  const displayZ0 = custom ? (parseFloat(draftZ0) || 0) : defaultZ0;

  const prevMax = (i: number) => i === 0 ? displayZ0 : displayVals[i - 1];

  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>
            Zones FC — FCmax {fcmax} bpm{fcrep ? ` · repos ${fcrep} bpm` : ""}
          </div>
          <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
            {custom ? "Bornes personnalisées (connectées au module énergie)" : "Calculé automatiquement"}
          </div>
        </div>
        <button
          onClick={() => {
            if (!custom) { setCustom(true); setDrafts(defaults.map(String)); }
            else { setCustom(false); }
          }}
          style={{
            padding: "4px 10px", borderRadius: 6,
            border: "1px solid " + (custom ? C.ac + "60" : C.brdL),
            background: custom ? C.ac + "15" : "transparent",
            color: custom ? C.ac : C.tx3, fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {custom ? "Personnalisé ✓" : "Personnaliser"}
        </button>
      </div>

      {/* Z0 min row — FC de départ activité */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 14px",
          borderBottom: "1px solid " + C.brd,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ width: 4, height: 20, borderRadius: 2, background: C.tx3, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: C.tx3, fontWeight: 600, flex: 1 }}>FC départ activité</span>
        <span style={{ fontSize: 10, color: C.tx3, minWidth: 50 }}>0 bpm</span>
        <span style={{ fontSize: 10, color: C.tx3 }}>→</span>
        {custom ? (
          <input
            type="number"
            value={draftZ0}
            onChange={(e) => setDraftZ0(e.target.value)}
            min={0}
            max={150}
            style={{
              width: 65, padding: "4px 7px", borderRadius: 6,
              border: "1px solid " + C.tx3 + "40", background: C.s2,
              color: C.tx, fontSize: 12, fontWeight: 700, fontFamily: "inherit", outline: "none",
              textAlign: "right",
            }}
          />
        ) : (
          <span style={{ fontSize: 12, color: C.tx, fontWeight: 700, minWidth: 65, textAlign: "right" }}>
            {displayZ0}
          </span>
        )}
        <span style={{ fontSize: 11, color: C.tx3, minWidth: 24 }}>bpm</span>
      </div>

      {/* Zone rows */}
      <div>
        {FC_ZONES_DEF.map((z, i) => (
          <div
            key={z.zoneKey}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 14px",
              borderBottom: i < FC_ZONES_DEF.length - 1 ? "1px solid " + C.brd : "none",
            }}
          >
            <div style={{ width: 4, height: 20, borderRadius: 2, background: z.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: C.tx, fontWeight: 600, flex: 1 }}>{z.label}</span>
            <span style={{ fontSize: 11, color: C.tx3, minWidth: 50 }}>
              {prevMax(i)} bpm
            </span>
            <span style={{ fontSize: 10, color: C.tx3 }}>→</span>
            {custom ? (
              <input
                type="number"
                value={drafts[i]}
                onChange={(e) => setDraft(i, e.target.value)}
                min={prevMax(i) + 1}
                max={250}
                style={{
                  width: 65, padding: "4px 7px", borderRadius: 6,
                  border: "1px solid " + z.color + "60", background: C.s2,
                  color: C.tx, fontSize: 12, fontWeight: 700, fontFamily: "inherit", outline: "none",
                  textAlign: "right",
                }}
              />
            ) : (
              <span style={{ fontSize: 12, color: C.tx, fontWeight: 700, minWidth: 65, textAlign: "right" }}>
                {displayVals[i]}
              </span>
            )}
            <span style={{ fontSize: 11, color: C.tx3, minWidth: 24 }}>bpm</span>
          </div>
        ))}
      </div>

      {/* Footer actions */}
      {custom && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid " + C.brd, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={resetToDefaults}
            style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >
            Réinitialiser
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            {saving ? "…" : "Enregistrer les zones"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Custom metric form ────────────────────────────────────────────────────────

const CUSTOM_CATEGORIES: { value: Category; label: string }[] = [
  { value: "cardio",    label: "Cardiaque"         },
  { value: "vitesse",   label: "Vitesse / Endurance"},
  { value: "puissance", label: "Puissance"          },
  { value: "corpo",     label: "Corporel"           },
  { value: "custom",    label: "Autre"              },
];

function CustomMetricForm({ onSave, saving }: { onSave: (name: string, value: number, unit: string, category: Category) => void; saving: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName]     = useState("");
  const [value, setValue]   = useState("");
  const [unit, setUnit]     = useState("");
  const [cat, setCat]       = useState<Category>("custom");

  function handleSubmit() {
    if (!name.trim()) { toast.error("Nom requis"); return; }
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) { toast.error("Valeur invalide"); return; }
    onSave(name.trim(), v, unit.trim() || "—", cat);
    setName(""); setValue(""); setUnit(""); setCat("custom");
    setOpen(false);
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 16px", borderRadius: 4, width: "100%",
        border: "1px dashed " + C.brdL, background: "transparent",
        color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        justifyContent: "center", transition: "all 150ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.ac + "60"; e.currentTarget.style.color = C.ac; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.brdL; e.currentTarget.style.color = C.tx3; }}
    >
      <Plus size={13} />
      Ajouter une donnée personnalisée
    </button>
  );

  return (
    <div style={{ background: C.s1, border: "1px solid " + CATEGORY_COLOR.custom + "50", borderRadius: 6, padding: "16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: CATEGORY_COLOR.custom, marginBottom: 12 }}>Nouvelle donnée</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>Nom</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Lactatémie, Indice…"
            autoFocus
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>Catégorie</div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value as Category)}
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none" }}
          >
            {CUSTOM_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>Valeur</div>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>Unité</div>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="mmol/L, %, s…"
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => setOpen(false)} style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={saving} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: CATEGORY_COLOR.custom, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {saving ? "…" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}

// ── ZoneTableSimple ───────────────────────────────────────────────────────────

function ZoneTableSimple({ title, rows }: {
  title: string;
  rows: Array<{ label: string; range?: string; min?: string; max?: string; color: string }>;
}) {
  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid " + C.brd, fontSize: 12, fontWeight: 700, color: C.tx }}>
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: i < rows.length - 1 ? "1px solid " + C.brd : "none" }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: r.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.tx, fontWeight: 600, flex: 1 }}>{r.label}</span>
          <span style={{ fontSize: 11, color: C.tx2, fontWeight: 600, textAlign: "right" }}>
            {r.range ?? `${r.min} → ${r.max}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilSportifPage() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { weightLog, weightMilestones, bodyWeight, nutritionStrategy, exos, setExos } = useAthleteContext();
  const { data: refs = {}, isLoading } = useAthleteRefs(athleteId!);
  const upsert = useUpsertRef(athleteId!);
  const deleteRef = useDeleteRef(athleteId!);

  const customEntries = Object.entries(refs).filter(
    ([k]) => !PREDEFINED_KEYS.has(k) && !k.startsWith("FCzone_") && k !== "FCzone_Z0_min"
  );

  const fcmax  = refs["FCmax"]?.value;
  const fcrep  = refs["FCrepos"]?.value;
  const vma    = refs["VMA"]?.value;
  const vmax   = refs["Vmax"]?.value;
  const ftp    = refs["FTP"]?.value;

  const storedFcZones: Record<string, number> = {};
  FC_ZONES_DEF.forEach((z) => {
    if (refs[z.zoneKey]) storedFcZones[z.zoneKey] = refs[z.zoneKey].value;
  });
  if (refs["FCzone_Z0_min"]) storedFcZones["FCzone_Z0_min"] = refs["FCzone_Z0_min"].value;

  async function saveZones(zones: Record<string, number>) {
    for (const [key, val] of Object.entries(zones)) {
      await upsert.mutateAsync({ metricName: key, value: val, unit: "bpm", metricType: "zone" });
    }
  }

  const metricsOf = (cat: Category) => METRICS.filter((m) => m.category === cat);

  function renderMetric(metric: MetricDef, derived?: { value: number; label?: string }) {
    return (
      <MetricCard
        key={metric.key}
        metric={metric}
        currentValue={refs[metric.key]?.value}
        currentDate={refs[metric.key]?.date}
        derivedValue={derived?.value}
        derivedLabel={derived?.label}
        onSave={(v) => upsert.mutate({ metricName: metric.key, value: v, unit: metric.unit })}
        saving={upsert.isPending}
      />
    );
  }

  return (
    <div>
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 90, background: C.s1, borderRadius: 6, border: "1px solid " + C.brd }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* ── PROFIL PAR CATÉGORIE (synthèse) ── */}
              <CategoryProfiles athleteId={athleteId!} />

              {/* ── CARDIAQUE ── */}
              <Panel title="Cardiaque" color={CATEGORY_COLOR.cardio}>
                <MetricGrid>
                  {metricsOf("cardio").map((m) =>
                    renderMetric(
                      m,
                      m.key === "FCseuil" && fcmax != null
                        ? { value: Math.round(fcmax * 0.85), label: "auto 85%" }
                        : undefined,
                    ),
                  )}
                </MetricGrid>
                {fcmax && (
                  <>
                    <FcZoneEditor
                      fcmax={fcmax}
                      fcrep={fcrep}
                      storedZones={storedFcZones}
                      onSaveZones={saveZones}
                      saving={upsert.isPending}
                    />
                    <div style={{ padding: "10px 14px", borderRadius: 4, background: C.ac + "10", border: "1px solid " + C.ac + "30", fontSize: 11, color: C.tx2 }}>
                      Les zones FC personnalisées s'appliquent dans l'aperçu de séance et le calendrier planning. Les bornes définissent l'interpolation d'intensité pour les cibles en bpm.
                    </div>
                  </>
                )}
              </Panel>

              {/* ── VITESSE - PUISSANCE - ÉNERGÉTIQUE ── */}
              <Panel title="Vitesse — Puissance — Énergétique" color={CATEGORY_COLOR.vitesse}>
                <MetricGrid>
                  {metricsOf("vitesse").map((m) => renderMetric(m))}
                  <VraDerivedCard vmax={vmax} vma={vma} />
                  {metricsOf("puissance").map((m) => renderMetric(m))}
                </MetricGrid>
                {(vma || ftp) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                    {vma && (
                      <ZoneTableSimple
                        title={`Zones allure — VMA ${vma} km/h`}
                        rows={vmaZones(vma).map((z) => ({ label: z.label, min: z.min + "/km", max: z.max + "/km", color: z.color }))}
                      />
                    )}
                    {ftp && (
                      <ZoneTableSimple
                        title={`Zones puissance — FTP ${ftp} W`}
                        rows={ftpZones(ftp).map((z) => ({ label: z.label, range: z.range, color: z.color }))}
                      />
                    )}
                  </div>
                )}
              </Panel>

          {/* ── BIOMÉTRIE ── */}
          <Panel title="Biométrie" color={CATEGORY_COLOR.corpo}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{ flex: "1 1 200px", minWidth: 200, maxWidth: 300, display: "flex" }}>
                <div style={{ flex: 1 }}>
                  <WeightDerivedCard athleteId={athleteId!} strategy={nutritionStrategy?.strategy ?? null} />
                </div>
              </div>
              <div style={{ flex: "3 1 320px", minWidth: 300, background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: CATEGORY_COLOR.corpo, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
                  Évolution du poids
                </div>
                {Object.keys(weightLog).length > 0 ? (
                  <WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy} />
                ) : (
                  <div style={{ textAlign: "center", color: C.tx3, fontSize: 11, padding: "14px 0" }}>Aucune mesure</div>
                )}
              </div>
            </div>
            <MeasurementComparison athleteId={athleteId!} />
          </Panel>

          {/* ── RECORDS PERSONNELS ── */}
          <Panel title="Records personnels (1RM)" color="#F59E0B">
            <PRLogsSection
              athleteId={athleteId!}
              exercises={Object.values(exos).flat()}
              onUpdateExerciseRef={(exId, rmRef) => {
                setExos((prev: import("@/features/shared/types/athlete").ExosMap) => {
                  const next = { ...prev };
                  for (const sid of Object.keys(next)) {
                    next[sid] = next[sid].map(e =>
                      e.id === exId ? { ...e, rm_ref: rmRef } : e
                    );
                  }
                  return next;
                });
              }}
            />
          </Panel>

          {/* ── DONNÉES PERSONNALISÉES (pleine largeur, tout en bas) ── */}
          <Panel title="Données personnalisées" color={CATEGORY_COLOR.custom}>
            {customEntries.length > 0 && (
              <MetricGrid>
                {customEntries.map(([key, ref]) => (
                  <MetricCard
                    key={key}
                    metric={{ key, label: key, unit: ref.unit, description: "Donnée personnalisée", category: "custom" }}
                    currentValue={ref.value}
                    currentDate={ref.date}
                    onSave={(v) => upsert.mutate({ metricName: key, value: v, unit: ref.unit, metricType: "custom" })}
                    onDelete={() => deleteRef.mutate(ref.id)}
                    saving={upsert.isPending}
                  />
                ))}
              </MetricGrid>
            )}
            <CustomMetricForm
              saving={upsert.isPending}
              onSave={(name, value, unit, _cat) =>
                upsert.mutate({ metricName: name, value, unit, metricType: "custom" })
              }
            />
          </Panel>

        </div>
      )}
    </div>
  );
}

// ── Panel & MetricGrid ────────────────────────────────────────────────────────

function Panel({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  return (
    <section style={{ border: "1px solid " + C.brd, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10, background: color + "14" }}>
        <div style={{ width: 4, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: C.tx, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
      {children}
    </div>
  );
}

