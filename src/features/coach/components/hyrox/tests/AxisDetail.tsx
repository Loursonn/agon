import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C } from "@/lib/theme";
import { AXES, fr, gridRowFor, type AthleteTestProfile, type GridSet, type MetricKey, type ScoreResult } from "@/lib/hyrox/tests";
import { Card, Muted, NoteBadge, SectionTitle, SourceTag } from "./ui";
import { NOTE_LABELS, gridLevels, noteColor } from "./format";

/** Lectures réservées au coach (jargon ou intermédiaires de calcul). */
const COACH_ONLY_READINGS = new Set(["e"]);

export default function AxisDetail({ scores, profile, set, audience }: {
  scores: ScoreResult; profile: AthleteTestProfile; set: GridSet | null; audience: "coach" | "athlete";
}) {
  const coach = audience === "coach";
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <SectionTitle>Détail par axe</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AXES.map(a => {
          const ax = scores.axes.find(x => x.key === a.key);
          const ms = scores.measures.filter(m => m.axis === a.key && (coach || !COACH_ONLY_READINGS.has(m.key)));
          return (
            <Card key={a.key} style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NoteBadge note={ax?.score} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{a.label}</div>
                  <Muted>{a.what}</Muted>
                </div>
              </div>
              {ax?.flags.map(f => <div key={f} style={{ fontSize: 11, color: C.o, marginTop: 6 }}>{f}</div>)}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column" }}>
                {ms.map(m => {
                  const row = !m.reading && set ? gridRowFor(set, m.key as MetricKey, profile.sex, profile.category) : null;
                  const id = `${a.key}.${m.key}`;
                  const isOpen = open === id;
                  const display = !coach && m.key === "cs" && m.value != null ? `${fr(m.value)} km/h` : m.display;
                  return (
                    <div key={m.key} style={{ borderTop: "1px solid " + C.brd, padding: "7px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {coach && row ? (
                          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>
                            {isOpen ? <ChevronDown size={13} color={C.tx3} /> : <ChevronRight size={13} color={C.tx3} />}
                          </button>
                        ) : <span style={{ width: 13 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: C.tx }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: C.tx2 }}>{display}</div>
                        </div>
                        <SourceTag source={m.source} />
                        {!m.reading && <NoteBadge note={m.note} />}
                      </div>
                      {!m.reading && m.note != null && !coach && (
                        <div style={{ fontSize: 10, color: noteColor(m.note), marginLeft: 21, marginTop: 2 }}>{NOTE_LABELS[m.note - 1]}</div>
                      )}
                      {isOpen && row && (
                        <div style={{ margin: "6px 0 2px 21px", display: "flex", flexDirection: "column", gap: 2 }}>
                          {gridLevels(m.key, row).map(l => (
                            <div key={l.note} style={{ display: "flex", gap: 8, fontSize: 11, color: m.note === l.note ? C.tx : C.tx3, fontWeight: m.note === l.note ? 700 : 400 }}>
                              <span style={{ width: 14, color: noteColor(l.note) }}>{l.note}</span>
                              <span style={{ width: 92 }}>{l.label}</span>
                              <span>{l.range}</span>
                            </div>
                          ))}
                          <Muted>Grille {set?.version} · poids {fr(row.weight, 1)}{row.notes ? ` · ${row.notes}` : ""}</Muted>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
