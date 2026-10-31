import { useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedAthlete } from "@/features/coach/context/SelectedAthleteContext";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { C } from "@/lib/theme";
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
  { key: "profil-sportif",  label: "Profil athlète"  },
  { key: "hyrox",           label: "HYROX", hyroxOnly: true },
  { key: "fiches",          label: "Fiches"          },
  { key: "athlete-view",    label: "Vue athlète", pushRight: true },
  { key: "donnees",         label: "Historique" },
];

const SUB_TABS: Record<string, { key: string; label: string }[]> = {
  planning: [
    { key: "month",        label: "Mois"          },
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
    { key: "runs",     label: "Runs et Roxzone"   },
    { key: "radar",    label: "Radar"             },
    { key: "tests",    label: "Tests HYROX"       },
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

  // Badge modifications athlète (reschedule + bonus sets)
  const { data: modifCount = 0 } = useQuery({
    queryKey: QK.athleteModifications(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("athlete_id", athleteId!)
        .or("rescheduled_by_athlete.eq.true,athlete_modifications.not.is.null");
      return count ?? 0;
    },
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
  const defaultSubView = subTabs[0]?.key ?? null;
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
        background: "rgba(29,28,30,0.9)",
        borderBottom: "1px solid " + C.brd,
        flexShrink: 0,
      }}
    >
      {/* Athlete info row — compact */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px",
          borderBottom: "1px solid " + C.brd,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 24, height: 24, borderRadius: "50%",
            background: C.coach + "25", border: "1px solid " + C.coach + "40",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: C.coach, flexShrink: 0,
          }}
        >
          {initials}
        </div>

        {/* Name */}
        <div
          style={{
            fontSize: 12, fontWeight: 700, color: C.tx,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}
        >
          {fullName}
          {selectedAthlete?.id === user?.id && (
            <span style={{ fontSize: 9, color: C.ac, marginLeft: 5, fontWeight: 500 }}>(moi)</span>
          )}
          {blockConfig?.blockName && (
            <span style={{ fontSize: 10, color: C.tx3, marginLeft: 8, fontWeight: 400 }}>
              {blockConfig.blockName} · S{currentWeek}/{tw}
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
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 6,
              border: "1px solid rgba(245,158,11,0.4)",
              background: "rgba(245,158,11,0.12)",
              color: "#F59E0B", fontSize: 10, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            {modifCount}
          </button>
        )}

        {/* Changer d'athlète — combobox */}
        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger asChild>
            <button
              style={{
                padding: "5px 12px", borderRadius: 4,
                border: "1px solid " + C.brdL, background: "transparent",
                color: C.tx2, fontSize: 11, fontWeight: 500,
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
      <div style={{ display: "flex", padding: "0 20px", gap: 0, overflowX: "auto" }}>
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => goTab(tab.key)}
              style={{
                padding: "10px 14px",
                border: "none",
                marginLeft: tab.pushRight ? "auto" : undefined,
                borderBottom: "2px solid " + (active ? C.coach : "transparent"),
                background: "transparent",
                color: active ? C.tx : C.tx3,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                transition: "color 150ms, border-color 150ms",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "#e0e0e0";
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
        <div
          style={{
            display: "flex",
            padding: "0 20px",
            gap: 4,
            overflowX: "auto",
            borderTop: "1px solid " + C.brd,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {subTabs.map((sub) => {
            const active = sub.key === activeSubTab;
            return (
              <button
                key={sub.key}
                onClick={() => goSubTab(sub.key)}
                style={{
                  padding: "7px 12px",
                  border: "none",
                  borderRadius: 0,
                  borderBottom: "2px solid " + (active ? C.ac : "transparent"),
                  background: "transparent",
                  color: active ? C.ac : C.tx3,
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
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
      )}
    </div>
  );
}
