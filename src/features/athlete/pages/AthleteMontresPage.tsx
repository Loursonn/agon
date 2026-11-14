import type { ReactNode } from "react";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { ProviderCards } from "@/features/shared/components/ConnectedServicesSection";
import { ActivityFileImport } from "@/features/shared/components/ActivityFileImport";
import { StravaExportTutorial } from "@/features/athlete/components/StravaExportTutorial";

function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <h2 className="agon-mono m-0 flex h-5 items-center whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.12em] text-agon-tx2">
        <span className="text-agon-accent">{n} —</span>&nbsp;{children}
      </h2>
      <div className="h-px bg-agon-brd" />
    </div>
  );
}

function Source({ children }: { children: ReactNode }) {
  return <span className="agon-mono whitespace-nowrap rounded-full border border-agon-brd bg-agon-s2 px-2 py-px text-[11px] text-agon-tx">{children}</span>;
}

const CARD = "rounded-[14px] border border-agon-brd bg-agon-s1 p-3.5";

/**
 * « Montres et données » (planche Ath2Montres), ouverte depuis Profil : les
 * montres, l'accord de partage avec le coach, et l'import de l'historique
 * d'avant la montre (archive Strava ou export Garmin, lu sur le téléphone).
 */
export default function AthleteMontresPage() {
  const { athleteId } = useAthleteContext();
  const { data: coaches } = useAthleteCoaches(athleteId);
  const coach = coaches?.referent?.full_name ?? "ton coach";
  return (
    <div className="mx-auto max-w-[480px]">
      <AthletePageHeader title="Montres et données" titleSize={22} />
      <div className="flex flex-col gap-3 px-4 pb-10 pt-5">
        <div className="text-[13px] text-agon-tx2">Tes activités et ta récupération arrivent seules dans Agon.</div>

        <SectionTitle n="01">Mes montres</SectionTitle>
        <ProviderCards />

        <SectionTitle n="02">Partage</SectionTitle>
        <div className={`${CARD} flex flex-col gap-2`}>
          <div className="text-[14px] font-medium">Partager avec {coach}</div>
          <div className="text-[12.5px] leading-normal text-agon-tx2">
            Ton coach voit tes activités, ton sommeil et ta récupération. Tu peux retirer ton accord quand tu veux : la synchronisation s’arrête.
          </div>
          <div className="text-[12px] leading-normal text-agon-tx3">Les données Garmin ne sont jamais envoyées à une intelligence artificielle.</div>
          <div className="text-[12px] leading-[1.7] text-agon-tx3">
            Chaque donnée affiche sa source, par exemple <Source>Garmin Forerunner 265</Source> ou <Source>Import Strava</Source>.
          </div>
        </div>

        <SectionTitle n="03">Avant ta montre</SectionTitle>
        <div className={CARD}>
          <div className="text-[14px] font-medium">Importer mon historique</div>
          <div className="mb-3 mt-0.5 text-[12px] text-agon-tx3">
            Archive Strava ou export Garmin. Garmin n’envoie que les activités faites après la connexion : pour les plus anciennes, dépose ton export.
          </div>
          <ActivityFileImport
            sourceChoice
            coachName={coach === "ton coach" ? undefined : coach}
            onOpenStravaTutorial={() => {
              const box = document.getElementById("strava-tuto");
              const btn = box?.querySelector("button");
              if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
              box?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>
        <div id="strava-tuto"><StravaExportTutorial /></div>
      </div>
    </div>
  );
}
