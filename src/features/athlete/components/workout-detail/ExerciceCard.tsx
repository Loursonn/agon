import { ACCENT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { BadgeTag } from "@/features/athlete/components/workout-detail/BadgeTag";
import { C, H } from "@/lib/theme";
import { ClusterSubRow } from "@/features/athlete/components/workout-detail/ClusterSubRow";
import type { ExerciceParams } from "@/features/coach/components/programmation/types";
import { InlineRestStrip } from "@/features/athlete/components/workout-detail/InlineRestStrip";
import { LinkifiedText } from "@/features/shared/components/LinkifiedText";
import { SetRow } from "@/features/athlete/components/workout-detail/SetRow";
import type { SetState } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import { blocColor } from "@/lib/peps";
import { hasIso, isAllIso, isIsoAt } from "@/lib/formatSetsReps";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";
import { useState } from "react";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";

// ── ExerciceCard ───────────────────────────────────────────────────────────────

export interface ExerciceCardProps {
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

export function ExerciceCard({
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
  // En-tête « Durée (s) » si toutes les séries sont en iso ; l'unité suit chaque série
  const isIso = isAllIso(params);
  const doneSets = sets.filter((s) => s.done).length;
  // For cluster: cluster.recup_sec is intra-cluster rest (shown as badge); inter-set rest = bloc rest
  const restSec = blocRestSec;
  const restLabel = blocRestLabel;
  // stripSec: InlineRestStrip only for repos timing (bloc-level) — not for depart, cluster-only
  // or superset members (rest is taken at the end of each round, not between own sets)
  const stripSec = timingMode === "repos" && !supersetTag ? blocRestSec : 0;
  const totalSets = sets.length;
  const allDone = doneSets === totalSets && totalSets > 0;
  const currentIdx = sets.findIndex((s) => !s?.done && !s?.skipped);

  return (
    <div
      style={{
        background: C.s1,
        borderRadius: 16,
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
                ...DISPLAY,
                fontSize: 18,
                fontWeight: 400,
                letterSpacing: "0.05em",
                lineHeight: 1.15,
                textTransform: "uppercase",
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
          {supersetTag && <BadgeTag label={supersetTag} color={H.miel} />}
          <BadgeTag label={prescription} color={ACCENT} />
          {hasIso(params) && <BadgeTag label="Iso" color={C.b} />}
          {muscle && <BadgeTag label={muscle} color={blocColor} />}
        </div>
        {/* Coach comment */}
        {coachComment && (
          <div style={{ marginTop: 5, fontSize: 10, color: C.tx2, fontStyle: "italic", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg><LinkifiedText text={coachComment} />
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
            <span style={{ fontSize: 9, fontWeight: 800, color: H.miel, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
              Cluster
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: H.miel, letterSpacing: 1 }}>
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
              ? "28px 1fr 1.3fr 0.8fr 42px"
              : "28px 1.1fr 0.8fr 1.3fr 0.7fr 42px",
            gap: 4,
            padding: "8px 18px 2px 20px",
            ...MONO,
            fontSize: 11,
            color: C.tx3,
            letterSpacing: "0.14em",
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
      <div style={{ padding: "6px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
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
                isIso={isIsoAt(params, i)}
                isCurrent={canEdit && i === currentIdx}
                onToggle={() => onToggle(i)}
                onOpenPad={(field) => onOpenPad(i, field)}
                isCompleted={!canEdit}
                canRemove={canEdit && i >= params.nb_series}
                onRemoveSet={canEdit && i >= params.nb_series ? () => onRemoveSet(i) : undefined}
              />
              {/* Récup : seulement après une série validée (ou passée), entre deux séries */}
              {(s?.done || s?.skipped || restActiveKey === stripKey) && i < sets.length - 1 && (
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
              )}
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
                color: H.ambre,
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
