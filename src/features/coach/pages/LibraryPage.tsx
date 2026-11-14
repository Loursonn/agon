import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Dumbbell, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { formValuesToConfig } from "@/features/coach/components/library/methodConfigConvert";

// ── Sub-tab types ─────────────────────────────────────────────────────────────

type LibTab = "musculaire" | "energetique" | "specifique";


const TABS: { key: LibTab; label: string; swatch: string }[] = [
  { key: "musculaire",  label: "Musculaire",  swatch: "bg-agon-accent" },
  { key: "energetique", label: "Énergétique", swatch: "bg-agon-info" },
  { key: "specifique",  label: "Spécifique",  swatch: "bg-agon-alerte" },
];

// ── Classes partagées ─────────────────────────────────────────────────────────

const FILTERS_ROW = "mb-5 flex flex-wrap items-center gap-2.5 border-b border-agon-brd pb-4 pt-3.5";
const SEGMENTS = "flex gap-0.5 rounded bg-agon-s2 p-0.5";
const SEARCH = "min-w-[140px] max-w-[260px] flex-1 rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-[5px] text-[12px] text-agon-tx outline-none";
const COUNT = "whitespace-nowrap text-[11px] text-agon-tx3";
const PRIMARY_BTN = "cursor-pointer whitespace-nowrap rounded bg-agon-or-vif px-3.5 py-[7px] text-[12px] font-semibold text-agon-ink";
const SKELETON_CARD = "overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1";
const BAR = "rounded bg-agon-s2";

/** Segment d'un filtre ; `onText` = couleur du texte actif. */
function segment(on: boolean, onText: string) {
  return cn(
    "cursor-pointer rounded-[6px] px-3 py-[5px] text-[12px] [transition:all_120ms]",
    on ? cn("bg-agon-accent font-semibold", onText) : "bg-transparent font-normal text-agon-tx3",
  );
}

/** Pastille de sous-onglet (Exercices / Méthodes…). */
function pill(on: boolean) {
  return cn(
    "box-border h-8 cursor-pointer rounded-full border px-3.5 text-[12px]",
    on ? "border-agon-accent bg-agon-accent/[0.14] font-medium text-agon-accent"
      : "border-agon-brd-l bg-transparent font-normal text-agon-tx2",
  );
}

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
    <div className={SKELETON_CARD}>
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
      <div className={FILTERS_ROW}>
        {/* Filter tabs */}
        <div className={SEGMENTS}>
          {FILTER_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterTab(t.value)}
              className={segment(filterTab === t.value, "text-agon-ink")}
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
          className={SEARCH}
        />

        {!isLoading && (
          <span className={COUNT}>
            {filtered.length} séance{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={() => navigate("/coach/energy-library/new?import=texte")}
          title="Coller une séance écrite au format YOXX"
          className="ml-auto cursor-pointer whitespace-nowrap rounded border border-agon-accent/25 bg-agon-accent/[0.071] px-3.5 py-[7px] text-[12px] font-semibold text-agon-accent"
        >
          Importer un texte
        </button>
        <button
          onClick={() => navigate("/coach/energy-library/new")}
          className={PRIMARY_BTN}
        >
          + Nouvelle séance
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full px-5 py-[60px] text-center text-agon-tx3">
            <div className="mb-3"><Zap size={36} className="text-agon-tx3" /></div>
            <div className="mb-1.5 text-[15px] font-semibold text-agon-tx2">Aucune séance</div>
            <div className="mb-5 text-[13px]">Créez la première séance de la banque énergétique.</div>
            <button
              onClick={() => navigate("/coach/energy-library/new")}
              className="cursor-pointer rounded bg-agon-or-vif px-5 py-[9px] text-[13px] font-semibold text-agon-ink"
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
    <div className={SKELETON_CARD}>
      <div className="h-[3px] bg-agon-s2" />
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        <div className={cn(BAR, "h-3.5 w-[55%]")} />
        <div className="flex gap-1.5">
          <div className={cn(BAR, "h-4 w-[50px]")} />
          <div className={cn(BAR, "h-4 w-[70px]")} />
        </div>
        <div className="h-9 rounded-[6px] bg-agon-s2" />
        <div className={cn(BAR, "h-2.5 w-[30%]")} />
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
      <div className={FILTERS_ROW}>
        {/* Scope */}
        <div className={SEGMENTS}>
          {SCOPE_OPTIONS.map((t) => (
            <button key={t.value} onClick={() => setScopeFilter(t.value)} className={segment(scopeFilter === t.value, "text-agon-tx")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-8 cursor-pointer rounded border border-agon-brd bg-agon-s2 px-2.5 py-[5px] text-[12px] text-agon-tx outline-none"
        >
          <option value="all">Toutes les catégories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Official / custom */}
        <div className={SEGMENTS}>
          {(["all", "official", "custom"] as const).map((v) => (
            <button key={v} onClick={() => setOfficialFilter(v)} className={segment(officialFilter === v, "text-agon-tx")}>
              {v === "all" ? "Toutes" : v === "official" ? "Officielles" : "Custom"}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className={SEARCH}
        />

        {!isLoading && (
          <span className={COUNT}>
            {filtered.length} méthode{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        <button onClick={openCreate} className={cn(PRIMARY_BTN, "ml-auto")}>
          + Créer une méthode
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonMethodCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full">
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
            className="fixed inset-0 z-[90] bg-black/65"
          />
          <div className="fixed left-1/2 top-1/2 z-[91] flex max-h-[90vh] w-[min(96vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[6px] border border-agon-brd-l bg-agon-bg">
            <div className="flex shrink-0 items-center border-b border-agon-brd px-5 pb-3.5 pt-4">
              <div className="flex-1 text-[15px] font-extrabold text-agon-tx">
                {editing ? "Modifier la méthode" : "Nouvelle méthode"}
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded border border-agon-brd-l bg-transparent text-agon-tx3"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
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
    <div className="px-6 pb-[60px]">

      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-agon-brd pt-4">
        {TABS.map(({ key, label, swatch }) => {
          const on = activeTab === key;
          // Planche CoachBanque : carré de couleur par type, soulignement or.
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap bg-transparent px-4 text-[13px]",
                on ? "font-medium text-agon-accent shadow-[inset_0_-2px_0_var(--agon-accent)]" : "font-normal text-agon-tx2",
              )}
            >
              <span aria-hidden className={cn("h-[9px] w-[9px] flex-none rounded-[2px]", swatch)} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="pt-5">
        {activeTab === "musculaire" && (
          <>
            {/* Sous-onglets Exercices / Méthodes / Blocs / Séances */}
            <div className="mb-4 flex gap-1.5">
              {[
                { k: "exercices", l: "Exercices" },
                { k: "methodes",  l: "Méthodes" },
                { k: "blocs",     l: "Blocs" },
                { k: "seances",   l: "Séances" },
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setMuscuTab(t.k as typeof muscuTab)}
                  className={pill(muscuTab === t.k)}
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
            <div className="mb-4 flex gap-1.5">
              {[{ k: "seances", l: "Séances" }, { k: "blocs", l: "Blocs" }].map(t => (
                <button
                  key={t.k}
                  onClick={() => setSpecTab(t.k as "seances" | "blocs")}
                  className={pill(specTab === t.k)}
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
