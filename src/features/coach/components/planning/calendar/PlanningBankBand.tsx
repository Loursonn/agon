import { useState } from "react";
import { C, alpha } from "@/lib/theme";
import { TEST_CATEGORY_LABEL } from "@/features/shared/types/tests";
import type { EnergySessionRow } from "@/types/energy";
import { BIO_BANK_ID, BIO_TITLE, CARD_MONO, ENERGY_KIND_LABEL, BankTab, BANK_TABS } from "./calendarConstants";
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
    <section aria-label="Banque" style={{ background: C.bg, border: "1px solid " + C.brd, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: folded ? "12px 14px" : "12px 14px 0", flexWrap: "wrap" }}>
        <span style={{ fontFamily: CARD_MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ac }}>Programmer</span>
        <span aria-hidden style={{ width: 1, height: 20, background: C.brd }} />
        {BANK_TABS.map(({ key, label, color }) => {
          const on = tab === key;
          const c = key === "workout" ? C.ac : key === "energy" ? C.b : color;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setFolded(false); }}
              aria-pressed={on}
              style={{
                height: 30, padding: "0 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
                border: "1px solid " + (on ? alpha(c, 0.6) : C.brdL), background: on ? alpha(c, 0.14) : "transparent",
                color: on ? c : C.tx2, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {key === "workout" ? "Musculation" : label}
              <span style={{ fontFamily: CARD_MONO, fontSize: 11, opacity: 0.7 }}>{counts[key]}</span>
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans la banque…"
          aria-label="Rechercher dans la banque"
          style={{ width: 260, height: 32, marginLeft: "auto", padding: "0 12px", borderRadius: 10, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 12.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
        <span style={{ fontFamily: CARD_MONO, fontSize: 11, color: C.tx3, letterSpacing: "0.06em" }}>
          {shown} élément{shown > 1 ? "s" : ""} · glisse sur un jour
        </span>
        <button
          type="button"
          onClick={() => setFolded((f) => !f)}
          style={{ height: 30, padding: "0 12px", borderRadius: 10, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          {folded ? "Déplier" : "Replier"}
        </button>
      </div>
      {!folded && (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "10px 14px 12px", scrollbarWidth: "thin" }}>
          {cards.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.tx3, padding: "18px 0" }}>{q ? "Aucun résultat" : "Rien dans la banque pour cette catégorie."}</div>
          ) : cards}
        </div>
      )}
    </section>
  );
}
