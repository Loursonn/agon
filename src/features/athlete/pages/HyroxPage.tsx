import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxFlag } from "@/features/shared/hooks/hyrox/useHyroxFlag";
import RacesView from "@/features/coach/components/hyrox/RacesView";
import HyroxSeasonView from "@/features/athlete/components/hyrox/HyroxSeasonView";
import AthleteTestsView from "@/features/coach/components/hyrox/tests/AthleteTestsView";

// Décision d'Hugo (15/11/2026) : trois onglets ; stations, runs et radar sont fondus dans « Ma saison ».
const TABS = [
  { key: "saison", label: "Ma saison" },
  { key: "courses", label: "Courses" },
  { key: "tests", label: "Tests" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function AthleteHyroxPage() {
  const { athleteId } = useAthleteContext();
  const { enabled } = useHyroxFlag(athleteId);
  const [params, setParams] = useSearchParams();
  // Une course ouverte par lien direct (?race=) s'affiche dans l'onglet Courses.
  const [tab, setTab] = useState<TabKey>(params.get("race") ? "courses" : "saison");
  const openRace = (id: string) => {
    setParams((p) => { const next = new URLSearchParams(p); next.set("race", id); return next; });
    setTab("courses");
  };

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
        {tab === "saison" && <HyroxSeasonView onOpenRace={openRace} />}
        {tab === "courses" && <RacesView />}
        {tab === "tests" && <AthleteTestsView />}
      </div>
    </div>
  );
}
