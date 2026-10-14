/**
 * CompetitionsView — liste de toutes les compétitions d'un athlète
 * avec création / édition / suppression via CompetitionFormModal.
 */
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, parseISO, isFuture, isPast, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { COMPETITION_META } from "@/types/planning";
import { CompetitionFormModal } from "./CompetitionFormModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Comp {
  id: string;
  athlete_id: string;
  coach_id: string;
  name: string;
  type: string;
  date: string;
  location: string | null;
  notes: string | null;
  priority: string;
  macrocycle_id: string | null;
  created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  A: "#F5A623",
  B: "#FFC933",
  C: "#9194A0",
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useComps(athleteId: string) {
  return useQuery<Comp[]>({
    queryKey: ["competitions", athleteId],
    enabled: !!athleteId,
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitions")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comp[];
    },
  });
}

function useDeleteComp() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; athlete_id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from("competitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["competitions", vars.athlete_id] });
    },
  });
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  athleteId: string;
  coachId:   string;
}

export function CompetitionsView({ athleteId, coachId }: Props) {
  const { data: competitions = [], isLoading } = useComps(athleteId);
  const { mutate: deleteComp } = useDeleteComp();
  const [formComp,   setFormComp]   = useState<Comp | null | "new">(null);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);

  const upcoming = competitions.filter((c) => isFuture(parseISO(c.date)) || isToday(parseISO(c.date)));
  const past     = competitions.filter((c) => isPast(parseISO(c.date)) && !isToday(parseISO(c.date)));

  function handleDelete(comp: Comp) {
    if (delConfirm === comp.id) {
      deleteComp({ id: comp.id, athlete_id: comp.athlete_id });
      setDelConfirm(null);
    } else {
      setDelConfirm(comp.id);
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: C.tx3, fontSize: 12 }}>
        Chargement…
      </div>
    );
  }

  return (
    <>
      <div style={{ maxWidth: 740, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.tx }}>Compétitions</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              {upcoming.length} à venir · {past.length} passées
            </div>
          </div>
          <button
            onClick={() => setFormComp("new")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 4,
              border: "none", background: C.ac,
              color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={13} /> Ajouter
          </button>
        </div>

        {competitions.length === 0 ? (
          <div style={{
            padding: "60px 0", textAlign: "center",
            background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Aucune compétition</div>
            <div style={{ fontSize: 12, color: C.tx3, marginTop: 4, marginBottom: 16 }}>
              Ajoute des compétitions pour planifier la saison.
            </div>
            <button
              onClick={() => setFormComp("new")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 4, border: "none", background: C.ac,
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={12} /> Ajouter une compétition
            </button>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Section title="À venir">
                {upcoming.map((c) => (
                  <CompRow
                    key={c.id}
                    comp={c}
                    delConfirm={delConfirm}
                    onEdit={() => setFormComp(c)}
                    onDelete={() => handleDelete(c)}
                    onCancelDel={() => setDelConfirm(null)}
                  />
                ))}
              </Section>
            )}

            {past.length > 0 && (
              <Section title="Passées" dimmed>
                {past.map((c) => (
                  <CompRow
                    key={c.id}
                    comp={c}
                    delConfirm={delConfirm}
                    onEdit={() => setFormComp(c)}
                    onDelete={() => handleDelete(c)}
                    onCancelDel={() => setDelConfirm(null)}
                    dimmed
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {formComp !== null && (
        <CompetitionFormModal
          athleteId={athleteId}
          coachId={coachId}
          existing={formComp === "new" ? null : (formComp as import("@/types/planning").Competition)}
          onClose={() => setFormComp(null)}
        />
      )}
    </>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, dimmed, children }: { title: string; dimmed?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: dimmed ? C.tx3 : C.tx2,
        textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface CompRowProps {
  comp:        Comp;
  delConfirm:  string | null;
  onEdit:      () => void;
  onDelete:    () => void;
  onCancelDel: () => void;
  dimmed?:     boolean;
}

function CompRow({ comp, delConfirm, onEdit, onDelete, onCancelDel, dimmed }: CompRowProps) {
  const meta     = COMPETITION_META[comp.type as keyof typeof COMPETITION_META] ?? COMPETITION_META.competition;
  const priColor = PRIORITY_COLOR[comp.priority] ?? C.tx3;
  const isConf   = delConfirm === comp.id;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderRadius: 4,
        background: C.s1, border: "1px solid " + C.brd,
        opacity: dimmed ? 0.7 : 1,
        transition: "opacity 150ms",
      }}
    >
      {/* Priority badge */}
      <div
        style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: priColor + "22", border: "1px solid " + priColor + "50",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: priColor,
        }}
      >
        {comp.priority}
      </div>

      {/* Emoji */}
      <div style={{ fontSize: 18, flexShrink: 0 }}>{meta.emoji}</div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{comp.name}</span>
          <span style={{
            fontSize: 9, fontWeight: 600, color: meta.color,
            background: meta.color + "18", padding: "1px 6px", borderRadius: 4,
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            {meta.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>{format(parseISO(comp.date), "d MMMM yyyy", { locale: fr })}</span>
          {comp.location && <span>{comp.location}</span>}
          {comp.notes    && (
            <span style={{ fontStyle: "italic", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {comp.notes}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {isConf ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: C.r }}>Supprimer ?</span>
          <button
            onClick={onDelete}
            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Oui
          </button>
          <button
            onClick={onCancelDel}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >
            Non
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={onEdit}
            title="Modifier"
            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            title="Supprimer"
            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
