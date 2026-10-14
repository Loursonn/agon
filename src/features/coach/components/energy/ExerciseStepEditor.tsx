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
import { C } from "@/lib/theme";
import type { ExerciseInterval, IntervalRole } from "@/types/energy";
import { genId } from "@/lib/energy/treeUtils";
import { ExerciceSearch } from "@/features/coach/components/programmation/ExerciceSearch";
import { supabase } from "@/integrations/supabase/client";

const EXO_COLOR = "#FFC933";

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
      setDurationS(exercise.duration?.kind === "time" ? exercise.duration.value : undefined);
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
      duration: durationS ? { kind: "time", value: durationS } : undefined,
      target: { kind: "none" },
      notes: notes.trim() || undefined,
      youtube_id: youtubeId,
    };
    // Persist youtube_id to exercise if added/changed
    if (exerciseId && youtubeId && youtubeId !== originalYoutubeId) {
      supabase.from("exercises").update({ youtube_id: youtubeId }).eq("id", exerciseId).then();
    }
    onSave(result);
    onOpenChange(false);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: C.tx3, fontWeight: 600, marginBottom: 4, display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: `1px solid ${C.brdL}`, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" style={{ background: C.bg, borderLeft: `1px solid ${C.brd}`, width: 380, maxWidth: "100vw", display: "flex", flexDirection: "column" }}>
        <SheetHeader>
          <SheetTitle style={{ color: C.tx, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: EXO_COLOR, flexShrink: 0 }} />
            {isNew ? "Ajouter un exercice" : "Modifier l'exercice"}
          </SheetTitle>
        </SheetHeader>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Exercise picker */}
          <div>
            <label style={labelStyle}>Exercice</label>
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
                style={{
                  ...inputStyle,
                  cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <span style={{ color: exerciseName ? C.tx : C.tx3 }}>
                  {exerciseName || "Choisir un exercice…"}
                </span>
                <span style={{ fontSize: 10, color: EXO_COLOR }}></span>
              </button>
            )}
          </div>

          {/* Video link */}
          <div>
            <label style={labelStyle}>Lien vidéo YouTube</label>
            <input
              value={youtubeId ? `https://youtube.com/watch?v=${youtubeId}` : ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) { setYoutubeId(undefined); return; }
                const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
                setYoutubeId(m ? m[1] : raw);
              }}
              placeholder="https://youtube.com/watch?v=..."
              style={inputStyle}
            />
          </div>

          {/* Video preview */}
          {youtubeId && (
            <div style={{
              position: "relative", paddingBottom: "56.25%", borderRadius: 4, overflow: "hidden",
              border: `1px solid ${C.brdL}`,
            }}>
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                allow="encrypted-media"
                allowFullScreen
              />
            </div>
          )}

          {/* Role */}
          <div>
            <label style={labelStyle}>Rôle</label>
            <Select value={role} onValueChange={(v) => setRole(v as IntervalRole)}>
              <SelectTrigger style={{ background: C.s2, border: `1px solid ${C.brdL}`, color: C.tx, fontSize: 12 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Reps range */}
          <div>
            <label style={labelStyle}>Répétitions</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number" min={0}
                value={repsMin ?? ""}
                onChange={(e) => setRepsMin(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Min"
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ color: C.tx3, fontSize: 13 }}>–</span>
              <input
                type="number" min={0}
                value={repsMax ?? ""}
                onChange={(e) => setRepsMax(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Max (optionnel)"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          {/* Weight */}
          <div>
            <label style={labelStyle}>Charge</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number" min={0} step={0.5}
                value={weightKg ?? ""}
                onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="—"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "kg" | "bw" | "pct_rm")}>
                <SelectTrigger style={{ width: 120, background: C.s2, border: `1px solid ${C.brdL}`, color: C.tx, fontSize: 12 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration (optional) */}
          <div>
            <label style={labelStyle}>Durée (secondes, optionnel)</label>
            <input
              type="number" min={0}
              value={durationS ?? ""}
              onChange={(e) => setDurationS(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Laisser vide si reps uniquement"
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Standard RX, tempo 3010…"
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

        </div>

        <SheetFooter style={{ borderTop: `1px solid ${C.brd}`, paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button
              onClick={() => onOpenChange(false)}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 4,
                border: `1px solid ${C.brdL}`, background: "transparent",
                color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!exerciseId}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 4,
                border: "none", background: EXO_COLOR, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                opacity: exerciseId ? 1 : 0.5,
              }}
            >
              {isNew ? "Ajouter" : "Enregistrer"}
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
