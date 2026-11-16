import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SessionPainQuestion } from "@/features/athlete/components/session/SessionPainQuestion";
import { useCompetitionSession, useSaveCompetitionSession } from "@/features/shared/hooks/useCompetitionSession";
import { useSaveSessionPain } from "@/features/shared/hooks/useSessionPain";
import { attributionOf } from "@/lib/activityDetail";
import {
  DAY_ACTIVITY_ROLE_LABEL, RESULT_TEXT_MAX, dayActivityRoles, proposedRaceActivity, toResultUrl,
} from "@/lib/competitionSession";
import { competitionDayLabel } from "@/types/planning";
import { fmtClock } from "@/lib/seance";
import { EMPTY_SESSION_PAIN, sessionPainPayload, type SessionPainAnswer } from "@/lib/sessionPain";

export interface CompetitionSessionData {
  id: string;
  athlete_id: string;
  name: string;
  type: string;
  date: string;
  athlete_comment: string | null;
  result_text?: string | null;
  result_url?: string | null;
  rpe_score?: number | null;
}

const LABEL = "mb-2 block text-[12px] font-semibold text-agon-tx3";
const FIELD = "box-border w-full rounded-[10px] border border-agon-brd bg-agon-s2 px-3 py-2.5 font-[inherit] text-[14px] text-agon-tx outline-none placeholder:text-agon-tx3";
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Séance de compétition du jour J (demande d'Hugo, 15/11/2026) : la
 * compétition se remplit comme un entraînement, quel que soit le sport.
 * Activité de la montre proposée d'office (la plus proche du chrono, sinon
 * la plus longue) ; l'échauffement reste une activité à part.
 */
export function CompetitionSessionSheet({ competition, onClose }: { competition: CompetitionSessionData; onClose: () => void }) {
  const athleteId = competition.athlete_id;
  const session = useCompetitionSession(athleteId, competition.id, competition.date);
  const save = useSaveCompetitionSession();
  const savePain = useSaveSessionPain();

  const [resultText, setResultText] = useState(competition.result_text ?? "");
  const [resultUrl, setResultUrl] = useState(competition.result_url ?? "");
  const [rpe, setRpe] = useState<number | null>(competition.rpe_score ?? null);
  const [comment, setComment] = useState(competition.athlete_comment ?? "");
  const [pain, setPain] = useState<SessionPainAnswer>(EMPTY_SESSION_PAIN);
  // undefined : pas encore choisi (on suit le lien, sinon la proposition).
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);

  const proposal = useMemo(() => proposedRaceActivity(session.activities), [session.activities]);
  const linkedId = session.link?.activityId ?? null;
  const activityId = chosen !== undefined ? chosen : linkedId ?? proposal?.id ?? null;
  const roles = useMemo(() => dayActivityRoles(session.activities, activityId), [session.activities, activityId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = toResultUrl(resultUrl);
  const urlInvalid = url === "invalid";
  const painPayload = sessionPainPayload(pain);
  const pending = save.isPending || savePain.isPending;

  const submit = () => {
    if (urlInvalid) return;
    save.mutate(
      {
        athleteId,
        competitionId: competition.id,
        input: { resultText: resultText.trim() || null, resultUrl: url, rpe, comment: comment.trim() || null },
        activityId,
        current: session.link ? { id: session.link.id, activityId: session.link.activityId, status: session.link.status } : null,
      },
      {
        onSuccess: () => {
          if (painPayload) savePain.mutate({ target: { kind: "competition", id: competition.id }, athleteId, ...painPayload }, { onSettled: onClose });
          else onClose();
        },
      },
    );
  };

  const day = new Date(competition.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[160] bg-agon-ink/[0.65]" />
      <div role="dialog" aria-label={`Séance : ${competition.name}`}
        className="fixed inset-x-0 bottom-0 z-[161] mx-auto max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[6px] border-t border-agon-brd bg-agon-s1 px-5 pb-10 pt-6">
        <div className="mx-auto mb-5 h-1 w-9 rounded-[2px] bg-agon-brd-l" />
        <div className="agon-mono text-[10px] uppercase tracking-[0.12em] text-agon-rouge">{competitionDayLabel(competition.type)} · {day}</div>
        <div className="mb-5 mt-1 text-[17px] font-extrabold text-agon-tx">{competition.name}</div>

        {/* Activité de la montre */}
        <section aria-label="Activité de la montre" className="mb-5">
          <span className={LABEL}>Activité de la montre</span>
          {session.loading ? (
            <div className="text-[13px] text-agon-tx3">Lecture des activités du jour…</div>
          ) : session.activities.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-agon-brd-l px-3 py-2.5 text-[12.5px] leading-[1.45] text-agon-tx3">
              Aucune activité de la montre ce jour-là. Synchronise ta montre ou importe le fichier de la course : tu pourras la lier ici.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {session.activities.map((a) => {
                const selected = a.id === activityId;
                const role = roles.get(a.id) ?? "autre";
                return (
                  <button key={a.id} type="button" aria-pressed={selected} onClick={() => setChosen(a.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left font-[inherit]",
                      selected ? "border-agon-rouge bg-agon-rouge/[0.1]" : "border-agon-brd bg-agon-s2",
                    )}>
                    <span className={cn("h-4 w-4 flex-none rounded-full border-2", selected ? "border-agon-rouge bg-agon-rouge" : "border-agon-brd-l")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-agon-tx">{a.title || attributionOf(a.source, a.deviceName)}</span>
                      <span className="agon-mono block truncate text-[12px] text-agon-tx2">
                        {a.durationS != null ? fmtClock(a.durationS) : "—"} · départ {hhmm(a.startedAt)}
                      </span>
                      <span className="block truncate text-[11px] text-agon-tx3">{attributionOf(a.source, a.deviceName)}</span>
                    </span>
                    <span className={cn(
                      "agon-mono flex-none rounded-full px-2 py-[2px] text-[10px] uppercase tracking-[0.08em]",
                      role === "course" ? "bg-agon-rouge text-agon-ink" : "border border-agon-brd-l text-agon-tx3",
                    )}>{DAY_ACTIVITY_ROLE_LABEL[role]}</span>
                  </button>
                );
              })}
              <button type="button" aria-pressed={activityId === null} onClick={() => setChosen(null)}
                className={cn("cursor-pointer self-start rounded-[10px] border px-3 py-1.5 font-[inherit] text-[12.5px]",
                  activityId === null ? "border-agon-tx2 text-agon-tx" : "border-agon-brd text-agon-tx3")}>
                Aucune de ces activités
              </button>
              <div className="text-[11.5px] leading-[1.45] text-agon-tx3">
                {session.link?.status === "confirmed" && activityId === linkedId
                  ? "Activité liée à ta compétition. "
                  : activityId ? "Proposée d'office : la plus longue du jour. " : ""}
                L'échauffement reste une activité à part : il compte dans ta charge du jour.
              </div>
            </div>
          )}
        </section>

        <div className="mb-4">
          <label className={LABEL} htmlFor="comp-result">Résultat</label>
          <input id="comp-result" value={resultText} maxLength={RESULT_TEXT_MAX} onChange={(e) => setResultText(e.target.value)}
            placeholder="12e / 80, 3-1, qualifiée en finale…" className={FIELD} />
        </div>

        <div className="mb-4">
          <label className={LABEL} htmlFor="comp-url">Lien</label>
          <input id="comp-url" value={resultUrl} inputMode="url" autoCapitalize="off" autoCorrect="off" onChange={(e) => setResultUrl(e.target.value)}
            placeholder="Résultats officiels, Strava, Garmin Connect…" aria-invalid={urlInvalid} className={cn(FIELD, urlInvalid && "border-agon-erreur")} />
          {urlInvalid && <div className="mt-1 text-[11.5px] text-agon-erreur">Adresse web attendue (https://…)</div>}
        </div>

        <div className="mb-4">
          <span className={LABEL}>RPE (1-10)</span>
          <div className="grid grid-cols-10 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button key={v} type="button" aria-pressed={rpe === v} onClick={() => setRpe(rpe === v ? null : v)}
                className={cn(
                  "min-w-0 cursor-pointer rounded-[4px] border px-0 py-[9px] text-[13px] font-bold",
                  rpe === v ? "border-agon-erreur bg-agon-erreur/[0.15] text-agon-erreur" : "border-agon-brd bg-agon-s2 text-agon-tx3",
                )}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className={LABEL} htmlFor="comp-comment">Ressenti / bilan</label>
          <textarea id="comp-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            placeholder="Comment s'est passée ta compétition ? Sensations, ce qui a marché ou pas…"
            className={cn(FIELD, "resize-y")} />
        </div>

        <div className="mb-5">
          <SessionPainQuestion value={pain} onChange={setPain} />
        </div>

        <button type="button" onClick={submit} disabled={pending || urlInvalid}
          className={cn("w-full cursor-pointer rounded-[6px] border-none bg-agon-rouge p-[13px] font-[inherit] text-[15px] font-bold text-agon-ink",
            (pending || urlInvalid) && "opacity-60")}>
          {pending ? "Enregistrement…" : "Enregistrer ma séance"}
        </button>
        <button type="button" onClick={onClose} className="mt-3 w-full cursor-pointer border-none bg-transparent py-2.5 font-[inherit] text-[13px] text-agon-tx3">
          Annuler
        </button>
      </div>
    </>
  );
}
