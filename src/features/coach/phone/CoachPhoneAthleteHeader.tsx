import { useMemo } from "react";
import { NavLink, useNavigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import { C } from "@/lib/theme";
import { ROUGE } from "@/lib/peps";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCycles, useCycleWeeks } from "@/features/coach/components/programmation/hooks/useProgramCycles";
import { useUpcomingCompetition } from "@/features/shared/hooks/useUpcomingCompetition";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";
import { localIsoDay } from "@shared/domain/dates";
import type { CycleLite, CycleWeek } from "@/api/program";
import { Avatar, Chevron, DISPLAY, Dot, MONO, Tag, lightColor, shortDate } from "./phoneUi";

export const PHONE_ATHLETE_TABS = [
  { to: "planning", label: "Planning" },
  { to: "programmation", label: "Programmation" },
  { to: "retours", label: "Retours" },
  { to: "wellness", label: "Wellness" },
  { to: "sante", label: "Santé" },
  { to: "tests", label: "Tests" },
  { to: "profil-sportif", label: "Profil" },
] as const;

/** Cycle qui couvre `day` (sinon le plus récent) et rang de la semaine (1…n, null hors cycle). */
export function useCurrentCycle(athleteId: string | undefined, day: string = localIsoDay()) {
  const { data: cycles = [], isLoading } = useAthleteCycles(athleteId);
  const cycle: CycleLite | null = useMemo(
    () => cycles.find((c) => c.start_date <= day && day <= c.end_date) ?? (cycles.length ? cycles[cycles.length - 1] : null),
    [cycles, day],
  );
  const { data: weeks = [] } = useCycleWeeks(cycle?.id);
  const weekIndex = useMemo(() => {
    const i = weeks.findIndex((w: CycleWeek) => w.start_date <= day && day <= w.end_date);
    return i >= 0 ? i + 1 : null;
  }, [weeks, day]);
  return { cycles, cycle, weeks, weekIndex, isLoading };
}

/**
 * En-tête d'une fiche athlète sur téléphone (planches CoachPhonePlanning,
 * Retours, Wellness…) : retour, date, nom, cycle « S1 / 5 », J-x de la
 * prochaine compétition, feu du matin, onglets défilants.
 */
export default function CoachPhoneAthleteHeader() {
  const navigate = useNavigate();
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { athleteProfile } = useAthleteContext();
  const name = athleteProfile?.full_name ?? "Athlète";
  const { cycle, weeks, weekIndex } = useCurrentCycle(athleteId);
  const { data: compet } = useUpcomingCompetition(athleteId);
  const light = useWellnessLight(athleteId);
  const feu = lightColor(light.data?.light);

  // « Modifier une séance » a son propre en-tête (plein écran).
  const { pathname } = useLocation();
  const [search] = useSearchParams();
  if (pathname.endsWith("/programmation") && search.has("edit")) return null;

  const cycleLine = cycle
    ? `${cycle.name}${weekIndex ? ` · S${weekIndex} / ${weeks.length}` : ""}`
    : null;

  return (
    <header style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap: 14, borderBottom: `1px solid ${C.brd}`, background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28 }}>
        <button type="button" aria-label="Retour aux athlètes" onClick={() => navigate("/coach/athletes")} style={{ background: "none", border: "none", padding: 4, margin: -4, cursor: "pointer", display: "flex" }}>
          <Chevron dir="left" color={C.tx2} size={20} />
        </button>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{shortDate(localIsoDay())}</span>
        <button type="button" aria-label="Fiches et staff de l’athlète" onClick={() => navigate(`/coach/athletes/${athleteId}/fiches`)} style={{ background: "none", border: "none", padding: 4, margin: -4, cursor: "pointer", display: "flex" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.tx2} strokeWidth="1.5" strokeLinecap="square"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar name={name} size={46} gold />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...DISPLAY, fontSize: 20, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, whiteSpace: "nowrap", minWidth: 0 }}>
            {cycleLine && <span style={{ ...MONO, fontSize: 11, color: C.tx2, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis" }}>{cycleLine}</span>}
            {compet && (
              <Tag color={compet.priority === "A" ? ROUGE : C.o} filled>{compet.daysUntil === 0 ? "Jour J" : `J-${compet.daysUntil}`}</Tag>
            )}
          </div>
        </div>
        <span title={light.data ? light.data.sentence : "Feu du matin : pas de donnée"} style={{ display: "flex" }}>
          <Dot color={feu} size={12} />
        </span>
      </div>
      <nav aria-label="Onglets de l’athlète" style={{ display: "flex", fontSize: 13.5, overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px" }}>
        {PHONE_ATHLETE_TABS.map((t) => (
          <NavLink
            key={t.to}
            to={`/coach/athletes/${athleteId}/${t.to}`}
            style={({ isActive }) => ({
              padding: "9px 0", marginRight: 18, whiteSpace: "nowrap", textDecoration: "none", flex: "none",
              color: isActive ? C.tx : C.tx3, borderBottom: `2px solid ${isActive ? C.ac : "transparent"}`,
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
