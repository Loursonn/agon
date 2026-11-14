/**
 * ProfilAthletePage — onglet « Profil athlète » (route profil-sportif).
 * Header unifié pour les 3 sous-onglets (?view=) :
 *   - sportif  : Profil Sportif Actuel
 *   - general  : Profil Général (profil + blessures + stratégie)
 *   - testing  : Suivi Testing
 */
import { useSearchParams } from "react-router-dom";
import ProfilSportifPage from "./ProfilSportifPage";
import TestPage from "./TestPage";
import { ProfilGeneralTab } from "@/features/coach/components/donnees/ProfilGeneralTab";

type ProfilView = "sportif" | "general" | "testing";

const HEADERS: Record<ProfilView, { title: string; subtitle: string }> = {
  sportif: {
    title: "Profil Sportif Actuel",
    subtitle: "Références de performance — alimentent les calculs de zones et l'éditeur de séances énergétiques.",
  },
  general: {
    title: "Profil Général",
    subtitle: "Informations personnelles, blessures et stratégie de suivi.",
  },
  testing: {
    title: "Suivi Testing",
    subtitle: "Tests à remplir, évolution par catégorie et historique des résultats.",
  },
};

export default function ProfilAthletePage() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("view");
  // Legacy ?view=strategie → fusionné dans Profil Général
  const view: ProfilView = raw === "general" || raw === "strategie" ? "general" : raw === "testing" ? "testing" : "sportif";
  const { title, subtitle } = HEADERS[view];

  return (
    <div className="px-6 pb-[60px]">
      {/* Header commun aux sous-onglets ; « Profil sportif » a son propre titre (planche). */}
      {view !== "sportif" && <div className="pb-4 pt-5">
        <div className="text-[20px] font-extrabold text-agon-tx">{title}</div>
        <div className="mt-1 text-[12px] text-agon-tx3">{subtitle}</div>
      </div>}

      {view === "sportif" && <div className="pt-6"><ProfilSportifPage /></div>}
      {view === "general" && <ProfilGeneralTab />}
      {view === "testing" && <TestPage embedded />}
    </div>
  );
}
