/**
 * ExerciseStepEditor — Sheet drawer for editing an ExerciseInterval step.
 * Used in IntervalBuilder when sessionKind === 'specifique'.
 */
import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ExerciseInterval, IntervalRole } from "@/types/energy";
import { genId } from "@/lib/energy/treeUtils";
import { ExerciceSearch } from "@/features/coach/components/programmation/ExerciceSearch";
import { toast } from "sonner";
import { saveExerciseYoutubeId } from "@/api/energy";

const LABEL = "mb-1 block text-[11px] font-semibold text-agon-tx3";
const INPUT = "box-border w-full rounded border border-agon-brd-l bg-agon-s2 px-2.5 py-2 text-[13px] text-agon-tx outline-none";
const TRIGGER = "border-agon-brd-l bg-agon-s2 text-[12px] leading-5 text-agon-tx";

const ROLES: { value: IntervalRole; label: string }[] = [
  { value: "work",     label: "Effort" },
  { value: "warmup",   label: "Échauffement" },
  { value: "recovery", label: "Récupération" },
  { value: "cooldown", label: "Retour au calme" },
  { value: "open",     label: "Libre" },
];

const WEIGHT_UNITS = [
  { value: "kg",     label: "kg" },
  { value: "bw",     label: "Poids de corps" },
  { value: "pct_rm", label: "% RM" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseInterval | null;
  onSave: (exercise: ExerciseInterval) => void;
}

export default function ExerciseStepEditor({ open, onOpenChange, exercise, onSave }: Props) {
  const isNew = !exercise;

  const [exerciseId, setExerciseId] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [youtubeId, setYoutubeId] = useState<string | undefined>();
  const [originalYoutubeId, setOriginalYoutubeId] = useState<string | undefined>();
  const [role, setRole] = useState<IntervalRole>("work");
  const [repsMin, setRepsMin] = useState<number | undefined>(10);
  const [repsMax, setRepsMax] = useState<number | undefined>();
  const [weightKg, setWeightKg] = useState<number | undefined>();
  const [weightUnit, setWeightUnit] = useState<"kg" | "bw" | "pct_rm">("kg");
  const [durationS, setDurationS] = useState<number | undefined>();
  // Temps (s) ou distance (m) — ex. Sled Push 15 m
  const [durationKind, setDurationKind] = useState<"time" | "distance">("time");
  const [notes, setNotes] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (exercise) {
      setExerciseId(exercise.exercise_id);
      setExerciseName(exercise.exercise_name);
      setYoutubeId(exercise.youtube_id);
      setOriginalYoutubeId(exercise.youtube_id);
      setRole(exercise.role);
      setRepsMin(exercise.reps_min);
      setRepsMax(exercise.reps_max);
      setWeightKg(exercise.weight_kg);
      setWeightUnit(exercise.weight_unit ?? "kg");
      setDurationKind(exercise.duration?.kind === "distance" ? "distance" : "time");
      setDurationS(exercise.duration?.kind === "time" || exercise.duration?.kind === "distance" ? exercise.duration.value : undefined);
      setNotes(exercise.notes ?? "");
      setShowSearch(false);
    } else {
      setExerciseId("");
      setExerciseName("");
      setYoutubeId(undefined);
      setOriginalYoutubeId(undefined);
      setRole("work");
      setRepsMin(10);
      setRepsMax(undefined);
      setWeightKg(undefined);
      setWeightUnit("kg");
      setDurationS(undefined);
      setDurationKind("time");
      setNotes("");
      setShowSearch(true);
    }
  }, [exercise, open]);

  function handleSave() {
    const result: ExerciseInterval = {
      type: "exercise",
      id: exercise?.id ?? genId(),
      role,
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      reps_min: repsMin || undefined,
      reps_max: repsMax || undefined,
      weight_kg: weightKg || undefined,
      weight_unit: weightKg ? weightUnit : undefined,
      duration: durationS ? { kind: durationKind, value: durationS } : undefined,
      target: { kind: "none" },
      notes: notes.trim() || undefined,
      youtube_id: youtubeId,
    };
    // Persist youtube_id to exercise if added/changed
    if (exerciseId && youtubeId && youtubeId !== originalYoutubeId) {
      // L'étape garde la vidéo même si la banque refuse ; on le signale.
      saveExerciseYoutubeId(exerciseId, youtubeId).catch(() =>
        toast.error("Vidéo gardée pour cette étape, mais pas enregistrée dans la banque d'exercices"));
    }
    onSave(result);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[380px] max-w-[100vw] flex-col border-l border-agon-brd bg-agon-bg sm:max-w-[100vw]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-agon-tx">
            <span className="h-2 w-2 shrink-0 rounded-[50%] bg-agon-accent" />
            {isNew ? "Ajouter un exercice" : "Modifier l'exercice"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          {/* Exercise picker */}
          <div>
            <label className={LABEL}>Exercice</label>
            {showSearch ? (
              <ExerciceSearch
                value={exerciseName}
                onSelect={(ex) => {
                  setExerciseId(ex.id);
                  setExerciseName(ex.name);
                  setYoutubeId(ex.youtube_id);
                  setOriginalYoutubeId(ex.youtube_id);
                  setShowSearch(false);
                }}
                onClose={() => { if (exerciseId) setShowSearch(false); }}
              />
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className={cn(INPUT, "flex cursor-pointer items-center justify-between text-left")}
              >
                <span className={exerciseName ? "text-agon-tx" : "text-agon-tx3"}>
                  {exerciseName || "Choisir un exercice…"}
                </span>
                <span className="text-[10px] text-agon-accent"></span>
              </button>
            )}
          </div>

          {/* Video link */}
          <div>
            <label className={LABEL}>Lien vidéo YouTube</label>
            <input
              value={youtubeId ? `https://youtube.com/watch?v=${youtubeId}` : ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) { setYoutubeId(undefined); return; }
                const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
                setYoutubeId(m ? m[1] : raw);
              }}
              placeholder="https://youtube.com/watch?v=..."
              className={INPUT}
            />
          </div>

          {/* Video preview */}
          {youtubeId && (
            <div className="relative overflow-hidden rounded border border-agon-brd-l pb-[56.25%]">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                className="absolute left-0 top-0 h-full w-full border-none"
                allow="encrypted-media"
                allowFullScreen
              />
            </div>
          )}

          {/* Role */}
          <div>
            <label className={LABEL}>Rôle</label>
            <Select value={role} onValueChange={(v) => setRole(v as IntervalRole)}>
              <SelectTrigger className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Reps range */}
          <div>
            <label className={LABEL}>Répétitions</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0}
                value={repsMin ?? ""}
                onChange={(e) => setRepsMin(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Min"
                className={cn(INPUT, "flex-1")}
              />
              <span className="text-[13px] text-agon-tx3">–</span>
              <input
                type="number" min={0}
                value={repsMax ?? ""}
                onChange={(e) => setRepsMax(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Max (optionnel)"
                className={cn(INPUT, "flex-1")}
              />
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className={LABEL}>Charge</label>
            <div className="flex gap-2">
              <input
                type="number" min={0} step={0.5}
                value={weightKg ?? ""}
                onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="—"
                className={cn(INPUT, "flex-1")}
              />
              <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "kg" | "bw" | "pct_rm")}>
                <SelectTrigger className={cn(TRIGGER, "w-[120px]")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration / distance (optional) */}
          <div>
            <label className={LABEL}>Durée ou distance (optionnel)</label>
            <div className="flex gap-2">
              <input
                type="number" min={0}
                value={durationS ?? ""}
                onChange={(e) => setDurationS(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Laisser vide si reps uniquement"
                className={cn(INPUT, "flex-1")}
              />
              <Select value={durationKind} onValueChange={(v) => setDurationKind(v as "time" | "distance")}>
                <SelectTrigger className={cn(TRIGGER, "w-[120px]")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">secondes</SelectItem>
                  <SelectItem value="distance">mètres</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Standard RX, tempo 3010…"
              rows={2}
              className={cn(INPUT, "resize-y")}
            />
          </div>

        </div>

        <SheetFooter className="border-t border-agon-brd pt-3">
          <div className="flex w-full gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 cursor-pointer rounded border border-agon-brd-l bg-transparent px-3.5 py-2.5 text-[13px] text-agon-tx2"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!exerciseId}
              className={cn(
                "flex-1 cursor-pointer rounded bg-agon-accent px-3.5 py-2.5 text-[13px] font-bold text-agon-tx",
                exerciseId ? "opacity-100" : "opacity-50",
              )}
            >
              {isNew ? "Ajouter" : "Enregistrer"}
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
