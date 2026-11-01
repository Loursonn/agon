import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Video } from "lucide-react";
import { C } from "@/lib/theme";
import { BATTERY_SESSIONS, type AthleteTestProfile, type BatteryResult } from "@/lib/hyrox/tests";
import { useHyroxBattery, useHyroxBatteryResults, type BatteryTest } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { ListSkeleton } from "@/features/shared/components/skeletons";
import TestEntryDrawer from "./TestEntryDrawer";
import { Btn, Card, Muted } from "./ui";
import { displayEntry, fmtDate } from "./format";

interface Props {
  athleteId: string;
  /** coach : saisit tout ; athlete : saisit les tests en auto-saisie seulement. */
  mode: "coach" | "athlete";
  readOnly?: boolean;
  profile: AthleteTestProfile | null;
}

function summary(test: BatteryTest, r: BatteryResult): string {
  return test.test_variables
    .filter(v => r.values[v.key] != null && !/^r\d_t\d$/.test(v.key))
    .slice(0, 4)
    .map(v => `${v.label} ${displayEntry(r.values[v.key], v.value_type)}${v.unit === "s" && r.values[v.key] >= 60 ? "" : ` ${v.unit}`}`)
    .join(" · ");
}

/** Planning de la semaine de bilan : séances S1 à S5 + semaine 1, protocole, vidéo, saisie. */
export default function BatteryPlan({ athleteId, mode, readOnly, profile }: Props) {
  const { data: tests = [], isLoading } = useHyroxBattery();
  const { data: results = [] } = useHyroxBatteryResults(athleteId);
  const [open, setOpen] = useState<string | null>(null);
  const [entry, setEntry] = useState<BatteryTest | null>(null);

  const latest = useMemo(() => {
    const m = new Map<string, BatteryResult>();
    for (const r of results) if (!m.has(r.test_definition_id)) m.set(r.test_definition_id, r); // déjà triés du plus récent
    return m;
  }, [results]);

  if (isLoading) return <ListSkeleton rows={4} />;
  if (!tests.length)
    return <Muted>La batterie de tests HYROX n'est pas encore installée sur cette base (migration en attente).</Muted>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {BATTERY_SESSIONS.map(s => {
        const list = tests.filter(t => t.battery_session === s.key);
        const done = list.filter(t => latest.has(t.id)).length;
        return (
          <Card key={s.key} style={{ padding: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}><span style={{ color: C.ac }}>{s.day}</span> · {s.label}</div>
                <Muted>{s.detail}</Muted>
              </div>
              <span style={{ fontSize: 11, color: done === list.length && list.length ? C.g : C.tx3, fontWeight: 700 }}>{done}/{list.length}</span>
            </div>
            {list.map(t => {
              const r = latest.get(t.id);
              const isOpen = open === t.id;
              const canFill = !readOnly && (mode === "coach" || t.fill_mode === "self");
              return (
                <div key={t.id} style={{ borderBottom: "1px solid " + C.brd }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : t.id)}
                      aria-expanded={isOpen}
                      style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                    >
                      {isOpen ? <ChevronDown size={14} color={C.tx3} /> : <ChevronRight size={14} color={C.tx3} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: r ? C.tx2 : C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r ? `${fmtDate(r.performed_at)} · ${summary(t, r)}` : "Pas encore fait"}
                        </div>
                      </div>
                    </button>
                    {canFill ? (
                      <Btn small primary={!r} onClick={() => setEntry(t)}>{r ? "Refaire" : "Saisir"}</Btn>
                    ) : mode === "athlete" && t.fill_mode === "coach" ? (
                      <Muted>Saisi par ton coach</Muted>
                    ) : null}
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 16px 12px 36px" }}>
                      {t.protocol?.text && <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.55 }}>{t.protocol.text}</div>}
                      {t.protocol?.video && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: C.tx3 }}>
                          <Video size={12} /> {t.protocol.video}
                        </div>
                      )}
                      {t.media_url && (
                        <a href={t.media_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.ac, display: "inline-block", marginTop: 6 }}>
                          Voir la démonstration
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}
      <TestEntryDrawer athleteId={athleteId} test={entry} previous={entry ? latest.get(entry.id) : undefined} profile={profile} onClose={() => setEntry(null)} />
    </div>
  );
}
