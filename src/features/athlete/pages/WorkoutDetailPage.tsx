import { Fragment, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import type { WorkoutBlocData, WorkoutExerciceData } from "@/features/shared/hooks/useWorkoutSession";
import { useSaveWorkoutSets } from "@/features/shared/hooks/useSaveWorkoutSets";
import { useExerciseVideos } from "@/features/shared/hooks/useExerciseVideos";
import { usePrevWorkoutSets } from "@/features/shared/hooks/usePrevWorkoutSets";
import type { AthleteModifications, SessionSetLog } from "@/features/shared/types/athlete";
import type { ExerciceParams, ClusterConfig } from "@/features/coach/components/programmation/types";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";

// ── Constants ──────────────────────────────────────────────────────────────────

const ACCENT = "#FFC933";
const ACCENT_ALT = "#FF9500";
const GREEN = "#66F03C";
const REST_DEFAULT = 90;
const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R; // ≈ 113.097

const BLOC_PALETTE = [
  "#FFC933", "#F97316", "#22C55E", "#EF4444",
  "#3B9EFF", "#FACC15", "#EC4899", "#14B8A6",
];

const FIELD_CFG = {
  kg:   { label: "Charge",                unit: "kg",   steps: [-2.5, -1.25, 1.25, 2.5] as number[] },
  reps: { label: "Répétitions",           unit: "reps", steps: [-2, -1, 1, 2] as number[] },
  rir:  { label: "RIR (reps en réserve)", unit: "",     steps: [-1, 1] as number[] },
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface SetState { kg: string; reps: string; rir: string; done: boolean; skipped: boolean; }
type AllSets = Record<string, SetState[]>;
interface PadTarget { exId: string; setIdx: number; field: "kg" | "reps" | "rir"; chargeUnit: string; clusterNb?: number; isIso?: boolean; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function parsePrevVal(str: string, field: "kg" | "reps"): string {
  if (!str || str === "—") return "";
  if (field === "kg") {
    const m = str.match(/^([\d,]+(?:\.\d+)?)/);
    return m ? m[1] : "";
  }
  const m = str.match(/×(\d+)/);
  return m ? m[1] : "";
}

function getSetTarget(
  params: ExerciceParams,
  setIdx: number,
): { reps?: number; kg?: number | null; rir?: number | null } {
  const reps =
    params.reps.mode === "par_serie" ? params.reps.values[setIdx] : params.reps.value;
  const kg =
    params.charge_unit !== "PDC"
      ? params.charge.mode === "par_serie"
        ? params.charge.values[setIdx]
        : params.charge.value
      : null;
  const rir =
    params.rir.mode === "par_serie"
      ? (params.rir.values as (number | null)[])[setIdx]
      : params.rir.value;
  return { reps, kg, rir };
}

function initSetState(
  params: ExerciceParams,
  setIdx: number,
  saved?: SessionSetLog,
): SetState {
  if (saved) {
    return {
      kg: saved.kg != null ? String(saved.kg).replace(".", ",") : "",
      reps: saved.reps != null ? String(saved.reps) : "",
      rir: saved.rir != null ? String(saved.rir) : "",
      done: saved.done,
      skipped: saved.skipped ?? false,
    };
  }
  const t = getSetTarget(params, setIdx);
  return {
    kg: t.kg != null ? String(t.kg).replace(".", ",") : "",
    reps: t.reps != null ? String(t.reps) : "",
    rir: t.rir != null ? String(t.rir) : "",
    done: false,
    skipped: false,
  };
}

const BLANK_SET: SetState = { kg: "", reps: "", rir: "", done: false, skipped: false };

/**
 * Ramène n'importe quelle valeur à un SetState complet.
 * Indispensable : une ligne absente (exercice apparu après l'init, index hors
 * bornes) donnait `{...undefined}` = objet vide → `s.kg` undefined → crash à la
 * sauvegarde ("Cannot read properties of undefined (reading 'replace')").
 */
function normalizeSet(s: Partial<SetState> | undefined | null): SetState {
  if (!s) return { ...BLANK_SET };
  return {
    kg: s.kg ?? "",
    reps: s.reps ?? "",
    rir: s.rir ?? "",
    done: s.done ?? false,
    skipped: s.skipped ?? false,
  };
}

function setStateToLog(s: SetState | undefined): SessionSetLog {
  const n = normalizeSet(s);
  const kgStr = n.kg.replace(",", ".");
  return {
    done: n.done,
    skipped: n.skipped,
    kg: kgStr ? parseFloat(kgStr) : undefined,
    reps: n.reps ? parseInt(n.reps) : undefined,
    rir: n.rir === "5+" ? 5 : n.rir !== "" ? parseFloat(n.rir) : undefined,
  };
}

function allSetsToMods(allSets: AllSets, base: AthleteModifications): AthleteModifications {
  const sessionSets: Record<string, SessionSetLog[]> = {};
  for (const [exId, exSets] of Object.entries(allSets)) {
    sessionSets[exId] = Array.isArray(exSets) ? exSets.map(setStateToLog) : [];
  }
  return { ...base, sessionSets };
}

/**
 * Lignes de séries attendues pour un exercice, à partir de la prescription
 * courante, des séries déjà enregistrées et de la saisie en cours.
 * La saisie en cours (`prev`) gagne toujours, et on ne supprime jamais de ligne
 * (séries bonus, prescription réduite par le coach en cours de séance).
 */
function buildExSets(
  ex: WorkoutExerciceData,
  saved: SessionSetLog[] | undefined,
  prev: SetState[] | undefined,
): SetState[] {
  if (ex.mode === "libre") {
    // Libre : une seule "série" virtuelle = case à cocher de validation
    const existing = prev?.[0];
    if (existing) return [normalizeSet(existing)];
    const savedItem = saved?.[0];
    return [normalizeSet({ done: savedItem?.done, skipped: savedItem?.skipped })];
  }

  const c = ex.params.cluster;
  const prescribed = c ? ex.params.nb_series * c.nb_clusters : ex.params.nb_series;
  const count = Math.max(prescribed || 0, saved?.length ?? 0, prev?.length ?? 0);

  const safeReps = c ? (Array.isArray(c.reps) ? c.reps : Array(c.nb_clusters).fill(5)) : null;
  const globalKg =
    c && ex.params.charge.mode === "global" && ex.params.charge.value != null
      ? String(ex.params.charge.value).replace(".", ",")
      : "";

  return Array.from({ length: count }, (_, i) => {
    const existing = prev?.[i];
    if (existing) return normalizeSet(existing);
    const savedItem = saved?.[i];

    if (c && safeReps) {
      const prescribedReps = safeReps[i % c.nb_clusters] ?? 5;
      if (savedItem) {
        return normalizeSet({
          kg: savedItem.kg != null ? String(savedItem.kg).replace(".", ",") : "",
          reps: savedItem.reps != null ? String(savedItem.reps) : String(prescribedReps),
          rir: savedItem.rir != null ? String(savedItem.rir) : "",
          done: savedItem.done,
          skipped: savedItem.skipped,
        });
      }
      return { kg: globalKg, reps: String(prescribedReps), rir: "", done: false, skipped: false };
    }

    return normalizeSet(initSetState(ex.params, i, savedItem ?? undefined));
  });
}

function sameSets(a: SetState[], b: SetState[] | undefined): boolean {
  if (!b || a.length !== b.length) return false;
  return a.every((s, i) => {
    const o = b[i];
    return (
      !!o &&
      s.kg === o.kg && s.reps === o.reps && s.rir === o.rir &&
      s.done === o.done && s.skipped === o.skipped
    );
  });
}

function formatPrescription(params: ExerciceParams): string {
  const nb = params.nb_series;
  if (params.cluster) {
    const c = params.cluster;
    const repsArr = Array.isArray(c.reps) ? c.reps : Array(c.nb_clusters).fill(5);
    let s = `${nb}×(${repsArr.join("+")} + ${c.recup_sec}s)`;
    const charge = params.charge.mode === "global" ? params.charge.value : null;
    if (charge != null && params.charge_unit !== "PDC") s += ` @ ${charge}${params.charge_unit}`;
    const ct = params.tempo?.mode === "global" && params.tempo.value ? params.tempo.value : null;
    if (ct) s += ` · T ${ct}`;
    return s;
  }
  if (params.reps.mode === "par_serie" || params.charge.mode === "par_serie") {
    const parts = Array.from({ length: nb }, (_, i) => {
      const r = params.reps.mode === "par_serie" ? params.reps.values[i] : params.reps.value;
      const c = params.charge.mode === "par_serie" ? params.charge.values[i] : params.charge.value;
      if (c != null && params.charge_unit !== "PDC") return `${r ?? "?"}@${c}${params.charge_unit}`;
      return String(r ?? "?");
    });
    let ps = `${nb}× ${parts.join(" / ")}`;
    const pt = params.tempo?.mode === "global" && params.tempo.value ? params.tempo.value : null;
    if (pt) ps += ` · T ${pt}`;
    return ps;
  }
  const reps = params.reps.mode === "global" ? params.reps.value : "?";
  const repsMax = params.reps_max?.mode === "global" ? params.reps_max.value : null;
  const isIso = (params.reps_mode?.mode === "global" && params.reps_mode.value === "iso");
  const repsLabel = repsMax != null && repsMax !== reps ? `${reps}-${repsMax}` : String(reps);
  const unit = isIso ? "sec" : "";
  const chargeVal =
    params.charge_unit === "PDC"
      ? "PDC"
      : params.charge.mode === "global" && params.charge.value != null
      ? `${params.charge.value}${params.charge_unit}`
      : null;
  const rirVal = params.rir.mode === "global" && params.rir.value != null ? params.rir.value : null;
  let s = `${nb}×${repsLabel}${unit ? " " + unit : ""}`;
  if (chargeVal) s += ` @ ${chargeVal}`;
  if (rirVal != null) s += ` · RIR ${rirVal}`;
  const tempoVal = params.tempo?.mode === "global" && params.tempo.value ? params.tempo.value : null;
  if (tempoVal) s += ` · T ${tempoVal}`;
  return s;
}

function timingLabel(bloc: {
  timing_mode: string;
  timing_repos_min?: number;
  timing_repos_sec?: number;
  timing_depart_min?: number;
  timing_depart_sec?: number;
}): string | null {
  if (bloc.timing_mode === "libre") return null;
  if (bloc.timing_mode === "depart") {
    const min = bloc.timing_depart_min ?? 0;
    const sec = bloc.timing_depart_sec ?? 0;
    return sec > 0
      ? `Départ /${min > 0 ? `${min}min ` : ""}${sec}s`
      : `Départ /${min}min`;
  }
  const min = bloc.timing_repos_min ?? 0;
  const sec = bloc.timing_repos_sec ?? 0;
  if (min > 0 && sec > 0) return `Repos ${min}min ${sec}s`;
  if (min > 0) return `Repos ${min}min`;
  if (sec > 0) return `Repos ${sec}s`;
  return null;
}

function blocRestSeconds(bloc: {
  timing_mode: string;
  timing_depart_min?: number;
  timing_depart_sec?: number;
  timing_repos_min?: number;
  timing_repos_sec?: number;
}): number {
  if (bloc.timing_mode === "repos") {
    const s = (bloc.timing_repos_min ?? 0) * 60 + (bloc.timing_repos_sec ?? 0);
    return s > 0 ? s : 0;
  }
  if (bloc.timing_mode === "depart") {
    const s = (bloc.timing_depart_min ?? 0) * 60 + (bloc.timing_depart_sec ?? 0);
    return s > 0 ? s : 0;
  }
  return 0; // libre → rien
}

// ── BadgeTag ───────────────────────────────────────────────────────────────────

function BadgeTag({ label, color = ACCENT }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 6,
        background: hexToRgba(color, 0.12),
        color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.2px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── SetRow ─────────────────────────────────────────────────────────────────────

interface SetRowProps {
  setIdx: number;
  state: SetState;
  prevStr: string;
  chargeUnit: string;
  isIso?: boolean;
  indexLabel?: string;
  indexColor?: string;
  onToggle: () => void;
  onOpenPad: (field: "kg" | "reps" | "rir") => void;
  isCompleted: boolean;
  canRemove?: boolean;
  onRemoveSet?: () => void;
}

function SetRow({ setIdx, state, prevStr, chargeUnit, isIso, indexLabel, indexColor, onToggle, onOpenPad, isCompleted, canRemove, onRemoveSet }: SetRowProps) {
  const isPDC = chargeUnit === "PDC";
  const checkState = state.done ? "done" : state.skipped ? "skip" : "empty";
  const gridCols = isPDC
    ? "34px 1fr 1.15fr 0.9fr 40px"
    : "34px 1fr 1.15fr 1.15fr 0.9fr 40px";

  function cell(field: "kg" | "reps" | "rir", val: string) {
    return (
      <div
        onClick={() => !isCompleted && onOpenPad(field)}
        style={{
          background: state.done ? hexToRgba(GREEN, 0.06) : C.s2,
          border: `1px solid ${state.done ? hexToRgba(GREEN, 0.3) : C.brdL}`,
          borderRadius: 4,
          padding: "7px 2px",
          color: state.done ? GREEN : state.skipped ? C.tx3 : C.tx,
          fontSize: 13,
          fontWeight: 700,
          textAlign: "center" as const,
          cursor: isCompleted ? "default" : "pointer",
          transition: "all 100ms",
          minHeight: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: state.skipped ? "line-through" : "none",
        }}
      >
        {val || <span style={{ color: C.tx3, fontWeight: 400, fontSize: 11 }}>—</span>}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: 5,
        alignItems: "center",
        padding: "5px 0",
        borderBottom: `1px solid ${C.brd}`,
      }}
    >
      {/* Set number / remove bonus */}
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: indexColor ?? C.tx3 }}>
        {canRemove && onRemoveSet ? (
          <button
            onClick={onRemoveSet}
            style={{
              width: 22, height: 22, borderRadius: 6,
              border: `1px solid ${hexToRgba(ACCENT_ALT, 0.5)}`,
              background: hexToRgba(ACCENT_ALT, 0.12),
              color: ACCENT_ALT, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >×</button>
        ) : (indexLabel ?? setIdx + 1)}
      </div>

      {/* kg */}
      {!isPDC && cell("kg", state.kg)}

      {/* reps — en iso la valeur est une durée en secondes */}
      {cell("reps", state.reps ? (isIso ? `${state.reps}s` : state.reps) : "")}

      {/* prev perf */}
      <div
        style={{
          textAlign: "center",
          fontSize: 10,
          color: C.tx3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {prevStr || "—"}
      </div>

      {/* rir */}
      {cell("rir", state.rir)}

      {/* 3-state checkmark */}
      <button
        onClick={() => {
          if (!isCompleted) {
            onToggle();
            haptic();
          }
        }}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: `2px solid ${
            checkState === "done" ? GREEN : checkState === "skip" ? ACCENT_ALT : C.brdL
          }`,
          background:
            checkState === "done"
              ? GREEN
              : checkState === "skip"
              ? hexToRgba(ACCENT_ALT, 0.18)
              : "transparent",
          color:
            checkState === "done"
              ? "#fff"
              : checkState === "skip"
              ? ACCENT_ALT
              : C.tx3,
          fontSize: 14,
          fontWeight: 700,
          cursor: isCompleted ? "default" : "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          flexShrink: 0,
          justifySelf: "center" as const,
          minWidth: 32,
          opacity: checkState === "empty" ? 0.35 : 1,
        }}
      >
        {checkState === "skip" ? "✕" : "✓"}
      </button>
    </div>
  );
}

// ── ClusterSubRow ──────────────────────────────────────────────────────────────

const ORANGE = "#F5A623";

interface ClusterSubRowProps {
  clusterIdx: number;
  prescribedReps: number;
  state: SetState;
  chargeUnit: string;
  prevStr: string;
  canEdit: boolean;
  onToggle: () => void;
  onOpenPad: () => void;
}

function ClusterSubRow({
  clusterIdx,
  prescribedReps,
  state,
  chargeUnit,
  prevStr,
  canEdit,
  onToggle,
  onOpenPad,
}: ClusterSubRowProps) {
  const isPDC = chargeUnit === "PDC";
  const checkState = state.done ? "done" : state.skipped ? "skip" : "empty";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isPDC ? "26px 1fr 44px 34px" : "26px 1fr 1fr 44px 34px",
      gap: 4,
      alignItems: "center",
      padding: "3px 0",
      borderBottom: `1px solid ${C.brd}`,
    }}>
      {/* Cluster badge */}
      <div style={{
        textAlign: "center",
        fontSize: 8,
        fontWeight: 800,
        color: ORANGE,
        background: "rgba(245,166,35,0.15)",
        borderRadius: 4,
        padding: "2px 0",
        lineHeight: "1.4",
      }}>
        C{clusterIdx + 1}
      </div>

      {/* Charge */}
      {!isPDC && (
        <div
          onClick={() => canEdit && onOpenPad()}
          style={{
            background: state.done ? hexToRgba(GREEN, 0.06) : C.s2,
            border: `1px solid ${state.done ? hexToRgba(GREEN, 0.3) : C.brdL}`,
            borderRadius: 7,
            padding: "5px 2px",
            color: state.done ? GREEN : C.tx,
            fontSize: 12,
            fontWeight: 700,
            textAlign: "center" as const,
            cursor: canEdit ? "pointer" : "default",
            minHeight: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {state.kg || <span style={{ color: C.tx3, fontWeight: 400, fontSize: 10 }}>—</span>}
        </div>
      )}

      {/* Prescribed reps (fixed) */}
      <div style={{
        background: "rgba(245,166,35,0.1)",
        border: "1px solid rgba(245,166,35,0.25)",
        borderRadius: 7,
        padding: "5px 2px",
        color: ORANGE,
        fontSize: 12,
        fontWeight: 800,
        textAlign: "center" as const,
        minHeight: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {prescribedReps}
      </div>

      {/* Prev */}
      <div style={{
        textAlign: "center",
        fontSize: 10,
        color: C.tx3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {prevStr ? (parsePrevVal(prevStr, "kg") || "—") : "—"}
      </div>

      {/* Checkmark */}
      <button
        onClick={() => { if (canEdit) { onToggle(); haptic(); } }}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `2px solid ${
            checkState === "done" ? GREEN : checkState === "skip" ? ACCENT_ALT : C.brdL
          }`,
          background: checkState === "done" ? GREEN : checkState === "skip" ? hexToRgba(ACCENT_ALT, 0.18) : "transparent",
          color: checkState === "done" ? "#fff" : checkState === "skip" ? ACCENT_ALT : C.tx3,
          fontSize: 12,
          fontWeight: 700,
          cursor: canEdit ? "pointer" : "default",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          flexShrink: 0,
          justifySelf: "center" as const,
          opacity: checkState === "empty" ? 0.35 : 1,
        }}
      >
        {checkState === "skip" ? "✕" : "✓"}
      </button>
    </div>
  );
}

// ── InlineRestStrip ────────────────────────────────────────────────────────────

interface InlineRestStripProps {
  myKey: string;
  seconds: number;
  label: string;
  activeKey: string | null;
  left: number | null;
  total: number;
  onStart: () => void;
  onStop: () => void;
  canEdit: boolean;
}

function InlineRestStrip({ myKey, seconds, label, activeKey, left, total, onStart, onStop, canEdit }: InlineRestStripProps) {
  if (!canEdit || seconds <= 0) return null;
  const isActive = activeKey === myKey && left !== null;

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
  }

  if (isActive) {
    const pct = Math.max(0, 1 - left! / total);
    const urgent = left! <= 10;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 2px" }}>
        <span style={{ fontSize: 9, color: urgent ? ACCENT_ALT : ACCENT, flexShrink: 0 }}></span>
        <div style={{ flex: 1, height: 3, background: C.brd, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: urgent ? ACCENT_ALT : ACCENT,
            borderRadius: 2,
            transition: "width 1s linear",
          }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: urgent ? ACCENT_ALT : ACCENT, minWidth: 28, textAlign: "right" as const }}>
          {fmt(left!)}
        </span>
        <button
          onClick={onStop}
          style={{
            padding: "2px 6px", borderRadius: 4, border: "none",
            background: hexToRgba(ACCENT_ALT, 0.15), color: ACCENT_ALT,
            fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >✕</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 1px", opacity: 0.45 }}>
      <div style={{ flex: 1, height: 1, background: C.brdL }} />
      <span style={{ fontSize: 9, color: C.tx3, whiteSpace: "nowrap" as const }}>
        {fmt(seconds)} {label}
      </span>
      <button
        onClick={onStart}
        style={{
          width: 18, height: 18, borderRadius: 4, border: `1px solid ${C.brdL}`,
          background: "transparent", color: C.tx3,
          fontSize: 9, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
        }}
      >▶</button>
      <div style={{ flex: 1, height: 1, background: C.brdL }} />
    </div>
  );
}

// ── SupersetCard ───────────────────────────────────────────────────────────────
// Superset = 1 série de chaque exo enchaînée sans repos, puis repos du bloc.
// Affichage par tours : Série 1 (A puis B) → repos → Série 2 (A puis B) → ...

const SS_LETTERS = "ABCDEFGH";
const SS_ORANGE = "#F5A623";

interface SupersetMemberData {
  id: string;
  name: string;
  muscle?: string;
  prescription: string;
  coachComment?: string;
  youtubeId?: string;
  onShowVideo?: () => void;
  params: ExerciceParams;
  sets: SetState[];
  prevSets: string[];
  isIso: boolean;
  onToggle: (setIdx: number) => void;
  onOpenPad: (setIdx: number, field: "kg" | "reps" | "rir") => void;
  comment: string;
  onCommentChange: (c: string) => void;
}

interface SupersetCardProps {
  groupKey: string;
  members: SupersetMemberData[];
  blocColor: string;
  restSec: number;
  timingMode: string;
  restActiveKey: string | null;
  restLeft: number | null;
  restTotal: number;
  canEdit: boolean;
  onStartRest: (key: string, sec: number) => void;
  onStopRest: () => void;
}

function SupersetCard({
  groupKey, members, blocColor, restSec, timingMode,
  restActiveKey, restLeft, restTotal, canEdit, onStartRest, onStopRest,
}: SupersetCardProps) {
  const rounds = Math.max(...members.map((m) => m.sets.length), 0);
  // Repos entre tours : seulement en timing "repos" (départ = chrono bloc, libre = rien)
  const stripSec = timingMode === "repos" ? restSec : 0;
  const anyNonPDC = members.some((m) => m.params.charge_unit !== "PDC");

  const totalSets = members.reduce((sum, m) => sum + m.sets.length, 0);
  const doneSets = members.reduce((sum, m) => sum + m.sets.filter((s) => s.done).length, 0);
  const allDone = doneSets === totalSets && totalSets > 0;

  return (
    <div style={{
      background: C.s1,
      borderRadius: 6,
      border: `1px solid ${hexToRgba(SS_ORANGE, 0.45)}`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "11px 14px 9px", borderBottom: `1px solid ${C.brd}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            padding: "2px 9px", borderRadius: 4,
            background: hexToRgba(SS_ORANGE, 0.14), border: `1px solid ${hexToRgba(SS_ORANGE, 0.4)}`,
            color: SS_ORANGE, fontSize: 10, fontWeight: 800,
          }}>
            Superset ×{members.length}
          </span>
          <span style={{ fontSize: 9, color: C.tx3, flex: 1, minWidth: 0 }}>
            enchaîner les exos, repos après chaque tour
          </span>
          {doneSets > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: allDone ? C.g : C.tx3,
              background: allDone ? C.gS : C.s2,
              padding: "2px 8px", borderRadius: 6, flexShrink: 0,
            }}>
              {doneSets}/{totalSets} ✓
            </span>
          )}
        </div>

        {/* Légende exos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {members.map((m, mi) => (
            <div key={m.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  background: hexToRgba(SS_ORANGE, 0.15), color: SS_ORANGE,
                  fontSize: 10, fontWeight: 900,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  {SS_LETTERS[mi]}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 800, color: C.tx, minWidth: 0,
                }}>
                  {m.name}
                </span>
                {m.youtubeId && m.onShowVideo && (
                  <button
                    onClick={m.onShowVideo}
                    title="Voir la vidéo de l'exercice"
                    style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: `1px solid ${hexToRgba(ACCENT, 0.4)}`,
                      background: hexToRgba(ACCENT, 0.12), color: ACCENT,
                      fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}
                  ></button>
                )}
                <span style={{ flexShrink: 0 }}>
                  <BadgeTag label={m.prescription} color={ACCENT} />
                </span>
                {m.muscle && <span style={{ flexShrink: 0 }}><BadgeTag label={m.muscle} color={blocColor} /></span>}
              </div>
              {m.coachComment && (
                <div style={{ marginTop: 2, marginLeft: 25, fontSize: 10, color: C.tx2, fontStyle: "italic", lineHeight: 1.4 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg>{m.coachComment}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: anyNonPDC
          ? "34px 1fr 1.15fr 1.15fr 0.9fr 40px"
          : "34px 1fr 1.15fr 0.9fr 40px",
        gap: 5,
        padding: "4px 14px 2px",
        fontSize: 9, color: C.tx3, fontWeight: 600,
        letterSpacing: "0.4px", textTransform: "uppercase" as const,
      }}>
        <div style={{ textAlign: "center" }}>Exo</div>
        {anyNonPDC && <div style={{ textAlign: "center" }}>Charge</div>}
        <div style={{ textAlign: "center" }}>Reps</div>
        <div style={{ textAlign: "center" }}>Préc.</div>
        <div style={{ textAlign: "center" }}>RIR</div>
        <div />
      </div>

      {/* Tours */}
      <div style={{ padding: "0 14px 10px" }}>
        {Array.from({ length: rounds }, (_, r) => {
          const roundMembers = members.filter((m) => m.sets[r]);
          const roundDone = roundMembers.length > 0 && roundMembers.every((m) => m.sets[r]?.done || m.sets[r]?.skipped);
          return (
            <div key={r}>
              {/* Label tour */}
              <div style={{ padding: "6px 0 2px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  color: roundDone ? C.g : SS_ORANGE,
                  background: roundDone ? C.gS : hexToRgba(SS_ORANGE, 0.12),
                  borderRadius: 5, padding: "1px 8px",
                }}>
                  Série {r + 1}
                </span>
                <span style={{ fontSize: 9, color: C.tx3 }}>
                  {roundMembers.map((_, i) => SS_LETTERS[i]).join(" → ")} sans repos
                </span>
              </div>

              {/* Une série de chaque exo, enchaînées */}
              {roundMembers.map((m, mi) => (
                <SetRow
                  key={m.id}
                  setIdx={r}
                  state={m.sets[r]}
                  prevStr={m.prevSets[r] ?? "—"}
                  chargeUnit={m.params.charge_unit}
                  isIso={m.isIso}
                  indexLabel={SS_LETTERS[mi]}
                  indexColor={SS_ORANGE}
                  onToggle={() => m.onToggle(r)}
                  onOpenPad={(field) => m.onOpenPad(r, field)}
                  isCompleted={!canEdit}
                />
              ))}

              {/* Repos après le tour (pas après le dernier) */}
              {r < rounds - 1 && (
                <InlineRestStrip
                  myKey={`ss:${groupKey}:${r}`}
                  seconds={stripSec}
                  label="repos"
                  activeKey={restActiveKey}
                  left={restLeft}
                  total={restTotal}
                  onStart={() => onStartRest(`ss:${groupKey}:${r}`, restSec)}
                  onStop={onStopRest}
                  canEdit={canEdit}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Commentaires par exercice (même stockage que ExerciceCard) */}
      {(canEdit || members.some((m) => m.comment)) && (
        <SupersetComments members={members} canEdit={canEdit} />
      )}
    </div>
  );
}

function SupersetComments({ members, canEdit }: { members: SupersetMemberData[]; canEdit: boolean }) {
  const [open, setOpen] = useState<string[]>([]);
  return (
    <div style={{ padding: "6px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      {members.map((m, mi) => {
        const shown = open.includes(m.id) || !!m.comment;
        if (!shown && !canEdit) return null;
        return shown ? (
          <div key={m.id}>
            <div style={{ fontSize: 9, fontWeight: 700, color: SS_ORANGE, marginBottom: 3 }}>
              {SS_LETTERS[mi]} · {m.name}
            </div>
            <textarea
              value={m.comment}
              onChange={(e) => m.onCommentChange(e.target.value)}
              readOnly={!canEdit}
              placeholder="Commentaire sur cet exercice…"
              rows={2}
              style={{
                width: "100%", background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 4,
                padding: "8px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit",
                outline: "none", resize: "none", boxSizing: "border-box",
              }}
            />
          </div>
        ) : (
          <button
            key={m.id}
            onClick={() => setOpen((o) => [...o, m.id])}
            style={{
              padding: "8px 0", minHeight: 36, borderRadius: 7, border: `1px dashed ${C.brdL}`,
              background: "transparent", color: C.tx3, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Commentaire {SS_LETTERS[mi]} · {m.name}
          </button>
        );
      })}
    </div>
  );
}

/** Commentaire d'un exercice « libre » (sous la case à cocher, hors zone cliquable). */
function LibreComment({ comment, canEdit, onChange }: { comment: string; canEdit: boolean; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !comment) return null;
  if (!open && !comment) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", marginTop: 6, padding: "8px 0", minHeight: 36, borderRadius: 7,
          border: `1px dashed ${C.brdL}`, background: "transparent", color: C.tx3,
          fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Commentaire
      </button>
    );
  }
  return (
    <textarea
      value={comment}
      onChange={(e) => onChange(e.target.value)}
      readOnly={!canEdit}
      placeholder="Commentaire sur cet exercice…"
      rows={2}
      style={{
        width: "100%", marginTop: 6, background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 4,
        padding: "8px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit",
        outline: "none", resize: "none", boxSizing: "border-box",
      }}
    />
  );
}

// ── ExerciceCard ───────────────────────────────────────────────────────────────

interface ExerciceCardProps {
  exId: string;
  name: string;
  muscle?: string;
  prescription: string;
  coachComment?: string;
  youtubeId?: string;
  onShowVideo?: () => void;
  supersetTag?: string;
  params: ExerciceParams;
  sets: SetState[];
  prevSets: string[];
  comment: string;
  canEdit: boolean;
  blocColor: string;
  timingMode: string;
  blocRestSec: number;
  blocRestLabel: string;
  restActiveKey: string | null;
  restLeft: number | null;
  restTotal: number;
  onToggle: (setIdx: number) => void;
  onOpenPad: (setIdx: number, field: "kg" | "reps" | "rir") => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onCommentChange: (c: string) => void;
  onStartRest: (key: string, sec: number) => void;
  onStopRest: () => void;
}

function ExerciceCard({
  exId,
  name,
  muscle,
  prescription,
  coachComment,
  youtubeId,
  onShowVideo,
  supersetTag,
  params,
  sets,
  prevSets,
  comment,
  canEdit,
  timingMode,
  blocColor,
  blocRestSec,
  blocRestLabel,
  restActiveKey,
  restLeft,
  restTotal,
  onToggle,
  onOpenPad,
  onAddSet,
  onRemoveSet,
  onCommentChange,
  onStartRest,
  onStopRest,
}: ExerciceCardProps) {
  const [showComment, setShowComment] = useState(false);
  const isPDC = params.charge_unit === "PDC";
  const isIso = params.reps_mode?.mode === "global" && params.reps_mode.value === "iso";
  const doneSets = sets.filter((s) => s.done).length;
  // For cluster: cluster.recup_sec is intra-cluster rest (shown as badge); inter-set rest = bloc rest
  const restSec = blocRestSec;
  const restLabel = blocRestLabel;
  // stripSec: InlineRestStrip only for repos timing (bloc-level) — not for depart, cluster-only
  // or superset members (rest is taken at the end of each round, not between own sets)
  const stripSec = timingMode === "repos" && !supersetTag ? blocRestSec : 0;
  const totalSets = sets.length;
  const allDone = doneSets === totalSets && totalSets > 0;

  return (
    <div
      style={{
        background: C.s1,
        borderRadius: 6,
        border: `1px solid ${C.brd}`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "11px 14px 8px",
          borderBottom: `1px solid ${C.brd}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: C.tx,
              }}
            >
              {name}
            </div>
          </div>
          {youtubeId && onShowVideo && (
            <button
              onClick={onShowVideo}
              title="Voir la vidéo de l'exercice"
              style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                border: `1px solid ${hexToRgba(ACCENT, 0.4)}`,
                background: hexToRgba(ACCENT, 0.12), color: ACCENT,
                fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}
            ></button>
          )}
          {doneSets > 0 && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: allDone ? C.g : C.tx3,
                background: allDone ? C.gS : C.s2,
                padding: "2px 8px",
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              {doneSets}/{totalSets} ✓
            </div>
          )}
        </div>
        {/* Badge row */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {supersetTag && <BadgeTag label={supersetTag} color="#F5A623" />}
          <BadgeTag label={prescription} color={ACCENT} />
          {muscle && <BadgeTag label={muscle} color={blocColor} />}
        </div>
        {/* Coach comment */}
        {coachComment && (
          <div style={{ marginTop: 5, fontSize: 10, color: C.tx2, fontStyle: "italic", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg>{coachComment}
          </div>
        )}
      </div>

      {/* Cluster info strip */}
      {params.cluster && (() => {
        const c = params.cluster;
        const safeReps = Array.isArray(c.reps) ? c.reps : Array(c.nb_clusters).fill(5);
        return (
          <div style={{
            padding: "5px 14px",
            borderBottom: `1px solid ${C.brd}`,
            background: "rgba(245,166,35,0.06)",
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#F5A623", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
              Cluster
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#F5A623", letterSpacing: 1 }}>
              {safeReps.join("+")}
            </span>
            <span style={{ fontSize: 9, color: C.tx3 }}>·  {c.recup_sec}s entre clusters</span>
          </div>
        );
      })()}

      {/* Column headers */}
      {params.cluster ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isPDC ? "26px 1fr 44px 34px" : "26px 1fr 1fr 44px 34px",
            gap: 4,
            padding: "4px 14px 2px",
            fontSize: 9,
            color: C.tx3,
            fontWeight: 600,
            letterSpacing: "0.4px",
            textTransform: "uppercase" as const,
          }}
        >
          <div style={{ textAlign: "center" }}>C#</div>
          {!isPDC && <div style={{ textAlign: "center" }}>Charge</div>}
          <div style={{ textAlign: "center" }}>Reps</div>
          <div style={{ textAlign: "center" }}>Préc.</div>
          <div />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isPDC
              ? "34px 1fr 1.15fr 0.9fr 40px"
              : "34px 1fr 1.15fr 1.15fr 0.9fr 40px",
            gap: 5,
            padding: "4px 14px 2px",
            fontSize: 9,
            color: C.tx3,
            fontWeight: 600,
            letterSpacing: "0.4px",
            textTransform: "uppercase" as const,
          }}
        >
          <div style={{ textAlign: "center" }}>#</div>
          {!isPDC && <div style={{ textAlign: "center" }}>Charge</div>}
          <div style={{ textAlign: "center" }}>{isIso ? "Durée (s)" : "Reps"}</div>
          <div style={{ textAlign: "center" }}>Préc.</div>
          <div style={{ textAlign: "center" }}>RIR</div>
          <div />
        </div>
      )}

      {/* Set rows */}
      <div style={{ padding: "0 14px" }}>
        {params.cluster ? (() => {
          const c = params.cluster;
          const nb = c.nb_clusters;
          const mainSetsCount = params.nb_series;
          const safeReps = Array.isArray(c.reps) ? c.reps : Array(nb).fill(5);
          return Array.from({ length: mainSetsCount }, (_, si) => {
            const clusterSets = sets.slice(si * nb, (si + 1) * nb);
            const allClusterDone = clusterSets.length > 0 && clusterSets.every((s) => s?.done || s?.skipped);
            const setStripKey = `${exId}:set${si}`;
            return (
              <div key={si} style={{ marginBottom: si < mainSetsCount - 1 ? 6 : 0 }}>
                {/* Main set label */}
                <div style={{
                  padding: "5px 0 2px",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    color: allClusterDone ? C.g : C.tx3,
                    background: allClusterDone ? C.gS : C.s2,
                    borderRadius: 5, padding: "1px 8px",
                  }}>
                    Série {si + 1}
                  </span>
                </div>
                {/* Cluster sub-rows */}
                {clusterSets.map((clusterState, ci) => {
                  const flatIdx = si * nb + ci;
                  const isLastCluster = ci === nb - 1;
                  return (
                    <div key={ci}>
                      <ClusterSubRow
                        clusterIdx={ci}
                        prescribedReps={safeReps[ci] ?? 5}
                        state={clusterState}
                        chargeUnit={params.charge_unit}
                        prevStr={prevSets[flatIdx] ?? ""}
                        canEdit={canEdit}
                        onToggle={() => onToggle(flatIdx)}
                        onOpenPad={() => onOpenPad(flatIdx, "kg")}
                      />
                      {!isLastCluster && c.recup_sec > 0 && (
                        <InlineRestStrip
                          myKey={`${exId}:${flatIdx}:cluster`}
                          seconds={c.recup_sec}
                          label="entre clusters"
                          activeKey={restActiveKey}
                          left={restLeft}
                          total={restTotal}
                          onStart={() => onStartRest(`${exId}:${flatIdx}:cluster`, c.recup_sec)}
                          onStop={onStopRest}
                          canEdit={canEdit}
                        />
                      )}
                    </div>
                  );
                })}
                {/* Inter-set rest after each complete set (not after last) */}
                {si < mainSetsCount - 1 && (
                  <InlineRestStrip
                    myKey={setStripKey}
                    seconds={stripSec}
                    label={restLabel}
                    activeKey={restActiveKey}
                    left={restLeft}
                    total={restTotal}
                    onStart={() => onStartRest(setStripKey, restSec)}
                    onStop={onStopRest}
                    canEdit={canEdit}
                  />
                )}
              </div>
            );
          });
        })() : sets.map((s, i) => {
          const stripKey = `${exId}:${i}`;
          return (
            <div key={i}>
              <SetRow
                setIdx={i}
                state={s}
                prevStr={prevSets[i] ?? "—"}
                chargeUnit={params.charge_unit}
                isIso={isIso}
                onToggle={() => onToggle(i)}
                onOpenPad={(field) => onOpenPad(i, field)}
                isCompleted={!canEdit}
                canRemove={canEdit && i >= params.nb_series}
                onRemoveSet={canEdit && i >= params.nb_series ? () => onRemoveSet(i) : undefined}
              />
              <InlineRestStrip
                myKey={stripKey}
                seconds={stripSec}
                label={restLabel}
                activeKey={restActiveKey}
                left={restLeft}
                total={restTotal}
                onStart={() => onStartRest(stripKey, restSec)}
                onStop={onStopRest}
                canEdit={canEdit}
              />
            </div>
          );
        })}
      </div>

      {/* Comment + bonus set */}
      {canEdit && (
        <div style={{ padding: "6px 14px 12px" }}>
          {(showComment || comment) && (
            <textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Commentaire sur cet exercice…"
              rows={2}
              style={{
                width: "100%",
                background: C.s2,
                border: `1px solid ${C.brdL}`,
                borderRadius: 4,
                padding: "8px 10px",
                color: C.tx,
                fontSize: 12,
                fontFamily: "inherit",
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
                marginBottom: 6,
              }}
            />
          )}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: showComment || comment ? 0 : 6,
            }}
          >
            {!showComment && !comment && (
              <button
                onClick={() => setShowComment(true)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 7,
                  border: `1px dashed ${C.brdL}`,
                  background: "transparent",
                  color: C.tx3,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg>Commentaire
              </button>
            )}
            {!params.cluster && <button
              onClick={onAddSet}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 7,
                border: "1px dashed rgba(245,158,11,0.5)",
                background: "rgba(245,158,11,0.05)",
                color: "#F59E0B",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + Série bonus
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── NumPad ─────────────────────────────────────────────────────────────────────

interface NumPadProps {
  target: PadTarget;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function NumPad({ target, value, onChange, onConfirm, onClose }: NumPadProps) {
  const baseCfg = FIELD_CFG[target.field];
  const cfg = target.field === "reps" && target.isIso
    ? { ...baseCfg, label: "Durée", unit: "sec" }
    : baseCfg;

  function step(delta: number) {
    const v = parseFloat(value.replace(",", ".")) || 0;
    const next = Math.max(0, v + delta);
    if (target.field === "kg") {
      const rounded = Math.round(next * 4) / 4;
      onChange(String(rounded).replace(".", ","));
    } else {
      onChange(String(Math.max(0, Math.round(next))));
    }
  }

  function press(key: string) {
    if (key === "←") {
      onChange(value.slice(0, -1));
    } else if (key === ",") {
      if (!value.includes(",")) onChange(value + ",");
    } else {
      onChange(value + key);
    }
  }

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "←"];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 41,
          background: C.s1,
          borderRadius: "6px 6px 0 0",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        {/* Label + value display */}
        <div style={{ padding: "16px 20px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.tx3, fontWeight: 600, marginBottom: 4 }}>
            {cfg.label}
            {cfg.unit ? ` (${cfg.unit})` : ""}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: ACCENT,
              letterSpacing: "1px",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {value || <span style={{ color: C.tx3, fontWeight: 400, fontSize: 22 }}>—</span>}
          </div>
        </div>

        {/* Steppers */}
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
          {cfg.steps.map((s) => (
            <button
              key={s}
              onClick={() => step(s)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 4,
                border: `1px solid ${C.brdL}`,
                background: C.s2,
                color: s < 0 ? ACCENT_ALT : ACCENT,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {s > 0 ? `+${s}` : s}
            </button>
          ))}
        </div>

        {/* Keyboard */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            padding: "0 12px 8px",
          }}
        >
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              style={{
                padding: "14px 0",
                borderRadius: 4,
                border: `1px solid ${C.brdL}`,
                background: k === "←" ? hexToRgba(ACCENT_ALT, 0.1) : C.s2,
                color: k === "←" ? ACCENT_ALT : C.tx,
                fontSize: k === "←" ? 18 : 16,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Confirm */}
        <div style={{ padding: "4px 12px 28px" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%",
              padding: "14px 0",
              borderRadius: 6,
              border: "none",
              background: ACCENT,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Valider
          </button>
        </div>
      </div>
    </>
  );
}

// ── RirPicker ──────────────────────────────────────────────────────────────────

const RIR_ITEMS: Array<{ val: string; label: string; desc: string }> = [
  { val: "0",   label: "0",    desc: "Échec" },
  { val: "0.5", label: "0,5",  desc: "Quasi échec" },
  { val: "1",   label: "1",    desc: "Très difficile" },
  { val: "1.5", label: "1,5",  desc: "Difficile" },
  { val: "2",   label: "2",    desc: "Modéré" },
  { val: "2.5", label: "2,5",  desc: "" },
  { val: "3",   label: "3",    desc: "Confortable" },
  { val: "3.5", label: "3,5",  desc: "" },
  { val: "4",   label: "4",    desc: "Facile" },
  { val: "4.5", label: "4,5",  desc: "" },
  { val: "5",   label: "5",    desc: "Très facile" },
  { val: "5+",  label: "5+",   desc: "Aucun effort" },
];

function getRirColor(val: string): string {
  const n = val === "5+" ? 6 : parseFloat(val);
  if (n <= 0.5) return "#EF4444";
  if (n <= 1.5) return "#F97316";
  if (n <= 2.5) return "#FACC15";
  if (n <= 3.5) return "#84CC16";
  if (n <= 4.5) return "#22C55E";
  if (n <= 5)   return "#66F03C";
  return "#3B9EFF";
}

interface RirPickerProps {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function RirPicker({ value, onChange, onConfirm, onClose }: RirPickerProps) {
  const selectedItem = RIR_ITEMS.find((r) => r.val === value);
  const selColor = value ? getRirColor(value) : ACCENT;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 41,
          background: C.s1, borderRadius: "6px 6px 0 0",
          maxWidth: 480, margin: "0 auto",
        }}
      >
        {/* Label + selected value display */}
        <div style={{ padding: "16px 20px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.tx3, fontWeight: 600, marginBottom: 4 }}>
            RIR — Reps en réserve
          </div>
          <div
            style={{
              fontSize: 36, fontWeight: 900, color: selColor,
              minHeight: 44, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10,
            }}
          >
            {value ? (
              <>
                <span>{selectedItem?.label ?? value}</span>
                {selectedItem?.desc && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.tx3 }}>
                    {selectedItem.desc}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: C.tx3, fontWeight: 400, fontSize: 22 }}>—</span>
            )}
          </div>
        </div>

        {/* 4-column grid of RIR values */}
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6, padding: "0 12px 8px",
          }}
        >
          {RIR_ITEMS.map((item) => {
            const color = getRirColor(item.val);
            const selected = value === item.val;
            return (
              <button
                key={item.val}
                onClick={() => onChange(item.val)}
                style={{
                  height: 52, borderRadius: 4,
                  border: `2px solid ${selected ? color : hexToRgba(color, 0.3)}`,
                  background: selected ? hexToRgba(color, 0.2) : hexToRgba(color, 0.07),
                  color: selected ? color : C.tx2,
                  fontSize: 15, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 120ms",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Confirm */}
        <div style={{ padding: "4px 12px 28px" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 6,
              border: "none",
              background: value ? selColor : C.s2,
              color: value ? "#fff" : C.tx3,
              fontSize: 14, fontWeight: 700,
              cursor: value ? "pointer" : "default", fontFamily: "inherit",
            }}
          >
            Valider
          </button>
        </div>
      </div>
    </>
  );
}

// ── RestTimer ──────────────────────────────────────────────────────────────────

interface RestTimerProps {
  left: number;
  total: number;
  nextInfo: string | null;
  loop?: boolean;
  onDismiss: () => void;
}

function RestTimer({ left, total, nextInfo, loop, onDismiss }: RestTimerProps) {
  const offset = RING_C * (1 - left / total);
  const isUrgent = left <= 10;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        bottom: 90,
        right: 16,
        zIndex: 30,
        background: C.s1,
        borderRadius: 6,
        border: `1px solid ${isUrgent ? ACCENT_ALT : C.brdL}`,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        maxWidth: 220,
      }}
    >
      {/* SVG ring */}
      <div style={{ flexShrink: 0 }}>
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle
            cx={22} cy={22} r={RING_R}
            fill="none" stroke={C.brd} strokeWidth={3}
          />
          <circle
            cx={22} cy={22} r={RING_R}
            fill="none"
            stroke={isUrgent ? ACCENT_ALT : ACCENT}
            strokeWidth={3}
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
          <text
            x={22} y={22}
            textAnchor="middle"
            dominantBaseline="central"
            fill={isUrgent ? ACCENT_ALT : C.tx}
            fontSize={10}
            fontWeight={700}
            fontFamily="inherit"
          >
            {left}s
          </text>
        </svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{loop ? "Départ ∞" : "Repos"}</div>
        {nextInfo && (
          <div
            style={{
              fontSize: 9,
              color: C.tx3,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 130,
            }}
          >
            Suiv. : {nextInfo}
          </div>
        )}
        <div style={{ fontSize: 9, color: C.tx3, marginTop: 2 }}>Tap pour ignorer</div>
      </div>
    </div>
  );
}

// ── FinishDialog ───────────────────────────────────────────────────────────────

interface FinishDialogProps {
  blocs: WorkoutBlocData[];
  allSets: AllSets;
  sessionComment: string;
  sessionForme: number | undefined;
  onCommentChange: (c: string) => void;
  onFormeChange: (f: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  completing: boolean;
}

function FinishDialog({
  blocs,
  allSets,
  sessionComment,
  sessionForme,
  onCommentChange,
  onFormeChange,
  onConfirm,
  onClose,
  completing,
}: FinishDialogProps) {
  let totalSets = 0, doneSets = 0, skippedSets = 0;
  for (const bloc of blocs) {
    for (const ex of bloc.exercices) {
      const exSets = allSets[ex.id] ?? [];
      totalSets += exSets.length;
      doneSets += exSets.filter((s) => s?.done).length;
      skippedSets += exSets.filter((s) => s?.skipped).length;
    }
  }

  const FORME_LABELS = ["1", "2", "3", "4", "5"];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 50,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 51,
          background: C.bg,
          borderRadius: "6px 6px 0 0",
          padding: "24px 20px 40px",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: C.tx,
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          Terminer la séance ?
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              textAlign: "center",
              background: C.gS,
              borderRadius: 6,
              padding: "8px 16px",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, color: C.g }}>{doneSets}</div>
            <div style={{ fontSize: 9, color: C.g }}>Séries ok</div>
          </div>
          {skippedSets > 0 && (
            <div
              style={{
                textAlign: "center",
                background: hexToRgba(ACCENT_ALT, 0.1),
                borderRadius: 6,
                padding: "8px 16px",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, color: ACCENT_ALT }}>{skippedSets}</div>
              <div style={{ fontSize: 9, color: ACCENT_ALT }}>Passées</div>
            </div>
          )}
          <div
            style={{
              textAlign: "center",
              background: C.s1,
              borderRadius: 6,
              padding: "8px 16px",
              border: `1px solid ${C.brd}`,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, color: C.tx }}>{totalSets}</div>
            <div style={{ fontSize: 9, color: C.tx3 }}>Total</div>
          </div>
        </div>

        {/* Forme */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.tx3,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 8,
            }}
          >
            État de forme
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {FORME_LABELS.map((emoji, i) => (
              <button
                key={i}
                onClick={() => onFormeChange(i + 1)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  borderRadius: 4,
                  border: `1px solid ${sessionForme === i + 1 ? ACCENT : C.brdL}`,
                  background:
                    sessionForme === i + 1 ? hexToRgba(ACCENT, 0.15) : C.s2,
                  fontSize: 18,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  minHeight: 44,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <textarea
          value={sessionComment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Comment s'est passée la séance ?"
          rows={2}
          style={{
            width: "100%",
            background: C.s2,
            border: `1px solid ${C.brdL}`,
            borderRadius: 4,
            padding: "10px 12px",
            color: C.tx,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            resize: "none",
            boxSizing: "border-box",
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 6,
              border: `1px solid ${C.brdL}`,
              background: "transparent",
              color: C.tx2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Continuer
          </button>
          <button
            onClick={onConfirm}
            disabled={completing}
            style={{
              flex: 2,
              padding: "12px 0",
              borderRadius: 6,
              border: "none",
              background: ACCENT,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: completing ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: completing ? 0.7 : 1,
            }}
          >
            {completing ? "Enregistrement…" : "Terminer ✓"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── RPE sheet ──────────────────────────────────────────────────────────────────

function RpeSheetForLog({
  workoutLogId,
  onClose,
}: {
  workoutLogId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { athleteId } = useAthleteContext();
  const [rpe, setRpe] = useState<number | null>(null);

  const { mutate: saveRpe, isPending } = useMutation({
    mutationFn: async (rpeScore: number) => {
      // supabase-js ne lève pas : sans lire `error`, un RPE refusé fermait la
      // feuille comme si tout s'était bien passé et la note était perdue.
      const { error: logErr } = await supabase
        .from("workout_logs")
        .update({ rpe_score: rpeScore })
        .eq("id", workoutLogId);
      if (logErr) throw logErr;
      const { error: rpeErr } = await supabase.from("workout_rpe").upsert({
        workout_log_id: workoutLogId,
        athlete_id: athleteId ?? "",
        rpe_score: rpeScore,
      });
      if (rpeErr) throw rpeErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-log-detail", workoutLogId] });
      onClose();
    },
    onError: () => {
      toast.error("RPE non enregistré — vérifie ta connexion");
    },
  });

  const RPE_ITEMS: Array<{ v: number; label: string; color: string }> = [
    { v: 1,  label: "Très léger",  color: "#22C55E" },
    { v: 2,  label: "Léger",       color: "#4ADE80" },
    { v: 3,  label: "Facile",      color: "#84CC16" },
    { v: 4,  label: "Modéré",      color: "#FACC15" },
    { v: 5,  label: "Rythme",      color: "#F59E0B" },
    { v: 6,  label: "Intense",     color: "#FF9500" },
    { v: 7,  label: "Dur",         color: "#F97316" },
    { v: 8,  label: "Très dur",    color: "#EF4444" },
    { v: 9,  label: "Quasi max",   color: "#DC2626" },
    { v: 10, label: "Maximum",     color: "#991B1B" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: C.bg,
          borderRadius: "6px 6px 0 0",
          padding: "24px 20px 40px",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: C.tx,
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          Séance terminée !
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.tx3,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Effort global perçu ? (RPE)
        </div>
        {/* 2 rows of 5 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 6,
            marginBottom: 20,
          }}
        >
          {RPE_ITEMS.map(({ v, label, color }) => {
            const selected = rpe === v;
            return (
              <button
                key={v}
                onClick={() => setRpe(v)}
                style={{
                  height: 56,
                  borderRadius: 4,
                  border: `2px solid ${selected ? color : hexToRgba(color, 0.35)}`,
                  background: selected ? hexToRgba(color, 0.22) : hexToRgba(color, 0.07),
                  color: selected ? color : C.tx2,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  transition: "all 120ms",
                  padding: "3px 2px",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1, color: selected ? color : C.tx }}>{v}</span>
                <span style={{ fontSize: 8, fontWeight: 600, lineHeight: 1.2, color: selected ? color : C.tx3, textAlign: "center" as const }}>{label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 6,
              border: `1px solid ${C.brdL}`,
              background: "transparent",
              color: C.tx2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Passer
          </button>
          <button
            onClick={() => rpe != null && saveRpe(rpe)}
            disabled={rpe == null || isPending}
            style={{
              flex: 2,
              padding: "12px 0",
              borderRadius: 6,
              border: "none",
              background: rpe != null ? (RPE_ITEMS.find(r => r.v === rpe)?.color ?? ACCENT) : C.s2,
              color: rpe != null ? "#fff" : C.tx3,
              fontSize: 13,
              fontWeight: 700,
              cursor: rpe != null ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            {isPending ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { athleteId } = useAthleteContext();
  const qc = useQueryClient();

  const workout = useWorkoutSession(id);
  const { save: saveWorkoutSets, flushNow: flushWorkoutSets } = useSaveWorkoutSets(id);

  // ── State ────────────────────────────────────────────────────────────────
  const [sets, setSets] = useState<AllSets>({});
  const [setsInit, setSetsInit] = useState(false);
  const [localMods, setLocalMods] = useState<AthleteModifications>({});
  const [padTarget, setPadTarget] = useState<PadTarget | null>(null);
  const [padVal, setPadVal] = useState("");
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(REST_DEFAULT);
  const [restNextInfo, setRestNextInfo] = useState<string | null>(null);
  const [restActiveKey, setRestActiveKey] = useState<string | null>(null);
  const [showFinish, setShowFinish] = useState(false);
  const [showRpe, setShowRpe] = useState(false);
  const [videoModal, setVideoModal] = useState<{ name: string; ytId: string } | null>(null);
  const [elapsed, setElapsed] = useState(() => {
    // Recover elapsed from persisted startedAt
    const stored = localStorage.getItem("activeWorkoutSession");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.id === id && parsed.startedAt) {
          return Math.floor((Date.now() - parsed.startedAt) / 1000);
        }
      } catch { /* ignore */ }
    }
    return 0;
  });

  const restRef = useRef<ReturnType<typeof setInterval>>();
  const elapsedRef = useRef<ReturnType<typeof setInterval>>();
  const loopRef = useRef(false);
  const restSecondsRef = useRef(REST_DEFAULT);

  // ── Collect all exIds for usePrevWorkoutSets ─────────────────────────────
  const allExIds = useMemo(
    () => workout.blocs.flatMap((b) => b.exercices.map((e) => e.id)),
    [workout.blocs],
  );

  const prevSets = usePrevWorkoutSets(
    workout.sessionId,
    workout.workoutLogId,
    allExIds,
    workout.weekNumber,
    workout.scheduledDate,
  );

  // ── Vidéos banque d'exercices (exercise_id → youtube_id) ─────────────────
  const bankExerciseIds = useMemo(
    () => [...new Set(workout.blocs.flatMap((b) => b.exercices.map((e) => e.exercise_id).filter((x): x is string => !!x)))],
    [workout.blocs],
  );
  const { data: videoMap = {} } = useExerciseVideos(bankExerciseIds);

  // ── Init + resync des séries dès que la séance change ────────────────────
  // Cet effet ne s'exécute pas qu'une fois : les blocs peuvent changer APRÈS le
  // premier rendu (semaine résolue par une requête plus lente, programme modifié
  // par le coach et refetch au retour sur l'onglet…). Avec l'ancienne init
  // "une seule fois", un exercice apparu ensuite n'avait aucune ligne dans
  // `sets` → le clic renvoyait un SetState vide → crash à la sauvegarde.
  // La saisie en cours n'est jamais écrasée et aucune ligne n'est supprimée.
  useEffect(() => {
    if (workout.isLoading) return;

    const base = workout.athleteModifications ?? {};
    const savedSets = base.sessionSets ?? {};

    setSets((prev) => {
      const next: AllSets = { ...prev };
      let changed = false;

      for (const bloc of workout.blocs) {
        for (const ex of bloc.exercices) {
          const rows = buildExSets(ex, savedSets[ex.id], prev[ex.id]);
          if (!sameSets(rows, prev[ex.id])) {
            next[ex.id] = rows;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });

    if (!setsInit) {
      setLocalMods(base);
      setSetsInit(true);
    }
  }, [workout.isLoading, workout.blocs, workout.athleteModifications, setsInit]);

  // ── Backfill empty cells from prevSets once they load ───────────────────
  useEffect(() => {
    if (!setsInit || Object.keys(prevSets).length === 0) return;
    setSets((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [exId, exSets] of Object.entries(next)) {
        const prevEx = prevSets[exId];
        if (!prevEx) continue;
        const updated = exSets.map((raw, i) => {
          const s = raw ?? normalizeSet(raw);
          if (s.done || s.skipped) return s;
          const prevStr = prevEx[i] ?? "";
          if (!prevStr) return s;
          let newS = { ...s };
          let dirty = false;
          if (!newS.kg) {
            const v = parsePrevVal(prevStr, "kg");
            if (v) { newS.kg = v; dirty = true; }
          }
          if (!newS.reps) {
            const v = parsePrevVal(prevStr, "reps");
            if (v) { newS.reps = v; dirty = true; }
          }
          return dirty ? newS : s;
        });
        if (updated.some((s, i) => s !== exSets[i])) {
          next[exId] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [setsInit, prevSets]);

  // ── Ouverture directe du dialogue de fin (?finish=1) ─────────────────────
  // Utilisé par le bandeau "séance non terminée" : l'athlète arrive
  // directement sur la clôture, sans avoir à retrouver le bouton.
  const finishRequested = searchParams.get("finish") === "1";
  const finishAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!finishRequested || finishAutoOpenedRef.current) return;
    if (workout.isLoading || workout.status === "completed") return;
    finishAutoOpenedRef.current = true;
    setShowFinish(true);
  }, [finishRequested, workout.isLoading, workout.status]);

  // ── Session timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (workout.status === "completed") return;
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(elapsedRef.current);
  }, [workout.status]);

  // ── Persist active session to localStorage (timer + "revenir" button) ──
  useEffect(() => {
    if (!id || workout.isLoading) return;
    if (workout.status === "completed") {
      localStorage.removeItem("activeWorkoutSession");
      return;
    }
    const stored = localStorage.getItem("activeWorkoutSession");
    let startedAt = Date.now();
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.id === id && parsed.startedAt) startedAt = parsed.startedAt;
      } catch { /* ignore */ }
    }
    localStorage.setItem("activeWorkoutSession", JSON.stringify({
      id,
      name: workout.sessionName,
      startedAt,
    }));
  }, [id, workout.isLoading, workout.status, workout.sessionName]);

  // ── Flush save on unmount + visibility change ──────────────────────────
  const setsRef = useRef(sets);
  const localModsRef = useRef(localMods);
  setsRef.current = sets;
  localModsRef.current = localMods;

  useEffect(() => {
    // Écriture IMMÉDIATE : sur `visibilitychange` l'onglet part en arrière-plan
    // et le navigateur mobile gèle ses timers. Un enregistrement débouncé ne
    // partirait jamais si le système tuait l'onglet dans la foulée.
    const flush = () => {
      if (!id || workout.status === "completed") return;
      const mods = allSetsToMods(setsRef.current, localModsRef.current);
      flushWorkoutSets(mods);
    };
    const onVisChange = () => { if (document.hidden) flush(); };
    document.addEventListener("visibilitychange", onVisChange);
    // `pagehide` couvre la fermeture d'onglet et le retour arrière iOS, cas où
    // `visibilitychange` n'est pas garanti.
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pagehide", flush);
      flush(); // flush on unmount
    };
  }, [id, workout.status, flushWorkoutSets]);

  // ── Inactivity reminder (10 min without interaction) ───────────────────
  const lastActivityRef = useRef(Date.now());
  const [showInactiveReminder, setShowInactiveReminder] = useState(false);

  // Reset activity timestamp on any set change
  useEffect(() => { lastActivityRef.current = Date.now(); setShowInactiveReminder(false); }, [sets]);

  useEffect(() => {
    if (workout.status === "completed") return;
    const CHECK_INTERVAL = 30_000; // check every 30s
    const INACTIVE_THRESHOLD = 10 * 60 * 1000; // 10 min
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVE_THRESHOLD) {
        setShowInactiveReminder(true);
      }
    }, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [workout.status]);

  // ── Rest timer helpers ───────────────────────────────────────────────────
  const stopRest = useCallback(() => {
    clearInterval(restRef.current);
    loopRef.current = false;
    setRestLeft(null);
    setRestActiveKey(null);
  }, []);

  const startRest = useCallback((seconds: number, nextInfo: string | null, activeKey?: string, loop = false) => {
    clearInterval(restRef.current);
    loopRef.current = loop;
    restSecondsRef.current = seconds;
    setRestTotal(seconds);
    setRestLeft(seconds);
    setRestNextInfo(nextInfo);
    setRestActiveKey(activeKey ?? null);
    restRef.current = setInterval(() => {
      setRestLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (loopRef.current) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            return restSecondsRef.current; // relance automatique
          }
          clearInterval(restRef.current);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Persist helper ───────────────────────────────────────────────────────
  const persist = useCallback(
    (newSets: AllSets, mods: AthleteModifications) => {
      const next = allSetsToMods(newSets, mods);
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  // ── Toggle 3-state checkmark ─────────────────────────────────────────────
  const toggleAndPersist = useCallback(
    (exId: string, setIdx: number, restSec: number, nextInfo: string | null, timingMode = "repos", blocId = "", blocExIds: string[] = [], clusterNb?: number, supersetExIds: string[] = []) => {
      // Un updater passé à setState doit rester pur : React peut le rejouer si
      // un rendu est abandonné. Démarrer un timer ou déclencher une écriture
      // réseau dedans expose à des doubles envois. On calcule donc l'état
      // suivant à partir du ref (déjà synchronisé à chaque rendu), puis on
      // applique les effets une seule fois, après.
      const prev = setsRef.current;
      const inSuperset = supersetExIds.length > 1;
      let justDone = false;
      let shouldStop = false;
      let restToStart: { seconds: number; info: string | null; key: string; loop: boolean } | null = null;

      const exSets = [...(prev[exId] ?? [])];
      // La ligne peut manquer si la structure a bougé entre le rendu et le clic
      while (exSets.length <= setIdx) exSets.push({ ...BLANK_SET });
      const s = normalizeSet(exSets[setIdx]);

      if (!s.done && !s.skipped) {
        const prevStr = prevSets[exId]?.[setIdx] ?? "";
        if (!s.kg && prevStr) s.kg = parsePrevVal(prevStr, "kg");
        if (!s.reps && prevStr) s.reps = parsePrevVal(prevStr, "reps");
        s.done = true;
        s.skipped = false;
        justDone = true;

        // Auto-fill ALL empty cluster sub-rows with the same charge
        if (clusterNb && s.kg) {
          for (let j = 0; j < exSets.length; j++) {
            const other = exSets[j];
            if (j !== setIdx && !other?.done && !other?.kg) {
              exSets[j] = { ...normalizeSet(other), kg: s.kg };
            }
          }
        }

        if (timingMode === "depart" && restSec > 0) {
          restToStart = { seconds: restSec, info: null, key: `depart:${blocId}`, loop: true };
        } else if (restSec > 0 && !inSuperset) {
          restToStart = { seconds: restSec, info: nextInfo, key: `${exId}:${setIdx}`, loop: false };
        }
      } else if (s.done) {
        s.done = false;
        s.skipped = true;
        if (timingMode !== "depart") shouldStop = true;
      } else {
        s.done = false;
        s.skipped = false;
      }

      exSets[setIdx] = s;
      const next = { ...prev, [exId]: exSets };

      // Superset: rest only at the end of a full round (one set of each linked
      // exercise done) — otherwise the athlete chains directly to the next exo.
      if (justDone && inSuperset && timingMode !== "depart" && restSec > 0) {
        const doneCount = (eid: string) =>
          (next[eid] ?? []).filter((ss) => ss.done || ss.skipped).length;
        const myCount = doneCount(exId);
        const roundDone = supersetExIds.every((eid) => doneCount(eid) >= myCount);
        if (roundDone) restToStart = { seconds: restSec, info: nextInfo, key: `${exId}:${setIdx}`, loop: false };
      }

      // Départ mode: stop looping timer when all bloc sets are done/skipped
      if (timingMode === "depart" && blocExIds.length > 0) {
        const allDone = blocExIds.every((eid) => {
          const eSets = next[eid] ?? [];
          return eSets.length > 0 && eSets.every((ss) => ss.done || ss.skipped);
        });
        if (allDone) shouldStop = true;
      }

      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);

      if (restToStart) startRest(restToStart.seconds, restToStart.info, restToStart.key, restToStart.loop);
      if (shouldStop) stopRest();
    },
    [prevSets, startRest, stopRest, saveWorkoutSets],
  );

  // ── Open NumPad ──────────────────────────────────────────────────────────
  const openPad = useCallback(
    (exId: string, setIdx: number, field: "kg" | "reps" | "rir", chargeUnit: string, clusterNb?: number, isIso?: boolean) => {
      const current = sets[exId]?.[setIdx];
      setPadTarget({ exId, setIdx, field, chargeUnit, clusterNb, isIso });
      setPadVal(current?.[field] ?? "");
    },
    [sets],
  );

  // ── Confirm NumPad ───────────────────────────────────────────────────────
  const confirmPad = useCallback(
    (value: string) => {
      if (!padTarget) return;
      const { exId, setIdx, field } = padTarget;

      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? [])];
      while (exSets.length <= setIdx) exSets.push({ ...BLANK_SET });
      const s = { ...normalizeSet(exSets[setIdx]), [field]: value };

      // Auto-validate: if not done/skipped, mark done
      if (!s.done && !s.skipped) {
        // If entering kg and reps still empty, autofill from prev
        if (field === "kg" && !s.reps && !padTarget.clusterNb) {
          const prevStr = prevSets[exId]?.[setIdx] ?? "";
          const prevReps = parsePrevVal(prevStr, "reps");
          if (prevReps) s.reps = prevReps;
        }
        s.done = true;

        // Auto-fill ALL empty cluster sub-rows with the same charge
        if (field === "kg" && padTarget.clusterNb && value) {
          for (let j = 0; j < exSets.length; j++) {
            const other = exSets[j];
            if (j !== setIdx && !other?.done && !other?.kg) {
              exSets[j] = { ...normalizeSet(other), kg: value };
            }
          }
        }
      }

      exSets[setIdx] = s;
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);

      setPadTarget(null);
      setPadVal("");
    },
    [padTarget, prevSets, saveWorkoutSets],
  );

  // ── Add bonus set ────────────────────────────────────────────────────────
  const addBonusSet = useCallback(
    (exId: string) => {
      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? []), { kg: "", reps: "", rir: "", done: false, skipped: false }];
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);
      haptic();
    },
    [saveWorkoutSets],
  );

  // ── Remove bonus set ─────────────────────────────────────────────────────
  const removeBonusSet = useCallback(
    (exId: string, setIdx: number) => {
      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? [])];
      exSets.splice(setIdx, 1);
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);
    },
    [saveWorkoutSets],
  );

  // ── Update comment / forme ───────────────────────────────────────────────
  const updateExComment = useCallback(
    (exId: string, comment: string) => {
      const prev = localModsRef.current;
      const next = {
        ...prev,
        exerciceComments: { ...(prev.exerciceComments ?? {}), [exId]: comment },
      };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  const updateSessionComment = useCallback(
    (comment: string) => {
      const next = { ...localModsRef.current, sessionComment: comment };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  const updateForme = useCallback(
    (forme: number) => {
      const next = { ...localModsRef.current, sessionForme: forme };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  // ── Reopen (cancel completion) ───────────────────────────────────────────
  const { mutate: reopenWorkout, isPending: reopening } = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { error } = await supabase
        .from("workout_logs")
        .update({ status: "planned", completed_at: null, rpe_score: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-log-detail", id] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", athleteId] });
      qc.invalidateQueries({ queryKey: ["activePlan", athleteId] });
      toast.success("Séance réouverte");
    },
    onError: () => toast.error("Erreur lors de la réouverture"),
  });

  // ── Complete workout ─────────────────────────────────────────────────────
  const { mutate: completeWorkout, isPending: completing } = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const finalMods = allSetsToMods(sets, localMods);
      const { error } = await supabase
        .from("workout_logs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          athlete_modifications: finalMods,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      localStorage.removeItem("activeWorkoutSession");
      qc.invalidateQueries({ queryKey: ["workout-log-detail", id] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", athleteId] });
      qc.invalidateQueries({ queryKey: ["activePlan", athleteId] });
      setShowFinish(false);
      setShowRpe(true);
      toast.success("Séance complétée ! ");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement");
    },
  });

  // ── Progress bar ─────────────────────────────────────────────────────────
  const { progTotal, progDone } = useMemo(() => {
    let total = 0, done = 0;
    for (const bloc of workout.blocs) {
      for (const ex of bloc.exercices) {
        const exSets = sets[ex.id] ?? [];
        total += exSets.length;
        done += exSets.filter((s) => s?.done || s?.skipped).length;
      }
    }
    return { progTotal: total, progDone: done };
  }, [sets, workout.blocs]);

  const isCompleted = workout.status === "completed";
  const canEdit = !isCompleted && !!id;

  // Toutes les séries traitées (validées ou passées) → on met en avant le bouton
  // "Terminer", moment où l'athlète oublie le plus souvent de clôturer.
  const allSetsHandled = useMemo(() => {
    const rows = Object.values(sets).flat();
    return rows.length > 0 && rows.every((s) => s?.done || s?.skipped);
    return rows.length > 0 && rows.every((s) => s.done || s.skipped);
  }, [sets]);

  // ── Early returns ────────────────────────────────────────────────────────
  if (workout.isLoading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.tx3, fontSize: 13 }}>
        Chargement…
      </div>
    );
  }
  if (!workout.workoutLogId) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.tx3, fontSize: 13 }}>
        Séance introuvable
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 140, scrollbarWidth: "none" }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: "12px 16px 0",
          position: "sticky",
          top: 45,
          background: C.bg,
          zIndex: 5,
          borderBottom: `1px solid ${C.brd}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              flexShrink: 0,
              border: `1px solid ${C.brdL}`,
              background: "transparent",
              color: C.tx3,
              fontSize: 16,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ←
          </button>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.tx3 }}>{workout.sessionShort}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>
              {workout.sessionName}
            </div>
            {workout.rescheduledByAthlete &&
              workout.originalScheduledDate &&
              workout.originalScheduledDate !== workout.scheduledDate && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 6,
                    marginTop: 3,
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#F59E0B",
                  }}
                >
                  Décalée du{" "}
                  {new Date(
                    workout.originalScheduledDate + "T12:00:00",
                  ).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
              )}
          </div>

          {/* Timer or "completed" badge */}
          {!isCompleted ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.tx3,
                background: C.s2,
                borderRadius: 4,
                padding: "4px 10px",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {formatElapsed(elapsed)}
            </div>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 6,
                background: C.gS,
                color: C.g,
                flexShrink: 0,
              }}
            >
              ✓ Complétée
            </span>
          )}
        </div>

        {/* Progress bar */}
        {!isCompleted && progTotal > 0 && (
          <div
            style={{
              height: 3,
              background: C.brd,
              borderRadius: 2,
              marginBottom: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round((progDone / progTotal) * 100)}%`,
                background: ACCENT,
                borderRadius: 2,
                transition: "width 300ms ease",
              }}
            />
          </div>
        )}
      </div>

      {/* ── Blocs ── */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Fiches de la séance (variante de la semaine) */}
        <FicheLinks
          title="Fiches de la séance"
          attachments={workout.sessionFiches}
          week={workout.weekNumber}
          athleteId={athleteId}
        />

        {workout.blocs.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: C.tx3,
              fontSize: 12,
            }}
          >
            Aucun exercice dans cette séance
          </div>
        ) : (
          workout.blocs.map((bloc, blocIdx) => {
            const bColor = bloc.color ?? BLOC_PALETTE[blocIdx % BLOC_PALETTE.length];
            const timing = timingLabel(bloc);
            const restSec = blocRestSeconds(bloc);

            return (
              <div key={bloc.id}>
                {/* Bloc header */}
                {(() => {
                  const departKey = `depart:${bloc.id}`;
                  const isDepart = bloc.timing_mode === "depart" && restSec > 0;
                  const isRunning = isDepart && restActiveKey === departKey && restLeft !== null;
                  const urgent = isRunning && restLeft !== null && restLeft <= 10;

                  function fmt(s: number) {
                    const m = Math.floor(s / 60);
                    const sec = s % 60;
                    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
                  }

                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        padding: "5px 10px 5px 12px",
                        borderRadius: 4,
                        background: hexToRgba(bColor, 0.08),
                        borderLeft: `3px solid ${bColor}`,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          background: hexToRgba(bColor, 0.18),
                          color: bColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {String.fromCharCode(65 + blocIdx)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: bColor, flex: 1, minWidth: 0 }}>
                        {bloc.name || `Bloc ${blocIdx + 1}`}
                      </div>
                      {timing && <BadgeTag label={timing} color={bColor} />}
                      {/* Depart inline chrono */}
                      {isDepart && canEdit && (
                        isRunning ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <span style={{
                              fontSize: 13,
                              fontWeight: 900,
                              color: urgent ? ACCENT_ALT : bColor,
                              fontVariantNumeric: "tabular-nums",
                              minWidth: 36,
                              textAlign: "right" as const,
                              transition: "color 300ms",
                            }}>
                              {fmt(restLeft!)}
                            </span>
                            <button
                              onClick={stopRest}
                              style={{
                                width: 22, height: 22, borderRadius: 6,
                                border: `1px solid ${hexToRgba(ACCENT_ALT, 0.5)}`,
                                background: hexToRgba(ACCENT_ALT, 0.12),
                                color: ACCENT_ALT, fontSize: 11, fontWeight: 700,
                                cursor: "pointer", fontFamily: "inherit",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 0, flexShrink: 0,
                              }}
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startRest(restSec, null, departKey, true)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "3px 8px", borderRadius: 6,
                              border: `1px solid ${hexToRgba(bColor, 0.4)}`,
                              background: hexToRgba(bColor, 0.12),
                              color: bColor, fontSize: 11, fontWeight: 700,
                              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                            }}
                          >
                            ▶ {fmt(restSec)}
                          </button>
                        )
                      )}
                    </div>
                  );
                })()}

                {bloc.instructions && (
                  <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45, whiteSpace: "pre-wrap", margin: "-2px 2px 8px" }}>
                    {bloc.instructions}
                  </div>
                )}

                {bloc.fiches && bloc.fiches.length > 0 && (
                  <div style={{ margin: "0 2px 8px" }}>
                    <FicheLinks compact attachments={bloc.fiches} week={workout.weekNumber} athleteId={athleteId} />
                  </div>
                )}

                {/* Exercices — colored background groups them visually as superset */}
                <div
                  style={{
                    background: hexToRgba(bColor, 0.05),
                    border: `1px solid ${hexToRgba(bColor, 0.2)}`,
                    borderRadius: 6,
                    padding: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {(() => {
                    // Superset chains: consecutive exercises linked via superset_with_next
                    const chains: number[][] = [];
                    let chain: number[] = [];
                    bloc.exercices.forEach((e, i) => {
                      chain.push(i);
                      if (!e.superset_with_next || i === bloc.exercices.length - 1) {
                        chains.push(chain);
                        chain = [];
                      }
                    });

                    return chains.map((ch) => {
                      const chainIds = ch.map((j) => bloc.exercices[j].id);
                      const isSS = ch.length > 1;
                      // Cluster/libre dans un superset : pas gérés par la carte tour-par-tour → cartes séparées
                      const hasComplex = ch.some((j) => bloc.exercices[j].mode === "libre" || bloc.exercices[j].params.cluster);

                      if (isSS && !hasComplex) {
                        const lastIdx = ch[ch.length - 1];
                        const afterEx = bloc.exercices[lastIdx + 1];
                        return (
                          <SupersetCard
                            key={chainIds[0]}
                            groupKey={chainIds[0]}
                            members={ch.map((j) => {
                              const ex = bloc.exercices[j];
                              const iso = ex.params.reps_mode?.mode === "global" && ex.params.reps_mode.value === "iso";
                              return {
                                id: ex.id,
                                name: ex.exercise_name,
                                muscle: ex.muscle,
                                prescription: formatPrescription(ex.params),
                                coachComment: ex.comment,
                                youtubeId: ex.exercise_id ? videoMap[ex.exercise_id] : undefined,
                                onShowVideo: () => {
                                  const ytId = ex.exercise_id ? videoMap[ex.exercise_id] : undefined;
                                  if (ytId) setVideoModal({ name: ex.exercise_name, ytId });
                                },
                                params: ex.params,
                                sets: sets[ex.id] ?? [],
                                prevSets: prevSets[ex.id] ?? [],
                                isIso: iso,
                                onToggle: (setIdx: number) =>
                                  toggleAndPersist(ex.id, setIdx, restSec, afterEx ? afterEx.exercise_name : null, bloc.timing_mode, bloc.id, bloc.exercices.map(e => e.id), undefined, chainIds),
                                onOpenPad: (setIdx: number, field: "kg" | "reps" | "rir") =>
                                  openPad(ex.id, setIdx, field, ex.params.charge_unit, undefined, iso),
                                comment: localMods.exerciceComments?.[ex.id] ?? "",
                                onCommentChange: (c: string) => updateExComment(ex.id, c),
                              };
                            })}
                            blocColor={bColor}
                            restSec={restSec}
                            timingMode={bloc.timing_mode}
                            restActiveKey={restActiveKey}
                            restLeft={restLeft}
                            restTotal={restTotal}
                            canEdit={canEdit}
                            onStartRest={(key, sec) => startRest(sec, null, key)}
                            onStopRest={stopRest}
                          />
                        );
                      }

                      // Exos seuls, ou chaîne superset avec cluster/libre → cartes individuelles
                      return (
                        <Fragment key={chainIds[0]}>
                        {ch.map((exIdx) => {
                    const ex = bloc.exercices[exIdx];
                    const nextEx = bloc.exercices[exIdx + 1];
                    const nextInfo = nextEx ? nextEx.exercise_name : null;
                    const supersetIds = isSS ? chainIds : [];
                    const ssPos = ch.indexOf(exIdx) + 1;

                    // Libre: pas de séries/reps — juste une case à cocher de validation
                    if (ex.mode === "libre") {
                      const s0 = (sets[ex.id] ?? [])[0];
                      const isDone = s0?.done ?? false;
                      const isSkipped = s0?.skipped ?? false;
                      return (
                        <div key={ex.id}>
                        <div
                          onClick={() => canEdit && toggleAndPersist(ex.id, 0, 0, null, "libre")}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 14px", borderRadius: 6,
                            background: isDone ? hexToRgba(GREEN, 0.06) : C.s1,
                            border: `1px solid ${isDone ? hexToRgba(GREEN, 0.35) : isSkipped ? hexToRgba(ACCENT_ALT, 0.4) : C.brd}`,
                            cursor: canEdit ? "pointer" : "default",
                            transition: "border-color 150ms, background 150ms",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 700,
                              color: isDone ? GREEN : C.tx,
                              textDecoration: isSkipped ? "line-through" : "none",
                            }}>
                              {ex.exercise_name || "Note libre"}
                            </div>
                            {ex.libre_text && (
                              <div style={{ fontSize: 12, color: C.tx2, marginTop: 3, whiteSpace: "pre-wrap" }}>
                                {ex.libre_text}
                              </div>
                            )}
                          </div>
                          <div style={{
                            width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${isDone ? GREEN : isSkipped ? ACCENT_ALT : C.brdL}`,
                            background: isDone ? hexToRgba(GREEN, 0.15) : isSkipped ? hexToRgba(ACCENT_ALT, 0.12) : "transparent",
                            color: isDone ? GREEN : ACCENT_ALT,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 900,
                          }}>
                            {isDone ? "✓" : isSkipped ? "✕" : ""}
                          </div>
                        </div>
                        <LibreComment
                          comment={localMods.exerciceComments?.[ex.id] ?? ""}
                          canEdit={canEdit}
                          onChange={(c) => updateExComment(ex.id, c)}
                        />
                        </div>
                      );
                    }

                    return (
                      <Fragment key={ex.id}>
                      <ExerciceCard
                        exId={ex.id}
                        name={ex.exercise_name}
                        muscle={ex.muscle}
                        prescription={formatPrescription(ex.params)}
                        coachComment={ex.comment}
                        youtubeId={ex.exercise_id ? videoMap[ex.exercise_id] : undefined}
                        onShowVideo={() => {
                          const ytId = ex.exercise_id ? videoMap[ex.exercise_id] : undefined;
                          if (ytId) setVideoModal({ name: ex.exercise_name, ytId });
                        }}
                        supersetTag={supersetIds.length ? `Superset ${ssPos}/${ch.length}` : undefined}
                        params={ex.params}
                        sets={sets[ex.id] ?? []}
                        prevSets={prevSets[ex.id] ?? []}
                        comment={localMods.exerciceComments?.[ex.id] ?? ""}
                        canEdit={canEdit}
                        timingMode={bloc.timing_mode}
                        blocColor={bColor}
                        blocRestSec={restSec}
                        blocRestLabel={bloc.timing_mode === "depart" ? "départ" : "repos"}
                        restActiveKey={restActiveKey}
                        restLeft={restLeft}
                        restTotal={restTotal}
                        onToggle={(setIdx) =>
                          toggleAndPersist(ex.id, setIdx, restSec, nextInfo, bloc.timing_mode, bloc.id, bloc.exercices.map(e => e.id), ex.params.cluster?.nb_clusters, supersetIds)
                        }
                        onOpenPad={(setIdx, field) =>
                          openPad(ex.id, setIdx, field, ex.params.charge_unit, ex.params.cluster?.nb_clusters, ex.params.reps_mode?.mode === "global" && ex.params.reps_mode.value === "iso")
                        }
                        onAddSet={() => addBonusSet(ex.id)}
                        onRemoveSet={(setIdx) => removeBonusSet(ex.id, setIdx)}
                        onCommentChange={(c) => updateExComment(ex.id, c)}
                        onStartRest={(key, sec) => startRest(sec, null, key)}
                        onStopRest={stopRest}
                      />
                      {/* Superset connector — no rest between linked exercises */}
                      {ex.superset_with_next && nextEx && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, margin: "-4px 0" }}>
                          <span style={{
                            padding: "1px 8px", borderRadius: 4,
                            background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.4)",
                            color: "#F5A623", fontSize: 9, fontWeight: 800,
                          }}>
                            enchaîner sans repos
                          </span>
                        </div>
                      )}
                      </Fragment>
                    );
                  })}
                        </Fragment>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })
        )}

        {/* Completed session comment */}
        {isCompleted && localMods.sessionComment && (
          <div
            style={{
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.brd}`,
              padding: "12px 16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.tx3,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 6,
              }}
            >
              Commentaire
            </div>
            <div style={{ fontSize: 13, color: C.tx2 }}>
              {localMods.sessionComment}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky "Rouvrir" button (completed) ── */}
      {isCompleted && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            left: 0,
            right: 0,
            zIndex: 20,
            padding: "12px 16px",
            background: `linear-gradient(transparent, ${C.bg} 30%)`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => reopenWorkout()}
            disabled={reopening}
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "14px 0",
              borderRadius: 6,
              border: `1px solid ${hexToRgba(ACCENT_ALT, 0.4)}`,
              background: hexToRgba(ACCENT_ALT, 0.08),
              color: ACCENT_ALT,
              fontSize: 13,
              fontWeight: 700,
              cursor: reopening ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: reopening ? 0.6 : 1,
            }}
          >
            {reopening ? "Annulation…" : "↩ Annuler la complétion"}
          </button>
        </div>
      )}

      {/* ── Sticky "Terminer" button ── */}
      {canEdit && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            left: 0,
            right: 0,
            zIndex: 20,
            padding: "12px 16px",
            background: `linear-gradient(transparent, ${C.bg} 30%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          {allSetsHandled && (
            <div style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>
              Toutes les séries sont validées — il ne reste qu'à terminer
            </div>
          )}
          <button
            onClick={() => setShowFinish(true)}
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "16px 0",
              borderRadius: 6,
              border: "none",
              background: allSetsHandled ? GREEN : ACCENT,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              animation: allSetsHandled ? "finishPulse 1.8s ease-in-out infinite" : undefined,
            }}
          >
            {allSetsHandled ? "Terminer la séance" : "Terminer la séance"}
          </button>
          {allSetsHandled && (
            <style>{`@keyframes finishPulse {
              0%, 100% { box-shadow: 0 4px 20px ${hexToRgba(GREEN, 0.35)}; }
              50%      { box-shadow: 0 4px 28px ${hexToRgba(GREEN, 0.7)}; }
            }`}</style>
          )}
        </div>
      )}

      {/* ── NumPad / RirPicker ── */}
      {padTarget && padTarget.field === "rir" ? (
        <RirPicker
          value={padVal}
          onChange={setPadVal}
          onConfirm={() => confirmPad(padVal)}
          onClose={() => { setPadTarget(null); setPadVal(""); }}
        />
      ) : padTarget ? (
        <NumPad
          target={padTarget}
          value={padVal}
          onChange={setPadVal}
          onConfirm={() => confirmPad(padVal)}
          onClose={() => { setPadTarget(null); setPadVal(""); }}
        />
      ) : null}

      {/* ── Rest timer ── */}
      {restLeft !== null && (
        <RestTimer
          left={restLeft}
          total={restTotal}
          nextInfo={restNextInfo}
          loop={restActiveKey?.startsWith("depart:") ?? false}
          onDismiss={stopRest}
        />
      )}

      {/* ── Inactivity reminder ── */}
      {showInactiveReminder && !isCompleted && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.s1, borderRadius: 6, padding: "28px 24px", maxWidth: 320, width: "100%", textAlign: "center", border: "1px solid " + C.brd }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏸</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 6 }}>Séance en pause ?</div>
            <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, marginBottom: 20 }}>
              Aucune activité depuis 10 minutes. Pensez à enregistrer votre séance si vous avez terminé.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => { setShowInactiveReminder(false); lastActivityRef.current = Date.now(); }}
                style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Continuer la séance
              </button>
              <button
                onClick={() => { setShowInactiveReminder(false); setShowFinish(true); }}
                style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "1px solid " + C.g + "60", background: C.g + "15", color: C.g, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Terminer la séance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finish dialog ── */}
      {showFinish && (
        <FinishDialog
          blocs={workout.blocs}
          allSets={sets}
          sessionComment={localMods.sessionComment ?? ""}
          sessionForme={localMods.sessionForme}
          onCommentChange={updateSessionComment}
          onFormeChange={updateForme}
          onConfirm={() => completeWorkout()}
          onClose={() => setShowFinish(false)}
          completing={completing}
        />
      )}

      {/* ── Video modal ── */}
      {videoModal && (
        <div
          onClick={() => setVideoModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 460,
              background: C.s1, borderRadius: 6, border: `1px solid ${C.brd}`,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {videoModal.name}
              </div>
              <button
                onClick={() => setVideoModal(null)}
                style={{
                  width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.brdL}`,
                  background: "transparent", color: C.tx3, fontSize: 16,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 0, flexShrink: 0,
                }}
              >×</button>
            </div>
            <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoModal.ytId}?rel=0`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
                allowFullScreen
                title={videoModal.name}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── RPE sheet ── */}
      {showRpe && workout.workoutLogId && (
        <RpeSheetForLog
          workoutLogId={workout.workoutLogId}
          onClose={() => {
            setShowRpe(false);
            navigate(-1);
          }}
        />
      )}
    </div>
  );
}
