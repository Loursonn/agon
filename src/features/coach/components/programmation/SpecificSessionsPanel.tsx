import { useState } from "react";
import { ChevronRight, Plus, Target } from "lucide-react";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { Input } from "@/ui/Input";
import { Skeleton } from "@/ui/Skeleton";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import type { EnergySessionRow } from "@/types/energy";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import { DeleteEnergySessionButton } from "@/features/coach/components/energy/DeleteEnergySessionButton";
import type { SessionsPanelProps } from "./EnergySessionsPanel";

/** Séances spécifiques (type CrossFit / MetCon) de l'athlète, ou de la banque perso du coach. */
export function SpecificSessionsPanel({ coachId, athleteId, onNew, onImportText, onEdit }: SessionsPanelProps) {
  const { data: allSessions = [], isLoading } = useEnergySessions();
  const sessions = athleteId
    ? allSessions.filter((s) => s.athlete_id === athleteId && s.session_kind === "specifique")
    : allSessions.filter((s) => s.created_by === coachId && !s.athlete_id && s.session_kind === "specifique");
  const [search, setSearch] = useState("");
  const [previewSession, setPreviewSession] = useState<EnergySessionRow | null>(null);

  const filtered = sessions.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="font-ui text-agon-tx">
      <div className="mb-agon-md flex flex-wrap items-center justify-between gap-agon-sm">
        <h2 className="text-agon-lg font-bold">
          Séances spécifiques
          {sessions.length > 0 && (
            <span className="ml-agon-sm text-agon-xs font-normal text-agon-tx3">
              {sessions.length} séance{sessions.length > 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap gap-agon-sm">
          {onImportText && (
            <Button
              size="sm"
              variant="secondary"
              title="Coller une séance écrite au format YOXX"
              className="border-agon-accent/40 bg-agon-accent/10 text-agon-accent hover:text-agon-accent"
              onClick={onImportText}
            >
              Importer un texte
            </Button>
          )}
          <Button size="sm" className="gap-agon-xs" onClick={onNew}>
            <Plus size={13} /> Créer une séance
          </Button>
        </div>
      </div>

      {previewSession && (
        <SessionPreviewModal
          session={previewSession}
          athleteId={athleteId}
          onEdit={() => { setPreviewSession(null); onEdit(previewSession.id); }}
          onClose={() => setPreviewSession(null)}
        />
      )}

      <div className="mb-agon-lg flex items-start gap-agon-md rounded-md border border-agon-alerte/30 bg-agon-alerte/10 px-agon-md py-agon-md text-agon-xs leading-normal text-agon-tx2">
        <Target size={14} className="mt-agon-2xs shrink-0 text-agon-alerte" />
        <span>Séances spécifiques type CrossFit / MetCon : combine intervalles énergétiques et exercices dans un même builder.</span>
      </div>

      {sessions.length > 4 && (
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="mb-agon-md" />
      )}

      {isLoading ? (
        <div className="flex flex-col gap-agon-sm">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg bg-agon-s1" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Target size={32} />}
          title={search ? "Aucun résultat" : "Aucune séance spécifique"}
          description={search ? "Modifie ta recherche." : "Crée ta première séance spécifique."}
          action={!search && <Button onClick={onNew}>Créer une séance</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-agon-sm xl:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setPreviewSession(s)}
                onKeyDown={(e) => { if (e.key === "Enter") setPreviewSession(s); }}
                className="flex cursor-pointer items-center gap-agon-md rounded-lg border border-agon-brd-l bg-agon-s1 px-agon-md py-agon-md transition-colors hover:border-agon-alerte/50"
              >
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-agon-alerte/20 text-agon-alerte">
                  <Target size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-agon-2xs truncate text-agon-base font-bold">{s.name}</div>
                  <div className="flex flex-wrap items-center gap-agon-xs">
                    <span className="rounded-sm bg-agon-alerte/20 px-agon-xs text-agon-xs font-bold text-agon-alerte">spécifique</span>
                    {s.total_duration_s != null && <span className="text-agon-xs text-agon-tx3">{Math.round(s.total_duration_s / 60)} min</span>}
                  </div>
                </div>
                <DeleteEnergySessionButton sessionId={s.id} sessionName={s.name} />
                <ChevronRight size={14} className="shrink-0 text-agon-tx3" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
