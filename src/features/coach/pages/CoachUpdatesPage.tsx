/**
 * CoachUpdatesPage — historique des nouveautés de l'app (vue coach).
 * Route : /coach/nouveautes
 * Admin : qui a vu chaque nouveauté (« vu par X / Y coachs »).
 */
import { useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates, useAppUpdateStats, useMarkAppUpdateSeen } from "@/features/shared/hooks/useAppUpdates";
import { ReleaseNoteContent } from "../components/updates/ReleaseNoteContent";
import { ReleaseNoteKindBadge } from "../components/updates/ReleaseNoteKindBadge";

function fmtDate(iso: string) {
  return new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function CoachUpdatesPage() {
  const { user, profile } = useAuth();
  const isAdmin = !!profile?.is_admin;
  const { notes, reads, unseen, isError } = useAppUpdates(user?.id);
  const { data: stats = [] } = useAppUpdateStats(isAdmin);
  const mark = useMarkAppUpdateSeen();
  const [whoOpen, setWhoOpen] = useState<string | null>(null);

  const totalCoaches = stats[0]?.total_coaches ?? null;

  return (
    <div style={{ padding: "24px 20px 60px", width: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: C.tx, margin: 0, flex: 1 }}>Nouveautés</h1>
        {user && unseen.length > 1 && (
          <button
            onClick={() => mark.mutate({ userId: user.id, updateIds: unseen.map(n => n.id) })}
            style={{ minHeight: 36, padding: "6px 14px", borderRadius: 4, border: "1px solid " + C.ac + "50", background: C.acS, color: C.ac, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Tout marquer comme vu ({unseen.length})
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: C.tx3, margin: "0 0 20px" }}>
        Chaque mise à jour de l'app, résumée : ce qui change et à quoi ça te sert.
      </p>
      {isError && (
        <div style={{ fontSize: 12, color: C.o, marginBottom: 16 }}>Le suivi « vu » est momentanément indisponible.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {notes.map(note => {
          const seenAt = reads[note.id];
          const readers = stats.filter(s => s.update_id === note.id);
          return (
            <article key={note.id} style={{ background: C.s1, border: "1px solid " + (seenAt ? C.brd : C.ac + "50"), borderRadius: 6, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <ReleaseNoteKindBadge kind={note.kind} />
                <span style={{ fontSize: 11, color: C.tx3 }}>{fmtDate(note.date)}</span>
                {seenAt ? (
                  <span style={{ fontSize: 11, color: C.g }}>· Vue le {fmtDate(seenAt)}</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#0E0C0A", background: C.ac, borderRadius: 3, padding: "1px 6px" }}>NON VUE</span>
                )}
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: C.tx, margin: "0 0 4px" }}>{note.title}</h2>
              <p style={{ fontSize: 13, color: C.tx2, margin: "0 0 12px" }}>{note.summary}</p>
              <ReleaseNoteContent note={note} />

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
                {!seenAt && user && (
                  <button
                    onClick={() => mark.mutate({ userId: user.id, updateIds: [note.id] })}
                    style={{ minHeight: 40, padding: "8px 16px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    J'ai vu
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setWhoOpen(whoOpen === note.id ? null : note.id)}
                    style={{ minHeight: 36, padding: "6px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Vue par {readers.length}{totalCoaches != null ? ` / ${totalCoaches}` : ""} coach{readers.length > 1 ? "s" : ""}
                  </button>
                )}
              </div>
              {isAdmin && whoOpen === note.id && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {readers.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.tx3 }}>Aucun coach ne l'a encore vue.</div>
                  ) : readers.map(r => (
                    <div key={r.user_id} style={{ display: "flex", gap: 8, fontSize: 12, padding: "6px 10px", background: C.s2, borderRadius: 4 }}>
                      <span style={{ flex: 1, color: C.tx }}>{r.full_name}</span>
                      <span style={{ color: C.tx3 }}>{fmtDate(r.seen_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
