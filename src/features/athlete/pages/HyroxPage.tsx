import { useState } from "react";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
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
    <div className="mx-auto w-full max-w-[480px] font-ui lg:max-w-[1248px]">
      <AthletePageHeader
        title="HYROX"
        titleSize={26}
        padding="56px 20px 24px"
        tabs={TABS}
        activeTab={tab}
        onTab={(k) => setTab(k as TabKey)}
        tabTone="gold"
      />

      <div className="px-5 pb-10 pt-6">
        {tab === "courses" && <RacesView />}
        {tab === "stations" && <StationsView />}
        {tab === "runs" && <RunsView />}
        {tab === "radar" && <HyroxRadarView />}
        {tab === "tests" && <AthleteTestsView />}
      </div>
    </div>
  );
}
