/**
 * ProfilSportifPage
 *
 * Références de performance + zones FC ajustables + métriques personnalisées.
 * Route : /coach/athletes/:athleteId/profil-sportif
 */
import { STALE_MS } from "@/lib/queryCache";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWellnessHistory, wellnessKeys } from "@/api/wellness";
import { recentWeights } from "@/api/profile";
import MeasurementComparison from "@/features/coach/components/MeasurementComparison";
import CategoryProfiles from "@/features/coach/components/CategoryProfiles";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { WeightChart } from "@/components/athlete/StatsCharts";
import { PRLogsSection } from "@/features/coach/components/PRLogsSection";
import { useActiveReferences, useDeleteMeasurement, useSaveFcZones, useSetReference } from "@/features/shared/hooks/useReferences";
import { ZoneModelPanel } from "@/features/coach/components/zones/ZoneModelPanel";
import { CriticalSpeedProposal } from "@/features/coach/components/load/CriticalSpeedProposal";
import { defaultFiveZoneMaxes, fiveZoneBounds } from "@shared/domain/hrZones";
import { storedFcZones as pickFcZones } from "@/api/references";
import { activeModelAt } from "@shared/domain/hrZones";
import { localIsoDay } from "@shared/domain/dates";
import { useZoneModels } from "@/features/shared/hooks/useZoneModels";
import { KICK, PageHead, SectionHead } from "@/features/shared/components/ordi/OrdiUi";
import { RefGroup, RefRow, RefTable, ThresholdTile } from "@/features/coach/components/profil/ProfilOrdi";
import { refSource } from "@/features/coach/components/profil/refSource";

/** Carte « ordi » (ORDI_CARD d'OrdiUi) en classes. */
const ORDI_CARD_CLS = "rounded-[14px] border border-agon-brd bg-agon-s1";

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


// ── Zone FC computations ──────────────────────────────────────────────────────

/** Couleurs des 5 zones (charte `--agon-zone5-*`), classes écrites en entier. */
const ZONE_BAR = ["bg-agon-zone5-1", "bg-agon-zone5-2", "bg-agon-zone5-3", "bg-agon-zone5-4", "bg-agon-zone5-5"] as const;
const ZONE_INPUT = [
  "border-agon-zone5-1/[0.376]", "border-agon-zone5-2/[0.376]", "border-agon-zone5-3/[0.376]",
  "border-agon-zone5-4/[0.376]", "border-agon-zone5-5/[0.376]",
] as const;

interface FcZoneDef { label: string; zoneKey: string }

const FC_ZONES_DEF: FcZoneDef[] = [
  { label: "Z1 — Récupération", zoneKey: "FCzone_Z1_max" },
  { label: "Z2 — Endurance",    zoneKey: "FCzone_Z2_max" },
  { label: "Z3 — Tempo",        zoneKey: "FCzone_Z3_max" },
  { label: "Z4 — Seuil",        zoneKey: "FCzone_Z4_max" },
  { label: "Z5 — VO₂max",       zoneKey: "FCzone_Z5_max" },
];

const computeDefaultFcZones = defaultFiveZoneMaxes;

function vmaZones(vma: number) {
  const p = (pct: number) => {
    const kmh = vma * pct;
    const s = 3600 / kmh;
    const m = Math.floor(s / 60);
    const ss = Math.round(s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };
  return [
    { label: "Z1 — Footing",   min: p(0.65), max: p(0.72), bar: ZONE_BAR[0] },
    { label: "Z2 — Endurance", min: p(0.72), max: p(0.82), bar: ZONE_BAR[1] },
    { label: "Z3 — Tempo",     min: p(0.82), max: p(0.89), bar: ZONE_BAR[2] },
    { label: "Z4 — Seuil",     min: p(0.89), max: p(0.95), bar: ZONE_BAR[3] },
    { label: "Z5 — VMA",       min: p(0.95), max: p(1.05), bar: ZONE_BAR[4] },
  ];
}

function ftpZones(ftp: number) {
  const w = (pct: number) => Math.round(ftp * pct);
  return [
    { label: "Z1 — Récupération", range: `< ${w(0.55)} W`,                        bar: ZONE_BAR[0] },
    { label: "Z2 — Endurance",    range: `${w(0.55)}–${w(0.75)} W`,               bar: ZONE_BAR[1] },
    { label: "Z3 — Tempo",        range: `${w(0.75)}–${w(0.90)} W`,               bar: ZONE_BAR[2] },
    { label: "Z4 — Seuil",        range: `${w(0.90)}–${w(1.05)} W`,               bar: ZONE_BAR[3] },
    { label: "Z5 — VO₂max",       range: `${w(1.05)}–${w(1.20)} W`,               bar: ZONE_BAR[4] },
  ];
}

// ── DB hooks ──────────────────────────────────────────────────────────────────

/** Références : `src/api/references.ts` (RPC atomiques, invalidation partout). */
function useUpsertRef(athleteId: string) {
  const m = useSetReference();
  return {
    ...m,
    mutate: ({ metricName, value, unit }: { metricName: string; value: number; unit: string; metricType?: string }) =>
      m.mutate(
        { athleteId, metricName, value, unit, validated: true },
        {
          onSuccess: () => toast.success("Référence mise à jour"),
          onError: () => toast.error("Erreur lors de la mise à jour"),
        },
      ),
  };
}

function useDeleteRef(athleteId: string) {
  const m = useDeleteMeasurement(athleteId);
  return {
    ...m,
    mutate: (id: string) =>
      m.mutate(id, {
        onSuccess: () => toast.success("Donnée supprimée"),
        onError: () => toast.error("Erreur lors de la suppression"),
      }),
  };
}

/**
 * Moyenne des 3 dernières pesées saisies avec le wellness (`asp:wh`, hors
 * blocs archivés). Même clé que l'historique wellness : rafraîchie par
 * `invalidateWellness` à chaque saisie.
 */
function useLastWeights(athleteId: string) {
  const range = { includeArchived: false } as const;
  return useQuery({
    queryKey: wellnessKeys.history(athleteId, range),
    queryFn: () => getWellnessHistory(athleteId, range),
    select: (history) => recentWeights(history, 3),
    staleTime: STALE_MS,
  });
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
/** Badge de stratégie : texte, aplat 10 %, bordure 25 %. */
const STRATEGY_BADGE: Record<StrategyKey, string> = {
  maintenance: "border-agon-info/25 bg-agon-info/[0.102] text-agon-info",
  seche: "border-agon-erreur/25 bg-agon-erreur/[0.102] text-agon-erreur",
  prise_de_masse: "border-agon-succes/25 bg-agon-succes/[0.102] text-agon-succes",
};

function WeightDerivedCard({ athleteId, strategy }: { athleteId: string; strategy?: StrategyKey | null }) {
  const { data, isLoading } = useLastWeights(athleteId);

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 rounded-[6px] border border-agon-brd bg-agon-s1 p-4 text-center hover:border-agon-succes/[0.314]",
        isLoading && "opacity-60",
      )}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-agon-succes">
        Poids
      </div>

      {data ? (
        <div className="flex flex-col items-center gap-[3px]">
          <div className="flex items-baseline gap-[5px]">
            <span className="text-[34px] font-extrabold text-agon-tx leading-none">{data.avg}</span>
            <span className="text-[14px] text-agon-tx3">kg</span>
          </div>
          <div className="text-[9px] text-agon-tx3">
            moy. {data.count} dernières
            {safeDate(data.lastDate) && " · " + safeDate(data.lastDate)!.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </div>
        </div>
      ) : (
        <div className="text-[12px] italic text-agon-tx3">
          {isLoading ? "…" : "Aucune saisie de poids"}
        </div>
      )}

      {/* Stratégie nutrition actuelle */}
      <div className="flex flex-col items-center gap-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.5px] text-agon-tx3">
          Stratégie
        </div>
        {strategy ? (
          <span className={cn("rounded-[6px] border px-3 py-1 text-[12px] font-bold", STRATEGY_BADGE[strategy])}>
            {STRATEGY_LABEL[strategy]}
          </span>
        ) : (
          <span className="text-[11px] italic text-agon-tx3">Non définie</span>
        )}
      </div>
    </div>
  );
}

// ── FC Zone Editor ────────────────────────────────────────────────────────────

const CARD = "overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1";
const ZONE_ROW = "flex items-center gap-2.5 px-3.5 py-2";
const ZONE_BAR_SHAPE = "h-5 w-1 shrink-0 rounded-[2px]";
const ZONE_INPUT_BASE = "w-[65px] rounded-[6px] border bg-agon-s2 px-[7px] py-1 text-right text-[12px] font-bold text-agon-tx outline-none";
const ZONE_VALUE = "min-w-[65px] text-right text-[12px] font-bold text-agon-tx";
const GHOST_BTN = "cursor-pointer rounded-[7px] border border-agon-brd-l bg-transparent px-3 py-1.5 text-[11px] text-agon-tx3";

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
    <div className={CARD}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-agon-brd px-3.5 py-2.5">
        <div>
          <div className="text-[12px] font-bold text-agon-tx">
            Zones FC — FCmax {fcmax} bpm{fcrep ? ` · repos ${fcrep} bpm` : ""}
          </div>
          <div className="mt-px text-[10px] text-agon-tx3">
            {custom ? "Bornes personnalisées (connectées au module énergie)" : "Calculé automatiquement"}
          </div>
        </div>
        <button
          onClick={() => {
            if (!custom) { setCustom(true); setDrafts(defaults.map(String)); }
            else { setCustom(false); }
          }}
          className={cn(
            "cursor-pointer rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold",
            custom ? "border-agon-accent/[0.376] bg-agon-accent/[0.082] text-agon-accent" : "border-agon-brd-l bg-transparent text-agon-tx3",
          )}
        >
          {custom ? "Personnalisé ✓" : "Personnaliser"}
        </button>
      </div>

      {/* Z0 min row — FC de départ activité */}
      <div className={cn(ZONE_ROW, "border-b border-agon-brd bg-white/[0.02]")}>
        <div className={cn(ZONE_BAR_SHAPE, "bg-agon-tx3")} />
        <span className="flex-1 text-[12px] font-semibold text-agon-tx3">FC départ activité</span>
        <span className="min-w-[50px] text-[10px] text-agon-tx3">0 bpm</span>
        <span className="text-[10px] text-agon-tx3">→</span>
        {custom ? (
          <input
            type="number"
            value={draftZ0}
            onChange={(e) => setDraftZ0(e.target.value)}
            min={0}
            max={150}
            className={cn(ZONE_INPUT_BASE, "border-agon-tx3/25")}
          />
        ) : (
          <span className={ZONE_VALUE}>
            {displayZ0}
          </span>
        )}
        <span className="min-w-6 text-[11px] text-agon-tx3">bpm</span>
      </div>

      {/* Zone rows */}
      <div>
        {FC_ZONES_DEF.map((z, i) => (
          <div
            key={z.zoneKey}
            className={cn(ZONE_ROW, i < FC_ZONES_DEF.length - 1 && "border-b border-agon-brd")}
          >
            <div className={cn(ZONE_BAR_SHAPE, ZONE_BAR[i])} />
            <span className="flex-1 text-[12px] font-semibold text-agon-tx">{z.label}</span>
            <span className="min-w-[50px] text-[11px] text-agon-tx3">
              {prevMax(i)} bpm
            </span>
            <span className="text-[10px] text-agon-tx3">→</span>
            {custom ? (
              <input
                type="number"
                value={drafts[i]}
                onChange={(e) => setDraft(i, e.target.value)}
                min={prevMax(i) + 1}
                max={250}
                className={cn(ZONE_INPUT_BASE, ZONE_INPUT[i])}
              />
            ) : (
              <span className={ZONE_VALUE}>
                {displayVals[i]}
              </span>
            )}
            <span className="min-w-6 text-[11px] text-agon-tx3">bpm</span>
          </div>
        ))}
      </div>

      {/* Footer actions */}
      {custom && (
        <div className="flex justify-end gap-2 border-t border-agon-brd px-3.5 py-2.5">
          <button
            onClick={resetToDefaults}
            className={GHOST_BTN}
          >
            Réinitialiser
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer rounded-[7px] border-none bg-agon-or-vif px-3.5 py-1.5 text-[11px] font-bold text-agon-ink"
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

const FIELD_LABEL = "mb-1 text-[10px] text-agon-tx3";
const FIELD = "w-full rounded-[7px] border border-agon-brd-l bg-agon-s2 px-2.5 py-[7px] text-[12px] text-agon-tx outline-none";

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
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-agon-brd-l bg-transparent px-4 py-2 text-[12px] text-agon-tx3 [transition:all_150ms] hover:border-agon-accent/[0.376] hover:text-agon-accent"
    >
      <Plus size={13} />
      Ajouter une donnée personnalisée
    </button>
  );

  return (
    <div className="rounded-[6px] border border-agon-accent/[0.314] bg-agon-s1 p-4">
      <div className="mb-3 text-[12px] font-bold text-agon-accent">Nouvelle donnée</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <div className={FIELD_LABEL}>Nom</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Lactatémie, Indice…"
            autoFocus
            className={FIELD}
          />
        </div>
        <div>
          <div className={FIELD_LABEL}>Catégorie</div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value as Category)}
            className={FIELD}
          >
            {CUSTOM_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <div className={FIELD_LABEL}>Valeur</div>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className={FIELD}
          />
        </div>
        <div>
          <div className={FIELD_LABEL}>Unité</div>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="mmol/L, %, s…"
            className={FIELD}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className={GHOST_BTN}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={saving} className="cursor-pointer rounded-[7px] border-none bg-agon-accent px-4 py-1.5 text-[11px] font-bold text-agon-tx">
          {saving ? "…" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}

// ── ZoneTableSimple ───────────────────────────────────────────────────────────

function ZoneTableSimple({ title, rows }: {
  title: string;
  rows: Array<{ label: string; range?: string; min?: string; max?: string; bar: string }>;
}) {
  return (
    <div className={CARD}>
      <div className="border-b border-agon-brd px-3.5 py-2.5 text-[12px] font-bold text-agon-tx">
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={i} className={cn(ZONE_ROW, i < rows.length - 1 && "border-b border-agon-brd")}>
          <div className={cn(ZONE_BAR_SHAPE, r.bar)} />
          <span className="flex-1 text-[12px] font-semibold text-agon-tx">{r.label}</span>
          <span className="text-right text-[11px] font-semibold text-agon-tx2">
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
  const { weightLog, weightMilestones, bodyWeight, nutritionStrategy, exos, setExos, athleteProfile } = useAthleteContext();
  const { data: zoneRows = [] } = useZoneModels(athleteId);
  const currentModel = activeModelAt(zoneRows, localIsoDay());
  const { data: refs = {}, isLoading } = useActiveReferences(athleteId);
  const upsert = useUpsertRef(athleteId!);
  const deleteRef = useDeleteRef(athleteId!);
  const saveFcZones = useSaveFcZones(athleteId!);

  const customEntries = Object.entries(refs).filter(
    ([k]) => !PREDEFINED_KEYS.has(k) && !k.startsWith("FCzone_") && k !== "FCzone_Z0_min"
  );

  const fcmax  = refs["FCmax"]?.value;
  const fcrep  = refs["FCrepos"]?.value;
  const vma    = refs["VMA"]?.value;
  const vmax   = refs["Vmax"]?.value;
  const ftp    = refs["FTP"]?.value;

  const storedFcZones: Record<string, number> = pickFcZones(refs);

  // Une écriture pour les 6 bornes ; une borne inchangée ne crée pas de ligne.
  function saveZones(zones: Record<string, number>) {
    saveFcZones.mutate(zones, {
      onSuccess: (n) => toast.success(n > 0 ? "Zones FC enregistrées" : "Zones FC déjà à jour"),
      onError: () => toast.error("Zones FC non enregistrées"),
    });
  }

  const first = athleteProfile?.first_name || "l'athlète";
  const src = (k: string) => refSource(refs[k], athleteId!);
  const save = (metric: MetricDef) => (v: number) => upsert.mutate({ metricName: metric.key, value: v, unit: metric.unit });
  const M = (k: string) => METRICS.find((m) => m.key === k)!;
  const three = currentModel?.kind === "three" ? currentModel : null;

  const refRow = (k: string, label?: string) => {
    const m = M(k);
    return (
      <RefRow
        key={k}
        label={label ?? m.description.replace(/ \(.*\)$/, "")}
        value={refs[k]?.value}
        unit={m.unit}
        date={refs[k]?.date}
        source={src(k)}
        step={m.step}
        onSave={save(m)}
        saving={upsert.isPending}
      />
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title="Profil sportif"
        sub={`Seuils, zones et références de ${first}. Chaque valeur garde sa date et sa source.`}
      />
      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={cn("h-[150px]", ORDI_CARD_CLS)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-7">

          {/* ── 01 FC et seuils ── */}
          <div className="flex flex-col gap-3">
            <SectionHead n={1} title="Fréquence cardiaque et seuils" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              {three && (
                <>
                  <ThresholdTile label="SV1" hint="seuil 1" value={three.bounds[0]} unit="bpm" date={three.validFrom}
                    source={three.origin === "test" ? "Test" : "Saisie coach"} readOnlyNote="Se règle dans les zones (02)" />
                  <ThresholdTile label="SV2" hint="seuil 2" value={three.bounds[1]} unit="bpm" date={three.validFrom}
                    source={three.origin === "test" ? "Test" : "Saisie coach"} readOnlyNote="Se règle dans les zones (02)" />
                </>
              )}
              <ThresholdTile label="FC max" hint="maximale" value={fcmax} unit="bpm" date={refs.FCmax?.date} source={src("FCmax")}
                onSave={save(M("FCmax"))} saving={upsert.isPending} />
              {!three && (
                <ThresholdTile label="FC seuil" hint="seuil lactique" value={refs.FCseuil?.value} unit="bpm" date={refs.FCseuil?.date}
                  source={src("FCseuil")} derived={fcmax != null ? { value: Math.round(fcmax * 0.85), label: "auto 85 %" } : null}
                  onSave={save(M("FCseuil"))} saving={upsert.isPending} />
              )}
              <ThresholdTile label="FC repos" hint="au réveil" value={fcrep} unit="bpm" date={refs.FCrepos?.date} source={src("FCrepos")}
                onSave={save(M("FCrepos"))} saving={upsert.isPending} />
            </div>
          </div>

          {/* ── 02 Zones FC ── */}
          <div className="flex flex-col gap-3">
            <SectionHead n={2} title="Zones de fréquence cardiaque" />
            <div className="flex items-center gap-3 rounded-[12px] border border-agon-brd-l bg-agon-s1 px-4 py-3 text-[13.5px]">
              <span><b className="font-medium">Ces zones servent à l'onglet Séance</b><span className="text-agon-tx2"> : couleur de la courbe de FC, temps par zone et zone de chaque tour, pour toutes les activités de {first}.</span></span>
            </div>
            <ZoneModelPanel
              athleteId={athleteId!}
              fcmax={fcmax ?? null}
              fcrep={fcrep ?? null}
              fiveBounds={fiveZoneBounds(storedFcZones)}
              fiveEditor={fcmax ? (
                <FcZoneEditor
                  fcmax={fcmax}
                  fcrep={fcrep}
                  storedZones={storedFcZones}
                  onSaveZones={saveZones}
                  saving={saveFcZones.isPending}
                />
              ) : (
                <div className="text-[12px] text-agon-tx3">Renseigne la FC max pour régler les 5 zones.</div>
              )}
            />
          </div>

          {/* ── 03 Références · 04 Métriques personnalisées ── */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] items-start gap-5">
            <div className="flex flex-col gap-3">
              <SectionHead n={3} title="Références de performance" />
              <RefTable>
                <RefGroup title="Endurance" first />
                {refRow("VMA", "VMA")}
                {refRow("VC", "Vitesse critique")}
                {refRow("Vmax", "Vitesse max (sprint)")}
                <RefRow label="VRA" value={vma && vmax ? Math.round((vmax - vma) * 10) / 10 : null} unit="km/h" source="Calculée : Vmax − VMA" />
                <RefGroup title="Puissance" />
                {refRow("FTP", "FTP (vélo)")}
                {refRow("PMA", "PMA")}
              </RefTable>
              <CriticalSpeedProposal
                athleteId={athleteId!}
                saving={upsert.isPending}
                onUse={(v) => upsert.mutate({ metricName: "VC", value: v, unit: "km/h" })}
              />
              {(vma || ftp) && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                  {vma && (
                    <ZoneTableSimple
                      title={`Zones allure — VMA ${vma} km/h`}
                      rows={vmaZones(vma).map((z) => ({ label: z.label, min: z.min + "/km", max: z.max + "/km", bar: z.bar }))}
                    />
                  )}
                  {ftp && (
                    <ZoneTableSimple
                      title={`Zones puissance — FTP ${ftp} W`}
                      rows={ftpZones(ftp).map((z) => ({ label: z.label, range: z.range, bar: z.bar }))}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <SectionHead n={4} title="Métriques personnalisées" />
              <RefTable>
                {customEntries.length === 0 && (
                  <div className="px-[18px] py-3.5 text-[13px] text-agon-tx3">Aucune métrique personnalisée.</div>
                )}
                {customEntries.map(([key, ref], i) => (
                  <div key={key} className={cn(i === 0 && "-mt-px")}>
                    <RefRow
                      label={key}
                      value={ref.value}
                      unit={ref.unit}
                      date={ref.date}
                      source={refSource(ref, athleteId!)}
                      onSave={(v) => upsert.mutate({ metricName: key, value: v, unit: ref.unit, metricType: "custom" })}
                      onDelete={() => deleteRef.mutate(ref.id)}
                      saving={upsert.isPending}
                    />
                  </div>
                ))}
                <div className="border-t border-agon-brd px-[18px] py-3.5">
                  <CustomMetricForm
                    saving={upsert.isPending}
                    onSave={(name, value, unit, _cat) =>
                      upsert.mutate({ metricName: name, value, unit, metricType: "custom" })
                    }
                  />
                </div>
              </RefTable>
            </div>
          </div>

          {/* ── Hors planche, gardé : biométrie, records 1RM, profil par catégorie ── */}
          <div className="flex flex-col gap-3">
            <SectionHead n={5} title="Biométrie" />
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="flex min-w-[200px] max-w-[300px] flex-[1_1_200px]">
                <div className="flex-1">
                  <WeightDerivedCard athleteId={athleteId!} strategy={nutritionStrategy?.strategy ?? null} />
                </div>
              </div>
              <div className={cn("min-w-[300px] flex-[3_1_320px] p-4", ORDI_CARD_CLS)}>
                <div style={KICK} className="mb-2.5">Évolution du poids</div>
                {Object.keys(weightLog).length > 0 ? (
                  <WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy} />
                ) : (
                  <div className="py-3.5 text-center text-[12px] text-agon-tx3">Aucune mesure</div>
                )}
              </div>
            </div>
            <MeasurementComparison athleteId={athleteId!} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHead n={6} title="Records personnels (1RM)" />
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
          </div>

          <div className="flex flex-col gap-3">
            <SectionHead n={7} title="Profil par catégorie" />
            <CategoryProfiles athleteId={athleteId!} />
          </div>
        </div>
      )}
    </div>
  );
}
