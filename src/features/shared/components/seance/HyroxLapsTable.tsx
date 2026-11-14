import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { distanceLabel, type ExpectedBlock } from "@shared/domain/hyroxLaps";
import { C, alpha } from "@/lib/theme";
import { DASH, fmtClock, fmtInt, plannedLabel, SERIES_COLORS, zoneColor, type LapKind } from "@/lib/seance";
import type { DetailLap, DetailLapWithMetrics } from "@/lib/activityDetail";
import { blockOf, doneValue, groupTotals, rhythmOf } from "@/lib/seanceHyrox";
import { ZonePill } from "./SeanceChart";
import { StationIcon } from "./StationIcon";
import { MONO, pillStyle } from "./seanceUi";

interface Props {
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  kinds: readonly LapKind[];
  blocks: readonly ExpectedBlock[] | null;
  zonesN: number;
  active: number | null;
  onSelect: (i: number) => void;
  /** Correction du réalisé (reps, distance) ou de la charge d'une station. */
  onPatch?: (i: number, patch: Partial<Pick<DetailLap, "reps" | "distanceOverrideM" | "loadKg" | "comment">>) => void;
  /** Athlète : la bulle d'un tour permet d'écrire son commentaire (coach : lecture). */
  canComment?: boolean;
}

const COLS = "36px minmax(150px,1.8fr) 70px 86px 86px 60px minmax(80px,1fr) 60px 60px 48px 30px";
const HEAD = ["N°", "Nom", "Prévu", "Réalisé", "Charge", "Temps", "Allure / rythme", "FC moy.", "FC max", "Zone", ""];

/** Tableau des tours HYROX (ordinateur) : prévu, réalisé et charge corrigeables, total de la séance. */
export function HyroxLapsTable({ laps, names, kinds, blocks, zonesN, active, onSelect, onPatch, canComment = false }: Props) {
  const cell: CSSProperties = { ...MONO, fontSize: 12.5, whiteSpace: "nowrap" };
  const [openComment, setOpenComment] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const editable = canComment && !!onPatch;
  function toggleComment(i: number) {
    if (openComment === i) { setOpenComment(null); return; }
    setCommentDraft(laps[i].comment ?? "");
    setOpenComment(i);
  }
  // Seulement la ligne Total : les lignes par type (Course / Sled push / Wall balls…)
  // sont retirées (retour d'Hugo, 12/11) ; le détail se lit tour par tour au-dessus.
  const groups = groupTotals(laps, names, kinds, blocks).filter((g) => g.label === "Total");
  return (
    <div style={{ border: `1px solid ${C.brd}`, borderRadius: 12, overflow: "hidden", background: C.s1 }} role="table">
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.brd}` }} role="row">
        {HEAD.map((h, i) => (
          <span key={h} style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.tx3, textAlign: i >= 5 ? "right" : "left" }}>{h}</span>
        ))}
      </div>
      {laps.map((l, i) => {
        const kind = kinds[i];
        const b = blockOf(l, blocks);
        const done = doneValue(l, kind, b);
        const on = active === i;
        const review = l.needsReview;
        const planned = b ? (done.field === "reps" ? b.reps : b.distanceM) : null;
        const differs = done.value != null && planned != null && done.value !== planned;
        return (
          <Fragment key={`${l.startS}-${i}`}>
          <div
            role="row"
            onClick={() => onSelect(i)}
            style={{
              display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "0 14px", minHeight: 44,
              borderTop: i ? `1px solid ${C.brd}` : "none", cursor: "pointer",
              background: on ? alpha(C.ac, 0.1) : review ? `repeating-linear-gradient(135deg, ${alpha(C.ac, 0.06)} 0 6px, transparent 6px 12px)` : "transparent",
              boxShadow: on || review ? `inset 3px 0 0 ${C.ac}` : "none",
            }}
          >
            <span style={{ ...MONO, fontSize: 11, color: on ? C.ac : C.tx3 }}>{i + 1}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <StationIcon name={kind === "run" ? "Course" : names[i]} size={15} />
              <span style={{ fontSize: 13, color: C.tx, fontStyle: l.status === "proposed" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortName(names[i], b)}
              </span>
              {review && <span style={pillStyle(C.ac)}>À vérifier</span>}
            </span>
            <span style={{ ...cell, color: C.tx2 }}>{plannedLabel(b)}</span>
            <span onClick={(e) => done.field && e.stopPropagation()}>
              {done.field && onPatch ? (
                <NumberField value={done.value} unit={done.unit} warn={differs} onCommit={(v) => onPatch(i, { [done.field!]: v })} />
              ) : (
                <span style={cell}>{done.text}</span>
              )}
            </span>
            <span onClick={(e) => kind === "station" && e.stopPropagation()}>
              {kind === "station" && onPatch ? (
                <NumberField value={l.loadKg ?? b?.loadKg ?? null} unit="kg" onCommit={(v) => onPatch(i, { loadKg: v })} />
              ) : (
                <span style={{ ...cell, color: C.tx3 }}>{kind === "station" ? (l.loadKg ?? b?.loadKg ?? DASH) : DASH}</span>
              )}
            </span>
            <span style={{ ...cell, textAlign: "right", fontWeight: 600 }}>{fmtClock(l.metrics.durationS)}</span>
            <span style={{ ...cell, textAlign: "right", color: kind === "run" ? SERIES_COLORS.pace : C.tx2 }}>{rhythmOf(l, kind, b)}</span>
            <span style={{ ...cell, textAlign: "right", color: l.metrics.meanZone ? zoneColor(l.metrics.meanZone, zonesN) : C.tx }}>{fmtInt(l.metrics.avgHr)}</span>
            <span style={{ ...cell, textAlign: "right", color: C.tx2 }}>{fmtInt(l.metrics.maxHr)}</span>
            <span style={{ textAlign: "right" }}><ZonePill zone={l.metrics.meanZone} n={zonesN} /></span>
            <span style={{ textAlign: "center" }}>
              {(l.comment || editable) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleComment(i); }}
                  title={l.comment ? `« ${l.comment} »` : "Ajouter un commentaire"}
                  aria-label={l.comment ? `Commentaire : ${l.comment}` : "Ajouter un commentaire sur ce tour"}
                  aria-expanded={openComment === i}
                  style={{ display: "inline-flex", padding: 2, background: "none", border: "none", cursor: "pointer" }}
                >
                  <CommentBubble color={l.comment ? C.ac : C.tx3} />
                </button>
              )}
            </span>
          </div>
          {openComment === i && (
            <div style={{ padding: "0 14px 12px 50px", background: on ? alpha(C.ac, 0.1) : "transparent" }} onClick={(e) => e.stopPropagation()}>
              {editable ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    autoFocus
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onPatch!(i, { comment: commentDraft.trim() || null }); setOpenComment(null); }
                      if (e.key === "Escape") setOpenComment(null);
                    }}
                    placeholder="Ton commentaire sur ce tour (poignées glissantes, crampe…)"
                    aria-label="Commentaire sur ce tour"
                    style={{ flex: 1, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontSize: 12.5, fontFamily: "inherit" }}
                  />
                  <button type="button" onClick={() => setOpenComment(null)} style={{ ...cell, height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, cursor: "pointer" }}>Annuler</button>
                  <button type="button" onClick={() => { onPatch!(i, { comment: commentDraft.trim() || null }); setOpenComment(null); }} style={{ ...cell, height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: C.ac, color: C.bg, fontWeight: 600, cursor: "pointer" }}>Enregistrer</button>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: C.tx2 }}>« {l.comment} »</span>
              )}
            </div>
          )}
          </Fragment>
        );
      })}
      {groups.map((g, k) => (
        <div key={g.label} style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "0 14px", minHeight: 40, borderTop: `1px solid ${k === 0 ? C.brdL : C.brd}`, background: alpha(C.tx, 0.02) }} role="row">
          <span />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{g.label}</span>
          <span style={{ ...cell, color: C.tx2 }}>{g.planned}</span>
          <span style={cell}>{g.done}</span>
          <span style={{ ...cell, color: C.tx3 }}>{g.load}</span>
          <span style={{ ...cell, textAlign: "right", fontWeight: 600 }}>{fmtClock(g.durationS)}</span>
          <span style={{ ...cell, textAlign: "right", color: C.tx2 }}>{g.rhythm}</span>
          <span style={{ ...cell, textAlign: "right" }}>{fmtInt(g.avgHr)}</span>
          <span style={{ ...cell, textAlign: "right", color: C.tx2 }}>{fmtInt(g.maxHr)}</span>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

/** Bulle de commentaire (dorée = l'athlète a commenté le tour). */
function CommentBubble({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" aria-hidden>
      <path d="M4 5H20V16H10L6 20V16H4Z" />
    </svg>
  );
}

/** Champ numérique compact (réalisé, charge) : enregistré à la sortie du champ. */
/** « Sled push 25 m 1 » → « Sled push 1 » : la distance est déjà dans la colonne Prévu. */
function shortName(name: string, b: ExpectedBlock | null): string {
  if (!b?.distanceM || b.kind === "run") return name;
  return name.replace(` ${distanceLabel(b.distanceM)}`, "");
}

export function NumberField({ value, unit, warn, onCommit }: { value: number | null; unit: string; warn?: boolean; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? String(value) : "");
  useEffect(() => setText(value != null ? String(value) : ""), [value]);
  const commit = () => {
    const v = text.trim() === "" ? null : Number(text.replace(",", "."));
    if (v === null || (Number.isFinite(v) && v >= 0)) {
      if (v !== value) onCommit(v);
    } else setText(value != null ? String(value) : "");
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px", borderRadius: 8,
      border: `1px solid ${warn ? alpha(C.o, 0.7) : C.brdL}`, color: warn ? C.o : C.tx,
    }}>
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={unit === "kg" ? "Charge" : "Réalisé"}
        style={{ ...MONO, width: unit.length > 2 ? 26 : 38, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 12.5, textAlign: "right", padding: 0 }}
      />
      <span style={{ ...MONO, fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>{unit}</span>
    </span>
  );
}
