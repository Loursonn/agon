import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import TodayPage from "@/features/athlete/pages/TodayPage";
import ProgramPage from "@/features/athlete/pages/ProgramPage";
import ProfilPage from "@/features/athlete/pages/ProfilPage";
import AthleteTestPage from "@/features/athlete/pages/AthleteTestPage";
import AlimPage from "@/features/athlete/pages/AlimPage";
import AthleteHyroxPage from "@/features/athlete/pages/HyroxPage";
import { FicheViewerHost } from "@/features/shared/components/fiches/FicheViewerHost";

const BASE_TABS = [
  { key: "today",   label: "Aujourd'hui" },
  { key: "program", label: "Programme"   },
  { key: "test",    label: "Tests"       },
] as const;

const HYROX_TAB = { key: "hyrox" as const, label: "HYROX" };

const TAIL_TABS = [
  { key: "alim",    label: "Nutrition"   },
  { key: "profil",  label: "Profil"      },
] as const;

export default function AthleteViewPage() {
  const { athleteProfile, athleteId } = useAthleteContext();
  const INNER_TABS = [...BASE_TABS, ...(athleteProfile?.is_hyrox_athlete ? [HYROX_TAB] : []), ...TAIL_TABS];
  const [tab, setTab] = useState<string>("today");

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Preview banner */}
      <div style={{
        padding: "6px 16px", background: C.acS,
        borderBottom: "1px solid " + C.ac + "30",
        fontSize: 11, color: C.ac, textAlign: "center", fontWeight: 600,
      }}>
        Aperçu — vue de l'athlète (lecture seule)
      </div>

      {/* Inner tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid " + C.brd, padding: "0 16px", overflowX: "auto" }}>
        {INNER_TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 16px", border: "none", background: "transparent",
                borderBottom: "2px solid " + (active ? C.ac : "transparent"),
                color: active ? C.ac : C.tx3,
                fontSize: 12, fontWeight: active ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                transition: "color 150ms, border-color 150ms",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "today"   && <TodayPage />}
      {tab === "program" && <ProgramPage />}
      {tab === "test"    && <AthleteTestPage />}
      {tab === "hyrox"   && <AthleteHyroxPage />}
      {tab === "alim"    && <AlimPage />}
      {tab === "profil"  && <ProfilPage />}
      <FicheViewerHost athleteId={athleteId} viewOnly />
    </div>
  );
}
