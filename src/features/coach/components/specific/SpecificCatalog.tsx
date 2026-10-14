/**
 * SpecificCatalog — catalogue des séances spécifiques trié Sport → Qualité.
 * Rail sports à gauche (compteurs), zone principale groupée par qualité physique,
 * puces de qualités pour filtrer, filtres Toutes / Mes séances / Vérifiées.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { useSpecificSports, usePhysicalQualities } from "@/features/shared/hooks/useSpecificTaxonomy";
import SpecificSessionCard from "./SpecificSessionCard";
import type { EnergySessionRow } from "@/types/energy";

const ORANGE = "#F5A623";

type FilterTab = "all" | "mine" | "verified";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all",      label: "Toutes" },
  { value: "mine",     label: "Mes séances" },
  { value: "verified", label: "Vérifiées" },
];

function SkeletonCard() {
  return (
    <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: 3, background: C.s2 }} />
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 13, width: "60%", background: C.s2, borderRadius: 4 }} />
        <div style={{ height: 9,  width: "30%", background: C.s2, borderRadius: 4 }} />
        <div style={{ height: 80, background: C.s2, borderRadius: 6 }} />
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

  const chip = (active: boolean, color: string) => ({
    padding: "4px 10px", borderRadius: 999,
    border: `1px solid ${active ? color : C.brdL}`,
    background: active ? color + "18" : "transparent",
    color: active ? color : C.tx3,
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", transition: "all 150ms", whiteSpace: "nowrap" as const,
  });

  return (
    <div>
      {/* ── Header : filtres + recherche + CTA ── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "14px 0 16px", borderBottom: `1px solid ${C.brd}`, marginBottom: 0,
      }}>
        <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
          {FILTER_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterTab(t.value)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "none",
                background: filterTab === t.value ? ORANGE : "transparent",
                color: filterTab === t.value ? "#1a1204" : C.tx3,
                fontSize: 12, fontWeight: filterTab === t.value ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

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
            {visible.length} séance{visible.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={() => navigate("/coach/energy-library/new?kind=specifique")}
          style={{
            marginLeft: "auto", padding: "7px 14px", borderRadius: 4, border: "none",
            background: ORANGE, color: "#1a1204", fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          + Nouvelle séance
        </button>
      </div>

      {/* ── Layout : rail sports + contenu ── */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>

        {/* Rail sports */}
        <div style={{
          width: 190, flexShrink: 0,
          borderRight: `1px solid ${C.brd}`,
          padding: "16px 12px 16px 0",
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          <button
            onClick={() => selectSport("all")}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 10px", borderRadius: 4, border: "none",
              background: selectedSport === "all" ? ORANGE + "18" : "transparent",
              color: selectedSport === "all" ? ORANGE : C.tx2,
              fontSize: 12, fontWeight: selectedSport === "all" ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 150ms",
            }}
          >
            <span style={{ flex: 1 }}>Tous les sports</span>
            <span style={{ fontSize: 10, color: C.tx3 }}>{scoped.length}</span>
          </button>

          {sports.map((sport) => {
            const count = countBySport.get(sport.id) ?? 0;
            const active = selectedSport === sport.id;
            const color = sport.color || ORANGE;
            return (
              <button
                key={sport.id}
                onClick={() => selectSport(sport.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 4, border: "none",
                  background: active ? color + "18" : "transparent",
                  color: active ? color : count > 0 ? C.tx2 : C.tx3,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 150ms",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0, opacity: count > 0 || active ? 1 : 0.35 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sport.name}</span>
                {count > 0 && <span style={{ fontSize: 10, color: active ? color : C.tx3 }}>{count}</span>}
              </button>
            );
          })}

          {(countBySport.get("__none__") ?? 0) > 0 && (
            <button
              onClick={() => selectSport("__none__")}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 4, border: "none",
                background: selectedSport === "__none__" ? C.s2 : "transparent",
                color: selectedSport === "__none__" ? C.tx : C.tx3,
                fontSize: 12, fontWeight: selectedSport === "__none__" ? 700 : 500,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 150ms",
              }}
            >
              <span style={{ flex: 1 }}>Sans sport</span>
              <span style={{ fontSize: 10, color: C.tx3 }}>{countBySport.get("__none__")}</span>
            </button>
          )}
        </div>

        {/* Contenu principal */}
        <div style={{ flex: 1, minWidth: 0, padding: "16px 0 0 20px" }}>

          {/* Puces qualités */}
          {(qualitiesInSport.length > 0 || hasUnclassified) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <button onClick={() => setSelectedQuality("all")} style={chip(selectedQuality === "all", ORANGE)}>
                Toutes
              </button>
              {qualitiesInSport.map((q) => (
                <button key={q.id} onClick={() => setSelectedQuality(q.id)} style={chip(selectedQuality === q.id, "#FFC933")}>
                  {q.name}
                </button>
              ))}
              {hasUnclassified && (
                <button onClick={() => setSelectedQuality("__none__")} style={chip(selectedQuality === "__none__", C.tx2)}>
                  Non classées
                </button>
              )}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.tx3 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.tx2, marginBottom: 6 }}>
                {specificSessions.length === 0 ? "Aucune séance spécifique" : "Aucune séance ici"}
              </div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>
                {specificSessions.length === 0
                  ? "Créez la première séance spécifique (WOD ou Classique)."
                  : "Aucune séance pour ce sport / cette qualité avec ces filtres."}
              </div>
              <button
                onClick={() => navigate("/coach/energy-library/new?kind=specifique")}
                style={{
                  padding: "9px 20px", borderRadius: 4, border: "none",
                  background: ORANGE, color: "#1a1204", fontSize: 13,
                  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                + Nouvelle séance
              </button>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} style={{ marginBottom: 28 }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, color: C.tx3,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
                }}>
                  {group.label}
                  <span style={{ fontWeight: 600, color: C.tx3, opacity: 0.7 }}>{group.items.length}</span>
                  <span style={{ flex: 1, height: 1, background: C.brd }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
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
