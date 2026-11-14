import { useState } from "react"
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { GripVertical, X, Check, Video } from "lucide-react"
import type { Exercice } from "./types"
import { SyntheseBar } from "./SyntheseBar"
import { ExerciceParamsPanel } from "./ExerciceParamsPanel"
import { RmDrawer } from "./RmDrawer"
import { ExerciceMusclesEditor, MuscleChips } from "./ExerciceMusclesEditor"
import { useExerciseBankMuscles } from "./hooks/useExerciseBankMuscles"
import { resolveMuscles } from "@/lib/muscleVolume"
import { useExerciceRM } from "./hooks/useExerciceRM"
import { resolveExerciceParams, resolveVideoRequest } from "@/lib/sessionOccurrence"

/** Étiquette « méthode / libre / vidéo » : couleur du bloc posée en style. */
const TAG = "shrink-0 rounded-[4px] px-[5px] py-px text-[8px] font-bold"
const SQ_BTN = "flex size-6 cursor-pointer items-center justify-center rounded-[6px]"

interface ExerciceRowProps {
  exercice: Exercice
  index: number
  total: number
  athleteId: string | undefined
  sessionMultiSemaine: boolean
  activeWeek: number
  blocSeriesMode: 'libre' | 'fixe'
  blocSeriesCount?: number
  accentColor?: string
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onChange: (updated: Exercice) => void
  dragHandleProps?: Record<string, unknown>
}

function getDisplayParams(exercice: Exercice, activeWeek: number, _multiSemaine: boolean) {
  const p = exercice.params
  if (!p || typeof p !== 'object') return null
  const raw = resolveExerciceParams(p, activeWeek)
  if (!raw) return null
  // Guard: at minimum reps must exist to show anything
  if (!raw.reps) return null
  return raw
}

export function ExerciceRow({
  exercice,
  index,
  athleteId,
  sessionMultiSemaine,
  activeWeek,
  blocSeriesMode,
  blocSeriesCount,
  accentColor,
  onMoveUp: _onMoveUp,
  onMoveDown: _onMoveDown,
  onDelete,
  onChange,
  dragHandleProps,
}: ExerciceRowProps) {
  const [showParams, setShowParams] = useState(false)
  const [showRm, setShowRm] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const accent = accentColor ?? C.ac
  const accentSoft = accent + "1F"

  const { best: bestRM } = useExerciceRM(athleteId, exercice)
  const { data: bankMuscles } = useExerciseBankMuscles()
  const muscles = resolveMuscles(exercice, bankMuscles ?? new Map())

  const effectiveMultiSemaine = sessionMultiSemaine || (exercice.multi_semaine ?? false)
  const displayParams = getDisplayParams(exercice, activeWeek, effectiveMultiSemaine)

  const hasName = !!exercice.exercise_name

  return (
    <div
      data-step-id={exercice.id}
      className={cn(
        "overflow-hidden rounded-[4px] border [transition:border-color_150ms,background_150ms]",
        !showParams && "border-agon-brd-l bg-agon-s1",
      )}
      style={showParams ? { borderColor: accent + "50", background: accent + "08" } : undefined}
    >
      {/* Row */}
      <div
        onClick={() => setShowParams(p => !p)}
        className="flex cursor-pointer items-center gap-1.5 px-2.5 py-[7px]"
      >

        {/* Drag */}
        <div
          {...(dragHandleProps ?? {})}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 cursor-grab items-center text-agon-tx3/[0.44]"
        >
          <GripVertical size={12} />
        </div>

        {/* Index badge */}
        <div
          className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[9px] font-extrabold", !hasName && "bg-agon-s2 text-agon-tx3")}
          style={hasName ? { background: accentSoft, color: accent } : undefined}
        >
          {index + 1}
        </div>

        {/* Exercise info */}
        <div className="min-w-0 flex-1">
          {/* Name row */}
          <div className="flex min-w-0 items-center gap-[5px]">
            <div className={cn("min-w-0 flex-1 truncate text-[12px] font-bold", hasName ? "text-agon-tx" : "text-agon-tx3")}>
              {exercice.exercise_name || (exercice.mode === 'libre' ? "Note libre" : "Exercice non défini")}
            </div>

            {exercice.mode === 'methode' && exercice.methode_id && (
              <div className={TAG} style={{ color: accent, background: accentSoft }}>
                méthode
              </div>
            )}

            {exercice.mode === 'libre' && (
              <div className={TAG} style={{ color: accent, background: accentSoft }}>
                libre
              </div>
            )}

            {resolveVideoRequest(exercice, activeWeek) && (
              <div title="Retour vidéo demandé" className={cn(TAG, "flex items-center gap-[3px]")} style={{ color: accent, background: accentSoft }}>
                <Video size={9} /> vidéo
              </div>
            )}

            {/* 1RM — always visible when exercise selected */}
            {hasName && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowRm(true) }}
                className={cn(
                  "shrink-0 cursor-pointer whitespace-nowrap rounded-[5px] border px-1.5 py-px text-[9px] font-bold",
                  !bestRM && "border-agon-brd-l bg-agon-s2 text-agon-tx3",
                )}
                style={bestRM ? { background: accentSoft, borderColor: accent + "40", color: accent } : undefined}
              >
                {bestRM ? `${bestRM.kg}kg 1RM` : "— 1RM"}
              </button>
            )}
          </div>

          {exercice.mode === 'libre' ? (
            exercice.libre_text && (
              <div className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: accent }}>
                {exercice.libre_text}
              </div>
            )
          ) : displayParams && (
            <div className="mt-0.5">
              <SyntheseBar params={displayParams} color={accent} />
            </div>
          )}

          {exercice.mode !== 'libre' && hasName && (
            <div className="mt-[3px] flex flex-wrap items-center gap-1">
              <MuscleChips muscles={muscles} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-[3px]">
          {confirmingDelete ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className={cn(SQ_BTN, "border-0 bg-agon-erreur-vif text-agon-ink")}
              ><Check size={11} /></button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false) }}
                className={cn(SQ_BTN, "border border-agon-brd-l bg-transparent text-agon-tx3")}
              ><X size={11} /></button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }}
              className={cn(SQ_BTN, "border border-agon-erreur/25 bg-agon-erreur-doux text-agon-erreur")}
            ><X size={11} /></button>
          )}
        </div>
      </div>

      {/* Params panel */}
      {showParams && (
        <div className="border-t px-2.5 pb-3" style={{ borderTopColor: accent + "30" }}>
          <ExerciceParamsPanel
            exercice={exercice}
            blocSeriesMode={blocSeriesMode}
            blocSeriesCount={blocSeriesCount}
            sessionMultiSemaine={sessionMultiSemaine}
            activeWeek={activeWeek}
            athleteId={athleteId}
            onChange={onChange}
          />
          {exercice.mode !== 'libre' && hasName && (
            <ExerciceMusclesEditor exercice={exercice} onChange={onChange} />
          )}
        </div>
      )}

      {/* RM Drawer */}
      {showRm && (
        <RmDrawer
          open={showRm}
          onClose={() => setShowRm(false)}
          exercice={exercice}
          athleteId={athleteId}
        />
      )}
    </div>
  )
}
