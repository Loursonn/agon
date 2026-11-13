import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { ROUGE } from "@/lib/peps";
import { useAuth } from "@/hooks/useAuth";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useWeeklyRetours } from "@/features/shared/hooks/useWeeklyRetours";
import { useAthleteModifications } from "@/features/shared/hooks/useAthleteModifications";
import { useWeeklyCoachRetour, useUpsertWeeklyRetour, RETOUR_REACTIONS } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { useMedicalEntries } from "@/features/shared/hooks/useMedicalEntries";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { activeInjuries, fmtInjuryDate, injurySummary } from "@/lib/injuryDetails";
import { getReco } from "@/lib/wellness";
import { mondayOf } from "@/lib/trainingLoadWeek";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { CARD, Chevron, KICKER, MONO, PhoneButton, PhonePage, Section, Tag, fmtDec, rowLine } from "./phoneUi";

const DOW = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Retours d'un athlète sur téléphone (planche CoachPhoneRetours) : une
 * semaine, wellness jour par jour avec séance faite ou non, 3 chiffres,
 * modifications de l'athlète, retour du coach (modifiable), blessures.
 */
export default function CoachPhoneRetours() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { user } = useAuth();
  const { freeSessions, athleteProfile } = useAthleteContext();
  const first = (athleteProfile?.first_name || athleteProfile?.full_name?.split(" ")[0] || "l’athlète").trim();
  const today = localIsoDay();
  const [offset, setOffset] = useState(0);
  const monday = addDays(mondayOf(today), offset * 7);
  const sunday = addDays(monday, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const weekQ = useWeeklyRetours(athleteId, new Date(monday + "T12:00:00"));
  const week = weekQ.data?.current_week ?? null;
  const { data: mods = [] } = useAthleteModifications(athleteId);
  const { data: retour } = useWeeklyCoachRetour(athleteId, monday);
  const upsert = useUpsertWeeklyRetour();
  const { data: medical = [] } = useMedicalEntries(athleteId);
  const injuries = medical.filter((e) => e.kind === "blessure");
  const active = activeInjuries(injuries);
  const { summaryBetween } = useRunningVolume(athleteId, freeSessions, monday);
  const { km } = summaryBetween(monday, sunday);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setEditing(false); setDraft(retour?.comment ?? ""); }, [retour?.comment, monday]);

  // ── Chiffres ───────────────────────────────────────────────────────────────
  const sessions = [
    ...(week?.workouts ?? []).map((w) => ({ date: w.scheduled_date, done: w.status === "completed", status: w.status, rpe: w.rpe_score })),
    ...(week?.energy_sessions ?? []).map((e) => ({ date: e.date, done: e.completed, status: e.status, rpe: e.rpe_score })),
  ].filter((s) => s.status !== "skipped");
  const done = sessions.filter((s) => s.done).length;
  const rpes = sessions.map((s) => s.rpe).filter((r): r is number => r != null);
  const rpeAvg = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const weekMods = mods.filter((m) => m.scheduledDate >= monday && m.scheduledDate <= sunday);

  const reaction = retour?.athlete_reaction ? RETOUR_REACTIONS.find((r) => r.key === retour.athlete_reaction) : null;

  function save() {
    if (!user) return;
    upsert.mutate(
      { athleteId, coachId: user.id, weekStart: monday, comment: draft.trim() },
      { onSuccess: () => { toast.success("Retour enregistré"); setEditing(false); }, onError: () => toast.error("Erreur d’enregistrement") },
    );
  }

  const navBtn: React.CSSProperties = { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" };
  const weekNum = week?.week_number;

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 34 }}>
        <button type="button" aria-label="Semaine précédente" style={navBtn} onClick={() => setOffset((o) => o - 1)}><Chevron dir="left" color={C.tx2} size={20} /></button>
        <button type="button" onClick={() => setOffset(0)} style={{ textAlign: "center", background: "none", border: "none", color: C.tx, fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{weekNum ? `Semaine ${weekNum}` : offset === 0 ? "Cette semaine" : "Semaine"}</div>
          <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{Number(monday.slice(8))} → {new Date(sunday + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
        </button>
        <button type="button" aria-label="Semaine suivante" disabled={offset >= 0} style={{ ...navBtn, opacity: offset >= 0 ? 0.3 : 1 }} onClick={() => setOffset((o) => Math.min(0, o + 1))}><Chevron color={C.tx2} size={20} /></button>
      </div>

      {weekQ.isError && !week ? (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>
          Les retours de cette semaine n’ont pas pu être chargés. <button type="button" onClick={() => void weekQ.refetch()} style={{ background: "none", border: "none", color: C.ac, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Réessayer</button>
        </div>
      ) : (
        <>
          <div style={{ ...CARD, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ ...KICKER, color: C.tx2 }}>Wellness · séance</span>
              <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>moy. {week?.avg_wellness != null ? Math.round(week.avg_wellness) : "—"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
              {days.map((d, i) => {
                const w = week?.daily_wellness[d]?.score ?? null;
                const daySessions = sessions.filter((s) => s.date === d);
                const mark = daySessions.length === 0 ? "" : daySessions.some((s) => s.done) ? "✓" : d < today ? "✕" : "";
                const col = w != null ? getReco(w).c : C.tx3;
                return (
                  <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0", borderRadius: 9, background: d === today ? C.s2 : "transparent" }}>
                    <span style={{ fontSize: 10.5, color: C.tx3 }}>{DOW[i]} {Number(d.slice(8))}</span>
                    <span style={{ ...MONO, fontSize: 14, color: col }}>{w != null ? Math.round(w) : "—"}</span>
                    <span style={{ fontSize: 11, height: 14, color: mark === "✓" ? C.g : ROUGE }}>{mark}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[
              { l: "Séances", v: sessions.length ? `${done}/${sessions.length}` : "—" },
              { l: "RPE moyen", v: fmtDec(rpeAvg, 1) },
              { l: "Course", v: km > 0 ? `${fmtDec(km, 1)}` : "—", u: km > 0 ? "km" : undefined },
            ].map((t) => (
              <div key={t.l} style={{ padding: "10px 12px", borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.tx3 }}>{t.l}</div>
                <div><span style={{ ...MONO, fontSize: 20 }}>{t.v}</span>{t.u && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}> {t.u}</span>}</div>
              </div>
            ))}
          </div>

          <Section n={1} title="Modifications de l’athlète" count={weekMods.length || undefined}>
            {weekMods.length === 0 ? (
              <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Aucune modification cette semaine.</div>
            ) : (
              <div style={{ ...CARD, padding: "2px 14px" }}>
                {weekMods.map((m, i) => {
                  const moved = m.rescheduledByAthlete && m.originalScheduledDate && m.originalScheduledDate !== m.scheduledDate;
                  const bonus = m.athleteModifications?.bonusSets?.reduce((n, b) => n + b.sets.length, 0) ?? 0;
                  const added = m.athleteModifications?.customExercises?.length ?? 0;
                  const parts = [
                    moved ? `Décalée du ${new Date(m.originalScheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : null,
                    m.rescheduleReason ? `« ${m.rescheduleReason} »` : null,
                    bonus ? `+${bonus} série${bonus > 1 ? "s" : ""} bonus` : null,
                    added ? `+${added} exercice${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}` : null,
                  ].filter(Boolean);
                  const st = m.status === "completed" ? { l: "Complétée", c: C.g } : m.status === "missed" ? { l: "Manquée", c: ROUGE } : { l: "Planifiée", c: C.tx3 };
                  return (
                    <div key={m.id} style={{ padding: "11px 0", boxShadow: rowLine(i) }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sessionName}</span>
                        <span style={{ fontSize: 11, color: st.c, whiteSpace: "nowrap" }}>{st.l}</span>
                      </div>
                      {parts.length > 0 && <div style={{ fontSize: 12, color: C.tx2, marginTop: 2 }}>{parts.join(" · ")}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section n={2} title="Ton retour de la semaine">
            <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {editing ? (
                <>
                  <textarea
                    aria-label="Ton retour de la semaine"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={5}
                    placeholder={`Un mot pour ${first} sur sa semaine…`}
                    style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontSize: 14, fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <PhoneButton style={{ flex: 1 }} onClick={() => { setEditing(false); setDraft(retour?.comment ?? ""); }}>Annuler</PhoneButton>
                    <PhoneButton primary style={{ flex: 1 }} disabled={upsert.isPending || !draft.trim()} onClick={save}>Enregistrer</PhoneButton>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.tx3 }}>{first} le voit dans son accueil. Modifier le retour efface sa réaction.</div>
                </>
              ) : retour?.comment ? (
                <>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{retour.comment}</div>
                  <div style={{ fontSize: 12, color: C.tx3 }}>
                    {reaction ? `Vu par ${first} · réaction « ${reaction.label} »${retour.reacted_at ? ` · ${new Date(retour.reacted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}` : "Pas encore vu"}
                  </div>
                  <PhoneButton onClick={() => setEditing(true)} style={{ alignSelf: "flex-start", height: 38 }}>Modifier le retour</PhoneButton>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: C.tx3 }}>Pas encore de retour pour cette semaine.</div>
                  <PhoneButton onClick={() => setEditing(true)} style={{ alignSelf: "flex-start", height: 38, color: C.ac, borderColor: alpha(C.ac, 0.55) }}>Écrire un retour</PhoneButton>
                </>
              )}
            </div>
          </Section>

          <Section n={3} title="Blessures" count={active.length || undefined}>
            {injuries.length === 0 ? (
              <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Aucune blessure</div>
            ) : (
              <div style={{ ...CARD, padding: "2px 14px" }}>
                {injuries.slice(0, 6).map((inj, i) => {
                  const ongoing = inj.status === "en_cours";
                  return (
                    <div key={inj.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 0", boxShadow: rowLine(i) }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{inj.title || inj.zone || "Blessure"}</div>
                        <div style={{ fontSize: 12, color: C.tx2 }}>{[injurySummary(inj), fmtInjuryDate(inj.date)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <Tag color={ongoing ? ROUGE : C.g} filled={ongoing}>{ongoing ? "En cours" : "Guéri"}</Tag>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
          <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Détail des séances, vue mois et nutrition : sur ordinateur.</div>
        </>
      )}
    </PhonePage>
  );
}
