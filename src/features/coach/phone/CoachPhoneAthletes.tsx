import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { useCoachDashboard, type SessionStatus } from "@/features/shared/hooks/useCoachDashboard";
import { useWellnessAlerts } from "@/features/shared/hooks/useWellnessAlerts";
import { useUpcomingCompetitions, type UpcomingCompetition } from "@/features/shared/hooks/useUpcomingCompetitions";
import { Avatar, CARD, Chevron, Chip, DISPLAY, Dot, KICKER, MONO, PhoneButton, PhonePage, Tag, dash, rowLine } from "./phoneUi";
import { shareCoachCode } from "./CoachPhonePlus";

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: "Planifié", in_progress: "En cours", completed: "Terminé", missed: "Manqué", skipped: "Sauté",
};

type Filter = "all" | "alert" | "compet";

function ageOf(a: Profile): number | null {
  if (a.birth_date) {
    const b = new Date(a.birth_date + "T12:00:00");
    const n = new Date();
    let age = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) age--;
    return age;
  }
  return a.age ?? null;
}

/**
 * Liste des athlètes sur téléphone (planche CoachPhoneAthletes) : recherche,
 * filtres Tous / Alerte / Compétition, pastille et score wellness du jour,
 * code coach à partager, athlètes masqués.
 */
export default function CoachPhoneAthletes() {
  const navigate = useNavigate();
  const { profile, user, athletes, hiddenAthletes, setAthleteHidden, createPendingAthlete } = useAuth();
  const { todayAthletes } = useCoachDashboard();
  const { alerts, injuries } = useWellnessAlerts();
  const { competitions } = useUpcomingCompetitions(120);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [creating, setCreating] = useState(false);

  const today = useMemo(() => new Map(todayAthletes.map((t) => [t.athleteId, t])), [todayAthletes]);
  const alertIds = useMemo(() => new Set([...alerts.map((a) => a.athleteId), ...injuries.map((i) => i.athleteId)]), [alerts, injuries]);
  const nextCompet = useMemo(() => {
    const m = new Map<string, UpcomingCompetition>();
    for (const c of competitions) if (!m.has(c.athlete_id)) m.set(c.athlete_id, c);
    return m;
  }, [competitions]);

  const list = athletes;
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const shown = list.filter((a) => {
    if (q && !norm(a.full_name).includes(norm(q))) return false;
    if (filter === "alert") return alertIds.has(a.id);
    if (filter === "compet") return nextCompet.has(a.id);
    return true;
  });
  const nAlert = list.filter((a) => alertIds.has(a.id)).length;
  const nCompet = list.filter((a) => nextCompet.has(a.id)).length;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !first.trim() || !last.trim()) return;
    setCreating(true);
    try {
      const id = await createPendingAthlete(first.trim(), last.trim());
      toast.success("Athlète créé");
      navigate(`/coach/athletes/${id}/planning`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  }

  function subtitle(a: Profile): string {
    if (a.is_pending) return "En attente de première connexion";
    const age = ageOf(a);
    const c = nextCompet.get(a.id);
    const parts = [age != null ? `${age} ans` : null, c ? `${c.name} ${c.daysUntil === 0 ? "Jour J" : `J-${c.daysUntil}`}` : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Profil non renseigné";
  }

  const field: React.CSSProperties = {
    height: 42, padding: "0 12px", borderRadius: 11, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx,
    fontSize: 14, fontFamily: "inherit", minWidth: 0, flex: 1,
  };

  return (
    <PhonePage>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28 }}>
        <span style={KICKER}>{list.length} athlète{list.length > 1 ? "s" : ""}</span>
        <button type="button" aria-label="Ajouter un athlète" onClick={() => setAddOpen((v) => !v)} style={{ background: "none", border: "none", padding: 4, cursor: "pointer" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ac} strokeWidth="1.5" strokeLinecap="square"><path d="M12 5V19M5 12H19" /></svg>
        </button>
      </div>
      <h1 style={{ margin: 0, ...DISPLAY, fontSize: 22 }}>Athlètes</h1>

      {addOpen && (
        <form onSubmit={create} style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ ...KICKER, color: C.tx2 }}>Nouvel athlète</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input aria-label="Prénom" placeholder="Prénom" value={first} onChange={(e) => setFirst(e.target.value)} style={field} />
            <input aria-label="Nom" placeholder="Nom" value={last} onChange={(e) => setLast(e.target.value)} style={field} />
          </div>
          <div style={{ fontSize: 12, color: C.tx3 }}>Le compte est créé tout de suite ; l’athlète le réclame ensuite avec son lien.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <PhoneButton style={{ flex: 1 }} onClick={() => setAddOpen(false)}>Annuler</PhoneButton>
            <PhoneButton primary type="submit" style={{ flex: 1 }} disabled={creating || !first.trim() || !last.trim()}>Créer</PhoneButton>
          </div>
        </form>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 14px", borderRadius: 12, background: C.s2 }}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.5" strokeLinecap="square"><circle cx="11" cy="11" r="6.5" /><path d="M16 16L21 21" /></svg>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un athlète" aria-label="Rechercher un athlète"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.tx, fontSize: 14, fontFamily: "inherit" }}
        />
      </label>

      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>Tous · {list.length}</Chip>
        <Chip active={filter === "alert"} onClick={() => setFilter("alert")}>Alerte · {nAlert}</Chip>
        <Chip active={filter === "compet"} onClick={() => setFilter("compet")}>Compétition · {nCompet}</Chip>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
        <span style={{ ...KICKER, fontSize: 11, letterSpacing: "0.1em" }}>Athlète</span>
        <span style={{ ...KICKER, fontSize: 11, letterSpacing: "0.1em" }}>Wellness du jour</span>
      </div>

      {shown.length === 0 ? (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>
          {list.length === 0 ? "Aucun athlète pour l’instant : partage ton code coach." : "Aucun athlète ne correspond."}
        </div>
      ) : (
        <div style={{ ...CARD, padding: "2px 14px" }}>
          {shown.map((a, i) => {
            const t = today.get(a.id);
            const s = t?.sessions[0];
            const self = a.id === user?.id;
            return (
              <button key={a.id} type="button" onClick={() => navigate(`/coach/athletes/${a.id}/planning`)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 0", width: "100%", textAlign: "left",
                background: "none", border: "none", boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
              }}>
                <Avatar name={a.full_name} gold={alertIds.has(a.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", minWidth: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{a.full_name}{self ? " (moi)" : ""}</span>
                    {a.co_coached_by_me ? <Tag>Co-coach</Tag> : a.co_coach_id ? <Tag>2 coachs</Tag> : null}
                  </div>
                  <div style={{ fontSize: 12, color: C.tx2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle(a)}</div>
                </div>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flex: "none" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Dot color={t?.wellnessScore != null ? t.wellnessColor : null} />
                    <span style={{ ...MONO, fontSize: 14, color: t?.wellnessScore != null ? C.tx : C.tx3 }}>{dash(t?.wellnessScore)}</span>
                  </span>
                  <span style={{ fontSize: 11, color: C.tx3 }}>{s ? STATUS_LABEL[s.status] : ""}</span>
                </span>
                <Chevron />
              </button>
            );
          })}
        </div>
      )}

      {profile?.coach_code && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: `1px dashed ${C.brdL}` }}>
          <div style={{ flex: 1 }}>
            <span style={{ ...KICKER, color: C.tx2 }}>Code coach</span>
            <div style={{ ...MONO, fontSize: 20, letterSpacing: "0.12em", color: C.ac, marginTop: 2 }}>{profile.coach_code}</div>
          </div>
          <button type="button" onClick={() => void shareCoachCode(profile.coach_code!)} style={{
            height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.brdL}`, color: C.tx, background: "transparent",
            fontSize: 13, fontFamily: "inherit", cursor: "pointer",
          }}>Partager</button>
        </div>
      )}

      {hiddenAthletes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={() => setShowHidden((v) => !v)} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: "0 2px", color: C.tx3, fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
            Masqués ({hiddenAthletes.length}) {showHidden ? "⌃" : "›"}
          </button>
          {showHidden && (
            <div style={{ ...CARD, padding: "2px 14px" }}>
              {hiddenAthletes.map((a, i) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", boxShadow: rowLine(i) }}>
                  <Avatar name={a.full_name} size={32} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.full_name}</span>
                  <button type="button" onClick={() => setAthleteHidden(a.id, false).then(() => toast.success("Athlète réaffiché"), () => toast.error("Erreur"))} style={{
                    height: 32, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                  }}>Réafficher</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Retirer un athlète, gérer les co-coachs et les liens : sur ordinateur.</div>
    </PhonePage>
  );
}
