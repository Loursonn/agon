import { useState } from "react";
import { ChevronRight, Zap, Plus, Library, Lightbulb } from "lucide-react";
import { alpha } from "@/lib/theme";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { Input } from "@/ui/Input";
import { Skeleton } from "@/ui/Skeleton";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import type { EnergySessionRow } from "@/types/energy";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import { KIND_COLOR, KIND_LABEL } from "@/features/coach/components/energy/energyLabels";
import { DeleteEnergySessionButton } from "@/features/coach/components/energy/DeleteEnergySessionButton";
import { BankPickerDialog } from "./BankPickerDialog";

export interface SessionsPanelProps {
  coachId: string;
  athleteId?: string;
  onNew: () => void;
  /** Import d'une séance au format texte YOXX. */
  onImportText?: () => void;
  onEdit: (sessionId: string) => void;
}

/**
 * Banque de séances énergétiques (de l'athlète, ou personnelle du coach sans athlète).
 * Pas d'assignation ici : elle se fait depuis Planning > Mois.
 */
export function EnergySessionsPanel({ coachId, athleteId, onNew, onImportText, onEdit }: SessionsPanelProps) {
  const { data: allSessions = [], isLoading } = useEnergySessions();
  // Filtrage client : séances de cet athlète, ou banque perso du coach sans athlète
  const sessions = athleteId
    ? allSessions.filter((s) => s.athlete_id === athleteId && s.session_kind !== "specifique")
    : allSessions.filter((s) => s.created_by === coachId && !s.athlete_id && s.session_kind !== "specifique");
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [previewSession, setPreviewSession] = useState<EnergySessionRow | null>(null);

  const filtered = sessions.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="font-ui text-agon-tx">
      <div className="mb-agon-md flex flex-wrap items-center justify-between gap-agon-sm">
        <h2 className="text-agon-lg font-bold">
          Séances énergétiques
          {sessions.length > 0 && (
            <span className="ml-agon-sm text-agon-xs font-normal text-agon-tx3">
              {sessions.length} séance{sessions.length > 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap gap-agon-sm">
          <Button size="sm" variant="secondary" className="gap-agon-xs" onClick={() => setShowPicker(true)}>
            <Library size={13} /> Importer une séance
          </Button>
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

      {showPicker && <BankPickerDialog coachId={coachId} athleteId={athleteId} onClose={() => setShowPicker(false)} />}

      {previewSession && (
        <SessionPreviewModal
          session={previewSession}
          athleteId={athleteId}
          onEdit={() => { setPreviewSession(null); onEdit(previewSession.id); }}
          onClose={() => setPreviewSession(null)}
        />
      )}

      <div className="mb-agon-lg flex items-start gap-agon-md rounded-md border border-agon-accent/30 bg-agon-accent/10 px-agon-md py-agon-md text-agon-xs leading-normal text-agon-tx2">
        <Lightbulb size={14} className="mt-agon-2xs shrink-0 text-agon-accent" />
        <span>
          Importe une séance depuis la banque ou un autre athlète. La copie est personnalisable sans modifier l'originale.
          Pour la planifier, glisse-la depuis <strong className="text-agon-accent">Planning → Mois</strong> vers le jour voulu.
        </span>
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
          icon={<Zap size={36} />}
          title={search ? "Aucun résultat" : "Banque vide"}
          description={search ? "Modifie ta recherche." : "Importe une séance depuis la banque ou crée-en une nouvelle."}
          action={
            !search && (
              <div className="flex flex-wrap justify-center gap-agon-sm">
                <Button variant="secondary" className="gap-agon-xs" onClick={() => setShowPicker(true)}>
                  <Library size={14} /> Importer une séance
                </Button>
                <Button onClick={onNew}>Créer une séance</Button>
              </div>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-agon-sm xl:grid-cols-2">
          {filtered.map((s) => {
            const kc = KIND_COLOR[s.session_kind] ?? "var(--agon-tx3)";
            return (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewSession(s)}
                  onKeyDown={(e) => { if (e.key === "Enter") setPreviewSession(s); }}
                  className="flex cursor-pointer items-center gap-agon-md rounded-lg border border-agon-brd-l bg-agon-s1 px-agon-md py-agon-md transition-colors hover:border-agon-tx3"
                >
                  <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md" style={{ background: alpha(kc, 0.125), color: kc }}>
                    <Zap size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-agon-2xs truncate text-agon-base font-bold">{s.name}</div>
                    <div className="flex flex-wrap items-center gap-agon-xs">
                      <span className="rounded-sm px-agon-xs text-agon-xs font-bold" style={{ background: alpha(kc, 0.125), color: kc }}>
                        {KIND_LABEL[s.session_kind] ?? s.session_kind}
                      </span>
                      {s.total_duration_s != null && <span className="text-agon-xs text-agon-tx3">{Math.round(s.total_duration_s / 60)} min</span>}
                      {s.is_verified && <span className="text-agon-xs font-bold text-agon-succes">✓ vérifiée</span>}
                    </div>
                  </div>
                  <DeleteEnergySessionButton sessionId={s.id} sessionName={s.name} />
                  <ChevronRight size={14} className="shrink-0 text-agon-tx3" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
