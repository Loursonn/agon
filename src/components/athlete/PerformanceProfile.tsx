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

const METRIC_COLORS: Record<string, string> = {
  vma: "#FF5A33", vitesse_critique: "#F5A623", one_rm: "#FFC933",
  temps_distance: "#66F03C", pma: "#33B5FF", ftp: "#33B5FF", puissance: "#33B5FF", fc_max: "#FFC933",
  fc_repos: "#9194A0", custom: "#F060C0",
};

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
  C: Record<string, string>;
}

// ── Mini graphique ──────────────────────────────────────────────────────────

function MiniPerfChart({ data, color, activeRef }: { data: { date: string; value: number }[]; color: string; activeRef?: number }) {
  if (data.length < 2) return null;
  const chartData = data.map(d => ({ label: d.date.slice(5), value: d.value }));
  return (
    <div style={{ height: 80, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#555866" }} axisLine={false} tickLine={false} />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{ background: "#27221D", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, fontSize: 11 }}
            labelStyle={{ color: "#9194A0" }}
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

export default function PerformanceProfile({ athleteId, viewOnly, isCoach, C }: Props) {
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
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Performances sportives</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>VMA, 1RM, VC, temps… avec historique</div>
        </div>
        {!viewOnly && (
          <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
            style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            + Ajouter
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
      ) : isError ? (
        <div style={{ background: C.s1, borderRadius: 6, padding: "24px 20px", border: "1px solid " + C.brd, textAlign: "center", fontSize: 13, color: C.tx3 }}>
          Performances non chargées — vérifie ta connexion
        </div>
      ) : Object.keys(grouped).length === 0 && records.length === 0 ? (
        <div style={{ background: C.s1, borderRadius: 6, padding: "24px 20px", border: "1px solid " + C.brd, textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 700, color: C.tx3 }}>Performances</div>
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucune performance enregistrée</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>Ajoute une première mesure pour commencer le suivi</div>
        </div>
      ) : (
        Object.entries(grouped).map(([metricName, entries]) => {
          const activeRef = entries.find(e => e.is_active_reference);
          const latest = entries[0];
          const metricType = typeOf(metricName, latest.metric_type);
          const color = METRIC_COLORS[metricType?.id ?? latest.metric_type] || C.ac;
          const isExpanded = expandedMetric === metricName;
          const chartData = [...entries].reverse().map(e => ({ date: e.date, value: e.value }));

          return (
            <div key={metricName} style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, marginBottom: 10, overflow: "hidden" }}>
              {/* Carte résumé */}
              <div
                onClick={() => setExpandedMetric(isExpanded ? null : metricName)}
                style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 6, background: color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {metricType?.emoji || "---"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{metricType?.metric ? metricType.label : metricName}</div>
                    {activeRef && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: C.g + "20", color: C.g }}>REF ACTIVE</span>
                    )}
                    {latest.coach_validated === false && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#FF5A3320", color: "#FF5A33" }}>REJETÉ</span>
                    )}
                    {latest.coach_validated === null && !activeRef && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: C.o + "20", color: C.o }}>EN ATTENTE</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>{entries.length} mesure{entries.length > 1 ? "s" : ""} · dernière : {latest.date}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: "-1px" }}>{latest.value}</div>
                  <div style={{ fontSize: 10, color: C.tx3 }}>{latest.unit}</div>
                </div>
                <span style={{ fontSize: 16, color: C.tx3, marginLeft: 4 }}>{isExpanded ? "∧" : "∨"}</span>
              </div>

              {/* Détail expandé */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid " + C.brd, padding: "14px 16px", background: C.bg }}>
                  {/* Graphique */}
                  {chartData.length >= 2 && (
                    <MiniPerfChart data={chartData} color={color} activeRef={activeRef?.value} />
                  )}

                  {/* Liste des entrées */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Historique</div>
                    {entries.map(entry => (
                      <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + C.brd }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: entry.is_active_reference ? color : C.tx }}>{entry.value} {entry.unit}</span>
                            {entry.is_active_reference && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: C.g + "20", color: C.g, fontWeight: 700 }}>REF</span>}
                          </div>
                          <div style={{ fontSize: 10, color: C.tx3 }}>{entry.date}{entry.notes ? " · " + entry.notes : ""}</div>
                        </div>
                        {!viewOnly && <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {!entry.is_active_reference && (
                            <button
                              onClick={() => handleSetActiveRef(entry.id, entry.metric_name)}
                              disabled={settingRef === entry.id}
                              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + color + "50", background: color + "12", color, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              {settingRef === entry.id ? "…" : "Réf. active"}
                            </button>
                          )}
                          <button onClick={() => setConfirmDelete(entry.id)}
                            style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(239,75,75,0.1)", color: "#FF5A33", fontSize: 12, cursor: "pointer" }}>×</button>
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
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, marginBottom: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Records (1RM)</div>
          {records.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid " + C.brd }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{r.exercise_ref}</div>
                <div style={{ fontSize: 10, color: C.tx3 }}>
                  {r.date}{r.source_reps && r.source_reps > 1 && r.source_kg ? ` · ${r.source_kg} kg × ${r.source_reps}` : ""}{r.source === "computed" ? " · séance" : ""}
                </div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: METRIC_COLORS.one_rm }}>{r.kg} kg</span>
              {!viewOnly && r.source === "manual" && (
                <button onClick={() => deleteRecord.mutate({ id: r.id, athleteId })} aria-label="Supprimer ce record"
                  style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(239,75,75,0.1)", color: "#FF5A33", fontSize: 12, cursor: "pointer" }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal ajout */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setShowForm(false)}>
          <div style={{ width: "100%", maxWidth: 600, background: C.s1, borderRadius: "6px 6px 0 0", padding: "20px 20px 40px", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>Ajouter une performance</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Type */}
              <div>
                <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Type de performance</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {METRIC_TYPES.map(m => (
                    <button key={m.id} onClick={() => handleMetricTypeChange(m.id)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, border: "1px solid " + (form.metric_type === m.id ? (METRIC_COLORS[m.id] || C.ac) : C.brdL), background: form.metric_type === m.id ? (METRIC_COLORS[m.id] || C.ac) + "20" : "transparent", color: form.metric_type === m.id ? (METRIC_COLORS[m.id] || C.ac) : C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      <span>{m.emoji}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nom */}
              <div>
                <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  {form.metric_type === "one_rm" ? "Exercice *" : "Nom de la métrique *"}
                </div>
                {formType?.metric ? (
                  <div style={{ padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx3, fontSize: 13 }}>
                    {formType.label}
                  </div>
                ) : (
                  <input value={form.metric_name} onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))}
                    placeholder={isOneRm ? "Ex: Développé couché" : "Ex: 5 km"}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                )}
              </div>

              {/* Valeur + Unité */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{isOneRm ? "Charge *" : "Valeur *"}</div>
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="Ex: 18.5"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Unité</div>
                  {METRIC_TYPES.find(m => m.id === form.metric_type)?.units.length === 1 ? (
                    <div style={{ padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx3, fontSize: 13 }}>
                      {form.unit}
                    </div>
                  ) : (
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                      {METRIC_TYPES.find(m => m.id === form.metric_type)?.units.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  )}
                  {form.unit === "custom" && (
                    <input value={form.custom_unit} onChange={e => setForm(f => ({ ...f, custom_unit: e.target.value }))} placeholder="Unité"
                      style={{ marginTop: 6, width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  )}
                </div>
              </div>

              {isOneRm && (
                <div>
                  <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Répétitions à cette charge</div>
                  <input type="number" min={1} max={30} value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  {oneRmPreview != null && (
                    <div style={{ fontSize: 11, color: C.tx3, marginTop: 6 }}>1RM estimé : <strong style={{ color: METRIC_COLORS.one_rm }}>{oneRmPreview} kg</strong></div>
                  )}
                </div>
              )}

              {/* Date */}
              <div>
                <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Date</div>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Notes (optionnel)</div>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Conditions, contexte…"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button onClick={handleSubmit} disabled={!canSubmit || addMeasurement.isPending || addRecord.isPending}
                style={{ flex: 2, padding: "12px 0", borderRadius: 4, border: "none", background: canSubmit ? C.ac : C.s2, color: canSubmit ? "#fff" : C.tx3, fontSize: 13, fontWeight: 700, cursor: canSubmit ? "pointer" : "default", fontFamily: "inherit" }}>
                {addMeasurement.isPending || addRecord.isPending ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setConfirmDelete(null)}>
          <div style={{ background: C.s1, borderRadius: 6, padding: 24, maxWidth: 300, width: "100%", border: "1px solid " + C.brd }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Supprimer cette mesure ?</div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              <button onClick={() => handleDelete(confirmDelete!)} style={{ flex: 1, padding: "11px 0", borderRadius: 4, border: "none", background: "#FF5A33", color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
