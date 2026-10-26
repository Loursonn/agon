import { HistoriqueTab } from "@/features/coach/components/donnees/HistoriqueTab";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import {
  ProviderActivityList,
  ProviderActivitySummary,
} from "@/features/shared/components/ProviderActivityList";
import { C } from "@/lib/theme";

/** Onglet Historique (route legacy "donnees"). Stratégie vit dans Profil athlète. */
export default function DonneesPage() {
  const { athleteId } = useAthleteContext();

  return (
    <div style={{ padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/*
        Les sorties de montre passent avant l'historique des séances, et non
        après : elles répondent à la question que le coach se pose en ouvrant cet
        onglet — « qu'est-ce que l'athlète a réellement fait ». L'historique, lui,
        dit ce qui était programmé. Les deux ne mesurent pas la même chose, d'où
        deux blocs séparés plutôt qu'une liste fusionnée qui inviterait à lire un
        écart comme une erreur.
      */}
      {athleteId && (
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <ProviderActivitySummary athleteId={athleteId} />
          <ProviderActivityList athleteId={athleteId} limit={30} />
        </div>
      )}

      <HistoriqueTab />
    </div>
  );
}
