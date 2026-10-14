import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PerformanceLog {
  id: string;
  athlete_id: string;
  metric_type: string;
  metric_name: string;
  value: number;
  unit: string;
  custom_unit?: string;
  date: string;
  test_session_id?: string;
  is_active_reference: boolean;
  coach_validated?: boolean;
  notes?: string;
  created_at: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const METRIC_TYPES = [
  { id: "vma", label: "VMA", units: ["km/h"], emoji: "VMA", description: "Vitesse Maximale Aérobie" },
  { id: "vitesse_critique", label: "Vitesse Critique", units: ["km/h", "min/km"], emoji: "VC", description: "Vitesse Critique" },
  { id: "one_rm", label: "1RM", units: ["kg"], emoji: "1RM", description: "Répétition maximale (préciser l'exercice)" },
  { id: "temps_distance", label: "Temps / Distance", units: ["s", "min:s"], emoji: "T/D", description: "Ex: 100m, 1000m, 5km…" },
  { id: "puissance", label: "Puissance", units: ["W", "W/kg"], emoji: "P", description: "Puissance maximale ou seuil" },
  { id: "fc_max", label: "FC Max", units: ["bpm"], emoji: "FC", description: "Fréquence cardiaque maximale" },
  { id: "fc_repos", label: "FC Repos", units: ["bpm"], emoji: "FCr", description: "Fréquence cardiaque de repos" },
  { id: "custom", label: "Autre", units: ["custom"], emoji: "---", description: "Métrique personnalisée" },
];

const METRIC_COLORS: Record<string, string> = {
  vma: "#FF5A33", vitesse_critique: "#F5A623", one_rm: "#FFC933",
  temps_distance: "#66F03C", puissance: "#33B5FF", fc_max: "#FFC933",
  fc_repos: "#9194A0", custom: "#F060C0",
};

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
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [settingRef, setSettingRef] = useState<string | null>(null);

  const [form, setForm] = useState({
    metric_type: "vma",
    metric_name: "VMA",
    value: "",
    unit: "km/h",
    custom_unit: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    loadLogs();
  }, [athleteId]);

  const loadLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("performance_logs")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false });
    // Un chargement en échec affichait "aucune donnée", indistinguable d'un
    // historique réellement vide.
    if (error) toast.error("Performances non chargées — vérifie ta connexion");
    else setLogs((data as PerformanceLog[]) || []);
    setLoading(false);
  };

  // Grouper par metric_name
  const grouped = logs.reduce<Record<string, PerformanceLog[]>>((acc, log) => {
    if (!acc[log.metric_name]) acc[log.metric_name] = [];
    acc[log.metric_name].push(log);
    return acc;
  }, {});

  const handleMetricTypeChange = (type: string) => {
    const mt = METRIC_TYPES.find(m => m.id === type);
    const defaultUnit = mt?.units[0] || "custom";
    const defaultName = type === "one_rm" ? "" : mt?.label || "";
    setForm(f => ({ ...f, metric_type: type, metric_name: defaultName, unit: defaultUnit }));
  };

  const handleSubmit = async () => {
    const val = parseFloat(form.value);
    if (!form.metric_name.trim() || isNaN(val)) return;

    const payload = {
      athlete_id: athleteId,
      metric_type: form.metric_type,
      metric_name: form.metric_name.trim(),
      value: val,
      unit: form.unit === "custom" ? (form.custom_unit || "custom") : form.unit,
      custom_unit: form.unit === "custom" ? form.custom_unit : null,
      date: form.date,
      notes: form.notes || null,
      is_active_reference: false,
      created_by: athleteId,
    };

    const { data: inserted, error } = await supabase.from("performance_logs").insert(payload).select().single();
    // Sans ce garde, un insert refusé fermait quand même le formulaire : la
    // performance saisie disparaissait sans le moindre message.
    if (error || !inserted) {
      toast.error("Performance non enregistrée — vérifie ta connexion");
      return;
    }

    // Notifier le coach si athlète
    if (!isCoach) {
      const { data: profile } = await supabase.from("profiles").select("coach_id").eq("id", athleteId).single();
      if (profile?.coach_id) {
        // La notification est secondaire : son échec ne doit pas faire croire
        // que la performance n'a pas été enregistrée.
        await supabase.from("performance_notifications").insert({
          coach_id: profile.coach_id,
          athlete_id: athleteId,
          performance_log_id: inserted.id,
          status: "pending",
        });
      }
    }

    setShowForm(false);
    loadLogs();
  };

  const handleSetActiveRef = async (logId: string, metricName: string) => {
    setSettingRef(logId);
    try {
      const { error } = await supabase.rpc("set_active_performance_reference", {
        p_performance_log_id: logId,
        p_athlete_id: athleteId,
        p_metric_name: metricName,
      });
      if (error) {
        toast.error("Référence non mise à jour — vérifie ta connexion");
        return;
      }
      loadLogs();
    } finally {
      setSettingRef(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("performance_logs").delete().eq("id", id);
    if (error) {
      toast.error("Suppression échouée — vérifie ta connexion");
      return;
    }
    setConfirmDelete(null);
    loadLogs();
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Performances sportives</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>VMA, 1RM, VC, temps… avec historique</div>
        </div>
        <button onClick={() => { setForm({ metric_type: "vma", metric_name: "VMA", value: "", unit: "km/h", custom_unit: "", date: new Date().toISOString().slice(0, 10), notes: "" }); setShowForm(true); }}
          style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          + Ajouter
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ background: C.s1, borderRadius: 6, padding: "24px 20px", border: "1px solid " + C.brd, textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 700, color: C.tx3 }}>Performances</div>
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucune performance enregistrée</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>Ajoute une première mesure pour commencer le suivi</div>
        </div>
      ) : (
        Object.entries(grouped).map(([metricName, entries]) => {
          const activeRef = entries.find(e => e.is_active_reference);
          const latest = entries[0];
          const metricType = METRIC_TYPES.find(m => m.id === latest.metric_type);
          const color = METRIC_COLORS[latest.metric_type] || C.ac;
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{metricName}</div>
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
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {!entry.is_active_reference && (
                            <button
                              onClick={() => handleSetActiveRef(entry.id, metricName)}
                              disabled={settingRef === entry.id}
                              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + color + "50", background: color + "12", color, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              {settingRef === entry.id ? "…" : "Réf. active"}
                            </button>
                          )}
                          <button onClick={() => setConfirmDelete(entry.id)}
                            style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(239,75,75,0.1)", color: "#FF5A33", fontSize: 12, cursor: "pointer" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
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
                <input value={form.metric_name} onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))}
                  placeholder={form.metric_type === "one_rm" ? "Ex: 1RM Développé couché" : "Ex: VMA"}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Valeur + Unité */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 10, color: C.tx3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Valeur *</div>
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
              <button onClick={handleSubmit} disabled={!form.metric_name.trim() || !form.value}
                style={{ flex: 2, padding: "12px 0", borderRadius: 4, border: "none", background: (form.metric_name.trim() && form.value) ? C.ac : C.s2, color: (form.metric_name.trim() && form.value) ? "#fff" : C.tx3, fontSize: 13, fontWeight: 700, cursor: (form.metric_name.trim() && form.value) ? "pointer" : "default", fontFamily: "inherit" }}>
                Enregistrer
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
