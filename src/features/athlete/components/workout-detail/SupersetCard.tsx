import { MONO } from "@/features/shared/components/seance/seanceUi";
import { ACCENT, SS_LETTERS, SS_ORANGE } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { BadgeTag } from "@/features/athlete/components/workout-detail/BadgeTag";
import { C } from "@/lib/theme";
import type { ExerciceParams } from "@/features/coach/components/programmation/types";
import { InlineRestStrip } from "@/features/athlete/components/workout-detail/InlineRestStrip";
import { LinkifiedText } from "@/features/shared/components/LinkifiedText";
import { SetRow } from "@/features/athlete/components/workout-detail/SetRow";
import type { SetState } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import { SupersetComments } from "@/features/athlete/components/workout-detail/SupersetComments";
import { blocColor } from "@/lib/peps";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── SupersetCard ───────────────────────────────────────────────────────────────
// Superset = 1 série de chaque exo enchaînée sans repos, puis repos du bloc.
// Affichage par tours : Série 1 (A puis B) → repos → Série 2 (A puis B) → ...


export interface SupersetMemberData {
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

export interface SupersetCardProps {
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

export function SupersetCard({
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

  // Série à saisir : premier exo non validé du premier tour incomplet (planche SeanceEnCoursSuperset)
  let current: { r: number; id: string } | null = null;
  for (let r = 0; r < rounds && !current; r++) {
    const m = members.find((x) => x.sets[r] && !x.sets[r].done && !x.sets[r].skipped);
    if (m) current = { r, id: m.id };
  }

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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg><LinkifiedText text={m.coachComment} />
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
          ? "28px 1.1fr 0.8fr 1.3fr 0.7fr 42px"
          : "28px 1fr 1.3fr 0.8fr 42px",
        gap: 4,
        padding: "8px 18px 2px 20px",
        ...MONO, fontSize: 11, color: C.tx3,
        letterSpacing: "0.14em", textTransform: "uppercase" as const,
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
                <div key={m.id} style={{ marginTop: mi > 0 ? 8 : 0 }}>
                <SetRow
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
                  isCurrent={canEdit && current?.r === r && current?.id === m.id}
                />
                </div>
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
