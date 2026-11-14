import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { ROUGE, TYPE_COLOR } from "@/lib/peps";
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
    ...(week?.workouts ?? []).map((w) => ({ date: w.scheduled_date, done: w.status === "completed", status: w.status, rpe: w.rpe_score, color: TYPE_COLOR.muscu })),
    ...(week?.energy_sessions ?? []).map((e) => ({ date: e.date, done: e.completed, status: e.status, rpe: e.rpe_score, color: TYPE_COLOR.energie })),
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
          <div style={{ ...CARD, padding: "12px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ ...KICKER, color: C.tx2 }}>Wellness · séance</span>
              <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>moy. {week?.avg_wellness != null ? Math.round(week.avg_wellness) : "—"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 }}>
              {days.map((d, i) => {
                const w = week?.daily_wellness[d]?.score ?? null;
                const daySessions = sessions.filter((s) => s.date === d);
                const mark = daySessions.length === 0 ? "" : daySessions.some((s) => s.done) ? "✓" : d < today ? "✕" : "";
                const col = w != null ? getReco(w).c : C.tx3;
                return (
                  <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0", borderRadius: 10, background: d === today ? C.s2 : "transparent" }}>
                    <span style={{ fontSize: 11, color: C.tx3 }}>{DOW[i]} <span style={{ ...MONO, color: C.tx2 }}>{Number(d.slice(8))}</span></span>
                    <span style={{ ...MONO, fontSize: 15, color: col }}>{w != null ? Math.round(w) : "—"}</span>
                    <span aria-hidden style={{ width: 26, height: 6, borderRadius: 3, background: daySessions[0]?.color ?? C.s2 }} />
                    <span aria-label={mark === "✓" ? "Faite" : mark === "✕" ? "Non faite" : undefined} style={{
                      width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, boxSizing: "border-box",
                      background: mark === "✓" ? C.g : mark === "✕" ? ROUGE : "transparent", color: C.bg,
                      border: mark ? "none" : `1px solid ${C.brdL}`,
                    }}>{mark}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[
              { l: "Séances", v: sessions.length ? `${done}/${sessions.length}` : "—", c: sessions.length && done === sessions.length ? C.g : sessions.length && done / sessions.length >= 0.75 ? C.g : sessions.length ? C.o : undefined },
              { l: "RPE moyen", v: fmtDec(rpeAvg, 1) },
              { l: "Course", v: km > 0 ? `${fmtDec(km, 1)}` : "—", u: km > 0 ? "km" : undefined },
            ].map((t) => (
              <div key={t.l} style={{ padding: "10px 12px", borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>{t.l}</div>
                <div style={{ whiteSpace: "nowrap" }}><span style={{ ...MONO, fontSize: 20, color: "c" in t && t.c ? t.c : C.tx }}>{t.v}</span>{t.u && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}> {t.u}</span>}</div>
              </div>
            ))}
          </div>

          <Section n={1} title="Modifications de l’athlète" count={weekMods.length || undefined}>
            {weekMods.length === 0 ? (
              <div style={{ ...CARD, padding: "12px 14px", fontSize: 13, color: C.tx3 }}>Aucune modification cette semaine.</div>
            ) : (
              weekMods.map((m) => {
                const moved = m.rescheduledByAthlete && m.originalScheduledDate && m.originalScheduledDate !== m.scheduledDate;
                const bonus = m.athleteModifications?.bonusSets?.reduce((n, b) => n + b.sets.length, 0) ?? 0;
                const added = m.athleteModifications?.customExercises?.length ?? 0;
                const parts = [
                  moved ? `Décalée du ${new Date(m.originalScheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : null,
                  m.rescheduleReason ? `« ${m.rescheduleReason} »` : null,
                  bonus ? `+${bonus} série${bonus > 1 ? "s" : ""} bonus` : null,
                  added ? `+${added} exercice${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}` : null,
                ].filter(Boolean);
                const st = m.status === "completed" ? { l: "Complétée", c: C.g, filled: true } : m.status === "missed" ? { l: "Manquée", c: C.o, filled: true } : { l: "Planifiée", c: C.tx2, filled: false };
                return (
                  <div key={m.id} style={{ ...CARD, padding: "12px 14px", display: "flex", gap: 10 }}>
                    <span aria-hidden style={{ width: 4, flex: "none", borderRadius: 2, background: TYPE_COLOR.muscu }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sessionName}</span>
                        <Tag color={st.c} filled={st.filled}>{st.l}</Tag>
                      </div>
                      {parts.length > 0 && <div style={{ fontSize: 12, color: C.tx2, marginTop: 3 }}>{parts.join(" · ")}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </Section>

          <Section n={2} title="Ton retour de la semaine">
            <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10, borderColor: retour?.comment || editing ? alpha(C.ac, 0.33) : C.brd }}>
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
                  <div style={{ fontSize: 11.5, color: C.tx3 }}>{first} le voit dans son accueil. Modifier le retour efface sa réaction.</div>
                </>
              ) : retour?.comment ? (
                <>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{retour.comment}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.tx3, whiteSpace: "nowrap", overflow: "hidden" }}>
                    {reaction ? <Tag color={C.g} filled>Vu</Tag> : <Tag>Pas encore vu</Tag>}
                    {reaction && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>par {first} · réaction « {reaction.label} »{retour.reacted_at ? ` · ${new Date(retour.reacted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}</span>}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.tx3 }}>Pas encore de retour pour cette semaine.</div>
              )}
            </div>
            {editing ? (
              <div style={{ display: "flex", gap: 8 }}>
                <PhoneButton style={{ flex: 1, height: 50, borderRadius: 14 }} onClick={() => { setEditing(false); setDraft(retour?.comment ?? ""); }}>Annuler</PhoneButton>
                <PhoneButton primary style={{ flex: 1, height: 50, borderRadius: 14, fontSize: 14 }} disabled={upsert.isPending || !draft.trim()} onClick={save}>Enregistrer</PhoneButton>
              </div>
            ) : (
              <PhoneButton primary onClick={() => setEditing(true)} style={{ width: "100%", height: 50, borderRadius: 14, fontSize: 14 }}>
                {retour?.comment ? "Modifier le retour" : "Écrire un retour"}
              </PhoneButton>
            )}
          </Section>

          <Section n={3} title="Blessures" count={active.length || undefined}>
            {injuries.length === 0 ? (
              <div style={{ ...CARD, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.tx2 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: C.g }} />Aucune blessure
              </div>
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
