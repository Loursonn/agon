import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Zap, Plus, Library, X, Check, Copy, Pencil, Trash2, Repeat, Calendar, Lightbulb, Target } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { NewBlockModal } from "@/components/coach/CoachComponents";
import type { Session } from "@/features/shared/types/athlete";
import { useEnergySessions, useCreateEnergySession } from "@/features/shared/hooks/useEnergySessions";
import type { EnergySessionRow } from "@/types/energy";
import { SessionPreviewModal, KIND_COLOR, KIND_LABEL } from "@/features/coach/components/energy/SessionPreviewModal";
import BlockHistoryViewer from "@/features/coach/components/BlockHistoryViewer";
import { useCreateCycleFromBloc } from "@/features/shared/hooks/useCreateCycleFromBloc";
import { ProgrammationView } from "@/features/coach/components/programmation/ProgrammationView";
import { localISO } from "@/lib/date";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];


// SessionPreviewModal, StepTree, buildRootGroup, ROLE_COLOR, ROLE_LABEL_FR imported from shared module

// ── AddMuscuSessionModal ───────────────────────────────────────────────────────

function AddMuscuSessionModal({ onAdd, onClose }: {
  onAdd: (name: string, short: string, dayOfWeek: number | undefined, recurrence: "weekly" | "once") => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState("");
  const [short, setShort]       = useState("");
  const [recurrence, setRecurrence] = useState<"weekly" | "once">("weekly");
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);

  function handleSubmit() {
    if (!name.trim()) { toast.error("Nom requis"); return; }
    const day = recurrence === "weekly" ? selectedDay : undefined;
    onAdd(name.trim(), short.trim() || name.trim().slice(0, 3).toUpperCase(), day, recurrence);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: "1px solid " + C.brdL, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 71,
          transform: "translate(-50%, -50%)",
          width: 400, maxWidth: "94vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "20px 22px",
          animation: "fadeScaleIn 150ms ease-out",
        }}
      >
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.96) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.tx }}>Nouvelle séance</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={13} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Nom */}
          <div>
            <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>Nom complet</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="ex. Haut du corps A, Jambes…"
              style={inputStyle}
            />
          </div>
          {/* Abréviation */}
          <div>
            <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>Abréviation <span style={{ fontWeight: 400 }}>(optionnel)</span></label>
            <input
              value={short}
              onChange={(e) => setShort(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="ex. HCA, JAM…"
              maxLength={6}
              style={{ ...inputStyle, textTransform: "uppercase" as const }}
            />
          </div>
          {/* Récurrence */}
          <div>
            <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6 }}>Type de séance</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["weekly", "once"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRecurrence(r)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 4,
                    border: "1px solid " + (recurrence === r ? C.coach : C.brdL),
                    background: recurrence === r ? C.coachS : "transparent",
                    color: recurrence === r ? C.coach : C.tx2,
                    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 120ms",
                  }}
                >
                  {r === "weekly" ? "Récurrente" : "Ponctuelle"}
                </button>
              ))}
            </div>
          </div>
          {/* Jour (récurrente seulement) */}
          {recurrence === "weekly" && (
            <div>
              <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6 }}>
                Jour de la semaine <span style={{ fontWeight: 400 }}>(optionnel)</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {DOW.map((label, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(selectedDay === idx ? undefined : idx)}
                    style={{
                      padding: "7px 2px", borderRadius: 7,
                      border: "1px solid " + (selectedDay === idx ? C.coach : C.brdL),
                      background: selectedDay === idx ? C.coachS : "transparent",
                      color: selectedDay === idx ? C.coach : C.tx2,
                      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={handleSubmit} style={{ padding: "8px 18px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Créer
          </button>
        </div>
      </div>
    </>
  );
}

// ── BankPickerModal ────────────────────────────────────────────────────────────
// Modale pour importer une séance et la dupliquer pour un athlète.
// 3 sources : banque générale, banque perso coach, séances d'autres athlètes.

type PickerTab = "generale" | "perso" | "athletes";

function BankPickerModal({ coachId, athleteId, onClose }: { coachId: string; athleteId?: string; onClose: () => void }) {
  const { athletes } = useAuth();
  const { data: allSessions = [], isLoading } = useEnergySessions();
  const createMutation = useCreateEnergySession();
  const [search, setSearch] = useState("");
  const [copying, setCopying] = useState<string | null>(null);
  const [tab, setTab] = useState<PickerTab>("generale");

  // Banque générale : publiques, pas liées à un athlète
  const generalSessions = allSessions.filter((s) => s.is_public && !s.athlete_id);
  // Banque perso coach : créées par le coach, pas liées à un athlète
  const coachSessions = allSessions.filter((s) => s.created_by === coachId && !s.athlete_id);
  // Séances d'autres athlètes du coach (pas l'athlète courant)
  const otherAthleteSessions = allSessions.filter(
    (s) => s.athlete_id && s.athlete_id !== athleteId
      && athletes.some((a) => a.id === s.athlete_id)
  );

  const sourceMap: Record<PickerTab, EnergySessionRow[]> = {
    generale: generalSessions,
    perso: coachSessions,
    athletes: otherAthleteSessions,
  };

  const currentList = sourceMap[tab];
  const filtered = currentList.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  /** Remonter à la source racine pour parent_session_id */
  function getRootParentId(s: EnergySessionRow): string {
    return s.parent_session_id ?? s.id;
  }

  /** Trouver le nom de l'athlète */
  function athleteName(id: string): string {
    return athletes.find((a) => a.id === id)?.full_name ?? "Athlète";
  }

  async function handleImport(s: EnergySessionRow) {
    if (copying || !athleteId) return;
    setCopying(s.id);
    try {
      await createMutation.mutateAsync({
        name:              s.name,
        session_kind:      s.session_kind,
        custom_kind:       s.custom_kind ?? null,
        structure_type:    s.structure_type,
        intervals:         s.intervals,
        notes:             s.notes ?? null,
        created_by:        coachId,
        athlete_id:        athleteId,
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
    { key: "perso",    label: "Mes séances",     count: coachSessions.length },
    { key: "athletes", label: "Autres athlètes", count: otherAthleteSessions.length },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 560, maxWidth: "94vw", maxHeight: "80vh",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          display: "flex", flexDirection: "column",
          animation: "fadeScaleIn 150ms ease-out",
        }}
      >
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.96) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Library size={16} color={C.coach} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.tx }}>Importer une séance</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>La séance sera dupliquée pour cet athlète — l'originale reste intacte.</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "9px 8px", border: "none",
                borderBottom: "2px solid " + (tab === t.key ? C.coach : "transparent"),
                background: "transparent",
                color: tab === t.key ? C.coach : C.tx3,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", transition: "color 150ms, border-color 150ms",
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>({t.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une séance…"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2,
              color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", padding: "12px 20px", flex: 1, scrollbarWidth: "none" }}>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <div key={i} style={{ height: 58, borderRadius: 4, background: C.s2 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 13 }}>
              {search ? "Aucun résultat" : "Aucune séance disponible"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map((s) => {
                const kc = KIND_COLOR[s.session_kind] ?? "#6B7280";
                const isCopying = copying === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleImport(s)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 4,
                      border: "1px solid " + C.brdL, background: C.s2,
                      cursor: copying ? "not-allowed" : "pointer",
                      opacity: copying && !isCopying ? 0.5 : 1,
                      transition: "border-color 120ms",
                    }}
                    onMouseEnter={(e) => { if (!copying) e.currentTarget.style.borderColor = kc + "60"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.brdL; }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 4, background: kc + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isCopying ? <Check size={13} color={kc} /> : <Zap size={13} color={kc} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: kc + "20", color: kc }}>
                          {KIND_LABEL[s.session_kind] ?? s.session_kind}
                        </span>
                        {s.total_duration_s != null && (
                          <span style={{ fontSize: 10, color: C.tx3 }}>{Math.round(s.total_duration_s / 60)} min</span>
                        )}
                        {s.is_verified && (
                          <span style={{ fontSize: 9, color: C.g, fontWeight: 700 }}>✓ vérifiée</span>
                        )}
                        {tab === "athletes" && s.athlete_id && (
                          <span style={{ fontSize: 9, color: C.tx3 }}>· {athleteName(s.athlete_id)}</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.tx3, flexShrink: 0 }}>
                      {isCopying ? "Import…" : "+ Importer"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── EnergyPanel ────────────────────────────────────────────────────────────────
// Banque de séances énergétiques personnelle du coach.
// Pas d'assignation ici — les assignations se font depuis Planning > Mois.

interface EnergyPanelProps {
  coachId: string;
  athleteId?: string;
  onNew: () => void;
  onEdit: (sessionId: string) => void;
}

function EnergyPanel({ coachId, athleteId, onNew, onEdit }: EnergyPanelProps) {
  const { data: allAthlSessions = [], isLoading } = useEnergySessions();
  // Filtrage client : séances de cet athlète, ou banque perso coach si pas d'athlète
  const sessions = athleteId
    ? allAthlSessions.filter((s) => s.athlete_id === athleteId && s.session_kind !== "specifique")
    : allAthlSessions.filter((s) => s.created_by === coachId && !s.athlete_id && s.session_kind !== "specifique");
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [previewSession, setPreviewSession] = useState<EnergySessionRow | null>(null);

  const filtered = sessions.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
          Séances énergétiques
          {sessions.length > 0 && (
            <span style={{ fontSize: 11, color: C.tx3, fontWeight: 400, marginLeft: 8 }}>
              {sessions.length} séance{sessions.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowPicker(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 12px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent", color: C.tx2,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Library size={13} />
            Importer une séance
          </button>
          <button
            onClick={onNew}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 14px", borderRadius: 4,
              border: "none", background: C.acV, color: "#0E0C0A",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={13} />
            Créer une séance
          </button>
        </div>
      </div>

      {showPicker && <BankPickerModal coachId={coachId} athleteId={athleteId} onClose={() => setShowPicker(false)} />}

      {previewSession && (
        <SessionPreviewModal
          session={previewSession}
          athleteId={athleteId}
          onEdit={() => { setPreviewSession(null); onEdit(previewSession.id); }}
          onClose={() => setPreviewSession(null)}
        />
      )}

      {/* Info banner */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 14px", borderRadius: 4, marginBottom: 16,
        background: C.ac + "10", border: "1px solid " + C.ac + "30",
        fontSize: 11, color: C.tx2, lineHeight: 1.5,
      }}>
        <Lightbulb size={14} style={{ color: C.ac, flexShrink: 0 }} />
        <span>
          Importe une séance depuis la banque ou un autre athlète. La copie est personnalisable sans modifier l'originale.
          Pour la planifier, glisse-la depuis <strong style={{ color: C.ac }}>Planning → Mois</strong> vers le jour voulu.
        </span>
      </div>

      {/* Search */}
      {sessions.length > 4 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: C.s2,
            color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box", marginBottom: 12,
          }}
        />
      )}

      {/* ── Session list ── */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 64, borderRadius: 6, background: C.s1 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <Zap size={36} style={{ color: C.tx3, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
            {search ? "Aucun résultat" : "Banque vide"}
          </div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 16 }}>
            {search
              ? "Modifie ta recherche."
              : "Importe une séance depuis la banque ou crée-en une nouvelle."}
          </div>
          {!search && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => setShowPicker(true)}
                style={{
                  padding: "10px 16px", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: "transparent", color: C.tx2,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Library size={14} /> Importer une séance
              </button>
              <button
                onClick={onNew}
                style={{
                  padding: "10px 20px", borderRadius: 4, border: "none",
                  background: C.acV, color: "#0E0C0A",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Créer une séance
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((s) => {
            const kc = KIND_COLOR[s.session_kind] ?? "#6B7280";
            return (
              <div
                key={s.id}
                onClick={() => setPreviewSession(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 6,
                  border: "1px solid " + C.brdL, background: C.s1,
                  cursor: "pointer", transition: "border-color 120ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = kc + "50")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.brdL)}
              >
                {/* Icon */}
                <div style={{
                  width: 34, height: 34, borderRadius: 4, flexShrink: 0,
                  background: kc + "20", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Zap size={16} color={kc} />
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: kc + "20", color: kc }}>
                      {KIND_LABEL[s.session_kind] ?? s.session_kind}
                    </span>
                    {s.total_duration_s != null && (
                      <span style={{ fontSize: 10, color: C.tx3 }}>
                        {Math.round(s.total_duration_s / 60)} min
                      </span>
                    )}
                    {s.is_verified && (
                      <span style={{ fontSize: 9, color: C.g, fontWeight: 700 }}>✓ vérifiée</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: C.tx3, flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── SpecifiquePanel ──────────────────────────────────────────────────────────

const SPECIFIQUE_COLOR = "#F5A623";

function SpecifiquePanel({ coachId, athleteId, onNew, onEdit }: EnergyPanelProps) {
  const { data: allSessions = [], isLoading } = useEnergySessions();
  const sessions = (athleteId
    ? allSessions.filter((s) => s.athlete_id === athleteId && s.session_kind === "specifique")
    : allSessions.filter((s) => s.created_by === coachId && !s.athlete_id && s.session_kind === "specifique")
  );
  const [search, setSearch] = useState("");
  const [previewSession, setPreviewSession] = useState<EnergySessionRow | null>(null);

  const filtered = sessions.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
          Séances spécifiques
          {sessions.length > 0 && (
            <span style={{ fontSize: 11, color: C.tx3, fontWeight: 400, marginLeft: 8 }}>
              {sessions.length} séance{sessions.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={onNew}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "7px 14px", borderRadius: 4,
            border: "none", background: C.acV, color: "#0E0C0A",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Plus size={13} />
          Créer une séance
        </button>
      </div>

      {previewSession && (
        <SessionPreviewModal
          session={previewSession}
          athleteId={athleteId}
          onEdit={() => { setPreviewSession(null); onEdit(previewSession.id); }}
          onClose={() => setPreviewSession(null)}
        />
      )}

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 14px", borderRadius: 4, marginBottom: 16,
        background: SPECIFIQUE_COLOR + "10", border: "1px solid " + SPECIFIQUE_COLOR + "30",
        fontSize: 11, color: C.tx2, lineHeight: 1.5,
      }}>
        <Target size={14} style={{ color: SPECIFIQUE_COLOR, flexShrink: 0 }} />
        <span>
          Séances spécifiques type CrossFit / MetCon : combine intervalles énergétiques et exercices dans un même builder.
        </span>
      </div>

      {sessions.length > 4 && (
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: C.s2,
            color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box", marginBottom: 12,
          }}
        />
      )}

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 64, borderRadius: 6, background: C.s1 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ marginBottom: 10 }}><Target size={32} style={{ color: C.tx3 }} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
            {search ? "Aucun résultat" : "Aucune séance spécifique"}
          </div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 16 }}>
            {search ? "Modifie ta recherche." : "Crée ta première séance spécifique."}
          </div>
          {!search && (
            <button
              onClick={onNew}
              style={{
                padding: "10px 20px", borderRadius: 4, border: "none",
                background: C.acV, color: "#0E0C0A",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Créer une séance
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((s) => (
            <div
              key={s.id}
              onClick={() => setPreviewSession(s)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 6,
                border: "1px solid " + C.brdL, background: C.s1,
                cursor: "pointer", transition: "border-color 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = SPECIFIQUE_COLOR + "50")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.brdL)}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 4, flexShrink: 0,
                background: SPECIFIQUE_COLOR + "20", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>
                <Target size={16} style={{ color: SPECIFIQUE_COLOR }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: SPECIFIQUE_COLOR + "20", color: SPECIFIQUE_COLOR }}>
                    spécifique
                  </span>
                  {s.total_duration_s != null && (
                    <span style={{ fontSize: 10, color: C.tx3 }}>{Math.round(s.total_duration_s / 60)} min</span>
                  )}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: C.tx3, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProgrammationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    athleteId, loaded, viewOnly,
    exos, setExos, sessions, setSessions, blockConfig, setBlockConfig,
    completedSessions, currentWeek, tw, dw, allMethods,
    customMethods, setCustomMethods, exMeta, setExMeta, sets,
    athleteNotes, weekSchedule, setWeekSchedule,
    showNewBlock, setShowNewBlock, showBlockHistory, setShowBlockHistory,
    blockHistory, setBlockHistory,
    archiveAndNewBlock, updateSessionDay,
    openCycleId, setOpenCycleId,
  } = useAthleteContext();

  const [subTab, setSubTab] = useState("muscu");
  const [showExoParams, setShowExoParams] = useState(false);
  const [showAddMuscu, setShowAddMuscu] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<{ sessId: string; sessName: string } | null>(null);
  const [dayPicker, setDayPicker] = useState<{ sessId: string; sessName: string; currentDay: number } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [trashedSessions, setTrashedSessions] = useState<Array<{ session: Session; exos: unknown[] }>>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ sessId: string; sessName: string } | null>(null);
  const qc = useQueryClient();

  // Tous les cycles de l'athlète (passés, en cours, futurs), triés par date.
  type CycleLite = { id: string; name: string; start_date: string; end_date: string };
  const { data: cyclesList = [], isLoading: cycleLoading } = useQuery({
    queryKey: ["athlete-cycles-list", athleteId],
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async (): Promise<CycleLite[]> => {
      const { data } = await supabase
        .from("cycles")
        .select("id, name, start_date, end_date")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: true });
      return (data ?? []) as CycleLite[];
    },
  });

  const createCycle = useCreateCycleFromBloc();

  // NOTE: la transformation bloc → cycle ne se fait plus automatiquement.
  // La création de cycle passe désormais explicitement par l'assistant de la frise
  // (CreateCycleAssistant) ou par le bouton « Créer le cycle » ci-dessous.
  // L'auto-création silencieuse programmait des séances sans choix de l'utilisateur.

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  const todayISO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  // Cycle par défaut = celui qui couvre AUJOURD'HUI ; sinon le plus récent.
  const coveringToday = cyclesList.find((c) => c.start_date <= todayISO && todayISO <= c.end_date) ?? null;
  const mostRecent    = cyclesList.length ? cyclesList[cyclesList.length - 1] : null;
  const defaultCycle  = coveringToday ?? mostRecent;
  // Cycle affiché = cycle ouvert (sélecteur) sinon défaut.
  const activeCycle   = cyclesList.find((c) => c.id === openCycleId) ?? defaultCycle ?? null;

  const weeksOf = (s: string, e: string) =>
    Math.max(1, Math.ceil((new Date(e + "T12:00:00").getTime() - new Date(s + "T12:00:00").getTime()) / (7 * 86_400_000)));

  // Ouvre un cycle : charge son contenu (exos/séances) + cale le bloc legacy dessus.
  const selectCycle = useCallback((c: CycleLite) => {
    setOpenCycleId(c.id);
    setBlockConfig((prev) => ({
      ...prev,
      cycleId:    c.id,
      blockName:  c.name,
      startDate:  c.start_date,
      totalWeeks: weeksOf(c.start_date, c.end_date),
      deloadWeek: prev.cycleId === c.id ? prev.deloadWeek : 0,
    }));
  }, [setOpenCycleId, setBlockConfig]);

  // Au chargement / changement de cycle : aligne openCycleId + blockConfig sur le
  // cycle par défaut (couvrant aujourd'hui) si rien n'est encore ouvert/aligné.
  useEffect(() => {
    if (!cyclesList.length) return;
    const target = cyclesList.find((c) => c.id === openCycleId) ?? defaultCycle;
    if (!target) return;
    if (openCycleId !== target.id) setOpenCycleId(target.id);
    if (blockConfig?.cycleId !== target.id) selectCycle(target);
  }, [cyclesList, openCycleId, blockConfig?.cycleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un cycle dont la date de fin est passée n'est plus « en cours » → dernier cycle.
  const cycleEnded = !!activeCycle && activeCycle.end_date < todayISO;
  const cycleStatusLabel = !activeCycle
    ? ""
    : activeCycle.end_date < todayISO   ? "Cycle passé"
    : activeCycle.start_date > todayISO ? "Cycle à venir"
    : "Cycle en cours";

  const sortedSessions = [...sessions].sort((a, b) => (a.day_of_week ?? 7) - (b.day_of_week ?? 7));

  async function rescheduleWorkoutLogs(sessId: string, newDay: number) {
    const today = localISO();
    const { data: logs } = await supabase
      .from("workout_logs")
      .select("id, microcycle_id, microcycles(start_date)")
      .eq("session_id", sessId)
      .gte("scheduled_date", today);

    if (!logs?.length) return;

    const updates = (logs as Array<{ id: string; microcycles: { start_date: string } | null }>)
      .filter(l => l.microcycles?.start_date)
      .map(l => {
        const monday = new Date(l.microcycles!.start_date + "T12:00:00");
        monday.setDate(monday.getDate() + newDay);
        return { id: l.id, scheduled_date: localISO(monday) };
      });

    await Promise.all(updates.map(u =>
      supabase.from("workout_logs").update({ scheduled_date: u.scheduled_date }).eq("id", u.id)
    ));

    qc.invalidateQueries({ queryKey: ["cal-range"] });
    qc.invalidateQueries({ queryKey: ["timeline-data"] });
    qc.invalidateQueries({ queryKey: ["micro-days"] });
    toast.success("Jour modifié — calendrier mis à jour");
  }

  if (!loaded) {
    return (
      <div style={{ padding: "16px 24px" }}>
        <Skeleton style={{ height: 80, borderRadius: 6, background: C.s1, marginBottom: 12 }} />
        <Skeleton style={{ height: 300, borderRadius: 6, background: C.s1 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 24px 60px" }}>

      {/* ── Bannière cycle ── */}
      <div style={{
        background: C.s1, borderRadius: 6, padding: "12px 16px",
        border: "1px solid " + C.b + "30", marginBottom: 16,
      }}>
        {(cycleLoading || createCycle.isPending) ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid " + C.coach, borderTopColor: "transparent",
              animation: "spin 0.7s linear infinite",
            }} />
            <span style={{ fontSize: 12, color: C.tx3 }}>Création du cycle…</span>
          </div>
        ) : activeCycle ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: cycleEnded ? C.tx3 : C.b,
                  textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 4,
                }}>{cycleStatusLabel}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{activeCycle.name}</div>
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                  {formatDate(activeCycle.start_date)} → {formatDate(activeCycle.end_date)}
                  {cycleEnded ? " · terminé" : activeCycle.start_date > todayISO ? " · à venir" : ` · S${currentWeek}/${tw}`}
                </div>
              </div>
              {dw > 0 && (
                <span style={{
                  padding: "4px 8px", borderRadius: 6,
                  background: C.bS, color: C.b, fontSize: 10, fontWeight: 700,
                }}>Deload S{dw}</span>
              )}
            </div>

            {/* Sélecteur : tous les cycles (passés / en cours / futurs) */}
            {cyclesList.length > 1 && (
              <select
                value={activeCycle.id}
                onChange={(e) => { const c = cyclesList.find((x) => x.id === e.target.value); if (c) selectCycle(c); }}
                style={{
                  width: "100%", padding: "7px 9px", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
                  fontSize: 12, fontFamily: "inherit",
                }}
              >
                {cyclesList.map((c) => {
                  const status = c.end_date < todayISO ? "Passé" : c.start_date > todayISO ? "À venir" : "En cours";
                  return (
                    <option key={c.id} value={c.id}>
                      {status} · {c.name} ({formatDate(c.start_date)} → {formatDate(c.end_date)})
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
                {blockConfig?.blockName || "Cycle sans nom"}
              </div>
              {blockConfig?.startDate
                ? <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                    Début {formatDate(blockConfig.startDate)} · {tw} semaines
                  </div>
                : <div style={{ fontSize: 11, color: C.o, marginTop: 2 }}>Date de début manquante</div>
              }
            </div>
            {!viewOnly && (
              <button
                onClick={() => {
                  if (user && blockConfig && sessions.length > 0) {
                    createCycle.mutate({ blockConfig, sessions, athleteId, coachId: user.id });
                  }
                }}
                disabled={!blockConfig?.startDate || sessions.length === 0}
                style={{
                  padding: "8px 14px", borderRadius: 4,
                  border: "1px solid " + C.coach + "40",
                  background: C.coachS, color: C.coach,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  flexShrink: 0,
                  opacity: (!blockConfig?.startDate || sessions.length === 0) ? 0.5 : 1,
                }}
              >Créer le cycle</button>
            )}
          </div>
        )}
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + C.brd, marginBottom: 16 }}>
        {[
          { k: "muscu",      l: "Musculation" },
          { k: "energie",    l: "Énergétique" },
          { k: "specifique", l: "Spécifique"  },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setSubTab(t.k)}
            style={{
              padding: "9px 18px", border: "none",
              borderBottom: "2px solid " + (subTab === t.k ? C.coach : "transparent"),
              background: "transparent",
              color: subTab === t.k ? C.coach : C.tx3,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", textTransform: "uppercase" as const,
              letterSpacing: "0.3px", flexShrink: 0,
              transition: "color 150ms, border-color 150ms",
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* ── Musculation ── */}
      {subTab === "muscu" && (
        <ProgrammationView
          athleteId={athleteId}
          cycleId={activeCycle?.id}
        />
      )}


      {/* ── Énergétique ── */}
      {subTab === "energie" && (
        <EnergyPanel
          coachId={user?.id ?? ""}
          athleteId={athleteId ?? undefined}
          onNew={() => navigate(athleteId ? `/coach/athletes/${athleteId}/energy/new` : "/coach/energy-library/new")}
          onEdit={(sessionId: string) => navigate(athleteId ? `/coach/athletes/${athleteId}/energy/${sessionId}/edit` : `/coach/energy-library/${sessionId}/edit`)}
        />
      )}

      {/* ── Spécifique ── */}
      {subTab === "specifique" && (
        <SpecifiquePanel
          coachId={user?.id ?? ""}
          athleteId={athleteId ?? undefined}
          onNew={() => {
            const base = athleteId
              ? `/coach/athletes/${athleteId}/energy/new`
              : "/coach/energy-library/new";
            navigate(`${base}?kind=specifique`);
          }}
          onEdit={(sessionId: string) => navigate(athleteId ? `/coach/athletes/${athleteId}/energy/${sessionId}/edit` : `/coach/energy-library/${sessionId}/edit`)}
        />
      )}

      {/* ── AddMuscuSessionModal ── */}
      {showAddMuscu && (
        <AddMuscuSessionModal
          onAdd={(name, short, dayOfWeek, recurrence) => {
            const newSess = {
              id:          crypto.randomUUID(),
              name,
              short,
              day_of_week: dayOfWeek,
              recurrence,
            };
            setSessions((prev) => [...prev, newSess]);
            toast.success(`Séance "${name}" créée`);
          }}
          onClose={() => setShowAddMuscu(false)}
        />
      )}

      {/* ── Corbeille ── */}
      {showTrash && (
        <>
          <div onClick={() => setShowTrash(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)" }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", zIndex: 81,
            transform: "translate(-50%, -50%)",
            background: C.bg, borderRadius: 6, padding: "20px",
            width: "min(92vw, 380px)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, display: "flex", alignItems: "center", gap: 8 }}>
                <Trash2 size={16} style={{ color: C.r }} />
                Corbeille
                <span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>({trashedSessions.length} séance{trashedSessions.length !== 1 ? "s" : ""})</span>
              </div>
              <button onClick={() => setShowTrash(false)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
            </div>
            {trashedSessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.tx3, fontSize: 13 }}>Corbeille vide</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
                {trashedSessions.map(({ session: s }) => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s1,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{s.name || s.short || "Séance"}</div>
                      {s.day_of_week != null && <div style={{ fontSize: 10, color: C.tx3 }}>{DOW[s.day_of_week]}</div>}
                    </div>
                    <button
                      title="Restaurer"
                      onClick={() => {
                        const item = trashedSessions.find(t => t.session.id === s.id);
                        if (!item) return;
                        setSessions(prev => [...prev, item.session]);
                        setExos(prev => ({ ...(prev as Record<string, unknown[]>), [s.id]: item.exos }));
                        setTrashedSessions(prev => prev.filter(t => t.session.id !== s.id));
                        toast.success(`"${s.name || s.short}" restaurée`);
                      }}
                      style={{
                        padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.coach,
                        background: C.coachS, color: C.coach, fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                      }}
                    >Restaurer</button>
                    <button
                      title="Supprimer définitivement"
                      onClick={() => {
                        setTrashedSessions(prev => prev.filter(t => t.session.id !== s.id));
                        toast.success("Supprimée définitivement");
                      }}
                      style={{
                        width: 26, height: 26, borderRadius: 6, border: "1px solid " + C.r + "40",
                        background: C.rS, color: C.r, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}
                    ><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Confirm suppression ── */}
      {confirmDelete && (
        <>
          <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, zIndex: 82, background: "rgba(0,0,0,0.6)" }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", zIndex: 83,
            transform: "translate(-50%, -50%)",
            background: C.bg, borderRadius: 6, padding: "20px 20px",
            width: "min(88vw, 320px)",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Déplacer vers la corbeille ?</div>
            <div style={{ fontSize: 13, color: C.tx2 }}>
              <span style={{ fontWeight: 700 }}>"{confirmDelete.sessName}"</span> sera déplacée dans la corbeille. Tu pourras la restaurer.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: "transparent",
                  color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >Annuler</button>
              <button
                onClick={() => {
                  const { sessId, sessName } = confirmDelete;
                  const sessObj = sessions.find(s => s.id === sessId);
                  if (sessObj) {
                    const sessExos = ((exos as Record<string, unknown[]>)[sessId] || []);
                    setTrashedSessions(prev => [...prev, { session: sessObj, exos: sessExos }]);
                    setSessions(prev => prev.filter(s => s.id !== sessId));
                    setExos(prev => { const next = { ...(prev as Record<string, unknown[]>) }; delete next[sessId]; return next; });
                    toast.success(`"${sessName}" déplacée dans la corbeille`);
                  }
                  setConfirmDelete(null);
                }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 4,
                  border: "none", background: C.rV, color: "#0E0C0A",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >Supprimer</button>
            </div>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {showNewBlock && (
        <NewBlockModal
          onStart={archiveAndNewBlock}
          onClose={() => setShowNewBlock(false)}
          onResume={() => setShowNewBlock(false)}
          hasCurrentData={sessions.length > 0 && Object.values(exos).flat().length > 0}
          blockHistory={blockHistory}
          onDelete={(idx) => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}
      {showBlockHistory && (
        <BlockHistoryViewer
          blockHistory={blockHistory}
          onClose={() => setShowBlockHistory(false)}
          onDelete={(idx) => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}

      {/* ── Modal choix de jour (double-clic) ── */}
      {dayPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div
            onClick={() => setDayPicker(null)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
          />
          <div style={{
            position: "relative", width: "100%",
            background: C.bg, borderRadius: "6px 6px 0 0",
            padding: "20px 16px 36px",
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 4 }}>
              {dayPicker.sessName}
            </div>
            <div style={{ fontSize: 11, color: C.tx3, marginBottom: 16 }}>
              Choisir le jour — reprogramme toutes les séances à partir d'aujourd'hui
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {DOW.map((label, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    const prev = dayPicker;
                    setDayPicker(null);
                    updateSessionDay(prev.sessId, idx);
                    await rescheduleWorkoutLogs(prev.sessId, idx);
                  }}
                  style={{
                    padding: "10px 4px", borderRadius: 4,
                    border: "1px solid " + (dayPicker.currentDay === idx ? C.coach : C.brdL),
                    background: dayPicker.currentDay === idx ? C.coachS : "transparent",
                    color: dayPicker.currentDay === idx ? C.coach : C.tx2,
                    fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
