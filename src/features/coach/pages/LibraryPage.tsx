import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Dumbbell, X, Zap, Target } from "lucide-react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExerciseBank } from "@/components/coach/ExerciseBank";
import { BlocBankView } from "@/features/coach/components/programmation/BlocBankView";
import { SessionBankView } from "@/features/coach/components/programmation/SessionBankView";
import SpecificCatalog from "@/features/coach/components/specific/SpecificCatalog";
import SpecificBlockBankView from "@/features/coach/components/specific/SpecificBlockBankView";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import EnergySessionCard from "@/features/coach/components/energy/EnergySessionCard";
import { EmptyState } from "@/features/shared/components/EmptyState";
import {
  useTrainingMethods,
  useCreateTrainingMethod,
  useUpdateTrainingMethod,
  useDeleteTrainingMethod,
  useDuplicateTrainingMethod,
} from "@/features/shared/hooks/useTrainingMethods";
import { MethodCard } from "@/features/coach/components/library/MethodCard";
import { MethodBuilder } from "@/features/coach/components/library/MethodBuilder";
import type { SessionKind } from "@/types/energy";
import type { TrainingMethod, MethodScope, MethodCategory } from "@/types/trainingMethods";
import { formValuesToConfig } from "@/features/coach/components/library/MethodPreview";

// ── Sub-tab types ─────────────────────────────────────────────────────────────

type LibTab = "musculaire" | "energetique" | "specifique";

const TAB_ICONS: Record<LibTab, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  musculaire:  Dumbbell,
  energetique: Zap,
  specifique:  Target,
};

const TABS: { key: LibTab; label: string }[] = [
  { key: "musculaire",  label: "Musculaire"  },
  { key: "energetique", label: "Énergétique" },
  { key: "specifique",  label: "Spécifique"  },
];

// ── Energy sub-tab constants ──────────────────────────────────────────────────

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
  { value: "specifique", label: "Spécifique" },
];

// ── Energy skeleton ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: 3, background: C.s2 }} />
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 13, width: "60%", background: C.s2, borderRadius: 4 }} />
        <div style={{ height: 9,  width: "30%", background: C.s2, borderRadius: 4 }} />
        <div style={{ height: 120, background: C.s2, borderRadius: 6 }} />
        <div style={{ height: 10, width: "40%", background: C.s2, borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── Energy tab ────────────────────────────────────────────────────────────────

function EnergyTab() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [kindFilter, setKind]     = useState("all");
  const [search, setSearch]       = useState("");

  const { data: sessions = [], isLoading } = useEnergySessions();
  const canVerify = !!(profile?.is_certified_coach || profile?.is_admin);

  const filtered = useMemo(() => {
    let list = sessions.filter((s) => s.session_kind !== "specifique");
    if (filterTab === "mine" && profile?.id) {
      list = list.filter((s) => s.created_by === profile.id);
    } else if (filterTab === "verified") {
      list = list.filter((s) => s.is_verified);
    }
    if (kindFilter !== "all") list = list.filter((s) => s.session_kind === (kindFilter as SessionKind));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, filterTab, kindFilter, search, profile?.id]);

  return (
    <div>
      {/* Filters row */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "14px 0 16px",
        borderBottom: `1px solid ${C.brd}`,
        marginBottom: 20,
      }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
          {FILTER_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterTab(t.value)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "none",
                background: filterTab === t.value ? C.ac : "transparent",
                color: filterTab === t.value ? "#fff" : C.tx3,
                fontSize: 12, fontWeight: filterTab === t.value ? 600 : 400,
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
            flex: 1, minWidth: 140, maxWidth: 260,
            background: C.s2, border: `1px solid ${C.brd}`,
            borderRadius: 6, color: C.tx, fontSize: 12,
            padding: "5px 10px", fontFamily: "inherit", outline: "none",
          }}
        />

        {!isLoading && (
          <span style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>
            {filtered.length} séance{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={() => navigate("/coach/energy-library/new")}
          style={{
            marginLeft: "auto", padding: "7px 14px", borderRadius: 4, border: "none",
            background: C.acV, color: "#0E0C0A", fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          + Nouvelle séance
        </button>
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
        alignItems: "start",
      }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: C.tx3 }}>
            <div style={{ marginBottom: 12 }}><Zap size={36} style={{ color: C.tx3 }} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.tx2, marginBottom: 6 }}>Aucune séance</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Créez la première séance de la banque énergétique.</div>
            <button
              onClick={() => navigate("/coach/energy-library/new")}
              style={{
                padding: "9px 20px", borderRadius: 4, border: "none",
                background: C.acV, color: "#0E0C0A", fontSize: 13,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              + Nouvelle séance
            </button>
          </div>
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
                canPublish={isAuthor || isAdmin || canVerify}
                userId={profile?.id}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Methods tab ───────────────────────────────────────────────────────────────

const SCOPE_OPTIONS: { value: "all" | MethodScope; label: string }[] = [
  { value: "all",      label: "Tous"       },
  { value: "classic",  label: "Classique"  },
  { value: "set",      label: "Sous-série" },
  { value: "exercise", label: "Exercice"   },
];


function SkeletonMethodCard() {
  return (
    <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: 3, background: C.s2 }} />
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 14, width: "55%", background: C.s2, borderRadius: 4 }} />
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ height: 16, width: 50, background: C.s2, borderRadius: 4 }} />
          <div style={{ height: 16, width: 70, background: C.s2, borderRadius: 4 }} />
        </div>
        <div style={{ height: 36, background: C.s2, borderRadius: 6 }} />
        <div style={{ height: 10, width: "30%", background: C.s2, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function MethodsTab({ coachId }: { coachId: string }) {
  const { profile } = useAuth();

  const [scopeFilter,    setScopeFilter]    = useState<"all" | MethodScope>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [officialFilter, setOfficialFilter] = useState<"all" | "official" | "custom">("all");
  const [search,         setSearch]         = useState("");
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [editing,        setEditing]        = useState<TrainingMethod | null>(null);

  const { data: methods = [], isLoading } = useTrainingMethods();
  const categoryOptions = [...new Set(methods.map((m) => m.category).filter(Boolean))].sort();
  const createMethod    = useCreateTrainingMethod();
  const updateMethod    = useUpdateTrainingMethod();
  const deleteMethod    = useDeleteTrainingMethod();
  const duplicateMethod = useDuplicateTrainingMethod();

  const filtered = useMemo(() => {
    let list = methods;
    if (scopeFilter !== "all")    list = list.filter((m) => m.scope    === scopeFilter);
    if (categoryFilter !== "all") list = list.filter((m) => m.category === categoryFilter);
    if (officialFilter === "official") list = list.filter((m) => m.is_official);
    if (officialFilter === "custom")   list = list.filter((m) => !m.is_official);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [methods, scopeFilter, categoryFilter, officialFilter, search]);

  function openCreate() { setEditing(null); setSheetOpen(true); }
  function openEdit(m: TrainingMethod) { setEditing(m); setSheetOpen(true); }

  async function handleSubmit(vals: Parameters<typeof formValuesToConfig>[0]) {
    const config = formValuesToConfig(vals);
    if (!config) return;

    const payload = {
      name:        (vals as Record<string, unknown>).name as string,
      description: (vals as Record<string, unknown>).description as string | undefined,
      scope:       (vals as Record<string, unknown>).scope as MethodScope,
      category:    (vals as Record<string, unknown>).category as MethodCategory,
      config:      config as TrainingMethod["config"],
      created_by:  coachId,
      tags:        (vals as Record<string, unknown>).tags as string[],
    };

    if (editing) {
      await updateMethod.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMethod.mutateAsync(payload);
    }
    setSheetOpen(false);
  }

  const canEditMethod = (m: TrainingMethod) =>
    m.created_by === profile?.id || !!profile?.is_admin;

  return (
    <div>
      {/* Filters row */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "14px 0 16px", borderBottom: `1px solid ${C.brd}`, marginBottom: 20,
      }}>
        {/* Scope */}
        <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
          {SCOPE_OPTIONS.map((t) => (
            <button key={t.value} onClick={() => setScopeFilter(t.value)} style={{
              padding: "5px 12px", borderRadius: 6, border: "none",
              background: scopeFilter === t.value ? C.ac : "transparent",
              color: scopeFilter === t.value ? "#fff" : C.tx3,
              fontSize: 12, fontWeight: scopeFilter === t.value ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: "5px 10px", borderRadius: 4, border: `1px solid ${C.brd}`,
            background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit",
            cursor: "pointer", outline: "none", height: 32,
          }}
        >
          <option value="all">Toutes les catégories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Official / custom */}
        <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
          {(["all", "official", "custom"] as const).map((v) => (
            <button key={v} onClick={() => setOfficialFilter(v)} style={{
              padding: "5px 12px", borderRadius: 6, border: "none",
              background: officialFilter === v ? C.ac : "transparent",
              color: officialFilter === v ? "#fff" : C.tx3,
              fontSize: 12, fontWeight: officialFilter === v ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
            }}>
              {v === "all" ? "Toutes" : v === "official" ? "Officielles" : "Custom"}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{
            flex: 1, minWidth: 140, maxWidth: 260,
            background: C.s2, border: `1px solid ${C.brd}`,
            borderRadius: 6, color: C.tx, fontSize: 12,
            padding: "5px 10px", fontFamily: "inherit", outline: "none",
          }}
        />

        {!isLoading && (
          <span style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>
            {filtered.length} méthode{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={openCreate}
          style={{
            marginLeft: "auto", padding: "7px 14px", borderRadius: 4, border: "none",
            background: C.acV, color: "#0E0C0A", fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          + Créer une méthode
        </button>
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16, alignItems: "start",
      }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonMethodCard key={i} />)
        ) : filtered.length === 0 ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <EmptyState
              icon={Dumbbell}
              title="Aucune méthode"
              description="Créez votre première méthode d'entraînement paramétrable."
              cta={{ label: "+ Créer une méthode", onClick: openCreate }}
            />
          </div>
        ) : (
          filtered.map((method) => (
            <MethodCard
              key={method.id}
              method={method}
              canEdit={canEditMethod(method)}
              currentUserId={profile?.id}
              onEdit={canEditMethod(method) ? openEdit : undefined}
              onDuplicate={() => duplicateMethod.mutate(method)}
              onDelete={canEditMethod(method) ? (m) => deleteMethod.mutate(m.id) : undefined}
            />
          ))
        )}
      </div>

      {/* Modal MethodBuilder */}
      {sheetOpen && (
        <>
          <div
            onClick={() => setSheetOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.65)" }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", zIndex: 91,
            transform: "translate(-50%, -50%)",
            background: C.bg, borderRadius: 6,
            width: "min(96vw, 820px)", maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            border: `1px solid ${C.brdL}`,
          }}>
            <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.brd}`, flexShrink: 0, display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.tx }}>
                {editing ? "Modifier la méthode" : "Nouvelle méthode"}
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                style={{ width: 30, height: 30, borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              <MethodBuilder
                key={editing?.id ?? "new"}
                initial={editing ?? undefined}
                coachId={coachId}
                onSubmit={handleSubmit as Parameters<typeof MethodBuilder>[0]["onSubmit"]}
                onCancel={() => setSheetOpen(false)}
                loading={createMethod.isPending || updateMethod.isPending}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── LibraryPage ───────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const tabParam = searchParams.get("tab") as LibTab | null;
  const activeTab: LibTab = TABS.some((t) => t.key === tabParam) ? (tabParam as LibTab) : "musculaire";
  const [muscuTab, setMuscuTab] = useState<"exercices" | "methodes" | "blocs" | "seances">("exercices");
  const [specTab, setSpecTab]   = useState<"seances" | "blocs">("seances");

  function setTab(key: LibTab) {
    setSearchParams({ tab: key }, { replace: true });
  }

  if (!user) return null;

  return (
    <div style={{ padding: "0 24px 60px" }}>

      {/* Sub-tabs */}
      <div
        style={{
          display: "flex", gap: 0,
          borderBottom: `1px solid ${C.brd}`,
          marginBottom: 0,
          paddingTop: 16,
        }}
      >
        {TABS.map(({ key, label }) => {
          const Icon = TAB_ICONS[key];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "8px 18px", border: "none", background: "transparent",
                color: activeTab === key ? C.ac : C.tx3,
                fontSize: 13, fontWeight: activeTab === key ? 700 : 400,
                cursor: "pointer", fontFamily: "inherit",
                borderBottom: "2px solid " + (activeTab === key ? C.ac : "transparent"),
                display: "flex", alignItems: "center", gap: 6,
                transition: "color 150ms",
              }}
            >
              <Icon size={15} style={{ color: activeTab === key ? C.ac : C.tx3 }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ paddingTop: 20 }}>
        {activeTab === "musculaire" && (
          <>
            {/* Sous-onglets Exercices / Méthodes / Blocs / Séances */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {[
                { k: "exercices", l: "Exercices" },
                { k: "methodes",  l: "Méthodes" },
                { k: "blocs",     l: "Blocs" },
                { k: "seances",   l: "Séances" },
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setMuscuTab(t.k as typeof muscuTab)}
                  style={{
                    padding: "6px 14px", borderRadius: 4,
                    border: "1px solid " + (muscuTab === t.k ? C.ac : C.brdL),
                    background: muscuTab === t.k ? C.acS : "transparent",
                    color: muscuTab === t.k ? C.ac : C.tx3,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >{t.l}</button>
              ))}
            </div>
            {muscuTab === "exercices" && <ExerciseBank coachId={user.id} onAddToExos={undefined} />}
            {muscuTab === "methodes"  && <MethodsTab coachId={user.id} />}
            {muscuTab === "blocs"     && <BlocBankView />}
            {muscuTab === "seances"   && <SessionBankView />}
          </>
        )}
        {activeTab === "energetique" && <EnergyTab />}
        {activeTab === "specifique"  && (
          <>
            {/* Sous-onglets Séances / Blocs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {[{ k: "seances", l: "Séances" }, { k: "blocs", l: "Blocs" }].map(t => (
                <button
                  key={t.k}
                  onClick={() => setSpecTab(t.k as "seances" | "blocs")}
                  style={{
                    padding: "6px 14px", borderRadius: 4,
                    border: "1px solid " + (specTab === t.k ? "#F5A623" : C.brdL),
                    background: specTab === t.k ? "#F5A62315" : "transparent",
                    color: specTab === t.k ? "#F5A623" : C.tx3,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >{t.l}</button>
              ))}
            </div>
            {specTab === "seances" && <SpecificCatalog />}
            {specTab === "blocs" && <SpecificBlockBankView />}
          </>
        )}
      </div>
    </div>
  );
}
