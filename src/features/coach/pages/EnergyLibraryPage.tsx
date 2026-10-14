/**
 * EnergyLibraryPage — banque partagée de séances énergétiques.
 * Route : /coach/energy-library
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import EnergySessionCard from "../components/energy/EnergySessionCard";
import type { SessionKind } from "@/types/energy";

// ── Constants ─────────────────────────────────────────────────────────────────

type FilterTab = "all" | "mine" | "verified";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all",      label: "Toutes" },
  { value: "mine",     label: "Mes séances" },
  { value: "verified", label: "Vérifiées" },
];

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "all",     label: "Tous les types" },
  { value: "vo2",     label: "VO₂max / VMA" },
  { value: "tempo",   label: "Tempo" },
  { value: "seuil",   label: "Seuil lactique" },
  { value: "footing", label: "Footing" },
  { value: "fartlek", label: "Fartlek" },
  { value: "autre",   label: "Autres" },
  { value: "custom",     label: "Personnalisé" },
];

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: 3, background: C.s2 }} />
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 13, width: "60%", background: C.s2, borderRadius: 4 }} />
        <div style={{ height: 9, width: "30%", background: C.s2, borderRadius: 4 }} />
        <div style={{ height: 120, background: C.s2, borderRadius: 6 }} />
        <div style={{ height: 10, width: "40%", background: C.s2, borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      gridColumn: "1 / -1",
      textAlign: "center",
      padding: "60px 20px",
      color: C.tx3,
    }}>
      <div style={{ marginBottom: 12 }}><Zap size={40} style={{ color: C.tx3 }} /></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.tx2, marginBottom: 6 }}>Aucune séance</div>
      <div style={{ fontSize: 13, marginBottom: 20 }}>Créez la première séance de la banque énergétique.</div>
      <button
        onClick={onNew}
        style={{
          padding: "9px 20px", borderRadius: 4, border: "none",
          background: C.acV, color: "#0E0C0A", fontSize: 13,
          fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        + Nouvelle séance
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EnergyLibraryPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [tab, setTab]         = useState<FilterTab>("all");
  const [kindFilter, setKind] = useState("all");
  const [search, setSearch]   = useState("");

  const { data: sessions = [], isLoading } = useEnergySessions();

  const canVerify = !!(profile?.is_certified_coach || profile?.is_admin);

  // Client-side filtering
  const filtered = useMemo(() => {
    let list = sessions.filter((s) => s.session_kind !== "specifique");

    if (tab === "mine" && profile?.id) {
      list = list.filter((s) => s.created_by === profile.id);
    } else if (tab === "verified") {
      list = list.filter((s) => s.is_verified);
    }

    if (kindFilter !== "all") {
      list = list.filter((s) => s.session_kind === kindFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    return list;
  }, [sessions, tab, kindFilter, search, profile?.id]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>

      {/* ── Sticky header + filters ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: C.s1, borderBottom: `1px solid ${C.brd}`,
      }}>
        {/* Title row */}
        <div style={{
          padding: "14px 20px 10px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.tx, margin: 0, flex: 1 }}>
            Banque énergétique
          </h1>
          <button
            onClick={() => navigate("/coach/energy-library/new")}
            style={{
              padding: "8px 16px", borderRadius: 4, border: "none",
              background: C.acV, color: "#0E0C0A", fontSize: 13,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            + Nouvelle séance
          </button>
        </div>

        {/* Filters row */}
        <div style={{
          padding: "0 20px 10px",
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
            {FILTER_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                style={{
                  padding: "5px 12px", borderRadius: 6, border: "none",
                  background: tab === t.value ? C.ac : "transparent",
                  color: tab === t.value ? "#fff" : C.tx3,
                  fontSize: 12, fontWeight: tab === t.value ? 600 : 400,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Kind select */}
          <Select value={kindFilter} onValueChange={setKind}>
            <SelectTrigger style={{
              width: 160, background: C.s2, border: `1px solid ${C.brd}`,
              color: C.tx, fontSize: 12, height: 32,
            }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              flex: 1, minWidth: 160, maxWidth: 260,
              background: C.s2, border: `1px solid ${C.brd}`,
              borderRadius: 6, color: C.tx, fontSize: 12,
              padding: "5px 10px", fontFamily: "inherit", outline: "none",
            }}
          />

          {/* Count */}
          {!isLoading && (
            <span style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>
              {filtered.length} séance{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{
        padding: "20px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
        alignItems: "start",
      }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <EmptyState onNew={() => navigate("/coach/energy-library/new")} />
        ) : (
          filtered.map((session) => {
            const isAuthor = session.created_by === profile?.id;
            const isAdmin  = !!profile?.is_admin;
            return (
              <EnergySessionCard
                key={session.id}
                session={session}
                canEdit={isAuthor || isAdmin}
                canVerify={canVerify}
                canDelete={isAuthor || isAdmin}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
