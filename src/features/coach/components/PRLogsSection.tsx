/**
 * PRLogsSection — Gestion des records personnels 1RM.
 *
 * Deux sources :
 *   ⚡ computed  — Epley (kg × (1 + reps/30), arrondi 0,5 kg) calculé à la validation de séance
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
import { cn } from "@/lib/utils";
import {
  usePRsByRef,
  useAddPRLog,
  useDeletePRLog,
  type PRLog,
} from "@/features/shared/hooks/usePRLogs";
import { estimateOneRm, recordRefOf as effectiveRmRef } from "@shared/domain/performance";
import { useSyncHistoricalPRs } from "@/features/shared/hooks/useSyncHistoricalPRs";
import type { Exercise } from "@/features/shared/types/athlete";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Champ de saisie (taille et marges ajustables par classes en plus). */
const INP = "w-full rounded-[7px] border border-agon-brd bg-agon-s2 px-2.5 py-[7px] text-[13px] text-agon-tx outline-none";
/** Icône de recherche posée dans un champ. */
const SEARCH_ICON = "absolute top-1/2 -translate-y-1/2 text-agon-tx3";
/** Petit bouton en pointillés (Lier, PR). */
const DASHED_BTN = "flex cursor-pointer items-center gap-[3px] rounded-[5px] border border-dashed border-agon-brd-l px-2 py-[3px] text-[10px]";
/** Bouton de l'en-tête (Sync, Ajouter). */
const HEAD_BTN = "flex items-center gap-[5px] rounded-[7px] border border-agon-brd-l bg-transparent px-3 py-1.5 text-[12px] font-semibold";
const KICKER = "text-[10px] uppercase tracking-[0.4px] text-agon-tx3";

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source, reps, kg }: { source: PRLog["source"]; reps?: number | null; kg?: number | null }) {
  if (source === "computed") {
    return (
      <span className="flex shrink-0 items-center gap-0.5 rounded px-[5px] py-px text-[9px] font-bold text-agon-accent bg-agon-accent/[0.125]">
        <Zap size={8} />
        {reps && kg ? `${kg}kg×${reps}` : "auto"}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5 rounded px-[5px] py-px text-[9px] font-bold text-agon-tx3 bg-agon-tx3/[0.082]">
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
  const epleyKg = mode === "epley" && kg && reps ? estimateOneRm(parseFloat(kg), parseInt(reps)) : null;

  function handleSubmit() {
    const lifted = parseFloat(kg);
    const nbReps = mode === "epley" ? parseInt(reps) : 1;
    if (!ref.trim() || !(lifted > 0) || !(nbReps > 0) || !date) return;
    addPR.mutate({
      athleteId,
      ref: ref.trim(),
      kg: lifted,
      reps: nbReps,
      date,
      notes: notes.trim() || undefined,
      source: "manual",
    }, { onSuccess: onDone });
  }

  const canSubmit = !!ref.trim() && (mode === "direct" ? !!kg : !!epleyKg) && !!date;


  return (
    <div className="flex flex-col gap-2.5 rounded border border-agon-brd bg-agon-s2 p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex-1 text-[12px] font-bold uppercase tracking-[0.4px] text-agon-tx3">
          Nouveau record
        </div>
        <div className="flex gap-0.5 rounded-[6px] bg-agon-s1 p-0.5">
          {(["direct", "epley"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={cn(
              "cursor-pointer rounded-[5px] border-none px-[9px] py-[3px] text-[10px]",
              mode === m ? "bg-agon-accent font-bold text-agon-tx" : "bg-transparent font-normal text-agon-tx3",
            )}>
              {m === "direct" ? "1RM direct" : "Via reps (Epley)"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <input
          value={ref}
          onChange={e => { setRef(e.target.value); setShowSugg(true); }}
          onFocus={() => setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder="Référence exercice (ex: Développé couché)"
          className={INP}
          disabled={!!defaultRef}
        />
        {showSugg && filtered.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-0.5 rounded-[7px] border border-agon-brd bg-agon-bg">
            {filtered.map(r => (
              <button key={r} onMouseDown={() => { setRef(r); setShowSugg(false); }} className="block w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-[13px] text-agon-tx">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "direct" ? (
        <div className="flex gap-2">
          <input type="number" value={kg} onChange={e => setKg(e.target.value)} placeholder="1RM (kg)" className={cn(INP, "flex-1")} step="0.5" min="0" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={cn(INP, "flex-1")} />
        </div>
      ) : (
        <div>
          <div className="mb-1.5 flex gap-2">
            <input type="number" value={kg} onChange={e => setKg(e.target.value)} placeholder="Charge (kg)" className={cn(INP, "flex-1")} step="0.5" min="0" />
            <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Reps" className={cn(INP, "flex-1")} min="1" max="30" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={cn(INP, "flex-1")} />
          </div>
          {epleyKg !== null && (
            <div className="rounded-[6px] border border-agon-succes/[0.188] bg-agon-succes/[0.082] px-2.5 py-1.5 text-[12px]">
              1RM Epley estimé : <strong className="text-agon-succes">{epleyKg} kg</strong>
            </div>
          )}
        </div>
      )}

      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)" className={INP} />

      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 cursor-pointer rounded-[7px] border border-agon-brd-l bg-transparent py-2 text-[12px] font-semibold text-agon-tx2">Annuler</button>
        <button onClick={handleSubmit} disabled={!canSubmit || addPR.isPending} className={cn(
          "flex-[2] rounded-[7px] border-none py-2 text-[12px] font-bold",
          canSubmit ? "cursor-pointer bg-agon-accent text-agon-tx" : "cursor-default bg-agon-s2 text-agon-tx3",
        )}>
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
    <div className="overflow-hidden">
      {/* Header — always visible */}
      <button onClick={() => setOpen(p => !p)} className="flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent px-2.5 py-[9px] text-left">
        <Trophy size={11} className="shrink-0 text-agon-succes" />
        <div className="flex-1 truncate text-[12px] font-bold text-agon-tx">
          {exerciseRef}
        </div>
        <span className="shrink-0 text-[14px] font-extrabold text-agon-succes">{best.kg}</span>
        <span className="mr-0.5 shrink-0 text-[9px] text-agon-tx3">kg</span>
        {open ? <ChevronDown size={11} className="shrink-0 text-agon-tx3" /> : <ChevronRight size={11} className="shrink-0 text-agon-tx3" />}
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="flex flex-col gap-1.5 border-t border-agon-brd bg-agon-s2 px-2.5 py-2">
          {/* PR history */}
          {prs.map(pr => (
            <div key={pr.id} className="flex items-center gap-[5px]">
              {pr.id === best.id ? <Trophy size={9} className="shrink-0 text-agon-succes" /> : <div className="w-[9px] shrink-0" />}
              <span className="flex-1 text-[11px] font-bold text-agon-tx">{pr.kg} kg</span>
              <SourceBadge source={pr.source} reps={pr.source_reps} kg={pr.source_kg} />
              <span className="shrink-0 text-[10px] text-agon-tx3">{formatDate(pr.date)}</span>
              <button onClick={() => deletePR.mutate({ id: pr.id, athleteId })} className="flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-agon-tx3">
                <X size={9} />
              </button>
            </div>
          ))}

          {/* Linked exercise chips */}
          {linkedExercises.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-[3px]">
              {linkedExercises.map(e => (
                <div key={e.id} className="flex items-center gap-0.5 rounded border border-agon-coach/[0.145] bg-agon-coach/[0.082] px-1.5 py-0.5">
                  <span className="text-[9px] font-semibold text-agon-coach">{e.name}</span>
                  <button onClick={() => onUnlinkExercise(e)} className="flex cursor-pointer items-center border-none bg-transparent p-0 text-agon-tx3">
                    <X size={7} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-[5px]">
            <button
              onClick={() => { setShowLink(p => !p); setLinkSearch(""); }}
              className={cn(DASHED_BTN, showLink ? "bg-agon-accent/[0.071] text-agon-accent" : "bg-transparent text-agon-tx3")}
            >
              <Link size={8} /> Lier
            </button>
            <button onClick={onAddPR} className={cn(DASHED_BTN, "bg-transparent text-agon-tx3")}>
              <Plus size={8} /> PR
            </button>
          </div>

          {/* Inline link picker with search */}
          {showLink && (
            <div className="overflow-hidden rounded-[7px] border border-agon-brd bg-agon-bg">
              <div className="relative border-b border-agon-brd p-[5px]">
                <Search size={10} className={cn(SEARCH_ICON, "left-[13px]")} />
                <input
                  autoFocus
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Rechercher un exercice…"
                  className={cn(INP, "py-[5px] pl-[26px] pr-2 text-[11px]")}
                />
              </div>
              <div className="max-h-[130px] overflow-y-auto">
                {filteredLink.length === 0 ? (
                  <div className="px-2.5 py-2 text-[11px] text-agon-tx3">Aucun exercice trouvé</div>
                ) : (
                  filteredLink.map(e => (
                    <button
                      key={e.id}
                      onClick={() => { onLinkExercise(e, exerciseRef); setShowLink(false); }}
                      className="flex w-full cursor-pointer items-center gap-1.5 border-0 border-b border-solid border-agon-brd bg-transparent px-2.5 py-1.5 text-left text-[11px] text-agon-tx"
                    >
                      <span className="flex-1">{e.name}</span>
                      {e.rm_ref && (
                        <span className="text-[9px] text-agon-tx3">→ {e.rm_ref}</span>
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
      <div onClick={onClose} className="fixed inset-0 z-[200] bg-black/[0.55]" />
      <div className="fixed left-1/2 top-1/2 z-[201] flex w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[6px] border border-agon-brd-l bg-agon-bg">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-agon-brd px-[18px] pb-2.5 pt-3.5">
          <div className="flex-1 text-[14px] font-extrabold text-agon-tx">Lier à une référence RM</div>
          {bulk && (
            <div className="rounded-[6px] bg-agon-accent/[0.082] px-2 py-0.5 text-[11px] font-bold text-agon-accent">
              {bulk.current} / {bulk.total}
            </div>
          )}
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent p-0.5 text-agon-tx3">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {/* Exercise label */}
          <div className="rounded border border-agon-coach/[0.145] bg-agon-coach/[0.071] px-3 py-2 text-[13px] font-bold text-agon-coach">
            {exercise.name}
          </div>

          {/* Search input */}
          <div>
            <div className={cn(KICKER, "mb-1.5 font-semibold")}>
              Référence RM cible
            </div>
            <div className="relative">
              <Search size={11} className={cn(SEARCH_ICON, "left-[9px]")} />
              <input
                autoFocus
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder="Tapez pour rechercher…"
                className={cn(INP, "pl-[26px]")}
              />
            </div>
            {/* Always-visible filtered list */}
            {filtered.length > 0 && (
              <div className="mt-1 max-h-[160px] overflow-y-auto rounded border border-agon-brd bg-agon-s2">
                {filtered.map(r => (
                  <button key={r} onMouseDown={() => setRef(r)} className="block w-full cursor-pointer border-0 border-b border-solid border-agon-brd bg-transparent px-3 py-2 text-left text-[12px] text-agon-tx">
                    {r}
                    {existingRefs.includes(r) && (
                      <span className="ml-1.5 text-[9px] text-agon-succes">✓ PR existant</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-1.5 rounded border border-agon-brd bg-agon-s2 px-3.5 py-2.5">
            <div className={cn(KICKER, "font-bold")}>
              Aperçu
            </div>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-agon-tx2">{exercise.name}</span>
              <span className="text-[10px] text-agon-tx3">→</span>
              <span className={cn("font-bold", refExists ? "text-agon-succes" : "text-agon-accent")}>
                {ref || "—"}
              </span>
              {refExists
                ? <span className="rounded bg-agon-succes/[0.125] px-[5px] py-px text-[10px] text-agon-succes">ref existante</span>
                : ref && ref !== defaultRef
                  ? <span className="rounded bg-agon-accent/[0.125] px-[5px] py-px text-[10px] text-agon-accent">nouvelle ref</span>
                  : <span className="text-[10px] text-agon-tx3">(nom par défaut)</span>
              }
            </div>
            {alreadyLinked.length > 0 && (
              <div className="text-[11px] text-agon-tx3">
                Regroupé avec : {alreadyLinked.map(e => e.name).join(", ")}
              </div>
            )}
            {isCustomRef && (
              <div className="text-[11px] italic text-agon-tx3">
                Les PRs de "{exercise.name}" contribueront au pool "{ref}".
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-[18px] pb-3.5 pt-2.5">
          <button onClick={() => onDismiss(exercise)} className="cursor-pointer rounded border border-agon-erreur/25 bg-agon-erreur-doux px-3.5 py-2 text-[12px] font-semibold text-agon-erreur">
            Pas de RM
          </button>
          <button onClick={onClose} className="flex-1 cursor-pointer rounded border border-agon-brd-l bg-transparent py-2 text-[12px] font-semibold text-agon-tx2">
            {bulk ? "Passer" : "Annuler"}
          </button>
          <button
            onClick={() => { if (ref.trim()) { onConfirm(exercise, ref.trim()); } }}
            disabled={!ref.trim()}
            className={cn(
              "flex-[2] rounded border-none py-2 text-[12px] font-bold",
              ref.trim() ? "cursor-pointer bg-agon-succes text-agon-tx" : "cursor-default bg-agon-s2 text-agon-tx3",
            )}
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
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 text-[14px] font-extrabold text-agon-tx">Records personnels (1RM)</div>
        <button
          onClick={() => sync({ athleteId, exercises })}
          disabled={syncing}
          title="Recalcule les PRs depuis tout l'historique de séances"
          className={cn(HEAD_BTN, "text-agon-tx3", syncing ? "cursor-wait" : "cursor-pointer")}
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Calcul…" : "Sync"}
        </button>
        <button onClick={() => setAdding("")} className={cn(HEAD_BTN, "cursor-pointer text-agon-tx2")}>
          <Plus size={13} /> Ajouter
        </button>
      </div>

      {/* Search */}
      {Object.keys(byRef).length > 3 && (
        <div className="relative">
          <Search size={12} className={cn(SEARCH_ICON, "left-2.5")} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className={cn(INP, "pl-7 text-[12px]")}
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
        <div className="text-[12px] text-agon-tx3">Chargement…</div>
      ) : refs.length === 0 && unlinkedExercises.length === 0 && adding === null ? (
        <div className="rounded border border-dashed border-agon-brd px-4 py-6 text-center text-[13px] text-agon-tx3">
          Aucun record enregistré.<br />
          <span className="text-[11px]">Les PRs sont calculés automatiquement depuis les séances, ou tu peux en ajouter manuellement.</span>
        </div>
      ) : (
        <>
          {/* PR cards — 3-column muscle group boxes */}
          {muscleOrder.length > 0 && (
            <div className="grid grid-cols-3 items-start gap-2">
              {muscleOrder.map(muscle => (
                <div key={muscle} className="overflow-hidden rounded border border-agon-brd bg-agon-s1">
                  {/* Muscle group header */}
                  <div className="flex items-center justify-between border-b border-agon-brd bg-agon-s2 px-2.5 py-[7px]">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.5px] text-agon-tx2">
                      {muscle}
                    </span>
                    <span className="text-[9px] text-agon-tx3">
                      {refsByMuscle[muscle].length}
                    </span>
                  </div>
                  {/* PR cards stacked */}
                  <div className="flex flex-col gap-0">
                    {refsByMuscle[muscle].map((ref, i) => (
                      <div key={ref} className={i > 0 ? "border-t border-agon-brd" : undefined}>
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
              <div className={cn(KICKER, "mb-[5px] flex items-center gap-1.5 font-semibold")}>
                <Link size={9} className="text-agon-tx3" />
                <span className="flex-1">Sans ref explicite ({unlinkedExercises.length})</span>
                <button onClick={startBulk} className="flex cursor-pointer items-center gap-[3px] rounded-[5px] border border-agon-accent/[0.314] bg-agon-accent/[0.071] px-2.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-agon-accent">
                  <Link size={8} /> Assigner tous
                </button>
              </div>
              <div className="flex flex-col gap-[3px]">
                {unlinkedExercises.map(ex => (
                  <div key={ex.id} className="flex items-center gap-2 rounded-[7px] border border-agon-brd bg-agon-s2 px-2.5 py-1.5">
                    <div className="flex-1 truncate text-[11px] font-semibold text-agon-tx2">
                      {ex.name}
                    </div>
                    <button onClick={() => setLinkingEx(ex)} className="flex cursor-pointer items-center gap-[3px] rounded border border-agon-succes/[0.314] bg-agon-succes/[0.063] px-2 py-0.5 text-[10px] font-semibold text-agon-succes">
                      <Link size={8} /> Regrouper
                    </button>
                    <button onClick={() => handleDismiss(ex)} title="Pas de RM" className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-agon-brd-l bg-transparent text-[10px] text-agon-tx3">
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
