/**
 * MethodPickerDialog — sélection et attachment d'une méthode sur un exercice.
 *
 * Affiche la liste des méthodes disponibles avec filtres rapides.
 * Pour scope='set'      : sélecteur de sets à affecter (checkboxes numérotées).
 * Pour scope='exercise' : message clair que le pattern standard est remplacé.
 *
 * Appelle onAttach(attachment) — le parent persiste l'attachment dans les exos.
 */
import { useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { C } from "@/lib/theme";
import { MethodPreview } from "./MethodPreview";
import { useTrainingMethods } from "@/features/shared/hooks/useTrainingMethods";
import type { TrainingMethod, MethodAttachment, MethodScope, ClassicMethodConfig, SetMethodConfig, FullWeekConfig, MethodConfig } from "@/types/trainingMethods";
import { methodConfigToText } from "./MethodPreview";

// ─── Extract reference from config ────────────────────────────────────────────

function extractReference(method: TrainingMethod): string | undefined {
  const cfg = method.config;
  if (cfg.scope === "classic") return (cfg as ClassicMethodConfig).load.reference || undefined;
  if (cfg.scope === "set")     return (cfg as SetMethodConfig).load.reference || undefined;
  return undefined;
}

// ─── Scope / category labels ──────────────────────────────────────────────────

const SCOPE_LABEL: Record<MethodScope, string> = { classic: "Classique", set: "Sous-série", exercise: "Exercice" };
const SCOPE_COLOR: Record<MethodScope, string> = { classic: C.g, set: C.ac, exercise: C.coach };

// ─── Component ───────────────────────────────────────────────────────────────

interface MethodPickerDialogProps {
  setsCount:  number;              // nombre de sets de l'exercice courant
  onAttach:   (attachment: MethodAttachment, method: TrainingMethod) => void;
  onClose:    () => void;
}

export function MethodPickerDialog({ setsCount, onAttach, onClose }: MethodPickerDialogProps) {
  const [scopeFilter, setScopeFilter] = useState<"all" | MethodScope>("all");
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState<TrainingMethod | null>(null);
  const [appliedSets, setAppliedSets] = useState<number[]>([]);

  const { data: methods = [], isLoading } = useTrainingMethods();

  const filtered = useMemo(() => {
    let list = methods;
    if (scopeFilter !== "all") list = list.filter((m) => m.scope === scopeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return list;
  }, [methods, scopeFilter, search]);

  function toggleSet(n: number) {
    setAppliedSets((prev) =>
      prev.includes(n) ? prev.filter((s) => s !== n) : [...prev, n]
    );
  }

  function handleApply() {
    if (!selected) return;
    const ref = extractReference(selected);
    const weeklyConfigs = (selected.config as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined;
    const prescription = weeklyConfigs?.length
      ? `Multi-semaines (${weeklyConfigs.length} sem.)`
      : methodConfigToText(selected.config);
    const attachment: MethodAttachment = {
      method_id:    selected.id,
      scope:        selected.scope,
      method_name:  selected.name,
      prescription,
      config:       selected.config,
      ...(selected.scope === "set" && appliedSets.length > 0 && { applied_to_sets: [...appliedSets].sort() }),
      ...(ref && { reference: ref }),
    };
    onAttach(attachment, selected);
    onClose();
  }

  const canApply = !!selected && (selected.scope !== "set" || appliedSets.length > 0);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.65)" }}
      />

      {/* Dialog */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 91,
        transform: "translate(-50%, -50%)",
        background: C.bg, borderRadius: 6,
        width: "min(94vw, 540px)", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        border: `1px solid ${C.brdL}`,
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.tx }}>
            Appliquer une méthode
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.brd}`, display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
            {(["all", "classic", "set", "exercise"] as const).map((v) => (
              <button key={v} onClick={() => setScopeFilter(v)} style={{
                padding: "4px 10px", borderRadius: 6, border: "none",
                background: scopeFilter === v ? C.ac : "transparent",
                color: scopeFilter === v ? "#fff" : C.tx3,
                fontSize: 11, fontWeight: scopeFilter === v ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {v === "all" ? "Tous" : SCOPE_LABEL[v as MethodScope]}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative" as const, minWidth: 140 }}>
            <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.tx3 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              style={{
                width: "100%", padding: "5px 10px 5px 26px",
                background: C.s2, border: `1px solid ${C.brd}`,
                borderRadius: 6, color: C.tx, fontSize: 12,
                fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const,
              }}
            />
          </div>
        </div>

        {/* Method list + detail */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* List */}
          <div style={{ width: 220, borderRight: `1px solid ${C.brd}`, overflowY: "auto", flexShrink: 0 }}>
            {isLoading ? (
              <div style={{ padding: 20, color: C.tx3, fontSize: 12 }}>Chargement…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 20, color: C.tx3, fontSize: 12, textAlign: "center" as const }}>Aucune méthode</div>
            ) : (
              filtered.map((m) => {
                const sc = SCOPE_COLOR[m.scope];
                const isSelected = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setSelected(m); setAppliedSets([]); }}
                    style={{
                      width: "100%", padding: "10px 14px", textAlign: "left" as const,
                      border: "none", borderBottom: `1px solid ${C.brd}`,
                      background: isSelected ? C.acS : "transparent",
                      cursor: "pointer", fontFamily: "inherit",
                      borderLeft: `3px solid ${isSelected ? C.ac : "transparent"}`,
                      transition: "all 120ms",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 4, lineHeight: 1.3 }}>
                      {m.name}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: `${sc}20`, color: sc }}>
                        {SCOPE_LABEL[m.scope]}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {!selected ? (
              <div style={{ textAlign: "center" as const, color: C.tx3, fontSize: 13, marginTop: 40 }}>
                Sélectionnez une méthode
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 4 }}>{selected.name}</div>
                  {selected.description && (
                    <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>{selected.description}</div>
                  )}
                </div>

                {/* Afficher base config seulement si pas de weekly_configs */}
                {!((selected.config as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined)?.length && (
                  <MethodPreview config={selected.config} />
                )}
                {/* Weekly protocol */}
                {((): FullWeekConfig[] | undefined => (selected.config as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined)()?.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
                      Progression semaine par semaine
                    </div>
                    {((selected.config as Record<string, unknown>)?.weekly_configs as FullWeekConfig[]).map((wc) => (
                      <div key={wc.week} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#FFC933", flexShrink: 0, minWidth: 24 }}>S{wc.week}</span>
                        <span style={{ fontSize: 11, color: C.tx2, fontFamily: "monospace" }}>
                          {wc.config ? methodConfigToText(wc.config as MethodConfig) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Set selector — scope='set' */}
                {selected.scope === "set" && setsCount > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
                      Appliquer sur le(s) set(s)
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Array.from({ length: setsCount }, (_, i) => i + 1).map((n) => {
                        const active = appliedSets.includes(n);
                        return (
                          <button
                            key={n}
                            onClick={() => toggleSet(n)}
                            style={{
                              width: 40, height: 40, borderRadius: 4,
                              border: `2px solid ${active ? C.ac : C.brdL}`,
                              background: active ? C.acS : "transparent",
                              color: active ? C.ac : C.tx3,
                              fontSize: 13, fontWeight: 700,
                              cursor: "pointer", fontFamily: "inherit",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    {appliedSets.length === 0 && (
                      <div style={{ fontSize: 11, color: C.o, marginTop: 8 }}>
                        Sélectionne au moins un set.
                      </div>
                    )}
                  </div>
                )}

                {/* Exercise scope warning */}
                {selected.scope === "exercise" && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 4,
                    background: C.oS, border: `1px solid ${C.o}40`,
                    fontSize: 12, color: C.o, lineHeight: 1.5,
                  }}>
                    Cette méthode remplacera le pattern de séries standard de l'exercice.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.brd}`, display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", borderRadius: 4,
            border: `1px solid ${C.brdL}`, background: "transparent",
            color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Annuler</button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 4, border: "none",
              background: canApply ? C.ac : C.s2,
              color: canApply ? "#fff" : C.tx3,
              fontSize: 13, fontWeight: 700,
              cursor: canApply ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </>
  );
}
