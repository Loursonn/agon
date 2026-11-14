import { useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedAthlete } from "@/features/coach/context/SelectedAthleteContext";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { countAthleteChoices, workoutKeys } from "@/api/workouts";
import { useCoachApiDrafts, useCoachApiHistory } from "@/features/coach/hooks/useCoachApiDrafts";
import { ClaudeDraftsSheet } from "@/features/coach/components/ClaudeDraftsSheet";
import { C, H } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import ClaimLinkButton from "@/features/coach/components/ClaimLinkButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// ── Navigation tabs ────────────────────────────────────────────────────────────

const ALL_TABS: { key: string; label: string; pushRight?: boolean; hyroxOnly?: boolean }[] = [
  { key: "planning",        label: "Planning"        },
  { key: "programmation",   label: "Programmation"   },
  { key: "retours",         label: "Retours"         },
  { key: "review",          label: "Review"          },
  { key: "profil-sportif",  label: "Profil athlète"  },
  { key: "hyrox",           label: "HYROX", hyroxOnly: true },
  { key: "fiches",          label: "Fiches"          },
  { key: "staff",           label: "Coachs & staff"  },
  { key: "athlete-view",    label: "Vue athlète", pushRight: true },
  { key: "donnees",         label: "Historique" },
];

const SUB_TABS: Record<string, { key: string; label: string }[]> = {
  planning: [
    { key: "month",        label: "Mois"          },
    { key: "week",         label: "Semaine"       },
    { key: "timeline",     label: "Frise"         },
    { key: "summary",      label: "Synthèse"      },
    { key: "competitions", label: "Compétitions"  },
  ],
  "profil-sportif": [
    { key: "sportif",  label: "Profil Sportif Actuel" },
    { key: "general",  label: "Profil Général"        },
    { key: "testing",  label: "Suivi Testing"         },
  ],
  programmation: [],
  hyrox: [
    { key: "bilan",    label: "Bilan"             },
    { key: "courses",  label: "Courses"           },
    { key: "stations", label: "Stations"          },
    { key: "runs",     label: "Runs"              },
    { key: "radar",    label: "Radar"             },
    { key: "tests",    label: "Tests"             },
    { key: "plan",     label: "Plan de course"    },
  ],
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function ContextBar() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { athletes, user, profile, canCoachSelf } = useAuth();
  const { selectedAthlete } = useSelectedAthlete();
  const { blockConfig, currentWeek, tw } = useAthleteContext();
  const [comboOpen, setComboOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const { data: claudeDrafts = [] } = useCoachApiDrafts(athleteId);
  const { data: claudeHistory = [] } = useCoachApiHistory(athleteId);

  // Badge modifications athlète (reschedule + bonus sets)
  const { data: modifCount = 0 } = useQuery({
    // Clé distincte de la liste des Retours : avant, compteur et tableau
    // partageaient la même clé et s'écrasaient dans le cache.
    queryKey: workoutKeys.choicesCount(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => countAthleteChoices(athleteId!),
  });

  // Filter HYROX tab based on athlete flag
  const TABS = ALL_TABS.filter(t => !t.hyroxOnly || selectedAthlete?.is_hyrox_athlete);

  // Active tab derived from URL segment
  const segments = location.pathname.split("/");
  const activeTab = ALL_TABS.find((t) => segments.includes(t.key))?.key ?? "planning";

  // Active sub-tab from ?view= param
  const searchParams = new URLSearchParams(location.search);
  const activeSubView = searchParams.get("view");
  const subTabs = SUB_TABS[activeTab] ?? [];
  const isDesktop = useIsDesktop();
  // Planning : la semaine pleine largeur est la vue par défaut à l'ordinateur (P24), le mois au téléphone.
  const defaultSubView = activeTab === "planning" && isDesktop ? "week" : subTabs[0]?.key ?? null;
  const activeSubTab = activeSubView ?? defaultSubView;

  function goTab(key: string) {
    navigate(`/coach/athletes/${athleteId}/${key}`);
  }

  function goSubTab(view: string) {
    navigate(`/coach/athletes/${athleteId}/${activeTab}?view=${view}`);
  }

  // Initials from name
  const fullName =
    selectedAthlete
      ? ([selectedAthlete.first_name, selectedAthlete.last_name].filter(Boolean).join(" ") ||
         selectedAthlete.full_name || "?")
      : "Athlète";
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Athlete list for combobox (own profile + athletes)
  const allOptions = [
    ...(canCoachSelf && profile ? [profile] : []),
    ...athletes.filter((a) => a.id !== profile?.id),
  ];

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9,
        background: C.bg,
        borderBottom: "1px solid " + C.brd,
        flexShrink: 0,
      }}
    >
      {/* Athlete info row — compact */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 24px 6px",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 36, height: 36, boxSizing: "border-box", borderRadius: "50%",
            border: "1px solid " + C.ac,
            display: "flex", alignItems: "center", justifyContent: "center",
            ...MONO, fontSize: 12, color: C.ac, flexShrink: 0,
          }}
        >
          {initials}
        </div>

        {/* Name */}
        <div
          style={{
            display: "flex", alignItems: "baseline", gap: 14,
            overflow: "hidden", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}
        >
          <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 400, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx, overflow: "hidden", textOverflow: "ellipsis" }}>
            {fullName}
          </span>
          {selectedAthlete?.id === user?.id && (
            <span style={{ ...MONO, fontSize: 11, color: C.ac }}>(moi)</span>
          )}
          {blockConfig?.blockName && (
            <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.tx3, overflow: "hidden", textOverflow: "ellipsis" }}>
              {blockConfig.blockName} · S{currentWeek} / {tw}
            </span>
          )}
        </div>

        {/* Lien de première connexion (athlète pré-créé, pas encore activé) */}
        {selectedAthlete?.is_pending && (
          <ClaimLinkButton athleteId={selectedAthlete.id} pending size={13} />
        )}

        {/* Badge modifications athlète */}
        {modifCount > 0 && (
          <button
            onClick={() => navigate(`/coach/athletes/${athleteId}/retours`)}
            title="Voir les modifications athlète"
            style={{
              ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "4px 9px", borderRadius: 999, border: "none",
              background: C.o, color: C.ink, whiteSpace: "nowrap",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {modifCount} modif{modifCount > 1 ? "s" : ""}
          </button>
        )}

        {/* Propositions de l'assistant IA du coach : en attente, ou inscrites
            récemment (à annuler si besoin). */}
        {(claudeDrafts.length > 0 || claudeHistory.length > 0) && (
          <button
            onClick={() => setDraftsOpen(true)}
            title={claudeDrafts.length > 0 ? "Propositions de Claude en attente" : "Ce que Claude a inscrit récemment"}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 30, boxSizing: "border-box", padding: "0 12px", borderRadius: 8,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx2, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            {claudeDrafts.length > 0 ? `Claude · ${claudeDrafts.length}` : "Claude"}
          </button>
        )}
        {athleteId && (
          <ClaudeDraftsSheet athleteId={athleteId} open={draftsOpen} onOpenChange={setDraftsOpen} />
        )}

        {/* Changer d'athlète — combobox */}
        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger asChild>
            <button
              style={{
                height: 30, boxSizing: "border-box", padding: "0 12px", borderRadius: 8,
                border: "1px solid " + C.brdL, background: "transparent",
                color: C.tx2, fontSize: 12, whiteSpace: "nowrap",
                cursor: "pointer", fontFamily: "inherit",
                transition: "border-color 150ms, color 150ms",
                flexShrink: 0,
              }}
            >
              Changer ›
            </button>
          </PopoverTrigger>
          <PopoverContent
            style={{
              width: 260, padding: 0,
              background: C.s1, border: "1px solid " + C.brdL,
              borderRadius: 6, overflow: "hidden",
            }}
          >
            <Command style={{ background: "transparent" }}>
              <CommandInput
                placeholder="Rechercher un athlète…"
                style={{ color: C.tx, fontSize: 12 }}
              />
              <CommandList>
                <CommandEmpty style={{ color: C.tx3, fontSize: 12, padding: "12px 16px" }}>
                  Aucun athlète trouvé.
                </CommandEmpty>
                <CommandGroup>
                  {allOptions.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.full_name}
                      onSelect={() => {
                        setComboOpen(false);
                        navigate(`/coach/athletes/${a.id}/planning`);
                      }}
                      style={{
                        cursor: "pointer",
                        background: a.id === athleteId ? "rgba(255,201,51,0.12)" : "transparent",
                        color: a.id === athleteId ? C.ac : C.tx,
                        fontSize: 12,
                        padding: "8px 12px",
                      }}
                    >
                      <span
                        style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: C.coach + "25",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: C.coach,
                          marginRight: 8, flexShrink: 0,
                        }}
                      >
                        {a.full_name.charAt(0).toUpperCase()}
                      </span>
                      {a.full_name}
                      {a.id === athleteId && (
                        <span style={{ marginLeft: "auto", color: C.ac, fontSize: 11 }}>✓</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Main tabs */}
      <div style={{ display: "flex", alignItems: "flex-end", padding: "0 10px", gap: 0, overflowX: "auto" }}>
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => goTab(tab.key)}
              style={{
                height: 42,
                padding: "0 14px",
                border: "none",
                marginLeft: tab.pushRight ? "auto" : undefined,
                boxShadow: active ? `inset 0 -2px 0 ${C.ac}` : "none",
                background: "transparent",
                color: active ? C.tx : C.tx3,
                fontSize: 13,
                fontWeight: 400,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                transition: "color 150ms, border-color 150ms",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.color = H.grisArgent;
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.color = C.tx3;
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs (Saison/Frise/Mois/Synthèse ou Bloc/Semaine/Jour) */}
      {subTabs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", padding: "10px 24px", borderTop: "1px solid " + C.brd, overflowX: "auto" }}>
          <div style={{ display: "flex", padding: 3, gap: 2, border: "1px solid " + C.brd, borderRadius: 10 }}>
          {subTabs.map((sub) => {
            const active = sub.key === activeSubTab;
            return (
              <button
                key={sub.key}
                onClick={() => goSubTab(sub.key)}
                style={{
                  height: 26,
                  padding: "0 12px",
                  border: "none",
                  borderRadius: 7,
                  background: active ? C.s2 : "transparent",
                  color: active ? C.tx : C.tx3,
                  fontSize: 12,
                  fontWeight: 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  transition: "color 150ms, border-color 150ms",
                }}
              >
                {sub.label}
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
