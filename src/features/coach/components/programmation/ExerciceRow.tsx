import { useState } from "react"
import { C } from "@/lib/theme"
import { GripVertical, X, Check } from "lucide-react"
import type { Exercice } from "./types"
import { SyntheseBar } from "./SyntheseBar"
import { ExerciceParamsPanel } from "./ExerciceParamsPanel"
import { RmDrawer } from "./RmDrawer"
import { useExerciceRM } from "./hooks/useExerciceRM"

const VIOLET = "#FFC933"

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
  const isRecord = Object.keys(p as object).some((k) => /^\d+$/.test(k))
  const raw = isRecord
    ? ((p as Record<string, import("./types").ExerciceParams>)[String(activeWeek)]
      ?? (p as Record<string, import("./types").ExerciceParams>)['1']
      ?? Object.values(p as Record<string, import("./types").ExerciceParams>)[0]
      ?? null)
    : (p as import("./types").ExerciceParams)
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

  const accent = accentColor ?? VIOLET
  const accentSoft = accent + "1F"

  const { best: bestRM } = useExerciceRM(athleteId, exercice.exercise_name)

  const effectiveMultiSemaine = sessionMultiSemaine || (exercice.multi_semaine ?? false)
  const displayParams = getDisplayParams(exercice, activeWeek, effectiveMultiSemaine)

  const hasName = !!exercice.exercise_name

  return (
    <div style={{
      borderRadius: 4,
      border: "1px solid " + (showParams ? accent + "50" : C.brdL),
      background: showParams ? accent + "08" : C.s1,
      overflow: "hidden",
      transition: "border-color 150ms, background 150ms",
    }}>
      {/* Row */}
      <div
        onClick={() => setShowParams(p => !p)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", cursor: "pointer" }}
      >

        {/* Drag */}
        <div
          {...(dragHandleProps ?? {})}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "grab", color: C.tx3 + "70", display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <GripVertical size={12} />
        </div>

        {/* Index badge */}
        <div style={{
          width: 18, height: 18, borderRadius: 5,
          background: hasName ? accentSoft : C.s2,
          color: hasName ? accent : C.tx3,
          fontSize: 9, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {index + 1}
        </div>

        {/* Exercise info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: hasName ? C.tx : C.tx3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              minWidth: 0, flex: 1,
            }}>
              {exercice.exercise_name || (exercice.mode === 'libre' ? "Note libre" : "Exercice non défini")}
            </div>

            {exercice.mode === 'methode' && exercice.methode_id && (
              <div style={{ fontSize: 8, fontWeight: 700, color: accent, background: accentSoft, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                méthode
              </div>
            )}

            {exercice.mode === 'libre' && (
              <div style={{ fontSize: 8, fontWeight: 700, color: accent, background: accentSoft, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                libre
              </div>
            )}

            {/* 1RM — always visible when exercise selected */}
            {hasName && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowRm(true) }}
                style={{
                  background: bestRM ? accentSoft : C.s2,
                  border: "1px solid " + (bestRM ? accent + "40" : C.brdL),
                  color: bestRM ? accent : C.tx3,
                  fontSize: 9, fontWeight: 700,
                  borderRadius: 5, padding: "1px 6px",
                  cursor: "pointer", fontFamily: "inherit",
                  flexShrink: 0, whiteSpace: "nowrap",
                }}
              >
                {bestRM ? `${bestRM.kg}kg 1RM` : "— 1RM"}
              </button>
            )}
          </div>

          {exercice.mode === 'libre' ? (
            exercice.libre_text && (
              <div style={{ marginTop: 2, fontSize: 11, color: accent, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {exercice.libre_text}
              </div>
            )
          ) : displayParams && (
            <div style={{ marginTop: 2 }}>
              <SyntheseBar params={displayParams} color={accent} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {confirmingDelete ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              ><Check size={11} /></button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false) }}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              ><X size={11} /></button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }}
              style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.r + "40", background: C.rS, color: C.r, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><X size={11} /></button>
          )}
        </div>
      </div>

      {/* Params panel */}
      {showParams && (
        <div style={{ borderTop: "1px solid " + accent + "30", padding: "0 10px 12px" }}>
          <ExerciceParamsPanel
            exercice={exercice}
            blocSeriesMode={blocSeriesMode}
            blocSeriesCount={blocSeriesCount}
            sessionMultiSemaine={sessionMultiSemaine}
            activeWeek={activeWeek}
            athleteId={athleteId}
            onChange={onChange}
          />
        </div>
      )}

      {/* RM Drawer */}
      {showRm && (
        <RmDrawer
          open={showRm}
          onClose={() => setShowRm(false)}
          exerciseName={exercice.exercise_name}
          athleteId={athleteId}
        />
      )}
    </div>
  )
}
