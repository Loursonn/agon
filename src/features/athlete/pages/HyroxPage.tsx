import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxFlag } from "@/features/shared/hooks/hyrox/useHyroxFlag";
import RacesView from "@/features/coach/components/hyrox/RacesView";
import StationsView from "@/features/coach/components/hyrox/StationsView";
import RunsView from "@/features/coach/components/hyrox/RunsView";
import HyroxRadarView from "@/features/coach/components/hyrox/HyroxRadarView";
import AthleteTestsView from "@/features/coach/components/hyrox/tests/AthleteTestsView";

const TABS = [
  { key: "courses", label: "Courses" },
  { key: "stations", label: "Stations" },
  { key: "runs", label: "Runs" },
  { key: "radar", label: "Radar" },
  { key: "tests", label: "Tests" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function AthleteHyroxPage() {
  const { athleteId } = useAthleteContext();
  const { enabled } = useHyroxFlag(athleteId);
  const [tab, setTab] = useState<TabKey>("courses");

  if (!enabled) {
    return (
      <div className="p-10 text-center font-ui">
        <div className="mb-agon-sm text-agon-lg font-bold text-agon-tx">Le suivi HYROX n'est pas activé</div>
        <div className="text-agon-base text-agon-tx3">Demandez à votre coach d'activer le suivi HYROX depuis votre profil.</div>
      </div>
    );
  }

  // Téléphone : colonne de 480 px. PC : colonne élargie (les vues dessinent leurs grilles dedans).
  return (
    <div className="mx-auto w-full max-w-[480px] font-ui lg:max-w-4xl">
      <div role="tablist" className="flex border-b border-agon-brd px-agon-md py-agon-sm lg:px-agon-xl">
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={cn(
                "min-h-11 flex-1 whitespace-nowrap border-b-2 bg-transparent text-agon-sm transition-colors lg:flex-none lg:px-agon-xl",
                active ? "border-agon-accent font-bold text-agon-accent" : "border-transparent font-normal text-agon-tx3",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="px-agon-md pb-10 lg:px-agon-xl">
        {tab === "courses" && <RacesView />}
        {tab === "stations" && <StationsView />}
        {tab === "runs" && <RunsView />}
        {tab === "radar" && <HyroxRadarView />}
        {tab === "tests" && <AthleteTestsView />}
      </div>
    </div>
  );
}
