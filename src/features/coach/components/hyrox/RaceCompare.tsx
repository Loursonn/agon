import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { C } from "@/lib/theme";
import { DISPLAY } from "@/features/shared/components/seance/seanceUi";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useHyroxReferences } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { pickRef } from "@/api/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import type { RefLookup } from "@/lib/hyrox/calc";
import { compareRaces } from "@/lib/hyrox/raceComparison";
import RaceVersus from "@/features/shared/components/hyrox/RaceVersus";

/** Deux courses cochées dans la liste, côte à côte (coach et athlète). */
export default function RaceCompare({ raceA, raceB, onBack }: { raceA: HyroxResult; raceB: HyroxResult; onBack: () => void }) {
  const phone = useIsPhone();
  const { data: refs = [] } = useHyroxReferences();
  const refLookup: RefLookup = useMemo(() => (d, s, b) => pickRef(refs, d, s, b) ?? undefined, [refs]);
  const cmp = useMemo(() => compareRaces(raceA, raceB, refs.length ? refLookup : null), [raceA, raceB, refs.length, refLookup]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button type="button" onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0, minHeight: 44, alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> HYROX · Courses
      </button>
      <h2 style={{ ...DISPLAY, margin: 0, fontSize: phone ? 22 : 24, fontWeight: 300, letterSpacing: "0.06em" }}>Face à face</h2>
      <RaceVersus cmp={cmp} phone={phone} />
    </div>
  );
}
