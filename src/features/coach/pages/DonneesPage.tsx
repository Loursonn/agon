import { HistoriqueTab } from "@/features/coach/components/donnees/HistoriqueTab";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import {
  ProviderActivityList,
  ProviderActivitySummary,
} from "@/features/shared/components/ProviderActivityList";
import { ActivityFileImport } from "@/features/shared/components/ActivityFileImport";

/** Onglet Historique (route legacy "donnees"). Stratégie vit dans Profil athlète. */
export default function DonneesPage() {
  const { athleteId } = useAthleteContext();

  return (
    <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
      {/*
        Les sorties de montre passent avant l'historique des séances, et non
        après : elles répondent à la question que le coach se pose en ouvrant cet
        onglet — « qu'est-ce que l'athlète a réellement fait ». L'historique, lui,
        dit ce qui était programmé. Les deux ne mesurent pas la même chose, d'où
        deux blocs séparés plutôt qu'une liste fusionnée qui inviterait à lire un
        écart comme une erreur.
      */}
      {athleteId && (
        <div className="flex flex-col gap-3 rounded-[6px] border border-agon-brd bg-agon-s1 px-4 py-3.5">
          <ProviderActivitySummary athleteId={athleteId} />
          <ProviderActivityList athleteId={athleteId} limit={30} />
          <ActivityFileImport athleteId={athleteId} forCoach />
        </div>
      )}

      <HistoriqueTab />
    </div>
  );
}
