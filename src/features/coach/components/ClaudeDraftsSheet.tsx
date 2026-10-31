import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import {
  type CoachApiDraft,
  CoachApiError,
  DraftAlreadyDecided,
  useApplyCoachApiDraft,
  useCoachApiDrafts,
  useCoachApiHistory,
  useDraftTargetHash,
  useRejectCoachApiDraft,
  useUndoCoachApiDraft,
} from "@/features/coach/hooks/useCoachApiDrafts";
import { describeOp, namesFrom } from "@/lib/coachApiDraftText";
import type { ProgSessionShape } from "@shared/coachApiOps.ts";
import { WeekDraftPreview } from "./WeekDraftPreview";
import { PlanDraftPreview } from "./PlanDraftPreview";

const KIND_LABEL: Record<CoachApiDraft["kind"], string> = {
  axe: "Axe de travail",
  programme: "Programme",
  planning: "Planning",
  objectifs: "Objectifs",
  semaine: "Semaine",
  plan: "Planification",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function DraftCard({ draft, athleteId }: { draft: CoachApiDraft; athleteId: string }) {
  const { setGoals } = useAthleteContext();
  const { data: prog } = useProgrammation(athleteId);
  const target = draft.kind === "objectifs" ? "asp:goals" : "asp:prog";
  // Une semaine ou une planification touche des lignes, pas une clé du
  // programme : pas d'empreinte de départ à comparer.
  const tracked = draft.kind !== "axe" && draft.kind !== "semaine" && draft.kind !== "plan";
  const { data: targetHash } = useDraftTargetHash(tracked ? athleteId : undefined, target);
  const apply = useApplyCoachApiDraft(athleteId);
  const reject = useRejectCoachApiDraft(athleteId);
  const busy = apply.isPending || reject.isPending;

  const progShape = prog as unknown as ProgSessionShape[] | undefined;
  const names = namesFrom(progShape, draft.ops);
  // Le programme a changé depuis la proposition : elle a été pensée pour un
  // état qui n'existe plus. Elle peut rester juste, mais le coach doit le
  // savoir avant de cliquer.
  const stale = tracked && !!targetHash && !!draft.base_hash && targetHash !== draft.base_hash;

  async function handleApply() {
    try {
      await apply.mutateAsync({ draft, setGoals });
      toast.success(draft.kind === "axe" ? "Axe de travail retenu" : "Proposition appliquée — annulable dans l'historique");
    } catch (e) {
      // Le serveur défait ce qu'il avait commencé à écrire : un échec ne
      // laisse rien à moitié appliqué.
      if (e instanceof CoachApiError && e.code === "deja_traitee") toast.info("Cette proposition a déjà été traitée ailleurs.");
      else if (e instanceof CoachApiError && e.code === "ne_s_applique_plus") toast.error(`Elle ne s'applique plus : ${e.message}`);
      else toast.error("L'application a échoué. Rien n'a été modifié.");
    }
  }

  async function handleReject() {
    try {
      await reject.mutateAsync(draft.id);
    } catch (e) {
      if (e instanceof DraftAlreadyDecided) toast.info("Cette proposition a déjà été traitée ailleurs.");
      else toast.error("Impossible d'écarter la proposition.");
    }
  }

  return (
    <div style={{ border: "1px solid " + C.brd, borderRadius: 6, padding: 14, background: C.s2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.coach, background: C.coachS, border: "1px solid " + C.coach + "40", borderRadius: 4, padding: "2px 6px" }}>
          Claude
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.tx2, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {KIND_LABEL[draft.kind]}
        </span>
        <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>{fmt(draft.created_at)}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 6 }}>{draft.title}</div>
      {draft.body && (
        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 10 }}>{draft.body}</div>
      )}

      {draft.kind === "semaine" ? (
        <WeekDraftPreview athleteId={athleteId} ops={draft.ops} prog={progShape} />
      ) : draft.kind === "plan" ? (
        <PlanDraftPreview athleteId={athleteId} ops={draft.ops} prog={progShape} names={names} />
      ) : draft.ops.length > 0 && (
        <ul style={{ margin: "0 0 10px", padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {draft.ops.map((op, i) => (
            <li key={i} style={{ fontSize: 12, color: C.tx, lineHeight: 1.45 }}>{describeOp(op, names)}</li>
          ))}
        </ul>
      )}

      {stale && (
        <div style={{ fontSize: 11, color: "#F59E0B", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 4, padding: "6px 8px", marginBottom: 10, lineHeight: 1.45 }}>
          {draft.kind === "objectifs" ? "Les objectifs ont été modifiés" : "Le programme a été modifié"} depuis cette proposition.
          Vérifie qu'elle a encore du sens avant de l'appliquer.
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => void handleApply()}
          disabled={busy}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 4, border: "1px solid " + C.coach + "50",
            background: C.coachS, color: C.coach, fontSize: 12, fontWeight: 700,
            cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          {apply.isPending ? "Application…" : draft.kind === "axe" ? "Retenir" : "Appliquer"}
        </button>
        <button
          onClick={() => void handleReject()}
          disabled={busy}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 4, border: "1px solid " + C.brdL,
            background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600,
            cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          Écarter
        </button>
      </div>
    </div>
  );
}

function HistoryCard({ draft, athleteId }: { draft: CoachApiDraft; athleteId: string }) {
  const undo = useUndoCoachApiDraft(athleteId);
  const undone = draft.status === "undone";

  async function handleUndo() {
    if (!window.confirm(`Annuler « ${draft.title} » ? Tout ce qu'elle a inscrit revient comme avant.`)) return;
    try {
      const res = await undo.mutateAsync({ id: draft.id });
      toast.success(res.message);
    } catch (e) {
      if (e instanceof CoachApiError && e.code === "modifie_depuis") {
        // Annuler maintenant effacerait aussi ce qui a été changé depuis.
        const ok = window.confirm(
          "Le programme ou les objectifs ont été modifiés depuis. Annuler effacera aussi ces modifications. Continuer ?",
        );
        if (!ok) return;
        try {
          const res = await undo.mutateAsync({ id: draft.id, forcer: true });
          toast.success(res.message);
        } catch {
          toast.error("L'annulation a échoué. Rien n'a été modifié.");
        }
      } else {
        toast.error(e instanceof CoachApiError ? e.message : "L'annulation a échoué. Rien n'a été modifié.");
      }
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid " + C.brd }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: undone ? C.tx3 : C.tx, textDecoration: undone ? "line-through" : "none" }}>
          {draft.title}
        </div>
        <div style={{ fontSize: 10, color: C.tx3 }}>
          {KIND_LABEL[draft.kind]} · {draft.applied_via === "api" ? "écrit par Claude" : "appliqué par toi"}
          {draft.decided_at ? ` · ${fmt(draft.decided_at)}` : ""}
          {undone ? " · annulé" : ""}
        </div>
      </div>
      {!undone && (
        <button
          onClick={() => void handleUndo()}
          disabled={undo.isPending}
          style={{
            padding: "5px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent",
            color: C.tx2, fontSize: 11, fontWeight: 600, cursor: undo.isPending ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          {undo.isPending ? "…" : "Annuler"}
        </button>
      )}
    </div>
  );
}

/**
 * Propositions de l'assistant IA du coach pour l'athlète ouvert.
 *
 * Rien n'atteint l'athlète avant « Appliquer » : c'est la promesse faite dans
 * le texte de consentement (« il relit tout »), et ce panneau en est le lieu.
 */
export function ClaudeDraftsSheet({ athleteId, open, onOpenChange }: {
  athleteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: drafts = [] } = useCoachApiDrafts(athleteId);
  const { data: history = [] } = useCoachApiHistory(athleteId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{
          background: C.s1, borderLeft: `1px solid ${C.brd}`, padding: 0,
          width: 400, maxWidth: "100vw", display: "flex", flexDirection: "column", gap: 0,
        }}
      >
        <SheetHeader style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.brd}` }}>
          <SheetTitle style={{ color: C.tx, fontSize: 16, fontWeight: 700 }}>Propositions de Claude</SheetTitle>
          <div style={{ color: C.tx3, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>
            Rien ne change pour l'athlète tant que tu n'as pas appliqué. Ce qui a été inscrit s'annule ci-dessous.
          </div>
        </SheetHeader>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {drafts.length === 0 ? (
            <div style={{ fontSize: 12, color: C.tx3, textAlign: "center", padding: "24px 0" }}>
              Aucune proposition en attente.
            </div>
          ) : (
            drafts.map((d) => <DraftCard key={d.id} draft={d} athleteId={athleteId} />)
          )}
          {history.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
                Inscrit dans Agon · 30 derniers jours
              </div>
              {history.map((d) => <HistoryCard key={d.id} draft={d} athleteId={athleteId} />)}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
