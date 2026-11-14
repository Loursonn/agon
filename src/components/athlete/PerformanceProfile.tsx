import { useState } from "react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { groupMeasurements, type PerformanceLog } from "@/api/references";
import {
  useActivateReference,
  useAddMeasurement,
  useDeleteMeasurement,
  useMeasurementHistory,
} from "@/features/shared/hooks/useReferences";
import { useAddPRLog, useDeletePRLog, usePRsByRef } from "@/features/shared/hooks/usePRLogs";
import { estimateOneRm, isFcZoneKey } from "@shared/domain/performance";
import { localIsoDay } from "@shared/domain/dates";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type { PerformanceLog };

// ── Constantes ────────────────────────────────────────────────────────────────

/**
 * Types proposés à l'athlète. `metric` = nom canonique enregistré (celui que
 * lit le module énergie : « FCmax », pas « FC Max ») ; sans `metric`, l'athlète
 * nomme lui-même sa mesure. Le 1RM va dans les records (`exercise_pr_logs`),
 * comme ceux du coach, pour servir à la programmation en % RM.
 */
const METRIC_TYPES: { id: string; label: string; metric?: string; units: string[]; emoji: string; description: string }[] = [
  { id: "vma", label: "VMA", metric: "VMA", units: ["km/h"], emoji: "VMA", description: "Vitesse Maximale Aérobie" },
  { id: "vitesse_critique", label: "Vitesse critique", metric: "VC", units: ["km/h"], emoji: "VC", description: "Vitesse Critique" },
  { id: "one_rm", label: "1RM", units: ["kg"], emoji: "1RM", description: "Répétition maximale (préciser l'exercice)" },
  { id: "temps_distance", label: "Temps / Distance", units: ["s", "min:s"], emoji: "T/D", description: "Ex: 100m, 1000m, 5km…" },
  { id: "pma", label: "PMA", metric: "PMA", units: ["W"], emoji: "PMA", description: "Puissance Maximale Aérobie" },
  { id: "ftp", label: "FTP", metric: "FTP", units: ["W"], emoji: "FTP", description: "Puissance au seuil (vélo)" },
  { id: "fc_max", label: "FC max", metric: "FCmax", units: ["bpm"], emoji: "FC", description: "Fréquence cardiaque maximale" },
  { id: "fc_repos", label: "FC repos", metric: "FCrepos", units: ["bpm"], emoji: "FCr", description: "Fréquence cardiaque de repos" },
  { id: "custom", label: "Autre", units: ["custom"], emoji: "---", description: "Métrique personnalisée" },
];

/**
 * Couleur par type de métrique, en couleurs de marque. `color` (valeur concrète)
 * sert au graphique Recharts ; les classes servent au reste de la carte.
 * Avant le 14/11 : VC en miel et FC repos en gris bleu (hors charte).
 */
interface MetricTone { color: string; text: string; soft: string; chip: string; refBtn: string }
const METRIC_TONES: Record<string, MetricTone> = {
  vma: { color: C.r, text: "text-agon-erreur", soft: "bg-agon-erreur/[0.125]", chip: "border-agon-erreur bg-agon-erreur/[0.125] text-agon-erreur", refBtn: "border-agon-erreur/[0.31] bg-agon-erreur/[0.07] text-agon-erreur" },
  vitesse_critique: { color: C.o, text: "text-agon-alerte", soft: "bg-agon-alerte/[0.125]", chip: "border-agon-alerte bg-agon-alerte/[0.125] text-agon-alerte", refBtn: "border-agon-alerte/[0.31] bg-agon-alerte/[0.07] text-agon-alerte" },
  one_rm: { color: C.ac, text: "text-agon-accent", soft: "bg-agon-accent/[0.125]", chip: "border-agon-accent bg-agon-accent/[0.125] text-agon-accent", refBtn: "border-agon-accent/[0.31] bg-agon-accent/[0.07] text-agon-accent" },
  temps_distance: { color: C.g, text: "text-agon-succes", soft: "bg-agon-succes/[0.125]", chip: "border-agon-succes bg-agon-succes/[0.125] text-agon-succes", refBtn: "border-agon-succes/[0.31] bg-agon-succes/[0.07] text-agon-succes" },
  pma: { color: C.b, text: "text-agon-info", soft: "bg-agon-info/[0.125]", chip: "border-agon-info bg-agon-info/[0.125] text-agon-info", refBtn: "border-agon-info/[0.31] bg-agon-info/[0.07] text-agon-info" },
  fc_max: { color: C.ac, text: "text-agon-accent", soft: "bg-agon-accent/[0.125]", chip: "border-agon-accent bg-agon-accent/[0.125] text-agon-accent", refBtn: "border-agon-accent/[0.31] bg-agon-accent/[0.07] text-agon-accent" },
  fc_repos: { color: C.tx3, text: "text-agon-tx3", soft: "bg-agon-tx3/[0.125]", chip: "border-agon-tx3 bg-agon-tx3/[0.125] text-agon-tx3", refBtn: "border-agon-tx3/[0.31] bg-agon-tx3/[0.07] text-agon-tx3" },
  custom: { color: C.ame, text: "text-agon-amethyste", soft: "bg-agon-amethyste/[0.125]", chip: "border-agon-amethyste bg-agon-amethyste/[0.125] text-agon-amethyste", refBtn: "border-agon-amethyste/[0.31] bg-agon-amethyste/[0.07] text-agon-amethyste" },
};
METRIC_TONES.ftp = METRIC_TONES.pma;
METRIC_TONES.puissance = METRIC_TONES.pma;
const DEFAULT_TONE = METRIC_TONES.one_rm;

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.5px] text-agon-tx3";
const FIELD = "box-border w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3 py-[9px] font-[inherit] text-[13px] [outline:none]";
const BTN_X = "size-[26px] cursor-pointer rounded-[6px] border-none bg-agon-erreur/[0.1] text-[12px] text-agon-erreur";
const BADGE = "rounded-[4px] px-1.5 py-px text-[9px] font-bold";

/** Type d'affichage d'une métrique : par nom canonique d'abord (saisies du coach : metric_type « reference »). */
function typeOf(metricName: string, metricType: string) {
  return METRIC_TYPES.find((m) => m.metric === metricName) ?? METRIC_TYPES.find((m) => m.id === metricType);
}

const emptyForm = () => ({
  metric_type: "vma",
  metric_name: "VMA",
  value: "",
  reps: "1",
  unit: "km/h",
  custom_unit: "",
  date: localIsoDay(),
  notes: "",
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  athleteId: string;
  viewOnly?: boolean;
  isCoach?: boolean;
  /** Plus utilisé (couleurs en classes) ; gardé pour les appelants. */
  C?: Record<string, string>;
}

// ── Mini graphique ──────────────────────────────────────────────────────────

function MiniPerfChart({ data, color, activeRef }: { data: { date: string; value: number }[]; color: string; activeRef?: number }) {
  if (data.length < 2) return null;
  const chartData = data.map(d => ({ label: d.date.slice(5), value: d.value }));
  return (
    <div className="mt-2 h-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.tx3 }} axisLine={false} tickLine={false} />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, fontSize: 11 }}
            labelStyle={{ color: C.tx3 }}
            formatter={(v: number) => [v, ""]}
          />
          {activeRef && <ReferenceLine y={activeRef} stroke={color} strokeDasharray="3 3" strokeOpacity={0.5} />}
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function PerformanceProfile({ athleteId, viewOnly, isCoach }: Props) {
  const { data: logs = [], isLoading: loading, isError } = useMeasurementHistory(athleteId);
  const { bestByRef } = usePRsByRef(athleteId);
  const addMeasurement = useAddMeasurement();
  const activate = useActivateReference(athleteId);
  const remove = useDeleteMeasurement(athleteId);
  const addRecord = useAddPRLog();
  const deleteRecord = useDeletePRLog();
  const [showForm, setShowForm] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [settingRef, setSettingRef] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Bornes de zones FC : des réglages du coach, pas des performances.
  const grouped = groupMeasurements(logs.filter((l) => !isFcZoneKey(l.metric_name)));
  const records = Object.values(bestByRef).sort((a, b) => a.exercise_ref.localeCompare(b.exercise_ref));
  const formType = METRIC_TYPES.find((m) => m.id === form.metric_type);
  const isOneRm = form.metric_type === "one_rm";

  const handleMetricTypeChange = (type: string) => {
    const mt = METRIC_TYPES.find(m => m.id === type);
    const defaultUnit = mt?.units[0] || "custom";
    setForm(f => ({ ...f, metric_type: type, metric_name: mt?.metric ?? "", unit: defaultUnit, reps: "1" }));
  };

  const handleSubmit = async () => {
    const val = parseFloat(form.value);
    if (!form.metric_name.trim() || isNaN(val)) return;

    if (isOneRm) {
      const reps = parseInt(form.reps, 10) || 1;
      try {
        await addRecord.mutateAsync({
          athleteId, ref: form.metric_name.trim(), kg: val, reps, date: form.date,
          notes: form.notes || null, source: "manual",
        });
        setShowForm(false);
      } catch {
        // Le message d'erreur est affiché par le hook ; le formulaire reste ouvert.
      }
      return;
    }

    try {
      const { notified } = await addMeasurement.mutateAsync({
        athleteId,
        metricType: form.metric_type,
        metricName: form.metric_name,
        value: val,
        unit: form.unit === "custom" ? (form.custom_unit || "custom") : form.unit,
        customUnit: form.unit === "custom" ? form.custom_unit : null,
        date: form.date,
        notes: form.notes || null,
        createdBy: athleteId,
        notifyCoach: !isCoach,
      });
      if (!isCoach && !notified) toast("Performance enregistrée — ton coach n'a pas pu être prévenu", { duration: 3000 });
      setShowForm(false);
    } catch {
      // Sans ce garde, un insert refusé fermait quand même le formulaire : la
      // performance saisie disparaissait sans le moindre message.
      toast.error("Performance non enregistrée — vérifie ta connexion");
    }
  };

  const handleSetActiveRef = async (logId: string, metricName: string) => {
    setSettingRef(logId);
    try {
      await activate.mutateAsync({ logId, metricName });
    } catch {
      toast.error("Référence non mise à jour — vérifie ta connexion");
    } finally {
      setSettingRef(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      setConfirmDelete(null);
    } catch {
      toast.error("Suppression échouée — vérifie ta connexion");
    }
  };

  const canSubmit = !!form.metric_name.trim() && !!form.value;
  const oneRmPreview = isOneRm && parseInt(form.reps, 10) > 1 && parseFloat(form.value) > 0
    ? estimateOneRm(parseFloat(form.value), parseInt(form.reps, 10))
    : null;

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-bold text-agon-tx">Performances sportives</div>
          <div className="mt-0.5 text-[11px] text-agon-tx3">VMA, 1RM, VC, temps… avec historique</div>
        </div>
        {!viewOnly && (
          <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
            className="cursor-pointer rounded-[4px] border-none bg-agon-accent px-3.5 py-[7px] font-[inherit] text-[12px] font-bold text-agon-ink">
            + Ajouter
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-5 text-center text-[12px] text-agon-tx3">Chargement…</div>
      ) : isError ? (
        <div className="rounded-[6px] border border-agon-brd bg-agon-s1 px-5 py-6 text-center text-[13px] text-agon-tx3">
          Performances non chargées — vérifie ta connexion
        </div>
      ) : Object.keys(grouped).length === 0 && records.length === 0 ? (
        <div className="rounded-[6px] border border-agon-brd bg-agon-s1 px-5 py-6 text-center">
          <div className="mb-2 text-[14px] font-bold text-agon-tx3">Performances</div>
          <div className="text-[13px] text-agon-tx3">Aucune performance enregistrée</div>
          <div className="mt-1 text-[11px] text-agon-tx3">Ajoute une première mesure pour commencer le suivi</div>
        </div>
      ) : (
        Object.entries(grouped).map(([metricName, entries]) => {
          const activeRef = entries.find(e => e.is_active_reference);
          const latest = entries[0];
          const metricType = typeOf(metricName, latest.metric_type);
          const tone = METRIC_TONES[metricType?.id ?? latest.metric_type] ?? DEFAULT_TONE;
          const isExpanded = expandedMetric === metricName;
          const chartData = [...entries].reverse().map(e => ({ date: e.date, value: e.value }));

          return (
            <div key={metricName} className="mb-2.5 overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
              {/* Carte résumé */}
              <div
                onClick={() => setExpandedMetric(isExpanded ? null : metricName)}
                className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5"
              >
                <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-[6px] text-[20px]", tone.soft)}>
                  {metricType?.emoji || "---"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[13px] font-bold text-agon-tx">{metricType?.metric ? metricType.label : metricName}</div>
                    {activeRef && (
                      <span className={cn(BADGE, "bg-agon-succes/[0.125] text-agon-succes")}>REF ACTIVE</span>
                    )}
                    {latest.coach_validated === false && (
                      <span className={cn(BADGE, "bg-agon-erreur/[0.125] text-agon-erreur")}>REJETÉ</span>
                    )}
                    {latest.coach_validated === null && !activeRef && (
                      <span className={cn(BADGE, "bg-agon-alerte/[0.125] text-agon-alerte")}>EN ATTENTE</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-agon-tx3">{entries.length} mesure{entries.length > 1 ? "s" : ""} · dernière : {latest.date}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={cn("text-[24px] font-black tracking-[-1px]", tone.text)}>{latest.value}</div>
                  <div className="text-[10px] text-agon-tx3">{latest.unit}</div>
                </div>
                <span className="ml-1 text-[16px] text-agon-tx3">{isExpanded ? "∧" : "∨"}</span>
              </div>

              {/* Détail expandé */}
              {isExpanded && (
                <div className="border-t border-agon-brd bg-agon-bg px-4 py-3.5">
                  {/* Graphique */}
                  {chartData.length >= 2 && (
                    <MiniPerfChart data={chartData} color={tone.color} activeRef={activeRef?.value} />
                  )}

                  {/* Liste des entrées */}
                  <div className="mt-3">
                    <div className={cn(LABEL, "mb-2")}>Historique</div>
                    {entries.map(entry => (
                      <div key={entry.id} className="flex items-center gap-2.5 border-b border-agon-brd py-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("text-[14px] font-bold", entry.is_active_reference ? tone.text : "text-agon-tx")}>{entry.value} {entry.unit}</span>
                            {entry.is_active_reference && <span className="rounded-[4px] bg-agon-succes/[0.125] px-[5px] py-px text-[9px] font-bold text-agon-succes">REF</span>}
                          </div>
                          <div className="text-[10px] text-agon-tx3">{entry.date}{entry.notes ? " · " + entry.notes : ""}</div>
                        </div>
                        {!viewOnly && <div className="flex shrink-0 gap-1.5">
                          {!entry.is_active_reference && (
                            <button
                              onClick={() => handleSetActiveRef(entry.id, entry.metric_name)}
                              disabled={settingRef === entry.id}
                              className={cn("cursor-pointer rounded-[6px] border px-2.5 py-1 font-[inherit] text-[10px] font-semibold", tone.refBtn)}
                            >
                              {settingRef === entry.id ? "…" : "Réf. active"}
                            </button>
                          )}
                          <button onClick={() => setConfirmDelete(entry.id)} className={BTN_X}>×</button>
                        </div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Records (1RM) — même table que ceux du coach, utilisés pour les % RM */}
      {!loading && records.length > 0 && (
        <div className="mb-2.5 rounded-[6px] border border-agon-brd bg-agon-s1 px-4 py-3">
          <div className={cn(LABEL, "mb-2")}>Records (1RM)</div>
          {records.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 border-b border-agon-brd py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-agon-tx">{r.exercise_ref}</div>
                <div className="text-[10px] text-agon-tx3">
                  {r.date}{r.source_reps && r.source_reps > 1 && r.source_kg ? ` · ${r.source_kg} kg × ${r.source_reps}` : ""}{r.source === "computed" ? " · séance" : ""}
                </div>
              </div>
              <span className={cn("text-[18px] font-black", METRIC_TONES.one_rm.text)}>{r.kg} kg</span>
              {!viewOnly && r.source === "manual" && (
                <button onClick={() => deleteRecord.mutate({ id: r.id, athleteId })} aria-label="Supprimer ce record" className={BTN_X}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal ajout */}
      {showForm && (
        <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70" onClick={() => setShowForm(false)}>
          <div className="max-h-[85vh] w-full max-w-[600px] overflow-y-auto rounded-t-[6px] bg-agon-s1 px-5 pb-10 pt-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-[15px] font-bold text-agon-tx">Ajouter une performance</div>

            <div className="flex flex-col gap-3.5">
              {/* Type */}
              <div>
                <div className={cn(LABEL, "mb-2")}>Type de performance</div>
                <div className="flex flex-wrap gap-1.5">
                  {METRIC_TYPES.map(m => (
                    <button key={m.id} onClick={() => handleMetricTypeChange(m.id)}
                      className={cn(
                        "flex cursor-pointer items-center gap-[5px] rounded-[4px] border px-3 py-1.5 font-[inherit] text-[11px] font-semibold",
                        form.metric_type === m.id ? (METRIC_TONES[m.id] ?? DEFAULT_TONE).chip : "border-agon-brd-l bg-transparent text-agon-tx3",
                      )}>
                      <span>{m.emoji}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nom */}
              <div>
                <div className={cn(LABEL, "mb-1.5")}>
                  {form.metric_type === "one_rm" ? "Exercice *" : "Nom de la métrique *"}
                </div>
                {formType?.metric ? (
                  <div className={cn(FIELD, "text-agon-tx3")}>
                    {formType.label}
                  </div>
                ) : (
                  <input value={form.metric_name} onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))}
                    placeholder={isOneRm ? "Ex: Développé couché" : "Ex: 5 km"}
                    className={cn(FIELD, "text-agon-tx")} />
                )}
              </div>

              {/* Valeur + Unité */}
              <div className="flex gap-2.5">
                <div className="flex-[2]">
                  <div className={cn(LABEL, "mb-1.5")}>{isOneRm ? "Charge *" : "Valeur *"}</div>
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="Ex: 18.5"
                    className={cn(FIELD, "text-[14px] font-bold text-agon-tx")} />
                </div>
                <div className="flex-1">
                  <div className={cn(LABEL, "mb-1.5")}>Unité</div>
                  {METRIC_TYPES.find(m => m.id === form.metric_type)?.units.length === 1 ? (
                    <div className={cn(FIELD, "text-agon-tx3")}>
                      {form.unit}
                    </div>
                  ) : (
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      className={cn(FIELD, "text-agon-tx")}>
                      {METRIC_TYPES.find(m => m.id === form.metric_type)?.units.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  )}
                  {form.unit === "custom" && (
                    <input value={form.custom_unit} onChange={e => setForm(f => ({ ...f, custom_unit: e.target.value }))} placeholder="Unité"
                      className={cn(FIELD, "mt-1.5 py-2 text-[12px] text-agon-tx")} />
                  )}
                </div>
              </div>

              {isOneRm && (
                <div>
                  <div className={cn(LABEL, "mb-1.5")}>Répétitions à cette charge</div>
                  <input type="number" min={1} max={30} value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))}
                    className={cn(FIELD, "text-agon-tx")} />
                  {oneRmPreview != null && (
                    <div className="mt-1.5 text-[11px] text-agon-tx3">1RM estimé : <strong className={METRIC_TONES.one_rm.text}>{oneRmPreview} kg</strong></div>
                  )}
                </div>
              )}

              {/* Date */}
              <div>
                <div className={cn(LABEL, "mb-1.5")}>Date</div>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className={cn(FIELD, "text-agon-tx")} />
              </div>

              {/* Notes */}
              <div>
                <div className={cn(LABEL, "mb-1.5")}>Notes (optionnel)</div>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Conditions, contexte…"
                  className={cn(FIELD, "text-[12px] text-agon-tx")} />
              </div>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 cursor-pointer rounded-[4px] border border-agon-brd-l bg-transparent py-3 font-[inherit] text-[13px] font-semibold text-agon-tx3">
                Annuler
              </button>
              <button onClick={handleSubmit} disabled={!canSubmit || addMeasurement.isPending || addRecord.isPending}
                className={cn(
                  "flex-[2] rounded-[4px] border-none py-3 font-[inherit] text-[13px] font-bold",
                  canSubmit ? "cursor-pointer bg-agon-accent text-agon-ink" : "cursor-default bg-agon-s2 text-agon-tx3",
                )}>
                {addMeasurement.isPending || addRecord.isPending ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 p-6" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-[300px] rounded-[6px] border border-agon-brd bg-agon-s1 p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-2 text-[15px] font-bold text-agon-tx">Supprimer cette mesure ?</div>
            <div className="mt-4 flex gap-2.5">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 cursor-pointer rounded-[4px] border border-agon-brd-l bg-transparent py-[11px] font-[inherit] text-[13px] font-semibold text-agon-tx3">Annuler</button>
              <button onClick={() => handleDelete(confirmDelete!)} className="flex-1 cursor-pointer rounded-[4px] border-none bg-agon-erreur py-[11px] font-[inherit] text-[13px] font-bold text-agon-ink">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
