import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { useAuth } from "@/hooks/useAuth";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteTestResults, useCreateTestResult } from "@/features/shared/hooks/tests/useAthleteTests";
import { useTestDefinitions } from "@/features/shared/hooks/tests/useTestDefinitions";
import { listTestSessions, pickDefinitionByName, testKeys } from "@/api/tests";
import {
  TEST_GROUP_COLOR, TEST_GROUP_LABEL, buildTestValueCards, displayUnit, fmtTestDate, formatTestDelta, formatTestValue, groupTestCards, testGroupOf,
  type TestValueCard,
} from "@/lib/athleteTestValues";
import { TestDetailView } from "@/features/athlete/components/tests/TestDetailView";
import { TestEntryPage } from "@/features/athlete/components/TestEntryPage";
import { parseClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";
import type { TestDefinitionWithVariables, TestVariable } from "@/features/shared/types/tests";
import { CARD, Chevron, DISPLAY, KICKER, MONO, PhoneButton, PhonePage, Section, rowLine } from "./phoneUi";

/**
 * Tests d'un athlète sur téléphone (planche CoachTelTests) : tests prévus,
 * derniers résultats rangés par dominante (une tape = évolution), saisie d'un
 * résultat à sa place. Banque et création d'un test : ordinateur.
 */
export default function CoachPhoneTests() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { athleteProfile } = useAthleteContext();
  const { user } = useAuth();
  const first = (athleteProfile?.first_name || athleteProfile?.full_name?.split(" ")[0] || "l’athlète").trim();
  const today = localIsoDay();
  const { data: results = [], isLoading, isError } = useAthleteTestResults(athleteId);
  const { data: defs = [] } = useTestDefinitions(user?.id ?? "");
  /** Domaine d'un test prévu (« Endurance »), retrouvé par son nom dans la banque. */
  const domainOf = (title: string) => {
    const def = pickDefinitionByName(defs as TestDefinitionWithVariables[], title);
    const g = def ? testGroupOf(def) : null;
    return g && g !== "autres" ? TEST_GROUP_LABEL[g] : null;
  };
  const sessionsQ = useQuery({ queryKey: testKeys.sessions(athleteId), enabled: !!athleteId, queryFn: () => listTestSessions(athleteId) });
  const planned = (sessionsQ.data ?? []).filter((s) => !s.completed && s.date >= today).slice(0, 6);
  const groups = useMemo(() => groupTestCards(buildTestValueCards(results)), [results]);
  const nCards = groups.reduce((n, g) => n + g.cards.length, 0);
  const [open, setOpen] = useState<TestValueCard | null>(null);
  const [fill, setFill] = useState<string | null>(null);
  const [entry, setEntry] = useState(false);

  if (open) {
    return (
      <PhonePage style={{ paddingTop: 10 }}>
        <TestDetailView card={open} color={TEST_GROUP_COLOR[open.group]} onBack={() => setOpen(null)} />
      </PhonePage>
    );
  }
  if (fill) {
    return <TestEntryPage testId={fill} athleteId={athleteId} onClose={() => setFill(null)} resultPath={null} />;
  }
  if (entry) {
    return <FreeTestEntry athleteId={athleteId} first={first} onClose={() => setEntry(false)} />;
  }

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <PhoneButton primary onClick={() => setEntry(true)} style={{ width: "100%" }}>Saisir un résultat pour {first}</PhoneButton>

      <Section n={1} title="Prévus au planning" count={planned.length || undefined}>
        {planned.length === 0 ? (
          <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Aucun test prévu.</div>
        ) : (
          <div style={{ ...CARD, padding: "2px 14px" }}>
            {planned.map((t, i) => (
              <button key={t.id} type="button" onClick={() => setFill(t.id)} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 0", background: "none", border: "none",
                boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
              }}>
                <span style={{ ...MONO, width: 52, flex: "none", fontSize: 11.5, color: TYPE_COLOR.test }}>
                  {new Date(t.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  {domainOf(t.title) && <span style={{ display: "block", fontSize: 11.5, color: C.tx3 }}>{domainOf(t.title)}</span>}
                </span>
                <span style={{ fontSize: 12, color: C.ac }}>Saisir</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section n={2} title="Derniers résultats" right={nCards ? <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{nCards} TEST{nCards > 1 ? "S" : ""}</span> : undefined}>
        {isError ? (
          <div style={{ fontSize: 12.5, color: C.o }}>Résultats : lecture impossible.</div>
        ) : isLoading ? null : nCards === 0 ? (
          <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Aucun résultat pour l’instant.</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.tx3, marginTop: -4 }}>Rangés par dominante. Touche un test pour voir son évolution.</div>
            {groups.map((g) => (
              <div key={g.group} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: TEST_GROUP_COLOR[g.group] }} />
                  <span style={{ fontSize: 13, color: TEST_GROUP_COLOR[g.group] }}>{TEST_GROUP_LABEL[g.group]}</span>
                  <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{g.cards.length}</span>
                </div>
                <div style={{ ...CARD, padding: "2px 14px" }}>
                  {g.cards.map((c, i) => (
                    <button key={c.variableId} type="button" onClick={() => setOpen(c)} style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 0", background: "none", border: "none",
                      boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                        <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{fmtTestDate(c.latest.date, false)}</div>
                      </div>
                      <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{ ...MONO, fontSize: 14 }}>{formatTestValue(c.latest.value, c.valueType)}</span>
                        <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}> {displayUnit(c.unit, c.valueType)}</span>
                        <span style={{ display: "block", ...MONO, fontSize: 11, color: c.improved == null ? C.tx3 : c.improved ? C.g : C.o }}>
                          {c.delta != null ? formatTestDelta(c.delta, c.valueType) : ""}
                        </span>
                      </span>
                      <Chevron />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </Section>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Banque de tests et création d’un test : sur ordinateur.</div>
    </PhonePage>
  );
}

// ── Saisie libre d'un résultat (planche CoachTelTests, écran 02) ──────────────

function parseValue(text: string, v: TestVariable): number | null {
  const t = text.trim();
  if (!t) return null;
  if (v.value_type === "duration" || v.value_type === "pace") return parseClock(t);
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function FreeTestEntry({ athleteId, first, onClose }: { athleteId: string; first: string; onClose: () => void }) {
  const { user } = useAuth();
  const { data: defs = [] } = useTestDefinitions(user?.id ?? "");
  const { data: results = [] } = useAthleteTestResults(athleteId);
  const cards = useMemo(() => buildTestValueCards(results), [results]);
  const create = useCreateTestResult(athleteId);
  const [defId, setDefId] = useState("");
  const [date, setDate] = useState(localIsoDay());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const def: TestDefinitionWithVariables | undefined = (defs as TestDefinitionWithVariables[]).find((d) => d.id === defId);
  const parsed = (def?.test_variables ?? []).map((v) => ({ v, n: parseValue(vals[v.id] ?? "", v), prev: cards.find((c) => c.variableId === v.id) ?? null }));
  const ok = !!def && parsed.some((p) => p.n != null) && parsed.every((p) => !(vals[p.v.id] ?? "").trim() || p.n != null);

  const field: React.CSSProperties = {
    height: 44, padding: "0 12px", borderRadius: 11, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx,
    fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box", colorScheme: "dark",
  };

  function save() {
    if (!def) return;
    const values: Record<string, number> = {};
    for (const p of parsed) if (p.n != null) values[p.v.id] = p.n;
    create.mutate({ test_definition_id: def.id, performed_at: date, notes, values }, { onSuccess: onClose });
  }

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={KICKER}>Tests de {first}</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: C.tx3, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>Annuler</button>
      </div>
      <div>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", color: TYPE_COLOR.test, textTransform: "uppercase" }}>{first} · nouveau résultat</div>
        <h1 style={{ margin: "2px 0 0", ...DISPLAY, fontSize: 19 }}>Saisir un résultat</h1>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 11.5, color: C.tx3 }}>Test</span>
        <select value={defId} onChange={(e) => { setDefId(e.target.value); setVals({}); }} style={field}>
          <option value="">Choisir un test…</option>
          {(defs as TestDefinitionWithVariables[]).map((d) => <option key={d.id} value={d.id}>{d.name}{testGroupOf(d) !== "autres" ? ` · ${TEST_GROUP_LABEL[testGroupOf(d)]}` : ""}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 11.5, color: C.tx3 }}>Date</span>
        <input type="date" value={date} max={localIsoDay()} onChange={(e) => setDate(e.target.value)} style={field} />
      </label>
      {def && (
        <div style={{ ...CARD, padding: "2px 14px" }}>
          {parsed.map(({ v, n, prev }, i) => {
            const delta = n != null && prev ? n - prev.latest.value : null;
            const better = delta == null || delta === 0 ? null : v.better_when === "lower" ? delta < 0 : delta > 0;
            const timeLike = v.value_type === "duration" || v.value_type === "pace";
            return (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", boxShadow: rowLine(i) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{v.label}</div>
                  <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>
                    {prev ? `Préc. ${formatTestValue(prev.latest.value, v.value_type)}` : "Premier résultat"}
                    {delta != null && <span style={{ color: better == null ? C.tx3 : better ? C.g : C.o }}> {formatTestDelta(delta, v.value_type)}</span>}
                  </div>
                </div>
                <input
                  aria-label={v.label}
                  inputMode={timeLike ? "text" : "decimal"}
                  placeholder={timeLike ? "m:ss" : "—"}
                  value={vals[v.id] ?? ""}
                  onChange={(e) => setVals((cur) => ({ ...cur, [v.id]: e.target.value }))}
                  style={{ ...field, width: 96, textAlign: "right", ...MONO, borderColor: (vals[v.id] ?? "").trim() && n == null ? C.r : C.brdL }}
                />
                <span style={{ ...MONO, fontSize: 11, color: C.tx3, width: 44 }}>{displayUnit(v.unit, v.value_type)}</span>
              </div>
            );
          })}
        </div>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 11.5, color: C.tx3 }}>Commentaire · facultatif</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...field, height: "auto", padding: 10, resize: "vertical" }} />
      </label>
      <PhoneButton primary disabled={!ok || create.isPending} onClick={save} style={{ width: "100%", height: 52 }}>Enregistrer</PhoneButton>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center", marginTop: -4 }}>{first} le voit tout de suite dans ses tests.</div>
    </PhonePage>
  );
}
