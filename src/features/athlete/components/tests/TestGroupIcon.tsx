import type { ReactNode } from "react";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { hyroxStationOf } from "@/features/shared/components/hyroxStation";
import type { TestGroup } from "@/lib/athleteTestValues";
import { RULER_PATH } from "./testGroupPaths";
import { C } from "@/lib/theme";

const INK = C.bg;

/** Tracés de la planche « Tests athlète » (traits carrés, 24×24). */
const PATHS: Partial<Record<TestGroup, ReactNode>> = {
  force: <path d="M3 12H21M6 7V17M9 9V15M15 9V15M18 7V17" />,
  endurance: <path d="M13 4.5A1.5 1.5 0 1 0 13 4.49M7 21L10 15L13 17V22M10 15L11 9L16 11L19 9M11 9L7 11V14" />,
  vitesse: <path d="M13 4.5A1.5 1.5 0 1 0 13 4.49M7 21L10 15L13 17V22M10 15L11 9L16 11L19 9M11 9L7 11V14" />,
  explosivite: <path d="M12 3V15M7 8L12 3L17 8M5 21H19" />,
};

/** Carré de couleur avec le picto du groupe (HYROX : picto de la station). */
export function TestGroupIcon({ group, color, testName, size = 24, radius = 10 }: {
  group: TestGroup;
  color: string;
  testName?: string;
  size?: number;
  radius?: number;
}) {
  const inner = Math.round(size * 0.58);
  return (
    <span aria-hidden style={{ width: size, height: size, flex: "none", borderRadius: radius, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {group === "hyrox" ? (
        <HyroxPicto station={hyroxStationOf(testName)} size={inner} color={INK} />
      ) : (
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="square">
          {PATHS[group] ?? RULER_PATH}
        </svg>
      )}
    </span>
  );
}
