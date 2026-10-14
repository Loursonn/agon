/**
 * PRLogsSection — Gestion des records personnels 1RM.
 *
 * Deux sources :
 *   ⚡ computed  — Epley (kg × (1 + reps/30)) calculé auto en fin de séance
 *   ✏️  manual   — saisie manuelle coach/athlète
 *
 * UI :
 *   • Barre de recherche par référence
 *   • Cartes compactes groupées par groupe musculaire (2 colonnes)
 *   • Lier un exercice inline avec recherche par frappe
 *   • Section "Exercices non liés" compacte
 */
import { useState, useMemo } from "react";
import {
  Plus, X, ChevronDown, ChevronRight, Trophy, Search,
  Link, Zap, Pencil, RefreshCw,
} from "lucide-react";
import { C } from "@/lib/theme";
import {
  usePRsByRef,
  useAddPRLog,
  useDeletePRLog,
  epley1RM,
  type PRLog,
} from "@/features/shared/hooks/usePRLogs";
import { effectiveRmRef } from "@/features/shared/hooks/useAutoComputePRs";
import { useSyncHistoricalPRs } from "@/features/shared/hooks/useSyncHistoricalPRs";
import type { Exercise } from "@/features/shared/types/athlete";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: C.s2,
  border: `1px solid ${C.brd}`,
  borderRadius: 7,
  color: C.tx,
  fontSize: 13,
  padding: "7px 10px",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  ...extra,
});

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source, reps, kg }: { source: PRLog["source"]; reps?: number; kg?: number }) {
  if (source === "computed") {
    return (
      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${C.ac}20`, color: C.ac, display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        <Zap size={8} />
        {reps && kg ? `${kg}kg×${reps}` : "auto"}
      </span>
    );
  }
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${C.tx3}15`, color: C.tx3, display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <Pencil size={8} />
      manuel
    </span>
  );
}

// ─── Manual add form ──────────────────────────────────────────────────────────

interface AddPRFormProps {
  athleteId: string;
  existingRefs: string[];
  defaultRef?: string;
  onDone: () => void;
}

function AddPRForm({ athleteId, existingRefs, defaultRef, onDone }: AddPRFormProps) {
  const [ref, setRef]     = useState(defaultRef ?? "");
  const [mode, setMode]   = useState<"direct" | "epley">("direct");
  const [kg, setKg]       = useState("");
  const [reps, setReps]   = useState("");
  const [date, setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [showSugg, setShowSugg] = useState(false);

  const addPR = useAddPRLog();
  const filtered = existingRefs.filter(r => r.toLowerCase().includes(ref.toLowerCase()) && r !== ref);
  const epleyKg = mode === "epley" && kg && reps ? epley1RM(parseFloat(kg), parseInt(reps)) : null;

  function handleSubmit() {
    const finalKg = mode === "direct" ? parseFloat(kg) : (epleyKg ?? 0);
    if (!ref.trim() || !finalKg || !date) return;
    addPR.mutate({
      athleteId,
      exercise_ref: ref.trim(),
      kg: finalKg,
      date,
      notes: notes.trim() || undefined,
      source: "manual",
      ...(mode === "epley" && kg && reps ? { source_kg: parseFloat(kg), source_reps: parseInt(reps) } : {}),
    }, { onSuccess: onDone });
  }

  const canSubmit = !!ref.trim() && (mode === "direct" ? !!kg : !!epleyKg) && !!date;

  return (
    <div style={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Nouveau record
        </div>
        <div style={{ display: "flex", background: C.s1, borderRadius: 6, padding: 2, gap: 2 }}>
          {(["direct", "epley"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "3px 9px", borderRadius: 5, border: "none", fontFamily: "inherit",
              background: mode === m ? C.ac : "transparent",
              color: mode === m ? "#fff" : C.tx3,
              fontSize: 10, fontWeight: mode === m ? 700 : 400, cursor: "pointer",
            }}>
              {m === "direct" ? "1RM direct" : "Via reps (Epley)"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <input
          value={ref}
          onChange={e => { setRef(e.target.value); setShowSugg(true); }}
          onFocus={() => setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder="Référence exercice (ex: Développé couché)"
          style={inp()}
          disabled={!!defaultRef}
        />
        {showSugg && filtered.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: C.bg, border: `1px solid ${C.brd}`, borderRadius: 7, marginTop: 2,
          }}>
            {filtered.map(r => (
              <button key={r} onMouseDown={() => { setRef(r); setShowSugg(false); }} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", border: "none", background: "transparent",
                color: C.tx, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "direct" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={kg} onChange={e => setKg(e.target.value)} placeholder="1RM (kg)" style={inp({ flex: "1" })} step="0.5" min="0" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp({ flex: "1" })} />
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input type="number" value={kg} onChange={e => setKg(e.target.value)} placeholder="Charge (kg)" style={inp({ flex: "1" })} step="0.5" min="0" />
            <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Reps" style={inp({ flex: "1" })} min="1" max="30" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp({ flex: "1" })} />
          </div>
          {epleyKg !== null && (
            <div style={{ padding: "6px 10px", borderRadius: 6, background: `${C.g}15`, border: `1px solid ${C.g}30`, fontSize: 12 }}>
              1RM Epley estimé : <strong style={{ color: C.g }}>{epleyKg} kg</strong>
            </div>
          )}
        </div>
      )}

      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)" style={inp()} />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onDone} style={{
          flex: 1, padding: "8px 0", borderRadius: 7,
          border: `1px solid ${C.brdL}`, background: "transparent",
          color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Annuler</button>
        <button onClick={handleSubmit} disabled={!canSubmit || addPR.isPending} style={{
          flex: 2, padding: "8px 0", borderRadius: 7, border: "none",
          background: canSubmit ? C.ac : C.s2,
          color: canSubmit ? "#fff" : C.tx3,
          fontSize: 12, fontWeight: 700, cursor: canSubmit ? "pointer" : "default", fontFamily: "inherit",
        }}>
          {addPR.isPending ? "…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// ─── Compact PR card (one ref) ────────────────────────────────────────────────

interface PRCardProps {
  exerciseRef: string;
  prs: PRLog[];
  athleteId: string;
  linkedExercises: Exercise[];
  allExercises: Exercise[];
  onLinkExercise: (ex: Exercise, ref: string) => void;
  onUnlinkExercise: (ex: Exercise) => void;
  onAddPR: () => void;
}

function PRCard({
  exerciseRef, prs, athleteId,
  linkedExercises, allExercises, onLinkExercise, onUnlinkExercise, onAddPR,
}: PRCardProps) {
  const [open, setOpen]           = useState(false);
  const [showLink, setShowLink]   = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const deletePR                  = useDeletePRLog();

  const best = prs.reduce((m, p) => p.kg > m.kg ? p : m, prs[0]);

  // Exercises that can be linked to this ref (all except those already using this ref)
  const linkable = useMemo(() =>
    allExercises.filter(e => effectiveRmRef(e) !== exerciseRef),
    [allExercises, exerciseRef]
  );
  const filteredLink = useMemo(() =>
    linkSearch.trim()
      ? linkable.filter(e => e.name.toLowerCase().includes(linkSearch.toLowerCase()))
      : linkable,
    [linkable, linkSearch]
  );

  return (
    <div style={{ overflow: "hidden" }}>
      {/* Header — always visible */}
      <button onClick={() => setOpen(p => !p)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 6,
        padding: "9px 10px", border: "none", background: "transparent",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      }}>
        <Trophy size={11} color={C.g} style={{ flexShrink: 0 }} />
        <div style={{
          flex: 1, fontSize: 12, fontWeight: 700, color: C.tx,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {exerciseRef}
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.g, flexShrink: 0 }}>{best.kg}</span>
        <span style={{ fontSize: 9, color: C.tx3, flexShrink: 0, marginRight: 2 }}>kg</span>
        {open ? <ChevronDown size={11} color={C.tx3} style={{ flexShrink: 0 }} /> : <ChevronRight size={11} color={C.tx3} style={{ flexShrink: 0 }} />}
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ borderTop: `1px solid ${C.brd}`, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, background: C.s2 }}>
          {/* PR history */}
          {prs.map(pr => (
            <div key={pr.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {pr.id === best.id ? <Trophy size={9} color={C.g} style={{ flexShrink: 0 }} /> : <div style={{ width: 9, flexShrink: 0 }} />}
              <span style={{ fontSize: 11, fontWeight: 700, color: C.tx, flex: 1 }}>{pr.kg} kg</span>
              <SourceBadge source={pr.source} reps={pr.source_reps} kg={pr.source_kg} />
              <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>{formatDate(pr.date)}</span>
              <button onClick={() => deletePR.mutate({ id: pr.id, athleteId })} style={{
                width: 18, height: 18, borderRadius: 4, border: "none",
                background: "transparent", color: C.tx3, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <X size={9} />
              </button>
            </div>
          ))}

          {/* Linked exercise chips */}
          {linkedExercises.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
              {linkedExercises.map(e => (
                <div key={e.id} style={{
                  display: "flex", alignItems: "center", gap: 2,
                  padding: "2px 6px", borderRadius: 4,
                  background: `${C.coach}15`, border: `1px solid ${C.coach}25`,
                }}>
                  <span style={{ fontSize: 9, color: C.coach, fontWeight: 600 }}>{e.name}</span>
                  <button onClick={() => onUnlinkExercise(e)} style={{
                    border: "none", background: "transparent", color: C.tx3,
                    cursor: "pointer", padding: 0, display: "flex", alignItems: "center",
                  }}>
                    <X size={7} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 5 }}>
            <button
              onClick={() => { setShowLink(p => !p); setLinkSearch(""); }}
              style={{
                padding: "3px 8px", borderRadius: 5,
                border: `1px dashed ${C.brdL}`, background: showLink ? `${C.ac}12` : "transparent",
                color: showLink ? C.ac : C.tx3, fontSize: 10, cursor: "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <Link size={8} /> Lier
            </button>
            <button onClick={onAddPR} style={{
              padding: "3px 8px", borderRadius: 5,
              border: `1px dashed ${C.brdL}`, background: "transparent",
              color: C.tx3, fontSize: 10, cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3,
            }}>
              <Plus size={8} /> PR
            </button>
          </div>

          {/* Inline link picker with search */}
          {showLink && (
            <div style={{ background: C.bg, border: `1px solid ${C.brd}`, borderRadius: 7, overflow: "hidden" }}>
              <div style={{ position: "relative", padding: 5, borderBottom: `1px solid ${C.brd}` }}>
                <Search size={10} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.tx3 }} />
                <input
                  autoFocus
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Rechercher un exercice…"
                  style={inp({ fontSize: 11, padding: "5px 8px 5px 26px" })}
                />
              </div>
              <div style={{ maxHeight: 130, overflowY: "auto" }}>
                {filteredLink.length === 0 ? (
                  <div style={{ padding: "8px 10px", fontSize: 11, color: C.tx3 }}>Aucun exercice trouvé</div>
                ) : (
                  filteredLink.map(e => (
                    <button
                      key={e.id}
                      onClick={() => { onLinkExercise(e, exerciseRef); setShowLink(false); }}
                      style={{
                        display: "flex", alignItems: "center", width: "100%", textAlign: "left",
                        padding: "6px 10px", border: "none", background: "transparent",
                        color: C.tx, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                        borderBottom: `1px solid ${C.brd}`, gap: 6,
                      }}
                    >
                      <span style={{ flex: 1 }}>{e.name}</span>
                      {e.rm_ref && (
                        <span style={{ fontSize: 9, color: C.tx3 }}>→ {e.rm_ref}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Link dialog (from "unlinked" section) ────────────────────────────────────

interface LinkDialogProps {
  exercise: Exercise;
  existingRefs: string[];
  allExercises: Exercise[];
  onConfirm: (ex: Exercise, ref: string) => void;
  onDismiss: (ex: Exercise) => void;
  onClose: () => void;
  /** When set, shows progress indicator and "Passer" instead of "Annuler" */
  bulk?: { current: number; total: number };
}

function LinkDialog({ exercise, existingRefs, allExercises, onConfirm, onDismiss, onClose, bulk }: LinkDialogProps) {
  const [ref, setRef] = useState(exercise.name);

  // All possible targets: existing PR refs + all exercise names
  const allOptions = useMemo(() => {
    const s = new Set([...existingRefs, ...allExercises.map(e => e.name)]);
    return [...s].sort();
  }, [existingRefs, allExercises]);

  const filtered = ref.trim()
    ? allOptions.filter(r => r !== ref && r.toLowerCase().includes(ref.toLowerCase()))
    : allOptions.filter(r => r !== ref);

  const alreadyLinked  = allExercises.filter(e => e.id !== exercise.id && e.rm_ref === ref);
  const defaultRef     = exercise.name;
  const isCustomRef    = ref !== defaultRef;
  const refExists      = existingRefs.includes(ref);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 201,
        transform: "translate(-50%, -50%)",
        background: C.bg, borderRadius: 6, width: "min(92vw, 420px)", border: `1px solid ${C.brdL}`,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.tx }}>Lier à une référence RM</div>
          {bulk && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ac, background: `${C.ac}15`, padding: "2px 8px", borderRadius: 6 }}>
              {bulk.current} / {bulk.total}
            </div>
          )}
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.tx3, cursor: "pointer", padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Exercise label */}
          <div style={{
            padding: "8px 12px", borderRadius: 4,
            background: `${C.coach}12`, border: `1px solid ${C.coach}25`,
            fontSize: 13, fontWeight: 700, color: C.coach,
          }}>
            {exercise.name}
          </div>

          {/* Search input */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
              Référence RM cible
            </div>
            <div style={{ position: "relative" }}>
              <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.tx3 }} />
              <input
                autoFocus
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder="Tapez pour rechercher…"
                style={inp({ paddingLeft: 26 })}
              />
            </div>
            {/* Always-visible filtered list */}
            {filtered.length > 0 && (
              <div style={{
                marginTop: 4, background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4,
                maxHeight: 160, overflowY: "auto",
              }}>
                {filtered.map(r => (
                  <button key={r} onMouseDown={() => setRef(r)} style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 12px", border: "none", background: "transparent",
                    color: C.tx, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    borderBottom: `1px solid ${C.brd}`,
                  }}>
                    {r}
                    {existingRefs.includes(r) && (
                      <span style={{ fontSize: 9, color: C.g, marginLeft: 6 }}>✓ PR existant</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div style={{
            background: C.s2, borderRadius: 4, padding: "10px 14px",
            border: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Aperçu
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ color: C.tx2 }}>{exercise.name}</span>
              <span style={{ color: C.tx3, fontSize: 10 }}>→</span>
              <span style={{ fontWeight: 700, color: refExists ? C.g : C.ac }}>
                {ref || "—"}
              </span>
              {refExists
                ? <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: `${C.g}20`, color: C.g }}>ref existante</span>
                : ref && ref !== defaultRef
                  ? <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: `${C.ac}20`, color: C.ac }}>nouvelle ref</span>
                  : <span style={{ fontSize: 10, color: C.tx3 }}>(nom par défaut)</span>
              }
            </div>
            {alreadyLinked.length > 0 && (
              <div style={{ fontSize: 11, color: C.tx3 }}>
                Regroupé avec : {alreadyLinked.map(e => e.name).join(", ")}
              </div>
            )}
            {isCustomRef && (
              <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>
                Les PRs de "{exercise.name}" contribueront au pool "{ref}".
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 18px 14px", display: "flex", gap: 8 }}>
          <button onClick={() => onDismiss(exercise)} style={{
            padding: "8px 14px", borderRadius: 4,
            border: `1px solid ${C.r}40`, background: C.rS,
            color: C.r, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Pas de RM
          </button>
          <button onClick={onClose} style={{
            flex: 1, padding: "8px 0", borderRadius: 4,
            border: `1px solid ${C.brdL}`, background: "transparent",
            color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            {bulk ? "Passer" : "Annuler"}
          </button>
          <button
            onClick={() => { if (ref.trim()) { onConfirm(exercise, ref.trim()); } }}
            disabled={!ref.trim()}
            style={{
              flex: 2, padding: "8px 0", borderRadius: 4, border: "none",
              background: ref.trim() ? C.g : C.s2,
              color: ref.trim() ? "#fff" : C.tx3,
              fontSize: 12, fontWeight: 700, cursor: ref.trim() ? "pointer" : "default", fontFamily: "inherit",
            }}
          >
            {bulk ? "Confirmer →" : "Confirmer"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PRLogsSectionProps {
  athleteId: string;
  exercises?: Exercise[];
  onUpdateExerciseRef?: (exerciseId: string, rm_ref: string | undefined) => void;
}

export function PRLogsSection({ athleteId, exercises = [], onUpdateExerciseRef }: PRLogsSectionProps) {
  const [search, setSearch]       = useState("");
  const [adding, setAdding]       = useState<string | null>(null);
  const [linkingEx, setLinkingEx] = useState<Exercise | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [bulkQueue, setBulkQueue] = useState<Exercise[]>([]);
  const [bulkIndex, setBulkIndex] = useState(0);
  const { byRef, isLoading }      = usePRsByRef(athleteId);
  const { sync, syncing }         = useSyncHistoricalPRs();

  function startBulk() {
    if (!unlinkedExercises.length) return;
    setBulkQueue(unlinkedExercises);
    setBulkIndex(0);
    setLinkingEx(unlinkedExercises[0]);
  }

  function advanceBulk() {
    const next = bulkIndex + 1;
    if (next >= bulkQueue.length) {
      setBulkQueue([]);
      setBulkIndex(0);
      setLinkingEx(null);
    } else {
      setBulkIndex(next);
      setLinkingEx(bulkQueue[next]);
    }
  }

  const isBulk = bulkQueue.length > 0;

  const refs = useMemo(() =>
    Object.keys(byRef).sort().filter(r => !search.trim() || r.toLowerCase().includes(search.toLowerCase())),
    [byRef, search]
  );

  // Map ref → muscle group (via exercises that use this ref)
  const refsByMuscle = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const ref of refs) {
      const linked = exercises.filter(e => effectiveRmRef(e) === ref);
      const muscle = linked[0]?.target || "Autres";
      if (!groups[muscle]) groups[muscle] = [];
      groups[muscle].push(ref);
    }
    // Refs with no matching exercise at all
    for (const ref of refs) {
      const found = Object.values(groups).some(arr => arr.includes(ref));
      if (!found) {
        if (!groups["Autres"]) groups["Autres"] = [];
        groups["Autres"].push(ref);
      }
    }
    return groups;
  }, [refs, exercises]);

  const muscleOrder = useMemo(() => {
    const keys = Object.keys(refsByMuscle).sort();
    const idx = keys.indexOf("Autres");
    if (idx > -1) { keys.splice(idx, 1); keys.push("Autres"); }
    return keys;
  }, [refsByMuscle]);

  // Explicit rm_ref links for display inside cards
  const linkedByRef = useMemo(() => {
    const map: Record<string, Exercise[]> = {};
    for (const ex of exercises) {
      if (ex.rm_ref) {
        if (!map[ex.rm_ref]) map[ex.rm_ref] = [];
        map[ex.rm_ref].push(ex);
      }
    }
    return map;
  }, [exercises]);

  // Unlinked strength exercises (no explicit rm_ref, not dismissed)
  const unlinkedExercises = useMemo(() =>
    exercises.filter(e =>
      !e.rm_ref &&
      !e.isFlexibility &&
      !dismissed.has(e.id) &&
      (e.exType === "muscu" || e.exType === "halterophilie" || !e.exType)
    ),
    [exercises, dismissed]
  );

  function handleLink(ex: Exercise, ref: string) { onUpdateExerciseRef?.(ex.id, ref); }
  function handleUnlink(ex: Exercise) { onUpdateExerciseRef?.(ex.id, undefined); }
  function handleDismiss(ex: Exercise) { setDismissed(prev => new Set([...prev, ex.id])); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.tx }}>Records personnels (1RM)</div>
        <button
          onClick={() => sync({ athleteId, exercises })}
          disabled={syncing}
          title="Recalcule les PRs depuis tout l'historique de séances"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 12px", borderRadius: 7,
            border: `1px solid ${C.brdL}`, background: "transparent",
            color: C.tx3, fontSize: 12, fontWeight: 600,
            cursor: syncing ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Calcul…" : "Sync"}
        </button>
        <button onClick={() => setAdding("")} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 12px", borderRadius: 7,
          border: `1px solid ${C.brdL}`, background: "transparent",
          color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          <Plus size={13} /> Ajouter
        </button>
      </div>

      {/* Search */}
      {Object.keys(byRef).length > 3 && (
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.tx3 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={inp({ paddingLeft: 28, fontSize: 12 })}
          />
        </div>
      )}

      {/* Add form */}
      {adding !== null && (
        <AddPRForm
          athleteId={athleteId}
          existingRefs={Object.keys(byRef)}
          defaultRef={adding || undefined}
          onDone={() => setAdding(null)}
        />
      )}

      {/* Loading */}
      {isLoading ? (
        <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
      ) : refs.length === 0 && unlinkedExercises.length === 0 && adding === null ? (
        <div style={{
          textAlign: "center", padding: "24px 16px",
          border: `1px dashed ${C.brd}`, borderRadius: 4, color: C.tx3, fontSize: 13,
        }}>
          Aucun record enregistré.<br />
          <span style={{ fontSize: 11 }}>Les PRs sont calculés automatiquement depuis les séances, ou tu peux en ajouter manuellement.</span>
        </div>
      ) : (
        <>
          {/* PR cards — 3-column muscle group boxes */}
          {muscleOrder.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "start" }}>
              {muscleOrder.map(muscle => (
                <div key={muscle} style={{
                  border: `1px solid ${C.brd}`,
                  borderRadius: 4,
                  overflow: "hidden",
                  background: C.s1,
                }}>
                  {/* Muscle group header */}
                  <div style={{
                    padding: "7px 10px",
                    borderBottom: `1px solid ${C.brd}`,
                    background: C.s2,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: C.tx2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {muscle}
                    </span>
                    <span style={{ fontSize: 9, color: C.tx3 }}>
                      {refsByMuscle[muscle].length}
                    </span>
                  </div>
                  {/* PR cards stacked */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {refsByMuscle[muscle].map((ref, i) => (
                      <div key={ref} style={{ borderTop: i > 0 ? `1px solid ${C.brd}` : undefined }}>
                        <PRCard
                          exerciseRef={ref}
                          prs={byRef[ref]}
                          athleteId={athleteId}
                          linkedExercises={linkedByRef[ref] ?? []}
                          allExercises={exercises}
                          onLinkExercise={handleLink}
                          onUnlinkExercise={handleUnlink}
                          onAddPR={() => setAdding(ref)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unlinked exercises */}
          {unlinkedExercises.length > 0 && onUpdateExerciseRef && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase",
                letterSpacing: "0.4px", marginBottom: 5,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <Link size={9} color={C.tx3} />
                <span style={{ flex: 1 }}>Sans ref explicite ({unlinkedExercises.length})</span>
                <button onClick={startBulk} style={{
                  padding: "2px 10px", borderRadius: 5,
                  border: `1px solid ${C.ac}50`, background: `${C.ac}12`,
                  color: C.ac, fontSize: 10, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 3,
                  textTransform: "none", letterSpacing: 0,
                }}>
                  <Link size={8} /> Assigner tous
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {unlinkedExercises.map(ex => (
                  <div key={ex.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 7,
                    background: C.s2, border: `1px solid ${C.brd}`,
                  }}>
                    <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ex.name}
                    </div>
                    <button onClick={() => setLinkingEx(ex)} style={{
                      padding: "2px 8px", borderRadius: 4,
                      border: `1px solid ${C.g}50`, background: `${C.g}10`,
                      color: C.g, fontSize: 10, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 3,
                    }}>
                      <Link size={8} /> Regrouper
                    </button>
                    <button onClick={() => handleDismiss(ex)} title="Pas de RM" style={{
                      width: 20, height: 20, borderRadius: 4,
                      border: `1px solid ${C.brdL}`, background: "transparent",
                      color: C.tx3, fontSize: 10, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "inherit", flexShrink: 0,
                    }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Link dialog */}
      {linkingEx && (
        <LinkDialog
          key={linkingEx.id}
          exercise={linkingEx}
          existingRefs={Object.keys(byRef)}
          allExercises={exercises}
          bulk={isBulk ? { current: bulkIndex + 1, total: bulkQueue.length } : undefined}
          onConfirm={(ex, ref) => {
            handleLink(ex, ref);
            if (isBulk) advanceBulk(); else setLinkingEx(null);
          }}
          onDismiss={(ex) => {
            handleDismiss(ex);
            if (isBulk) advanceBulk(); else setLinkingEx(null);
          }}
          onClose={() => {
            setBulkQueue([]);
            setBulkIndex(0);
            setLinkingEx(null);
          }}
        />
      )}
    </div>
  );
}
