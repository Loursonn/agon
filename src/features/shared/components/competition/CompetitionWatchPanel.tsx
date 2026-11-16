import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { CARD, LABEL, MONO, buttonStyle, pillStyle } from "@/features/shared/components/seance/seanceUi";
import { useActivityDetail } from "@/features/shared/hooks/useActivityDetail";
import { useCompetitionSession, useLinkCompetitionWatch } from "@/features/shared/hooks/useCompetitionSession";
import { attributionOf } from "@/lib/activityDetail";
import { sportLabel } from "@/lib/activityDisplay";
import { isCompetitionSession, proposedRaceActivity } from "@/lib/competitionSession";
import { hrCurve, type HrPoint } from "@/lib/hrCurve";
import { fmtClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";

/**
 * Sortie de la montre d'une compétition, depuis la compétition elle-même
 * (demande d'Hugo, 16/11/2026 : « linker une compétition HYROX à une sortie
 * Garmin pour avoir la courbe FC »). Athlète et coach : la sortie liée (ou
 * proposée), sa mini-courbe FC, le choix d'une autre sortie et la séance
 * complète. Le lien alimente l'analyse de course HYROX (et inversement).
 * Attribution « Garmin [appareil] » toujours affichée ; données de montre
 * jamais envoyées à une IA.
 */

export interface CompetitionWatchTarget {
  id: string;
  date: string;
  type: string;
  cancelled_at?: string | null;
}

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

function HrSparkline({ points, min, max }: { points: HrPoint[]; min: number; max: number }) {
  const W = 300, H = 64, pad = 4;
  const span = Math.max(1, max - min);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (hr: number) => pad + (1 - (hr - min) / span) * (H - 2 * pad);
  // Un trou de capteur coupe le tracé.
  const d = points.reduce((acc, p, i) => {
    if (p.hr == null) return acc;
    const prev = i > 0 ? points[i - 1].hr : null;
    return `${acc}${prev == null ? "M" : "L"}${x(i).toFixed(1)},${y(p.hr).toFixed(1)}`;
  }, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Courbe de fréquence cardiaque"
      style={{ display: "block", width: "100%", height: H }}>
      <path d={d} fill="none" stroke={C.r} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function CompetitionWatchPanel({
  athleteId, competition, seancePath, canEdit = true,
}: {
  athleteId: string;
  competition: CompetitionWatchTarget;
  /** Page de la séance complète (courbe, zones, tours, recalage). */
  seancePath: (activityId: string) => string;
  canEdit?: boolean;
}) {
  const navigate = useNavigate();
  const started = competition.date <= localIsoDay();
  const enabled = started && isCompetitionSession(competition);
  const session = useCompetitionSession(athleteId, competition.id, competition.date, enabled);
  const link = useLinkCompetitionWatch();
  const [picking, setPicking] = useState(false);

  const proposal = useMemo(() => proposedRaceActivity(session.activities), [session.activities]);
  const linkedId = session.link?.activityId ?? null;
  const activityId = linkedId ?? proposal?.id ?? null;
  const status: "confirmed" | "auto" | "proposed" | null = !activityId ? null
    : session.link?.status === "confirmed" ? "confirmed" : session.link ? "auto" : "proposed";
  const activity = session.activities.find((a) => a.id === activityId) ?? null;
  const detail = useActivityDetail(athleteId, enabled && activityId ? activityId : undefined);
  const curve = useMemo(() => hrCurve(detail.data?.display ?? detail.data?.stream ?? null), [detail.data]);

  if (!enabled) return null;

  const current = session.link ? { id: session.link.id, activityId: session.link.activityId, status: session.link.status } : null;
  const choose = (id: string | null) => {
    link.mutate({ athleteId, competitionId: competition.id, activityId: id, current }, { onSuccess: () => setPicking(false) });
  };
  const attribution = activity ? attributionOf(activity.source, activity.deviceName) : detail.data?.attribution ?? null;
  const duration = activity?.durationS ?? curve?.durationS ?? null;

  return (
    <section aria-label="Montre de la compétition" style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={LABEL}>Montre · courbe FC</span>
        {status === "confirmed" && <span style={pillStyle(C.g)}>Liée</span>}
        {(status === "auto" || status === "proposed") && <span style={pillStyle(C.ac)}>Proposée</span>}
      </div>

      {session.loading ? (
        <div style={{ fontSize: 12.5, color: C.tx3 }}>Lecture des activités du jour…</div>
      ) : session.activities.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.tx3, lineHeight: 1.5 }}>
          Aucune activité de la montre ce jour-là. Dès que la sortie est synchronisée (ou le fichier importé), elle se lie ici.
        </div>
      ) : (
        <>
          {activity && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activity.title || sportLabel(activity.sport)}
              </div>
              <div style={{ ...MONO, fontSize: 12, color: C.tx2, marginTop: 2 }}>
                {duration != null ? fmtClock(duration) : "—"} · départ {hhmm(activity.startedAt)}
              </div>
              <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>{attribution}</div>
            </div>
          )}

          {activityId && (detail.isLoading ? (
            <div style={{ height: 64, display: "flex", alignItems: "center", fontSize: 12, color: C.tx3 }}>Lecture de la courbe…</div>
          ) : curve ? (
            <div>
              <HrSparkline points={curve.points} min={curve.minHr} max={curve.maxHr} />
              <div style={{ ...MONO, display: "flex", gap: 14, fontSize: 12, color: C.tx2, marginTop: 6 }}>
                <span>FC moy <b style={{ color: C.tx }}>{curve.avgHr}</b></span>
                <span>FC max <b style={{ color: C.tx }}>{curve.maxHr}</b></span>
                <span>bpm</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.tx3 }}>Pas de fréquence cardiaque dans cette sortie.</div>
          ))}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activityId && (
              <button type="button" style={buttonStyle("ghost")} onClick={() => navigate(seancePath(activityId))}>
                Voir la séance
              </button>
            )}
            {canEdit && status !== "confirmed" && activityId && (
              <button type="button" style={buttonStyle("primary", link.isPending)} disabled={link.isPending} onClick={() => choose(activityId)}>
                C'est bien la course
              </button>
            )}
            {canEdit && session.activities.length > 0 && (
              <button type="button" style={buttonStyle("ghost")} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
                {picking ? "Fermer" : "Choisir une autre sortie"}
              </button>
            )}
          </div>

          {picking && (
            <div role="radiogroup" aria-label="Sorties du jour" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {session.activities.map((a) => {
                const selected = a.id === activityId && status === "confirmed";
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={selected} disabled={link.isPending}
                    aria-label={`${a.title || sportLabel(a.sport)}, ${a.durationS != null ? fmtClock(a.durationS) : "durée inconnue"}, départ ${hhmm(a.startedAt)}, ${attributionOf(a.source, a.deviceName)}`}
                    onClick={() => choose(a.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
                      padding: "9px 11px", borderRadius: 10, fontFamily: "inherit",
                      border: `1px solid ${selected ? C.rouge : C.brd}`, background: selected ? C.rouge + "1a" : C.s2,
                    }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.title || sportLabel(a.sport)}
                      </span>
                      <span style={{ ...MONO, display: "block", fontSize: 11.5, color: C.tx2 }}>
                        {a.durationS != null ? fmtClock(a.durationS) : "—"} · départ {hhmm(a.startedAt)} · {attributionOf(a.source, a.deviceName)}
                      </span>
                    </span>
                  </button>
                );
              })}
              {linkedId && (
                <button type="button" disabled={link.isPending} onClick={() => choose(null)}
                  style={{ ...buttonStyle("ghost"), alignSelf: "flex-start", color: C.tx3 }}>
                  Aucune de ces sorties
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
