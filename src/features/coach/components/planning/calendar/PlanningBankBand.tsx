import { useState } from "react";
import { cn } from "@/lib/utils";
import { TEST_CATEGORY_LABEL } from "@/features/shared/types/tests";
import type { EnergySessionRow } from "@/types/energy";
import { BIO_BANK_ID, BIO_TITLE, ENERGY_KIND_LABEL, BankTab, BANK_TABS } from "./calendarConstants";
import { BANK_TAB_ON } from "./bankTone";
import { DraggableSession } from "./DraggableSession";

/**
 * Banque en bandeau au-dessus de la semaine (planche CoachPlanningLarge3, P24) :
 * catégories en pastilles, recherche, petites cartes qui défilent en continu
 * et se glissent sur un jour. Mêmes éléments que la colonne du mois.
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
  const q = search.trim().toLowerCase();
  const muscu = sessions.filter((s) => s.name.toLowerCase().includes(q));
  const energy = energySessions.filter((s) => s.session_kind !== "specifique" && s.name.toLowerCase().includes(q));
  const spec = energySessions.filter((s) => s.session_kind === "specifique" && s.name.toLowerCase().includes(q));
  const tests = testDefinitions.filter((t) => t.name.toLowerCase().includes(q));
  const counts: Record<BankTab, number> = { workout: muscu.length, energy: energy.length, specifique: spec.length, tests: tests.length + 1 };
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
    return [
      <DraggableSession key={BIO_BANK_ID} variant="card" session={{ id: BIO_BANK_ID, name: BIO_TITLE }} sessionType="biometric" isDragging={activeDragId === BIO_BANK_ID} meta="Saisie de l'athlète" />,
      ...tests.map((t) => (
        <DraggableSession key={t.id} variant="card" session={{ id: t.id, name: t.name }} sessionType="test" isDragging={activeDragId === t.id}
          meta={t.category ? TEST_CATEGORY_LABEL[t.category as keyof typeof TEST_CATEGORY_LABEL] ?? null : null} />
      )),
    ];
  })();

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
          placeholder="Rechercher dans la banque…"
          aria-label="Rechercher dans la banque"
          className="ml-auto h-8 w-[260px] rounded-[10px] border border-agon-brd-l bg-transparent px-3 text-[12.5px] text-agon-tx outline-none"
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
      {!folded && (
        <div className="flex gap-2.5 overflow-x-auto px-3.5 pb-3 pt-2.5 [scrollbar-width:thin]">
          {cards.length === 0 ? (
            <div className="py-[18px] text-[12.5px] text-agon-tx3">{q ? "Aucun résultat" : "Rien dans la banque pour cette catégorie."}</div>
          ) : cards}
        </div>
      )}
    </section>
  );
}
