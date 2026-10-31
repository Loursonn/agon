import { C } from "@/lib/theme";
import { useStaffPlanning, type StaffPlanItem } from "../../hooks/useStaffAthleteData";
import { empty, fmtDate, row, tabTitle } from "./staffTabStyles";

const KIND: Record<StaffPlanItem["kind"], { l: string; c: string }> = {
  saison: { l: "Saison", c: C.tx2 },
  macro: { l: "Macrocycle", c: C.b },
  cycle: { l: "Cycle", c: C.pat },
  competition: { l: "Compétition", c: C.ac },
};

/** Planification (domaine `planification`) — lecture seule. */
export function StaffPlanningTab({ athleteId }: { athleteId: string }) {
  const { data = [], isLoading } = useStaffPlanning(athleteId, true);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.filter((i) => i.kind === "competition" && i.start >= today).sort((a, b) => a.start.localeCompare(b.start));
  const current = data.filter((i) => i.kind !== "competition" && i.start <= today && (!i.end || i.end >= today));

  if (isLoading) return <div style={empty}>Chargement…</div>;
  if (data.length === 0) return <div style={empty}>Aucune planification renseignée.</div>;

  const Item = ({ i }: { i: StaffPlanItem }) => (
    <div style={{ ...row, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: KIND[i.kind].c, width: 84, flexShrink: 0 }}>{KIND[i.kind].l}</span>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{i.name}</div>
        {i.detail && <div style={{ fontSize: 11, color: C.tx2 }}>{i.detail}</div>}
      </div>
      <span style={{ fontSize: 11, color: C.tx3 }}>{fmtDate(i.start)}{i.end ? ` → ${fmtDate(i.end)}` : ""}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section>
        <h2 style={tabTitle}>En cours</h2>
        {current.length === 0 ? <div style={empty}>Rien en cours aujourd'hui.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{current.map((i) => <Item key={i.id} i={i} />)}</div>
        )}
      </section>
      <section>
        <h2 style={tabTitle}>Compétitions à venir</h2>
        {upcoming.length === 0 ? <div style={empty}>Aucune compétition prévue.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{upcoming.map((i) => <Item key={i.id} i={i} />)}</div>
        )}
      </section>
      <section>
        <h2 style={tabTitle}>Tout l'historique</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{data.map((i) => <Item key={i.id} i={i} />)}</div>
      </section>
    </div>
  );
}
