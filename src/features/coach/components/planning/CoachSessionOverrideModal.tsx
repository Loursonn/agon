/**
 * CoachSessionOverrideModal
 * Lets the coach adapt a session for ONE specific day (one workout_log), without
 * touching the shared template or any other occurrence. Reuses SessionBlocEditor;
 * the edited blocs are stored flattened (single week) in
 * workout_logs.athlete_modifications.coachOverride (see useCoachSessionOverride).
 */
import { useState, useEffect, useMemo } from "react";
import { X, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { SessionBlocEditor } from "@/features/coach/components/programmation/SessionBlocEditor";
import { defaultExerciceParams } from "@/features/coach/components/programmation/types";
import type { Bloc, Exercice, ExerciceParams, ProgSession } from "@/features/coach/components/programmation/types";
import { useCoachSessionOverride } from "@/features/shared/hooks/useCoachSessionOverride";
import type { AthleteModifications } from "@/features/shared/types/athlete";

// ── Param flattening (mirror of ProgSessionWeekDrawer.resolveParams) ───────────

function resolveParams(
  exercice: Exercice,
  week: number,
  sessionMultiSemaine: boolean,
): ExerciceParams | null {
  const p = exercice.params;
  if (!p || typeof p !== "object") return null;
  const isFlat = !Object.keys(p as object).some((k) => /^\d+$/.test(k));
  const multi = sessionMultiSemaine || (exercice.multi_semaine ?? false);
  if (!multi || isFlat) {
    return isFlat
      ? (p as ExerciceParams)
      : (Object.values(p as Record<string, ExerciceParams>)[0] ?? null);
  }
  return (p as Record<string, ExerciceParams>)[String(week)] ?? null;
}

/** Deep-clones blocs and collapses per-week params to a single flat week. */
function flattenBlocsToWeek(blocs: Bloc[], week: number, multi: boolean): Bloc[] {
  return (structuredClone(blocs) as Bloc[]).map((b) => ({
    ...b,
    exercices: b.exercices.map((ex) => ({
      ...ex,
      multi_semaine: false,
      params: resolveParams(ex, week, multi) ?? defaultExerciceParams(),
    })),
  }));
}

interface Props {
  workoutLogId: string;
  athleteId: string;
  onClose: () => void;
}

export function CoachSessionOverrideModal({ workoutLogId, athleteId, onClose }: Props) {
  const { mutate: saveOverride, isPending } = useCoachSessionOverride();

  // ── Fetch the log (source session + week + existing override) ──────────────
  const { data: wlog, isLoading: loadingLog } = useQuery({
    queryKey: ["coach-override-log", workoutLogId],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_logs")
        .select("id, session_id, session_name, week_number, athlete_modifications")
        .eq("id", workoutLogId)
        .maybeSingle();
      return data;
    },
  });

  const { data: progSessions = [], isLoading: loadingSessions } = useProgrammation(athleteId);

  const sourceSession = useMemo<ProgSession | undefined>(
    () => progSessions.find((s) => s.id === wlog?.session_id),
    [progSessions, wlog?.session_id],
  );

  const existingOverride = useMemo(
    () => (wlog?.athlete_modifications as AthleteModifications | null)?.coachOverride ?? null,
    [wlog?.athlete_modifications],
  );

  // ── Local editable session (single week, multi_semaine off) ────────────────
  const [session, setSession] = useState<ProgSession | null>(null);

  useEffect(() => {
    if (session) return; // seed once
    if (loadingLog || loadingSessions) return;

    const weekNumber = wlog?.week_number ?? 1;
    const name = sourceSession?.name ?? wlog?.session_name ?? "Séance";

    let blocs: Bloc[];
    if (existingOverride?.blocs?.length) {
      blocs = structuredClone(existingOverride.blocs) as Bloc[];
    } else if (sourceSession) {
      blocs = flattenBlocsToWeek(sourceSession.blocs, weekNumber, sourceSession.multi_semaine);
    } else {
      blocs = [];
    }

    setSession({
      id: sourceSession?.id ?? wlog?.session_id ?? "override",
      name,
      short: sourceSession?.short ?? name.slice(0, 3).toUpperCase(),
      recurrence: "once",
      multi_semaine: false,
      blocs,
    });
  }, [session, loadingLog, loadingSessions, wlog, sourceSession, existingOverride]);

  const loading = loadingLog || loadingSessions || !session;
  const canEdit = !!sourceSession || !!existingOverride;

  function handleSave() {
    if (!session) return;
    saveOverride(
      { workoutLogId, athleteId, override: { blocs: session.blocs } },
      { onSuccess: onClose },
    );
  }

  function handleReset() {
    saveOverride({ workoutLogId, athleteId, override: null }, { onSuccess: onClose });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 71,
          transform: "translate(-50%, -50%)",
          width: 640, maxWidth: "96vw", maxHeight: "92vh",
          background: C.bg, borderRadius: 6, border: "1px solid " + C.brd,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid " + C.brd,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>
              Adapter pour ce jour
            </div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              {session?.name ?? "…"} — modifie exercices &amp; charges pour cette séance uniquement
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          ><X size={15} /></button>
        </div>

        {existingOverride && (
          <div style={{
            padding: "8px 20px", fontSize: 11, color: "#F59E0B",
            background: "#F59E0B14", borderBottom: "1px solid " + C.brd, flexShrink: 0,
          }}>
            Cette séance est déjà adaptée pour ce jour. Modifie ou réinitialise.
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
              Chargement…
            </div>
          ) : !canEdit ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
              Édition indisponible : séance introuvable dans la programmation.
            </div>
          ) : (
            <SessionBlocEditor
              session={session!}
              cycleId={undefined}
              athleteId={athleteId}
              onChange={setSession}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid " + C.brd, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {existingOverride && (
            <button
              onClick={handleReset}
              disabled={isPending}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "10px 14px", borderRadius: 4,
                border: "1px solid " + C.r + "40", background: "transparent",
                color: C.r, fontSize: 12, fontWeight: 600,
                cursor: isPending ? "default" : "pointer", fontFamily: "inherit",
                opacity: isPending ? 0.5 : 1,
              }}
            >
              <RotateCcw size={13} />
              Réinitialiser
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: "10px 16px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, fontSize: 12, fontWeight: 600,
              cursor: isPending ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !canEdit}
            style={{
              padding: "10px 18px", borderRadius: 4,
              border: "1px solid " + C.ac + "40", background: C.acS,
              color: C.ac, fontSize: 12, fontWeight: 700,
              cursor: isPending || !canEdit ? "default" : "pointer", fontFamily: "inherit",
              opacity: isPending || !canEdit ? 0.5 : 1,
            }}
          >
            {isPending ? "Enregistrement…" : "Enregistrer pour ce jour"}
          </button>
        </div>
      </div>
    </>
  );
}
