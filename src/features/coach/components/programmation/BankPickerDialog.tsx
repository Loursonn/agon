import { useState } from "react";
import { Zap, Check } from "lucide-react";
import { toast } from "sonner";
import { alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Dialog } from "@/ui/Dialog";
import { Input } from "@/ui/Input";
import { Skeleton } from "@/ui/Skeleton";
import { useEnergySessions, useCreateEnergySession } from "@/features/shared/hooks/useEnergySessions";
import type { EnergySessionRow } from "@/types/energy";
import { KIND_COLOR, KIND_LABEL } from "@/features/coach/components/energy/SessionPreviewModal";
import { DeleteEnergySessionButton } from "@/features/coach/components/energy/DeleteEnergySessionButton";

type PickerTab = "generale" | "perso" | "athletes";

interface Props {
  coachId: string;
  athleteId?: string;
  onClose: () => void;
}

/**
 * Importer une séance et la dupliquer pour un athlète.
 * 3 sources : banque générale, banque perso du coach, séances d'autres athlètes.
 */
export function BankPickerDialog({ coachId, athleteId, onClose }: Props) {
  const { athletes, profile } = useAuth();
  const isAdmin = !!profile?.is_admin;
  const { data: allSessions = [], isLoading } = useEnergySessions();
  const createMutation = useCreateEnergySession();
  const [search, setSearch] = useState("");
  const [copying, setCopying] = useState<string | null>(null);
  const [tab, setTab] = useState<PickerTab>("generale");

  // Banque générale : publiques, pas liées à un athlète
  const generalSessions = allSessions.filter((s) => s.is_public && !s.athlete_id);
  // Banque perso du coach : créées par le coach, pas liées à un athlète
  const coachSessions = allSessions.filter((s) => s.created_by === coachId && !s.athlete_id);
  // Séances d'autres athlètes du coach (pas l'athlète courant)
  const otherAthleteSessions = allSessions.filter(
    (s) => s.athlete_id && s.athlete_id !== athleteId && athletes.some((a) => a.id === s.athlete_id),
  );

  const sourceMap: Record<PickerTab, EnergySessionRow[]> = {
    generale: generalSessions,
    perso: coachSessions,
    athletes: otherAthleteSessions,
  };

  const filtered = sourceMap[tab].filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  /** Remonter à la source racine pour parent_session_id */
  function getRootParentId(s: EnergySessionRow): string {
    return s.parent_session_id ?? s.id;
  }

  function athleteName(id: string): string {
    return athletes.find((a) => a.id === id)?.full_name ?? "Athlète";
  }

  async function handleImport(s: EnergySessionRow) {
    if (copying || !athleteId) return;
    setCopying(s.id);
    try {
      await createMutation.mutateAsync({
        name: s.name,
        session_kind: s.session_kind,
        custom_kind: s.custom_kind ?? null,
        structure_type: s.structure_type,
        intervals: s.intervals,
        notes: s.notes ?? null,
        created_by: coachId,
        athlete_id: athleteId,
        parent_session_id: getRootParentId(s),
      });
      toast.success(`"${s.name}" importée pour l'athlète`);
      onClose();
    } catch {
      toast.error("Erreur lors de l'import");
    } finally {
      setCopying(null);
    }
  }

  const TABS: { key: PickerTab; label: string; count: number }[] = [
    { key: "generale", label: "Banque générale", count: generalSessions.length },
    { key: "perso", label: "Mes séances", count: coachSessions.length },
    { key: "athletes", label: "Autres athlètes", count: otherAthleteSessions.length },
  ];

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Importer une séance"
      description="La séance sera dupliquée pour cet athlète — l'originale reste intacte."
      className="md:max-w-[560px]"
    >
      <div role="tablist" className="-mx-agon-lg flex border-b border-agon-brd px-agon-lg">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-10 flex-1 border-b-2 px-agon-xs text-agon-xs font-semibold transition-colors",
              tab === t.key ? "border-agon-coach text-agon-coach" : "border-transparent text-agon-tx3",
            )}
          >
            {t.label}
            {t.count > 0 && <span className="ml-agon-xs opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      <Input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher une séance…"
        className="my-agon-md"
      />

      {isLoading ? (
        <div className="flex flex-col gap-agon-sm">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[58px] rounded-md bg-agon-s2" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-agon-2xl text-center text-agon-base text-agon-tx3">
          {search ? "Aucun résultat" : "Aucune séance disponible"}
        </div>
      ) : (
        <div className="flex flex-col gap-agon-xs">
          {filtered.map((s) => {
            const kc = KIND_COLOR[s.session_kind] ?? "var(--agon-tx3)";
            const isCopying = copying === s.id;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => void handleImport(s)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleImport(s); }}
                className={cn(
                  "flex items-center gap-agon-md rounded-md border border-agon-brd-l bg-agon-s2 px-agon-md py-agon-md transition-colors hover:border-agon-tx3",
                  copying ? "cursor-not-allowed" : "cursor-pointer",
                  copying && !isCopying && "opacity-50",
                )}
              >
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md" style={{ background: alpha(kc, 0.125), color: kc }}>
                  {isCopying ? <Check size={13} /> : <Zap size={13} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-agon-sm font-bold text-agon-tx">{s.name}</div>
                  <div className="mt-agon-2xs flex flex-wrap items-center gap-agon-xs">
                    <span className="rounded-sm px-agon-xs text-agon-xs font-bold" style={{ background: alpha(kc, 0.125), color: kc }}>
                      {KIND_LABEL[s.session_kind] ?? s.session_kind}
                    </span>
                    {s.total_duration_s != null && <span className="text-agon-xs text-agon-tx3">{Math.round(s.total_duration_s / 60)} min</span>}
                    {s.is_verified && <span className="text-agon-xs font-bold text-agon-succes">✓ vérifiée</span>}
                    {tab === "athletes" && s.athlete_id && <span className="text-agon-xs text-agon-tx3">· {athleteName(s.athlete_id)}</span>}
                  </div>
                </div>
                <span className="hidden shrink-0 text-agon-xs text-agon-tx3 min-[420px]:inline">{isCopying ? "Import…" : "+ Importer"}</span>
                {tab !== "athletes" && (s.created_by === coachId || isAdmin) && (
                  <DeleteEnergySessionButton sessionId={s.id} sessionName={s.name} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
