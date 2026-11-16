import { useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedAthlete } from "@/features/coach/context/SelectedAthleteContext";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { AthleteChangesBadge } from "@/features/coach/components/AthleteChangesBadge";
import { useCoachApiDrafts, useCoachApiHistory } from "@/features/coach/hooks/useCoachApiDrafts";
import { ClaudeDraftsSheet } from "@/features/coach/components/ClaudeDraftsSheet";
import { cn } from "@/lib/utils";
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

/** `short` : libellé compact sous 1280 px, pour que la barre tienne sans défiler (ex. 1100 px). */
const ALL_TABS: { key: string; label: string; short?: string; pushRight?: boolean; hyroxOnly?: boolean }[] = [
  { key: "planning",        label: "Planning"        },
  { key: "programmation",   label: "Programmation"   },
  { key: "retours",         label: "Retours"         },
  { key: "review",          label: "Review"          },
  { key: "profil-sportif",  label: "Profil athlète", short: "Profil" },
  { key: "hyrox",           label: "HYROX", hyroxOnly: true },
  { key: "fiches",          label: "Fiches"          },
  { key: "staff",           label: "Coachs & staff", short: "Staff" },
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
    { key: "courses",  label: "Courses"           },
    { key: "stations", label: "Stations"          },
    { key: "runs",     label: "Runs"              },
    { key: "radar",    label: "Radar"             },
    { key: "tests",    label: "Tests"             },
    { key: "plan",     label: "Objectif"          },
  ],
};

const OUTLINE_BTN = "h-[30px] flex-shrink-0 cursor-pointer rounded-[8px] border border-agon-brd-l bg-transparent px-3 text-[12px] text-agon-tx2";
const TAB_BASE = "cursor-pointer whitespace-nowrap border-0 bg-transparent font-normal transition-[color,border-color] duration-150";

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
    <div className="sticky top-0 z-[9] flex-shrink-0 border-b border-agon-brd bg-agon-bg">
      {/* Athlete info row — compact */}
      <div className="flex items-center gap-3.5 px-4 pb-1.5 pt-3.5 md:px-6">
        {/* Avatar */}
        <div className="agon-mono flex size-9 flex-shrink-0 items-center justify-center rounded-full border border-agon-accent text-[12px] text-agon-accent">
          {initials}
        </div>

        {/* Name */}
        <div className="flex min-w-0 flex-1 items-baseline gap-3.5 overflow-hidden whitespace-nowrap">
          <span className="agon-display overflow-hidden text-ellipsis text-[17px] font-normal uppercase tracking-[0.08em] text-agon-tx">
            {fullName}
          </span>
          {selectedAthlete?.id === user?.id && (
            <span className="agon-mono text-[11px] text-agon-accent">(moi)</span>
          )}
          {blockConfig?.blockName && (
            <span className="agon-mono overflow-hidden text-ellipsis text-[11px] uppercase tracking-[0.1em] text-agon-tx3">
              {blockConfig.blockName} · S{currentWeek} / {tw}
            </span>
          )}
        </div>

        {/* Lien de première connexion (athlète pré-créé, pas encore activé) */}
        {selectedAthlete?.is_pending && (
          <ClaimLinkButton athleteId={selectedAthlete.id} pending size={13} />
        )}

        {/* Modifications de l'athlète pas encore vues (liste au clic) */}
        {athleteId && athleteId !== user?.id && <AthleteChangesBadge athleteId={athleteId} athleteName={fullName} />}

        {/* Propositions de l'assistant IA du coach : en attente, ou inscrites
            récemment (à annuler si besoin). */}
        {(claudeDrafts.length > 0 || claudeHistory.length > 0) && (
          <button
            onClick={() => setDraftsOpen(true)}
            title={claudeDrafts.length > 0 ? "Propositions de Claude en attente" : "Ce que Claude a inscrit récemment"}
            className={cn(OUTLINE_BTN, "flex items-center gap-1.5")}
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
            <button className={cn(OUTLINE_BTN, "whitespace-nowrap transition-[border-color,color] duration-150")}>
              Changer ›
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] overflow-hidden rounded-[6px] border border-agon-brd-l bg-agon-s1 p-0">
            <Command className="bg-transparent">
              <CommandInput placeholder="Rechercher un athlète…" className="text-[12px] leading-5 text-agon-tx" />
              <CommandList>
                <CommandEmpty className="px-4 py-3 text-center text-[12px] leading-5 text-agon-tx3">
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
                      className={cn(
                        "cursor-pointer px-3 py-2 text-[12px] leading-5",
                        a.id === athleteId ? "!bg-agon-accent/[0.12] !text-agon-accent" : "!bg-transparent !text-agon-tx",
                      )}
                    >
                      <span className="mr-2 inline-flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-agon-coach/[0.145] text-[10px] font-bold text-agon-coach">
                        {a.full_name.charAt(0).toUpperCase()}
                      </span>
                      {a.full_name}
                      {a.id === athleteId && <span className="ml-auto text-[11px] text-agon-accent">✓</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Main tabs */}
      <div className="flex items-end gap-0 overflow-x-auto px-2.5">
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => goTab(tab.key)}
              title={tab.short ? tab.label : undefined}
              className={cn(
                TAB_BASE,
                "h-[42px] px-2.5 text-[13px] xl:px-3.5",
                tab.pushRight && "ml-auto",
                active ? "text-agon-tx shadow-[inset_0_-2px_0_var(--agon-accent)]" : "text-agon-tx3 hover:text-agon-tx2",
              )}
            >
              {tab.short ? (
                <>
                  <span className="xl:hidden">{tab.short}</span>
                  <span className="hidden xl:inline">{tab.label}</span>
                </>
              ) : tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs (Saison/Frise/Mois/Synthèse ou Bloc/Semaine/Jour) */}
      {subTabs.length > 0 && (
        <div className="flex items-center overflow-x-auto border-t border-agon-brd px-4 py-2.5 md:px-6">
          <div className="flex gap-0.5 rounded-[10px] border border-agon-brd p-[3px]">
            {subTabs.map((sub) => {
              const active = sub.key === activeSubTab;
              return (
                <button
                  key={sub.key}
                  onClick={() => goSubTab(sub.key)}
                  className={cn(
                    TAB_BASE,
                    "h-[26px] rounded-[7px] px-3 text-[12px]",
                    active ? "bg-agon-s2 text-agon-tx" : "text-agon-tx3",
                  )}
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
