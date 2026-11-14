import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEST_CATEGORY_LABEL, TEST_CATEGORY_ORDER } from "@/features/shared/types/tests";
import type { EnergySessionRow } from "@/types/energy";
import { BIO_BANK_ID, BIO_TITLE, ENERGY_KIND_LABEL, BankTab, BANK_TABS } from "./calendarConstants";
import { BANK_SIDE_TAB_ON, ENERGY_KIND_TEXT, TEST_CAT_TONE } from "./bankTone";
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
    <div className="py-3.5 text-center text-[11px] text-agon-tx3">
      {search ? "Aucun résultat" : msg}
    </div>
  );
  const META = "flex items-center gap-1.5 pl-1.5 text-[9px] text-agon-tx3";

  return (
    <div className="flex max-h-[720px] w-[252px] flex-shrink-0 flex-col self-stretch overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      {/* Header : 4 catégories distinctes */}
      <div className="border-b border-agon-brd px-3 pb-2.5 pt-3">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
          Programmer
        </div>
        <div className="mb-2.5 grid grid-cols-2 gap-1.5">
          {BANK_TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[4px] border py-2.5 text-[11px] transition-all duration-[130ms]",
                  active ? BANK_SIDE_TAB_ON[key] : "border-agon-brd bg-agon-s2 font-medium text-agon-tx3",
                )}
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
          className="w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-[9px] py-1.5 text-[12px] text-agon-tx outline-none"
        />
      </div>

      {/* Contenu */}
      <div className="flex flex-1 flex-col gap-[5px] overflow-y-auto p-2 [scrollbar-width:none]">
        {tab === "workout" && (
          filteredMuscu.length === 0 ? empty("Aucune séance dans la banque") :
          filteredMuscu.map((s) => (
            <DraggableSession key={s.id} session={s} sessionType="workout" isDragging={activeDragId === s.id} />
          ))
        )}

        {tab === "energy" && (
          filteredEnergy.length === 0 ? empty("Aucune séance énergétique") :
          filteredEnergy.map((s) => (
            <div key={s.id} className="flex flex-col gap-0.5">
              <DraggableSession session={{ id: s.id, name: s.name }} sessionType="energy" isDragging={activeDragId === s.id} />
              <div className={META}>
                <span className={cn("font-bold", ENERGY_KIND_TEXT[s.session_kind] ?? "text-agon-accent")}>{ENERGY_KIND_LABEL[s.session_kind] ?? s.session_kind}</span>
                {s.total_duration_s != null && <span>{Math.round(s.total_duration_s / 60)} min</span>}
              </div>
            </div>
          ))
        )}

        {tab === "specifique" && (
          filteredSpecifique.length === 0 ? empty("Aucune séance spécifique") :
          filteredSpecifique.map((s) => {
            const isClassique = s.format === "classique";
            return (
              <div key={s.id} className="flex flex-col gap-0.5">
                <DraggableSession session={{ id: s.id, name: s.name }} sessionType="specifique" isDragging={activeDragId === s.id} />
                <div className={META}>
                  <span className="font-bold text-agon-type-hyrox">{isClassique ? "Blocs" : "WOD"}</span>
                  {s.total_duration_s != null && s.total_duration_s > 0 && <span>{Math.round(s.total_duration_s / 60)} min</span>}
                </div>
              </div>
            );
          })
        )}

        {tab === "tests" && (
          <>
            {/* Biométrie — épinglée en tête */}
            <BankGroupTitle label="Biométrie" />
            <DraggableSession
              session={{ id: BIO_BANK_ID, name: BIO_TITLE }}
              sessionType="biometric"
              isDragging={activeDragId === BIO_BANK_ID}
            />
            <div className="mb-1 pl-1.5 text-[9px] text-agon-tx3">
              L'athlète saisit mensurations &amp; photos
            </div>

            {/* Tests : catégories repliables (menu déroulant) */}
            {filteredTests.length === 0 ? empty("Aucun test dans la banque") : (
              <>
                {[...testGroups.map((g) => ({ ...g, label: TEST_CATEGORY_LABEL[g.cat], tone: TEST_CAT_TONE[g.cat] })),
                  ...(uncategorized.length > 0 ? [{ cat: "__autres__", tests: uncategorized, label: "Autres", tone: TEST_CAT_TONE.autres }] : []),
                ].map(({ cat, tests, label, tone }) => {
                  const isOpen = openCats.has(cat) || !!search.trim();
                  return (
                    <div key={cat} className="flex flex-col gap-1">
                      <button
                        onClick={() => toggleCat(cat)}
                        className={cn(
                          "flex cursor-pointer items-center gap-1.5 rounded-[4px] border px-[9px] py-[7px] text-[11px] font-bold uppercase tracking-[0.04em] transition-all duration-[130ms]",
                          tone.text,
                          isOpen ? tone.open : "border-agon-brd bg-agon-s2",
                        )}
                      >
                        <ChevronRight size={12} className={cn("flex-shrink-0 transition-transform duration-[130ms]", isOpen && "rotate-90")} />
                        <span className="flex-1 text-left">{label}</span>
                        <span className="text-[10px] font-medium opacity-60">{tests.length}</span>
                      </button>
                      {isOpen && (
                        <div className="mb-0.5 flex flex-col gap-1 pl-1.5">
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

      <div className="border-t border-agon-brd px-2.5 py-2">
        <div className="text-center text-[9px] text-agon-tx3">
          ↕ Glisser sur le calendrier
        </div>
      </div>
    </div>
  );
}
