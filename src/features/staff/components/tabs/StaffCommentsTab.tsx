import { C } from "@/lib/theme";
import { useAthleteDocComments } from "@/features/shared/hooks/fiches/useDocComments";
import { useStaffWeeklyRetours } from "../../hooks/useStaffAthleteData";
import { empty, fmtDate, row, tabTitle } from "./staffTabStyles";

/**
 * Commentaires (domaine `commentaires`) : retours hebdo du coach (lecture) et
 * fils de commentaires sur les fiches. On répond dans la fiche elle-même.
 */
export function StaffCommentsTab({ athleteId }: { athleteId: string }) {
  const { data: retours = [], isLoading } = useStaffWeeklyRetours(athleteId, true);
  const { data: comments = [] } = useAthleteDocComments(athleteId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section>
        <h2 style={tabTitle}>Retours hebdo du coach</h2>
        {isLoading ? <div style={empty}>Chargement…</div> : retours.length === 0 ? <div style={empty}>Aucun retour hebdo.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {retours.map((r) => (
              <div key={r.id} style={row}>
                <div style={{ fontSize: 11, color: C.tx3, marginBottom: 4 }}>Semaine du {fmtDate(r.week_start)}{r.athlete_reaction ? ` · ${r.athlete_reaction}` : ""}</div>
                <div style={{ fontSize: 13, color: C.tx, whiteSpace: "pre-wrap" }}>{r.comment}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 style={tabTitle}>Commentaires sur les fiches · {comments.length}</h2>
        {comments.length === 0 ? <div style={empty}>Aucun commentaire. Ouvre une fiche (onglet Fiches) pour en écrire un.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {comments.slice(0, 20).map((c) => (
              <div key={c.id} style={row}>
                <div style={{ fontSize: 11, color: C.tx3, marginBottom: 2 }}>{fmtDate(c.created_at)}{c.image_path ? " · 🖼️" : ""}</div>
                <div style={{ fontSize: 13, color: C.tx }}>{c.body || "(image)"}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
