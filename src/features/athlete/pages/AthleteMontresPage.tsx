import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { headerGlow } from "@/features/athlete/components/headerGlow";
import { ProviderCards } from "@/features/shared/components/ConnectedServicesSection";
import { ActivityFileImport } from "@/features/shared/components/ActivityFileImport";
import { StravaExportTutorial } from "@/features/athlete/components/StravaExportTutorial";

function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <h2 style={{ margin: 0, height: 20, display: "flex", alignItems: "center", ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{n} —</span>&nbsp;{children}
      </h2>
      <div style={{ height: 1, background: C.brd }} />
    </div>
  );
}

const SOURCE: CSSProperties = { ...MONO, fontSize: 11, color: C.tx, background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" };

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
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <AthletePageHeader title="Montres et données" titleSize={22} background={headerGlow(C.b, C.g)} />
      <div style={{ padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: C.tx2 }}>Tes activités et ta récupération arrivent seules dans Agon.</div>

        <SectionTitle n="01">Mes montres</SectionTitle>
        <ProviderCards />

        <SectionTitle n="02">Partage</SectionTitle>
        <div style={{ borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Partager avec {coach}</div>
          <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>
            Ton coach voit tes activités, ton sommeil et ta récupération. Tu peux retirer ton accord quand tu veux : la synchronisation s’arrête.
          </div>
          <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>Les données Garmin ne sont jamais envoyées à une intelligence artificielle.</div>
          <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.7 }}>
            Chaque donnée affiche sa source, par exemple <span style={SOURCE}>Garmin Forerunner 265</span> ou <span style={SOURCE}>Import Strava</span>.
          </div>
        </div>

        <SectionTitle n="03">Avant ta montre</SectionTitle>
        <div style={{ borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Importer mon historique</div>
          <div style={{ fontSize: 12, color: C.tx3, marginTop: 2, marginBottom: 12 }}>
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
