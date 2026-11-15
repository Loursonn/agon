import type { CSSProperties, ReactNode } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { DebriefItem, RaceDebrief, StripSegment } from "@/lib/hyrox/raceDebrief";
import type { GainItem } from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";
import { OBJECTIVE_LEGEND, objectiveColor } from "./raceAnalysisShared";

/**
 * Débrief visuel d'une course (planches « HYROX · refonte visuelle », validées
 * par Hugo le 15/11/2026), contre l'objectif de la course : la course segment
 * par segment, ce qui a marché, ce qui a coûté, où gagner du temps, et ce qui
 * a bougé depuis la course
 * précédente du même format. Téléphone : sections empilées ; ordinateur :
 * trois colonnes. Toutes les phrases sont calculées (`raceDebrief`).
 */

const dot = (color: string, square = false): CSSProperties => ({ width: 9, height: 9, borderRadius: square ? 2 : 999, background: color, flex: "none" });

export function ObjectiveLegend({ square = false, extra }: { square?: boolean; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: C.tx2 }}>
      {OBJECTIVE_LEGEND.map((l) => (
        <span key={l.s} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={dot(objectiveColor(l.s), square)} />{l.label}</span>
      ))}
      {extra}
    </div>
  );
}

/** Frise : un bloc par segment, largeur = temps passé, couleur = écart à l'objectif. */
export function RaceStrip({ segments, tall = false }: { segments: StripSegment[]; tall?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div role="img" aria-label="Course segment par segment, couleur selon l'écart à l'objectif"
        style={{ display: "flex", gap: tall ? 3 : 2, height: tall ? 60 : 40, borderRadius: 8, overflow: "hidden" }}>
        {segments.map((s) => {
          const start = s.state == null;
          return (
            <div key={s.key} title={`${s.label} · ${fmtClock(s.timeS)}${s.deltaS != null ? ` · ${s.deltaS > 0 ? "+" : s.deltaS < 0 ? "−" : "±"}${Math.abs(s.deltaS)} s vs objectif` : ""}`}
              style={{
                flexGrow: s.timeS, flexBasis: 0, minWidth: 0, borderRadius: tall ? 4 : 0, boxSizing: "border-box",
                background: start ? "transparent" : objectiveColor(s.state), border: start ? `1px dashed ${C.tx3}` : "none",
                display: "flex", flexDirection: "column", justifyContent: tall ? "space-between" : "flex-end", alignItems: tall ? "flex-start" : "center",
                padding: tall ? 6 : "0 0 3px", overflow: "hidden",
              }}>
              <span style={{ ...MONO, fontSize: tall ? 10.5 : 9, color: start ? C.tx2 : C.ink, whiteSpace: "nowrap" }}>{tall ? s.label : s.short}</span>
              {tall && <span style={{ ...MONO, fontSize: 11, color: start ? C.tx2 : C.ink }}>{fmtClock(s.timeS)}</span>}
            </div>
          );
        })}
      </div>
      <ObjectiveLegend square />
    </div>
  );
}

function ItemRow({ item, color, compact }: { item: DebriefItem; color: string; compact: boolean }) {
  const box: CSSProperties = compact
    ? { display: "flex", gap: 14, alignItems: "baseline", padding: "10px 0", borderTop: `1px solid ${C.brd}` }
    : { display: "flex", gap: 14, alignItems: "center", borderRadius: 14, padding: 14, background: alpha(color, 0.08), border: `1px solid ${alpha(color, 0.3)}` };
  return (
    <div style={box}>
      <span style={{ ...MONO, fontSize: compact ? 17 : 20, color, minWidth: compact ? 78 : 84, flex: "none" }}>{item.value}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: C.tx }}>{item.title}</span>
        <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>{item.why}</span>
      </span>
    </div>
  );
}

function Section({ n, title, color, children }: { n?: string; title: string; color: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 style={{ ...KICKER, margin: 0, color, fontWeight: 400 }}>{n ? `${n} — ` : ""}{title}</h3>
      {children}
    </section>
  );
}

function Gains({ items, possibleS }: { items: GainItem[]; possibleS: number | null }) {
  const max = Math.max(1, ...items.map((g) => g.gainS));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {possibleS != null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, color: C.tx2 }}>Chrono possible</span>
          <span style={{ ...MONO, fontSize: 20, color: C.ac }}>{fmtClock(possibleS)}</span>
        </div>
      )}
      {items.map((g) => (
        <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
            <span>{g.label}</span><span style={{ ...MONO, color: C.ac }}>−{Math.round(g.gainS)} s</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: C.s2 }}>
            <div style={{ height: 6, borderRadius: 999, width: `${(g.gainS / max) * 100}%`, background: C.ac }} />
          </div>
          {g.key !== "runs" && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{fmtClock(g.athleteS)} · objectif {fmtClock(g.medianS)}</span>}
        </div>
      ))}
    </div>
  );
}

function Since({ debrief }: { debrief: RaceDebrief }) {
  return (
    <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
      {debrief.since.map((r, i) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderTop: i ? `1px solid ${C.brd}` : "none" }}>
          <span style={{ fontSize: 14 }}>{r.label}</span>
          <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>{r.from} → {r.to}</span>
            <span style={{ ...MONO, fontSize: 15, minWidth: 56, textAlign: "right", color: r.better == null ? C.tx2 : r.better ? C.g : C.o }}>{r.delta}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const empty = (text: string) => <div style={{ fontSize: 12.5, color: C.tx3 }}>{text}</div>;

export default function RaceDebriefView({ debrief, strip, gains, possibleS, layout, previousName, coach = false, noReps = null }: {
  debrief: RaceDebrief;
  strip: StripSegment[];
  gains: GainItem[];
  possibleS: number | null;
  layout: "phone" | "desktop";
  previousName: string | null;
  coach?: boolean;
  /** « Wall balls 5:55 · 6 no reps : 4 cible, 2 parallèle », si saisi. */
  noReps?: string | null;
}) {
  const you = coach ? "Le plus de temps perdu" : "Ce qui t'a coûté";
  const good = debrief.good.length
    ? debrief.good.map((g) => <ItemRow key={g.key} item={g} color={C.g} compact={layout === "desktop"} />)
    : empty("Aucun segment en avance sur l'objectif sur cette course.");
  const bad = debrief.bad.length
    ? debrief.bad.map((b) => <ItemRow key={b.key} item={b} color={C.o} compact={layout === "desktop"} />)
    : empty("Rien en retard : partout dans l'objectif ou devant.");
  const gainsBlock = gains.length ? <Gains items={gains.slice(0, 4)} possibleS={possibleS} /> : empty("Partout dans l'objectif ou devant.");
  const noRepsLine = noReps ? <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>{noReps}</span> : null;
  const sinceTitle = previousName ? `Depuis ${previousName}` : "Depuis la dernière course";

  if (layout === "desktop") {
    const col: CSSProperties = { ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ ...KICKER, color: C.ac }}>La course, segment par segment</span>
            {debrief.headline && <span style={{ fontSize: 13, color: C.tx2 }}>{debrief.headline}</span>}
          </div>
          <RaceStrip segments={strip} tall />
          {noRepsLine}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          <div style={col}><span style={{ ...KICKER, color: C.g, marginBottom: 6 }}>Points forts</span>{good}</div>
          <div style={col}><span style={{ ...KICKER, color: C.o, marginBottom: 6 }}>À travailler</span>{bad}</div>
          <div style={{ ...col, gap: 10 }}><span style={{ ...KICKER, color: C.ac }}>Où gagner du temps</span>{gainsBlock}</div>
        </div>
        {debrief.since.length > 0 && (
          <div style={{ ...CARD, padding: "14px 18px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ ...KICKER, color: C.ac }}>{sinceTitle}</span>
            {debrief.since.map((r) => (
              <span key={r.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={LABEL}>{r.label}</span>
                <span style={{ ...MONO, fontSize: 16, color: r.better == null ? C.tx2 : r.better ? C.g : C.o }}>{r.delta}</span>
                <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{r.from} → {r.to}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {debrief.headline && <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: C.tx }}>{debrief.headline}</p>}
      <Section title="Ta course, segment par segment" color={C.ac}>
        <RaceStrip segments={strip} />
        {noRepsLine && <div style={{ marginTop: 8 }}>{noRepsLine}</div>}
      </Section>
      <Section n="01" title="Ce qui a marché" color={C.g}>{good}</Section>
      <Section n="02" title={you} color={C.o}>{bad}</Section>
      <Section n="03" title="Où gagner du temps" color={C.ac}><div style={{ ...CARD, padding: 16 }}>{gainsBlock}</div></Section>
      {debrief.since.length > 0 && <Section n="04" title={sinceTitle} color={C.ac}><Since debrief={debrief} /></Section>}
    </div>
  );
}
