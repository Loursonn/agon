import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxFlag } from "@/features/shared/hooks/hyrox/useHyroxFlag";
import RacesView from "@/features/coach/components/hyrox/RacesView";
import StationsView from "@/features/coach/components/hyrox/StationsView";
import RunsView from "@/features/coach/components/hyrox/RunsView";
import HyroxRadarView from "@/features/coach/components/hyrox/HyroxRadarView";

const TABS = [
  { key: "courses",  label: "Courses"  },
  { key: "stations", label: "Stations" },
  { key: "runs",     label: "Runs"     },
  { key: "radar",    label: "Radar"    },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function AthleteHyroxPage() {
  const { athleteId } = useAthleteContext();
  const { enabled } = useHyroxFlag(athleteId);
  const [tab, setTab] = useState<TabKey>("courses");

  if (!enabled) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
          Le suivi HYROX n'est pas activé
        </div>
        <div style={{ fontSize: 13, color: C.tx3 }}>
          Demandez à votre coach d'activer le suivi HYROX depuis votre profil.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Segmented control */}
      <div style={{ display: "flex", padding: "8px 12px", gap: 0, borderBottom: "1px solid " + C.brd, overflowX: "auto" }}>
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "8px 0", border: "none", background: "transparent",
                borderBottom: "2px solid " + (active ? C.ac : "transparent"),
                color: active ? C.ac : C.tx3,
                fontSize: 12, fontWeight: active ? 700 : 400,
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                transition: "color 150ms",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "0 12px 40px" }}>
        {tab === "courses"  && <RacesView />}
        {tab === "stations" && <StationsView />}
        {tab === "runs"     && <RunsView />}
        {tab === "radar"    && <HyroxRadarView />}
      </div>
    </div>
  );
}
