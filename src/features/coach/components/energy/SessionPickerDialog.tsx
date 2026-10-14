import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import type { SessionKind } from "@/types/energy";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  date: string; // YYYY-MM-DD
  athleteId: string;
  sessionKindFilter?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  vo2:        "#FFC933",
  tempo:      "#33B5FF",
  seuil:      "#FF9500",
  footing:    "#66F03C",
  fartlek:    "#FF9500",
  autre:      "#7D7468",
  custom:     "#FFC933",
  specifique: "#F5A623",
};

const KIND_LABELS: Record<string, string> = {
  vo2:        "VO₂",
  tempo:      "Tempo",
  seuil:      "Seuil",
  footing:    "Footing",
  fartlek:    "Fartlek",
  autre:      "Autre",
  custom:     "Custom",
  specifique: "Spécifique",
};

const ALL_KINDS: SessionKind[] = ["vo2", "tempo", "seuil", "footing", "fartlek"];

// ── SessionPickerDialog ───────────────────────────────────────────────────────

export function SessionPickerDialog({ open, onClose, date, athleteId, sessionKindFilter }: Props) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<SessionKind | null>(null);

  const { data: sessions = [], isLoading } = useEnergySessions();
  const assignMut = useAssignEnergySession();

  const formattedDate = useMemo(() => {
    try {
      return format(parseISO(date), "d MMMM yyyy", { locale: fr });
    } catch {
      return date;
    }
  }, [date]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      // Filter by session kind category (specifique vs energy)
      if (sessionKindFilter && s.session_kind !== sessionKindFilter) return false;
      if (!sessionKindFilter && s.session_kind === "specifique") return false;
      const matchKind = kindFilter ? s.session_kind === kindFilter : true;
      const matchSearch = search.trim()
        ? s.name.toLowerCase().includes(search.trim().toLowerCase())
        : true;
      return matchKind && matchSearch;
    });
  }, [sessions, kindFilter, search, sessionKindFilter]);

  function handleSelect(sessionId: string) {
    assignMut.mutate(
      {
        energy_session_id: sessionId,
        athlete_id: athleteId,
        scheduled_date: date,
        status: "planned",
      },
      { onSuccess: onClose }
    );
  }

  if (!open) return null;

  return (
    /* Overlay */
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Panel */}
      <div
        style={{
          background: C.s1,
          border: `1px solid ${C.brd}`,
          borderRadius: 6,
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${C.brd}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
              Choisir une séance
            </div>
            <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>
              {formattedDate}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.tx3,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 2,
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>

        {/* Search + filters */}
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.brd}` }}>
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              background: C.s2,
              border: `1px solid ${C.brdL}`,
              borderRadius: 4,
              color: C.tx,
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />
          {/* Kind filter pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <KindPill
              label="Toutes"
              active={kindFilter === null}
              color={C.tx3}
              onClick={() => setKindFilter(null)}
            />
            {ALL_KINDS.map((k) => (
              <KindPill
                key={k}
                label={KIND_LABELS[k]}
                active={kindFilter === k}
                color={KIND_COLORS[k]}
                onClick={() => setKindFilter(kindFilter === k ? null : k)}
              />
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: C.tx3, fontSize: 13 }}>
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.tx3, fontSize: 13 }}>
              Aucune séance trouvée
            </div>
          ) : (
            filtered.map((s) => {
              const kind = s.session_kind as SessionKind;
              const durationMin = s.total_duration_s
                ? Math.round(s.total_duration_s / 60)
                : null;
              const distanceKm = s.total_distance_m
                ? (s.total_distance_m / 1000).toFixed(1)
                : null;

              return (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  disabled={assignMut.isPending}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 20px",
                    background: "none",
                    border: "none",
                    borderBottom: `1px solid ${C.brd}`,
                    cursor: assignMut.isPending ? "not-allowed" : "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.s2;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "none";
                  }}
                >
                  {/* Kind dot */}
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: KIND_COLORS[kind] ?? C.tx3,
                      flexShrink: 0,
                    }}
                  />
                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.tx,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.name}
                    </div>
                  </div>
                  {/* Kind badge + duration */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 6,
                        color: KIND_COLORS[kind] ?? C.tx3,
                        background: (KIND_COLORS[kind] ?? C.tx3) + "20",
                        border: `1px solid ${(KIND_COLORS[kind] ?? C.tx3)}40`,
                      }}
                    >
                      {KIND_LABELS[kind] ?? kind}
                    </span>
                    {durationMin && (
                      <span style={{ fontSize: 11, color: C.tx3 }}>{durationMin} min</span>
                    )}
                    {distanceKm && !durationMin && (
                      <span style={{ fontSize: 11, color: C.tx3 }}>{distanceKm} km</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── KindPill ──────────────────────────────────────────────────────────────────

function KindPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 10px",
        borderRadius: 6,
        border: `1px solid ${active ? color : C.brd}`,
        background: active ? color + "20" : "transparent",
        color: active ? color : C.tx3,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export default SessionPickerDialog;
