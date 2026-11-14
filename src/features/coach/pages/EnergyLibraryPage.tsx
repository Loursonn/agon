/**
 * EnergyLibraryPage — banque partagée de séances énergétiques.
 * Route : /coach/energy-library
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
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

const PRIMARY_BTN = "cursor-pointer whitespace-nowrap rounded bg-agon-or-vif text-[13px] font-semibold text-agon-ink";
const BAR = "rounded bg-agon-s2";

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      <div className="h-[3px] bg-agon-s2" />
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <div className={cn(BAR, "h-[13px] w-[60%]")} />
        <div className={cn(BAR, "h-[9px] w-[30%]")} />
        <div className="h-[120px] rounded-[6px] bg-agon-s2" />
        <div className={cn(BAR, "h-2.5 w-[40%]")} />
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="col-span-full px-5 py-[60px] text-center text-agon-tx3">
      <div className="mb-3"><Zap size={40} className="text-agon-tx3" /></div>
      <div className="mb-1.5 text-[15px] font-semibold text-agon-tx2">Aucune séance</div>
      <div className="mb-5 text-[13px]">Créez la première séance de la banque énergétique.</div>
      <button
        onClick={onNew}
        className={cn(PRIMARY_BTN, "whitespace-normal px-5 py-[9px]")}
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
    <div className="min-h-screen bg-agon-bg">

      {/* ── Sticky header + filters ── */}
      <div className="sticky top-0 z-20 border-b border-agon-brd bg-agon-s1">
        {/* Title row */}
        <div className="flex flex-wrap items-center gap-3 px-5 pb-2.5 pt-3.5">
          <h1 className="m-0 flex-1 text-[18px] font-extrabold text-agon-tx">
            Banque énergétique
          </h1>
          <button
            onClick={() => navigate("/coach/energy-library/new?import=texte")}
            title="Coller une séance écrite au format YOXX"
            className="cursor-pointer whitespace-nowrap rounded border border-agon-accent/25 bg-agon-accent/[0.071] px-4 py-2 text-[13px] font-semibold text-agon-accent"
          >
            Importer un texte
          </button>
          <button
            onClick={() => navigate("/coach/energy-library/new")}
            className={cn(PRIMARY_BTN, "px-4 py-2")}
          >
            + Nouvelle séance
          </button>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 pb-2.5">
          {/* Tabs */}
          <div className="flex gap-0.5 rounded bg-agon-s2 p-0.5">
            {FILTER_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "cursor-pointer rounded-[6px] px-3 py-[5px] text-[12px] [transition:all_120ms]",
                  tab === t.value ? "bg-agon-accent font-semibold text-agon-tx" : "bg-transparent font-normal text-agon-tx3",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Kind select */}
          <Select value={kindFilter} onValueChange={setKind}>
            <SelectTrigger className="h-8 w-[160px] border-agon-brd bg-agon-s2 text-[12px] leading-5 text-agon-tx">
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
            className="min-w-[160px] max-w-[260px] flex-1 rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-[5px] text-[12px] text-agon-tx outline-none"
          />

          {/* Count */}
          {!isLoading && (
            <span className="whitespace-nowrap text-[11px] text-agon-tx3">
              {filtered.length} séance{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-4 p-5">
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
