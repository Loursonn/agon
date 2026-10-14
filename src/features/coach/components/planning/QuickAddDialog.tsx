import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { X, Dumbbell, FlaskConical, Zap, Layers } from "lucide-react";
import { C } from "@/lib/theme";
import { useAssignWorkout, useCreateTestSession } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import { useTestDefinitions } from "@/features/shared/hooks/tests/useTestDefinitions";
import type { TestDefinitionWithVariables } from "@/features/shared/types/tests";
import { TEST_CATEGORY_LABEL, TEST_CATEGORY_COLOR, TEST_CATEGORY_ORDER } from "@/features/shared/types/tests";

type Tab = "workout" | "energy" | "test" | "specific";

const TAB_KEY = "quickadd_tab";

function getSavedTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY) as Tab | null;
    if (v === "workout" || v === "energy" || v === "test") return v;
  } catch {}
  return "workout";
}

const TEST_TYPES = ["musculation", "endurance", "vitesse", "puissance", "souplesse", "autre"] as const;

const KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};
const KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#10B981", fartlek: "#EF4444", autre: "#6B7280", custom: "#6B7280",
};

const SIDEBAR_CATS = [
  { key: "workout"  as Tab, label: "Muscu",      Icon: Dumbbell,     color: "#FFC933", disabled: false },
  { key: "energy"   as Tab, label: "Énergie",    Icon: Zap,          color: "#F59E0B", disabled: false },
  { key: "test"     as Tab, label: "Test",        Icon: FlaskConical, color: "#C49A6C", disabled: false },
  { key: "specific" as Tab, label: "Spécifique",  Icon: Layers,       color: C.tx3,     disabled: true  },
];

interface QuickAddDialogProps {
  open: boolean;
  onClose: () => void;
  date: Date | null;
  athleteId: string;
  coachId: string;
  sessions: Array<{ id: string; name: string; multi_semaine?: boolean; nb_semaines?: number }>;
}

// ── Shared micro-styles ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 4,
  border: "1px solid " + C.brdL, background: C.s2,
  color: C.tx, fontSize: 12, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};

function itemBtn(active: boolean, color: string): React.CSSProperties {
  return {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: "1px solid " + (active ? color + "60" : C.brd),
    background: active ? color + "15" : C.s2,
    color: active ? color : C.tx,
    fontSize: 12, fontWeight: active ? 600 : 400,
    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    transition: "all 120ms",
  };
}

const emptyTxt: React.CSSProperties = {
  textAlign: "center", padding: "28px 0", color: C.tx3, fontSize: 12,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickAddDialog({
  open, onClose, date, athleteId, coachId, sessions,
}: QuickAddDialogProps) {
  const [tab, setTab]                           = useState<Tab>(getSavedTab);
  const [selectedSession, setSelectedSession]   = useState("");
  const [sessionSearch, setSessionSearch]       = useState("");
  const [selectedEnergy, setSelectedEnergy]     = useState("");
  const [energySearch, setEnergySearch]         = useState("");
  const [testSearch, setTestSearch]             = useState("");
  const [selectedTestDef, setSelectedTestDef]   = useState<TestDefinitionWithVariables | null>(null);
  const [testTitle, setTestTitle]               = useState("");
  const [testType, setTestType]                 = useState("musculation");

  const { mutate: assignWorkout, isPending: pendingWorkout } = useAssignWorkout();
  const { mutate: createTest,    isPending: pendingTest    } = useCreateTestSession();
  const { mutate: assignEnergy,  isPending: pendingEnergy  } = useAssignEnergySession();
  const { data: energySessions = [] } = useEnergySessions();
  const { data: testDefinitions = [] } = useTestDefinitions(coachId);

  if (!open || !date) return null;

  const dateStr   = format(date, "yyyy-MM-dd");
  const dateLabel = format(date, "d MMMM yyyy", { locale: fr });

  const filteredSessions = sessions.filter(s =>
    s.name.toLowerCase().includes(sessionSearch.toLowerCase()),
  );
  const filteredEnergy = energySessions.filter(s =>
    s.name.toLowerCase().includes(energySearch.toLowerCase()),
  );
  const filteredTests = testDefinitions.filter(d =>
    d.name.toLowerCase().includes(testSearch.toLowerCase()),
  );

  // Group tests by category
  const testGroups = TEST_CATEGORY_ORDER
    .map(cat => ({ cat, tests: filteredTests.filter(d => d.category === cat) }))
    .filter(g => g.tests.length > 0);
  const uncategorized = filteredTests.filter(d => !d.category);

  function switchTab(t: Tab) {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
  }

  function handleClose() {
    setSelectedSession(""); setSessionSearch("");
    setSelectedEnergy(""); setEnergySearch("");
    setTestSearch(""); setSelectedTestDef(null); setTestTitle(""); setTestType("musculation");
    onClose();
  }

  const canSubmit =
    tab === "workout"  ? !!selectedSession :
    tab === "energy"   ? !!selectedEnergy  :
    tab === "test"     ? !!(selectedTestDef || testTitle.trim()) :
    false;

  const isPending =
    tab === "workout" ? pendingWorkout :
    tab === "energy"  ? pendingEnergy  :
    pendingTest;

  function handleSubmit() {
    if (!canSubmit || isPending) return;
    if (tab === "workout") {
      const sess = sessions.find(s => s.id === selectedSession);
      if (!sess) return;
      assignWorkout(
        { sessionId: sess.id, sessionName: sess.name, athleteId, coachId, date: dateStr },
        { onSuccess: handleClose },
      );
    } else if (tab === "energy") {
      assignEnergy(
        { energy_session_id: selectedEnergy, athlete_id: athleteId, coach_id: coachId, scheduled_date: dateStr, status: "planned" },
        { onSuccess: handleClose },
      );
    } else if (tab === "test") {
      const title = testTitle.trim() || selectedTestDef?.name;
      if (!title) return;
      createTest(
        { athleteId, coachId, title, type: testType, date: dateStr },
        { onSuccess: handleClose },
      );
    }
  }

  const submitLabel =
    isPending         ? "Ajout…"           :
    tab === "workout" ? "Planifier séance"  :
    tab === "energy"  ? "Planifier énergie" :
    tab === "test"    ? "Créer le test"     :
    "Valider";

  return (
    <>
      {/* Backdrop */}
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)" }} />

      {/* Dialog */}
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 60,
          transform: "translate(-50%, -50%)",
          width: 520, maxWidth: "95vw",
          background: C.s1, borderRadius: 6,
          border: "1px solid " + C.brdL,
          display: "flex", flexDirection: "column",
          maxHeight: "84vh", overflow: "hidden",
          animation: "qdIn 180ms ease-out",
        }}
      >
        <style>{`
          @keyframes qdIn {
            from { opacity: 0; transform: translate(-50%,-50%) scale(0.96); }
            to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          }
        `}</style>

        {/* ── Header ── */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid " + C.brd,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Ajouter au planning</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>{dateLabel}</div>
          </div>
          <button onClick={handleClose} style={{
            width: 28, height: 28, borderRadius: 4,
            border: "1px solid " + C.brdL, background: "transparent",
            color: C.tx3, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Body: sidebar + content ── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* Left sidebar — 2×2 category buttons */}
          <div style={{
            width: 164, flexShrink: 0,
            borderRight: "1px solid " + C.brd,
            padding: "12px 10px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            alignContent: "start",
          }}>
            {SIDEBAR_CATS.map(({ key, label, Icon, color, disabled }) => {
              const active = tab === key && !disabled;
              return (
                <button
                  key={key}
                  onClick={() => !disabled && switchTab(key)}
                  title={disabled ? "Bientôt disponible" : undefined}
                  style={{
                    height: 68,
                    borderRadius: 6,
                    border: "1px solid " + (active ? color + "70" : disabled ? C.brd + "40" : C.brd),
                    background: active ? color + "1A" : disabled ? "transparent" : C.s2,
                    color: active ? color : disabled ? C.tx3 + "40" : C.tx3,
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 5,
                    transition: "all 140ms",
                    padding: 0,
                  }}
                >
                  <Icon size={17} />
                  <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, lineHeight: 1, textAlign: "center", padding: "0 4px" }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right content pane */}
          <div style={{
            flex: 1, minWidth: 0,
            overflowY: "auto", scrollbarWidth: "none",
            padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>

            {/* ── MUSCU ── */}
            {tab === "workout" && (
              <>
                <input
                  value={sessionSearch}
                  onChange={e => setSessionSearch(e.target.value)}
                  placeholder="Rechercher une séance…"
                  autoFocus
                  style={inputStyle}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {filteredSessions.length === 0 ? (
                    <div style={emptyTxt}>
                      {sessionSearch ? "Aucun résultat" : "Banque vide — créez une séance dans Programmation"}
                    </div>
                  ) : filteredSessions.map(s => {
                    const active = selectedSession === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSession(active ? "" : s.id)}
                        style={itemBtn(active, "#FFC933")}
                      >
                        {active && "✓ "}{s.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── ÉNERGIE ── */}
            {tab === "energy" && (
              <>
                <input
                  value={energySearch}
                  onChange={e => setEnergySearch(e.target.value)}
                  placeholder="Rechercher une séance énergie…"
                  autoFocus
                  style={inputStyle}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {filteredEnergy.length === 0 ? (
                    <div style={emptyTxt}>Aucune séance énergie</div>
                  ) : filteredEnergy.map(s => {
                    const active = selectedEnergy === s.id;
                    const kc = KIND_COLOR[s.session_kind] ?? "#6B7280";
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedEnergy(active ? "" : s.id)}
                        style={{ ...itemBtn(active, kc), display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: kc + "25", color: kc, flexShrink: 0 }}>
                          {KIND_LABEL[s.session_kind] ?? s.session_kind}
                        </span>
                        <span style={{ flex: 1, textAlign: "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {active && "✓ "}{s.name}
                        </span>
                        {s.total_duration_s && (
                          <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>
                            {Math.round(s.total_duration_s / 60)} min
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── TEST (groupé par catégorie) ── */}
            {tab === "test" && (
              <>
                <input
                  value={testSearch}
                  onChange={e => setTestSearch(e.target.value)}
                  placeholder="Rechercher un test…"
                  autoFocus
                  style={inputStyle}
                />

                {filteredTests.length === 0 ? (
                  <div style={emptyTxt}>{testSearch ? `Aucun test « ${testSearch} »` : "Banque de tests vide"}</div>
                ) : (
                  <>
                    {/* Grouped sections */}
                    {testGroups.map(({ cat, tests }) => {
                      const cc = TEST_CATEGORY_COLOR[cat];
                      return (
                        <div key={cat}>
                          <div style={{
                            fontSize: 10, fontWeight: 700, color: cc,
                            textTransform: "uppercase", letterSpacing: "0.5px",
                            marginBottom: 5,
                            display: "flex", alignItems: "center", gap: 6,
                          }}>
                            <div style={{ width: 14, height: 2, borderRadius: 1, background: cc }} />
                            {TEST_CATEGORY_LABEL[cat]}
                            <span style={{ fontWeight: 400, opacity: 0.6 }}>· {tests.length}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
                            {tests.map(def => {
                              const active = selectedTestDef?.id === def.id;
                              return (
                                <button
                                  key={def.id}
                                  onClick={() => { setSelectedTestDef(active ? null : def); setTestTitle(active ? "" : def.name); }}
                                  style={{ ...itemBtn(active, cc), display: "flex", alignItems: "center", gap: 7 }}
                                >
                                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                                    {active && "✓ "}{def.name}
                                  </span>
                                  {def.kind === "preset" && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: C.ac + "20", color: C.ac, flexShrink: 0 }}>✓</span>
                                  )}
                                  {def.test_variables.length > 0 && (
                                    <span style={{ fontSize: 9, color: C.tx3, flexShrink: 0 }}>{def.test_variables.length}v</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Uncategorized */}
                    {uncategorized.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
                          Autres · {uncategorized.length}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
                          {uncategorized.map(def => {
                            const active = selectedTestDef?.id === def.id;
                            return (
                              <button
                                key={def.id}
                                onClick={() => { setSelectedTestDef(active ? null : def); setTestTitle(active ? "" : def.name); }}
                                style={{ ...itemBtn(active, C.o), display: "flex", alignItems: "center", gap: 7 }}
                              >
                                <span style={{ flex: 1, textAlign: "left" }}>{active && "✓ "}{def.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Titre libre si besoin */}
                {(filteredTests.length === 0 || (testTitle && testTitle !== (selectedTestDef?.name ?? ""))) && (
                  <div>
                    <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>
                      {selectedTestDef ? "Titre personnalisé" : "Ou saisir un titre libre"}
                    </div>
                    <input
                      value={testTitle}
                      onChange={e => { setTestTitle(e.target.value); if (selectedTestDef && e.target.value !== selectedTestDef.name) setSelectedTestDef(null); }}
                      placeholder="ex: VMA, 1RM Squat…"
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Type — affiché uniquement si une sélection est faite */}
                {(selectedTestDef || testTitle.trim()) && (
                  <div>
                    <div style={{ fontSize: 10, color: C.tx3, marginBottom: 5 }}>Type</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {TEST_TYPES.map(t => (
                        <button
                          key={t}
                          onClick={() => setTestType(t)}
                          style={{
                            padding: "4px 10px", borderRadius: 7,
                            border: "1px solid " + (testType === t ? C.o + "60" : C.brdL),
                            background: testType === t ? C.oS : "transparent",
                            color: testType === t ? C.o : C.tx3,
                            fontSize: 11, fontWeight: testType === t ? 600 : 400,
                            cursor: "pointer", fontFamily: "inherit",
                            textTransform: "capitalize",
                          }}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── SPÉCIFIQUE (placeholder) ── */}
            {tab === "specific" && (
              <div style={{ ...emptyTxt, padding: "40px 0" }}>
                Bientôt disponible
              </div>
            )}
          </div>
        </div>

        {/* ── Submit ── */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid " + C.brd, flexShrink: 0 }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 4,
              border: "none",
              background: canSubmit && !isPending ? C.ac : C.s2,
              color: canSubmit && !isPending ? "#fff" : C.tx3,
              fontSize: 13, fontWeight: 700,
              cursor: canSubmit && !isPending ? "pointer" : "default",
              fontFamily: "inherit", transition: "all 150ms",
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
