import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { C, H } from "@/lib/theme";
import { TEST_CATEGORY_LABEL, TEST_CATEGORY_COLOR, TEST_CATEGORY_ORDER } from "@/features/shared/types/tests";
import type { EnergySessionRow } from "@/types/energy";
import { BIO_COLOR, BIO_BANK_ID, BIO_TITLE, ENERGY_KIND_COLOR, ENERGY_KIND_LABEL, BankTab, BANK_TABS } from "./calendarConstants";
import { DraggableSession } from "./DraggableSession";
import { BankGroupTitle } from "./BankGroupTitle";

export function PlanningBank({
  sessions,
  energySessions,
  testDefinitions,
  activeDragId,
}: {
  sessions: Array<{ id: string; name: string }>;
  energySessions: EnergySessionRow[];
  testDefinitions: Array<{ id: string; name: string; kind?: string; category?: string | null }>;
  activeDragId: string | null;
}) {
  const [tab, setTab]       = useState<BankTab>("workout");
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  function toggleCat(cat: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = search.toLowerCase();
  const filteredMuscu      = sessions.filter((s) => s.name.toLowerCase().includes(q));
  const filteredEnergy     = energySessions.filter((s) => s.session_kind !== "specifique" && s.name.toLowerCase().includes(q));
  const filteredSpecifique = energySessions.filter((s) => s.session_kind === "specifique" && s.name.toLowerCase().includes(q));
  const filteredTests      = testDefinitions.filter((t) => t.name.toLowerCase().includes(q));

  const testGroups = TEST_CATEGORY_ORDER
    .map((cat) => ({ cat, tests: filteredTests.filter((t) => t.category === cat) }))
    .filter((g) => g.tests.length > 0);
  const uncategorized = filteredTests.filter((t) => !t.category);

  const empty = (msg: string) => (
    <div style={{ fontSize: 11, color: C.tx3, textAlign: "center", padding: "14px 0" }}>
      {search ? "Aucun résultat" : msg}
    </div>
  );

  return (
    <div
      style={{
        width: 252, flexShrink: 0,
        background: C.s1,
        borderRadius: 6,
        border: "1px solid " + C.brd,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        alignSelf: "stretch",
        maxHeight: 720,
      }}
    >
      {/* Header : 4 catégories distinctes */}
      <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid " + C.brd }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Programmer
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {BANK_TABS.map(({ key, label, Icon, color }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  padding: "10px 0", borderRadius: 4,
                  border: "1px solid " + (active ? color + "70" : C.brd),
                  background: active ? color + "1A" : C.s2,
                  color: active ? color : C.tx3,
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 130ms",
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{
            width: "100%", padding: "6px 9px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: C.s2,
            color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Contenu */}
      <div
        style={{
          flex: 1, overflowY: "auto", padding: "8px",
          display: "flex", flexDirection: "column", gap: 5,
          scrollbarWidth: "none",
        }}
      >
        {tab === "workout" && (
          filteredMuscu.length === 0 ? empty("Aucune séance dans la banque") :
          filteredMuscu.map((s) => (
            <DraggableSession key={s.id} session={s} sessionType="workout" isDragging={activeDragId === s.id} />
          ))
        )}

        {tab === "energy" && (
          filteredEnergy.length === 0 ? empty("Aucune séance énergétique") :
          filteredEnergy.map((s) => {
            const kc = ENERGY_KIND_COLOR[s.session_kind] ?? C.ac;
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <DraggableSession session={{ id: s.id, name: s.name }} sessionType="energy" isDragging={activeDragId === s.id} />
                <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: kc, fontWeight: 700 }}>{ENERGY_KIND_LABEL[s.session_kind] ?? s.session_kind}</span>
                  {s.total_duration_s != null && <span>{Math.round(s.total_duration_s / 60)} min</span>}
                </div>
              </div>
            );
          })
        )}

        {tab === "specifique" && (
          filteredSpecifique.length === 0 ? empty("Aucune séance spécifique") :
          filteredSpecifique.map((s) => {
            const isClassique = s.format === "classique";
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <DraggableSession session={{ id: s.id, name: s.name }} sessionType="specifique" isDragging={activeDragId === s.id} />
                <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: H.miel, fontWeight: 700 }}>{isClassique ? "Blocs" : "WOD"}</span>
                  {s.total_duration_s != null && s.total_duration_s > 0 && <span>{Math.round(s.total_duration_s / 60)} min</span>}
                </div>
              </div>
            );
          })
        )}

        {tab === "tests" && (
          <>
            {/* Biométrie — épinglée en tête */}
            <BankGroupTitle label="Biométrie" color={BIO_COLOR} />
            <DraggableSession
              session={{ id: BIO_BANK_ID, name: BIO_TITLE }}
              sessionType="biometric"
              isDragging={activeDragId === BIO_BANK_ID}
            />
            <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 6, marginBottom: 4 }}>
              L'athlète saisit mensurations &amp; photos
            </div>

            {/* Tests : catégories repliables (menu déroulant) */}
            {filteredTests.length === 0 ? empty("Aucun test dans la banque") : (
              <>
                {[...testGroups.map((g) => ({ ...g, label: TEST_CATEGORY_LABEL[g.cat], color: TEST_CATEGORY_COLOR[g.cat] })),
                  ...(uncategorized.length > 0 ? [{ cat: "__autres__", tests: uncategorized, label: "Autres", color: C.tx3 }] : []),
                ].map(({ cat, tests, label, color }) => {
                  const isOpen = openCats.has(cat) || !!search.trim();
                  return (
                    <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button
                        onClick={() => toggleCat(cat)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 9px", borderRadius: 4,
                          border: "1px solid " + (isOpen ? color + "50" : C.brd),
                          background: isOpen ? color + "10" : C.s2,
                          color, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                          textTransform: "uppercase", letterSpacing: "0.04em",
                          transition: "all 130ms",
                        }}
                      >
                        <ChevronRight
                          size={12}
                          style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 130ms", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
                        <span style={{ fontWeight: 500, opacity: 0.6, fontSize: 10 }}>{tests.length}</span>
                      </button>
                      {isOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 6, marginBottom: 2 }}>
                          {tests.map((t) => (
                            <DraggableSession key={t.id} session={{ id: t.id, name: t.name }} sessionType="test" isDragging={activeDragId === t.id} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      <div style={{ padding: "8px 10px", borderTop: "1px solid " + C.brd }}>
        <div style={{ fontSize: 9, color: C.tx3, textAlign: "center" }}>
          ↕ Glisser sur le calendrier
        </div>
      </div>
    </div>
  );
}
