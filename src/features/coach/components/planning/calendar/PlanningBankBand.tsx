import { useState } from "react";
import { cn } from "@/lib/utils";
import type { EnergySessionRow } from "@/types/energy";
import { foldSearch, groupBankTests, type TestGroupKey } from "@/lib/testBankGroups";
import { BIO_BANK_ID, BIO_TITLE, ENERGY_KIND_LABEL, BankTab, BANK_TABS } from "./calendarConstants";
import { BANK_TAB_ON, TEST_CAT_TONE } from "./bankTone";
import { DraggableSession } from "./DraggableSession";

/** Mots qui retrouvent la carte Biométrie dans la recherche. */
const BIO_SEARCH = foldSearch(`${BIO_TITLE} biometrie mensurations photos`);

/**
 * Banque en bandeau au-dessus de la semaine (planche CoachPlanningLarge3, P24) :
 * catégories en pastilles, recherche, petites cartes qui défilent en continu
 * et se glissent sur un jour. Mêmes éléments que la colonne du mois ; les
 * tests, trop nombreux pour une seule ligne, sont rangés par dominante
 * (pastilles pour filtrer, cartes qui passent à la ligne).
 */
export function PlanningBankBand({
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
  const [tab, setTab] = useState<BankTab>("workout");
  const [search, setSearch] = useState("");
  const [folded, setFolded] = useState(false);
  const [testCat, setTestCat] = useState<TestGroupKey | "all">("all");
  const q = foldSearch(search);
  const has = (name: string) => foldSearch(name).includes(q);
  const muscu = sessions.filter((s) => has(s.name));
  const energy = energySessions.filter((s) => s.session_kind !== "specifique" && has(s.name));
  const spec = energySessions.filter((s) => s.session_kind === "specifique" && has(s.name));
  const testGroups = groupBankTests(testDefinitions, search);
  const bioShown = q.split(/\s+/).every((w) => BIO_SEARCH.includes(w));
  const nTests = testGroups.reduce((n, g) => n + g.tests.length, 0);
  const counts: Record<BankTab, number> = { workout: muscu.length, energy: energy.length, specifique: spec.length, tests: nTests + (bioShown ? 1 : 0) };
  // Dominante choisie absente des résultats (recherche) : on revient à « Toutes ».
  const cat = testCat !== "all" && testGroups.some((g) => g.key === testCat) ? testCat : "all";
  const visibleGroups = cat === "all" ? testGroups : testGroups.filter((g) => g.key === cat);
  const minutes = (sec: number | null | undefined) => (sec != null && sec > 0 ? `${Math.round(sec / 60)} min` : null);
  const shown = counts[tab];

  const cards = (() => {
    if (tab === "workout") return muscu.map((s) => <DraggableSession key={s.id} variant="card" session={s} sessionType="workout" isDragging={activeDragId === s.id} />);
    if (tab === "energy") return energy.map((s) => (
      <DraggableSession key={s.id} variant="card" session={{ id: s.id, name: s.name }} sessionType="energy" isDragging={activeDragId === s.id}
        meta={[minutes(s.total_duration_s), ENERGY_KIND_LABEL[s.session_kind] ?? null].filter(Boolean).join(" · ") || null} />
    ));
    if (tab === "specifique") return spec.map((s) => (
      <DraggableSession key={s.id} variant="card" session={{ id: s.id, name: s.name }} sessionType="specifique" isDragging={activeDragId === s.id}
        meta={[minutes(s.total_duration_s), s.format === "classique" ? "Blocs" : "WOD"].filter(Boolean).join(" · ")} />
    ));
    return [];
  })();

  const pill = (on: boolean) => cn(
    "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px]",
    on ? "border-agon-type-test/60 bg-agon-type-test/[0.12] font-medium text-agon-tx" : "border-agon-brd-l bg-transparent text-agon-tx2",
  );
  const groupTitle = (label: string, n: number, tone: string) => (
    <div className={cn("mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em]", tone)}>
      {label}<span className="agon-mono font-medium opacity-60">{n}</span><span aria-hidden className="h-px flex-1 bg-agon-brd" />
    </div>
  );

  const testsBody = (
    <div className="px-3.5 pb-3 pt-2.5">
      {testGroups.length > 1 && (
        <div role="group" aria-label="Dominantes" className="mb-2.5 flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={cat === "all"} onClick={() => setTestCat("all")} className={pill(cat === "all")}>
            Toutes<span className="agon-mono text-[11px] opacity-70">{counts.tests}</span>
          </button>
          {testGroups.map((g) => (
            <button key={g.key} type="button" aria-pressed={cat === g.key} onClick={() => setTestCat(g.key)} className={pill(cat === g.key)}>
              <span aria-hidden className={cn("size-2 rounded-[2px] bg-current", TEST_CAT_TONE[g.key].text)} />
              {g.label}<span className="agon-mono text-[11px] opacity-70">{g.tests.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex max-h-[300px] flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {cat === "all" && bioShown && (
          <section aria-label="Biométrie">
            {groupTitle("Biométrie", 1, "text-agon-succes")}
            <div className="flex flex-wrap gap-2.5">
              <DraggableSession variant="card" session={{ id: BIO_BANK_ID, name: BIO_TITLE }} sessionType="biometric" isDragging={activeDragId === BIO_BANK_ID} meta="Saisie de l'athlète" />
            </div>
          </section>
        )}
        {visibleGroups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            {groupTitle(g.label, g.tests.length, TEST_CAT_TONE[g.key].text)}
            <div className="flex flex-wrap gap-2.5">
              {g.tests.map((t) => (
                <DraggableSession key={t.id} variant="card" session={{ id: t.id, name: t.name }} sessionType="test" isDragging={activeDragId === t.id} />
              ))}
            </div>
          </section>
        ))}
        {counts.tests === 0 && (
          <div className="py-[18px] text-[12.5px] text-agon-tx3">{q ? "Aucun résultat" : "Rien dans la banque pour cette catégorie."}</div>
        )}
      </div>
    </div>
  );

  return (
    <section aria-label="Banque" className="overflow-hidden rounded-[14px] border border-agon-brd bg-agon-bg">
      <div className={cn("flex flex-wrap items-center gap-2.5 px-3.5 pt-3", folded && "pb-3")}>
        <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-accent">Programmer</span>
        <span aria-hidden className="h-5 w-px bg-agon-brd" />
        {BANK_TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setFolded(false); }}
              aria-pressed={on}
              className={cn(
                "inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px]",
                on ? BANK_TAB_ON[key] : "border-agon-brd-l bg-transparent font-medium text-agon-tx2",
              )}
            >
              {key === "workout" ? "Musculation" : label}
              <span className="agon-mono text-[11px] opacity-70">{counts[key]}</span>
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "tests" ? "Rechercher un test, une dominante…" : "Rechercher dans la banque…"}
          aria-label="Rechercher dans la banque"
          className="ml-auto h-8 w-[260px] max-w-full rounded-[10px] border border-agon-brd-l bg-transparent px-3 text-[12.5px] text-agon-tx outline-none"
        />
        <span className="agon-mono text-[11px] tracking-[0.06em] text-agon-tx3">
          {shown} élément{shown > 1 ? "s" : ""} · glisse sur un jour
        </span>
        <button
          type="button"
          onClick={() => setFolded((f) => !f)}
          className="h-[30px] cursor-pointer rounded-[10px] border border-agon-brd-l bg-transparent px-3 text-[12px] text-agon-tx2"
        >
          {folded ? "Déplier" : "Replier"}
        </button>
      </div>
      {!folded && tab === "tests" && testsBody}
      {!folded && tab !== "tests" && (
        <div className="flex gap-2.5 overflow-x-auto px-3.5 pb-3 pt-2.5 [scrollbar-width:thin]">
          {cards.length === 0 ? (
            <div className="py-[18px] text-[12.5px] text-agon-tx3">{q ? "Aucun résultat" : "Rien dans la banque pour cette catégorie."}</div>
          ) : cards}
        </div>
      )}
    </section>
  );
}
