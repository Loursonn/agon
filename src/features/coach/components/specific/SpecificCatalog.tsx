/**
 * SpecificCatalog — catalogue des séances spécifiques trié Sport → Qualité.
 * Rail sports à gauche (compteurs), zone principale groupée par qualité physique,
 * puces de qualités pour filtrer, filtres Toutes / Mes séances / Vérifiées.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { useSpecificSports, usePhysicalQualities } from "@/features/shared/hooks/useSpecificTaxonomy";
import SpecificSessionCard from "./SpecificSessionCard";
import type { EnergySessionRow } from "@/types/energy";

/** Couleur par défaut d'un sport sans couleur (donnée : reste en style). */
const SPORT_FALLBACK = C.o;

type FilterTab = "all" | "mine" | "verified";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all",      label: "Toutes" },
  { value: "mine",     label: "Mes séances" },
  { value: "verified", label: "Vérifiées" },
];

/** Puce de qualité active, par teinte (classes écrites en entier pour Tailwind). */
const CHIP_ON = {
  alerte: "border-agon-alerte bg-agon-alerte/[0.094] text-agon-alerte",
  accent: "border-agon-accent bg-agon-accent/[0.094] text-agon-accent",
  tx2:    "border-agon-tx2 bg-agon-tx2/[0.094] text-agon-tx2",
} as const;

function chip(active: boolean, tone: keyof typeof CHIP_ON) {
  return cn(
    "cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold [transition:all_150ms]",
    active ? CHIP_ON[tone] : "border-agon-brd-l bg-transparent text-agon-tx3",
  );
}

const RAIL_BTN = "flex cursor-pointer items-center gap-2 rounded px-2.5 py-[7px] text-left text-[12px] [transition:all_150ms]";
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4";
const PRIMARY = "cursor-pointer rounded bg-agon-alerte font-semibold text-agon-ink";

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      <div className="h-[3px] bg-agon-s2" />
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <div className="h-[13px] w-[60%] rounded bg-agon-s2" />
        <div className="h-[9px] w-[30%] rounded bg-agon-s2" />
        <div className="h-20 rounded-[6px] bg-agon-s2" />
      </div>
    </div>
  );
}

export default function SpecificCatalog() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [filterTab, setFilterTab]       = useState<FilterTab>("all");
  const [search, setSearch]             = useState("");
  const [selectedSport, setSelectedSport]     = useState<string | "all">("all");
  const [selectedQuality, setSelectedQuality] = useState<string | "all">("all");

  const { data: sessions = [], isLoading }  = useEnergySessions();
  const { data: sports = [] }    = useSpecificSports();
  const { data: qualities = [] } = usePhysicalQualities();

  const canVerify = !!(profile?.is_certified_coach || profile?.is_admin);

  const sportById   = useMemo(() => new Map(sports.map((s) => [s.id, s])), [sports]);
  const qualityById = useMemo(() => new Map(qualities.map((q) => [q.id, q])), [qualities]);

  // Base : séances spécifiques de la banque (pas les copies athlète)
  const specificSessions = useMemo(
    () => sessions.filter((s) => s.session_kind === "specifique" && !s.athlete_id),
    [sessions]
  );

  // Filtres scope + recherche (avant sport/qualité, pour les compteurs du rail)
  const scoped = useMemo(() => {
    let list = specificSessions;
    if (filterTab === "mine" && profile?.id) list = list.filter((s) => s.created_by === profile.id);
    else if (filterTab === "verified")       list = list.filter((s) => s.is_verified);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [specificSessions, filterTab, search, profile?.id]);

  // Compteurs par sport
  const countBySport = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scoped) {
      const key = s.sport_id ?? "__none__";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [scoped]);

  // Sessions du sport sélectionné
  const sportFiltered = useMemo(() => {
    if (selectedSport === "all") return scoped;
    if (selectedSport === "__none__") return scoped.filter((s) => !s.sport_id);
    return scoped.filter((s) => s.sport_id === selectedSport);
  }, [scoped, selectedSport]);

  // Qualités présentes dans le sport sélectionné (pour les puces)
  const qualitiesInSport = useMemo(() => {
    const ids = new Set(sportFiltered.map((s) => s.quality_id ?? "__none__"));
    return qualities.filter((q) => ids.has(q.id));
  }, [sportFiltered, qualities]);

  const hasUnclassified = useMemo(
    () => sportFiltered.some((s) => !s.quality_id),
    [sportFiltered]
  );

  // Filtre qualité (puces)
  const visible = useMemo(() => {
    if (selectedQuality === "all") return sportFiltered;
    if (selectedQuality === "__none__") return sportFiltered.filter((s) => !s.quality_id);
    return sportFiltered.filter((s) => s.quality_id === selectedQuality);
  }, [sportFiltered, selectedQuality]);

  // Groupement par qualité
  const groups = useMemo(() => {
    const m = new Map<string, EnergySessionRow[]>();
    for (const s of visible) {
      const key = s.quality_id ?? "__none__";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    // Ordre : qualités connues (ordre référentiel), puis non classées
    const ordered: { key: string; label: string; items: EnergySessionRow[] }[] = [];
    for (const q of qualities) {
      if (m.has(q.id)) ordered.push({ key: q.id, label: q.name, items: m.get(q.id)! });
    }
    if (m.has("__none__")) ordered.push({ key: "__none__", label: "Non classées", items: m.get("__none__")! });
    return ordered;
  }, [visible, qualities]);

  function selectSport(id: string | "all") {
    setSelectedSport(id);
    setSelectedQuality("all");
  }

  return (
    <div>
      {/* ── Header : filtres + recherche + CTA ── */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-agon-brd pb-4 pt-3.5">
        <div className="flex gap-0.5 rounded bg-agon-s2 p-0.5">
          {FILTER_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterTab(t.value)}
              className={cn(
                "cursor-pointer rounded-[6px] px-3 py-[5px] text-[12px] [transition:all_120ms]",
                filterTab === t.value ? "bg-agon-alerte font-semibold text-agon-ink" : "bg-transparent font-normal text-agon-tx3",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="min-w-[140px] max-w-[260px] flex-1 rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-[5px] text-[12px] text-agon-tx outline-none"
        />

        {!isLoading && (
          <span className="whitespace-nowrap text-[11px] text-agon-tx3">
            {visible.length} séance{visible.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={() => navigate("/coach/energy-library/new?kind=specifique&import=texte")}
          title="Coller une séance écrite au format YOXX"
          className="ml-auto cursor-pointer whitespace-nowrap rounded border border-agon-alerte/25 bg-agon-alerte/[0.071] px-3.5 py-[7px] text-[12px] font-semibold text-agon-alerte"
        >
          Importer un texte
        </button>
        <button
          onClick={() => navigate("/coach/energy-library/new?kind=specifique")}
          className={cn(PRIMARY, "whitespace-nowrap px-3.5 py-[7px] text-[12px]")}
        >
          + Nouvelle séance
        </button>
      </div>

      {/* ── Layout : rail sports + contenu ── */}
      <div className="flex items-stretch gap-0">

        {/* Rail sports */}
        <div className="flex w-[190px] shrink-0 flex-col gap-0.5 border-r border-agon-brd py-4 pl-0 pr-3">
          <button
            onClick={() => selectSport("all")}
            className={cn(RAIL_BTN, selectedSport === "all" ? "bg-agon-alerte/[0.094] font-bold text-agon-alerte" : "bg-transparent font-medium text-agon-tx2")}
          >
            <span className="flex-1">Tous les sports</span>
            <span className="text-[10px] text-agon-tx3">{scoped.length}</span>
          </button>

          {sports.map((sport) => {
            const count = countBySport.get(sport.id) ?? 0;
            const active = selectedSport === sport.id;
            // Couleur du sport = donnée : reste en style.
            const color = sport.color || SPORT_FALLBACK;
            return (
              <button
                key={sport.id}
                onClick={() => selectSport(sport.id)}
                className={cn(RAIL_BTN, active ? "font-bold" : cn("bg-transparent font-medium", count > 0 ? "text-agon-tx2" : "text-agon-tx3"))}
                style={active ? { background: color + "18", color } : undefined}
              >
                <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", count > 0 || active ? "opacity-100" : "opacity-[0.35]")} style={{ background: color }} />
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{sport.name}</span>
                {count > 0 && <span className={cn("text-[10px]", !active && "text-agon-tx3")} style={active ? { color } : undefined}>{count}</span>}
              </button>
            );
          })}

          {(countBySport.get("__none__") ?? 0) > 0 && (
            <button
              onClick={() => selectSport("__none__")}
              className={cn(RAIL_BTN, selectedSport === "__none__" ? "bg-agon-s2 font-bold text-agon-tx" : "bg-transparent font-medium text-agon-tx3")}
            >
              <span className="flex-1">Sans sport</span>
              <span className="text-[10px] text-agon-tx3">{countBySport.get("__none__")}</span>
            </button>
          )}
        </div>

        {/* Contenu principal */}
        <div className="min-w-0 flex-1 pl-5 pt-4">

          {/* Puces qualités */}
          {(qualitiesInSport.length > 0 || hasUnclassified) && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedQuality("all")} className={chip(selectedQuality === "all", "alerte")}>
                Toutes
              </button>
              {qualitiesInSport.map((q) => (
                <button key={q.id} onClick={() => setSelectedQuality(q.id)} className={chip(selectedQuality === q.id, "accent")}>
                  {q.name}
                </button>
              ))}
              {hasUnclassified && (
                <button onClick={() => setSelectedQuality("__none__")} className={chip(selectedQuality === "__none__", "tx2")}>
                  Non classées
                </button>
              )}
            </div>
          )}

          {isLoading ? (
            <div className={GRID}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-[60px] text-center text-agon-tx3">
              <div className="mb-3 text-[36px]"></div>
              <div className="mb-1.5 text-[15px] font-semibold text-agon-tx2">
                {specificSessions.length === 0 ? "Aucune séance spécifique" : "Aucune séance ici"}
              </div>
              <div className="mb-5 text-[13px]">
                {specificSessions.length === 0
                  ? "Créez la première séance spécifique (WOD ou Classique)."
                  : "Aucune séance pour ce sport / cette qualité avec ces filtres."}
              </div>
              <button
                onClick={() => navigate("/coach/energy-library/new?kind=specifique")}
                className={cn(PRIMARY, "px-5 py-[9px] text-[13px]")}
              >
                + Nouvelle séance
              </button>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="mb-7">
                <div className="mb-2.5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-agon-tx3">
                  {group.label}
                  <span className="font-semibold text-agon-tx3 opacity-70">{group.items.length}</span>
                  <span className="h-px flex-1 bg-agon-brd" />
                </div>
                <div className={cn(GRID, "items-start")}>
                  {group.items.map((session) => {
                    const isAuthor = session.created_by === profile?.id;
                    const isAdmin  = !!profile?.is_admin;
                    return (
                      <SpecificSessionCard
                        key={session.id}
                        session={session}
                        sport={session.sport_id ? sportById.get(session.sport_id) : undefined}
                        quality={session.quality_id ? qualityById.get(session.quality_id) : undefined}
                        canEdit={isAuthor || isAdmin}
                        canVerify={canVerify}
                        canDelete={isAuthor || isAdmin}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
