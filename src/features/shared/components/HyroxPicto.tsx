import type { ReactNode } from "react";
import { token } from "@/lib/theme";
import { type HyroxStation, hyroxPictoColor } from "./hyroxStation";

const F = { fill: "currentColor", stroke: "none" } as const;
const L = (w = 2.5) => ({ fill: "none", stroke: "currentColor", strokeWidth: w, strokeLinecap: "round", strokeLinejoin: "round" } as const);

const SHAPES: Record<HyroxStation, ReactNode> = {
  skierg: (
    <>
      <rect x="18.4" y="2" width="3" height="18.6" rx="1" {...F} /><rect x="13.8" y="2" width="7" height="1.8" rx="0.9" {...F} />
      <rect x="15.6" y="19.8" width="7" height="1.6" rx="0.8" {...F} /><path d="M15 3.6 L15 10" {...L(1.2)} />
      <rect x="14.2" y="9.6" width="1.6" height="2.6" rx="0.8" {...F} /><circle cx="8.6" cy="5.4" r="2.1" {...F} />
      <path d="M9.6 8.4 L7.2 13.6" {...L()} /><path d="M9.8 8.8 L14 10.6" {...L()} />
      <path d="M7.2 13.6 L10 16.8 L9.2 21" {...L()} /><path d="M7.2 13.6 L6 17.4 L6.2 21" {...L()} />
    </>
  ),
  sled_push: (
    <>
      <rect x="15.2" y="7" width="1.8" height="11.5" rx="0.9" {...F} /><rect x="17.2" y="12.6" width="4.6" height="5.6" rx="0.8" {...F} />
      <path d="M14.4 18.4H22.6L21.6 21.2H15.4Z" {...F} /><circle cx="12.6" cy="7.4" r="2.1" {...F} />
      <path d="M10.6 9.8 L6.6 13.4" {...L()} /><path d="M10.6 10 L15.4 10.6" {...L()} />
      <path d="M6.6 13.4 L9.4 16.6 L8.8 21" {...L()} /><path d="M6.6 13.4 L4.4 17 L2.4 20.4" {...L()} />
    </>
  ),
  sled_pull: (
    <>
      <rect x="2.4" y="13.4" width="4.6" height="5" rx="0.8" {...F} /><path d="M1.4 18.4H9.4L8.4 21.2H2.4Z" {...F} />
      <path d="M8.4 16.6 L14.2 11.2" {...L(1.1)} /><circle cx="19.6" cy="6.6" r="2.1" {...F} />
      <path d="M18.2 9.2 L16.4 14.4" {...L()} /><path d="M18 9.8 L14.2 11.2" {...L()} />
      <path d="M16.4 14.4 L13.8 17.4 L14.4 21" {...L()} /><path d="M16.4 14.4 L17.6 17.8 L19.6 21" {...L()} />
    </>
  ),
  burpee_broad_jump: (
    <>
      <path d="M1.6 21.4 L22.4 21.4" {...L(1.4)} /><path d="M3.4 19.6 L6.4 15.6" {...L(1.1)} strokeDasharray="1.4 2" />
      <circle cx="18.4" cy="6.2" r="2.1" {...F} /><path d="M16 8.4 L10.4 11.6" {...L()} /><path d="M16.2 8.6 L21 9.6" {...L()} />
      <path d="M10.4 11.6 L7 11.2 L4 13.8" {...L()} /><path d="M10.4 11.6 L9 15.2 L6.4 17.4" {...L()} />
    </>
  ),
  rameur: (
    <>
      <path d="M2 19.2H17V21H2Z" {...F} /><circle cx="19.4" cy="16.2" r="3.2" {...F} />
      <rect x="5.2" y="16.8" width="4" height="1.6" rx="0.8" {...F} /><path d="M8.6 13.4 L16.6 15.4" {...L(1.1)} />
      <circle cx="5" cy="6.6" r="2.1" {...F} /><path d="M6 9.2 L7.2 16.2" {...L()} />
      <path d="M6.2 9.8 L3.8 13 L8.6 13.4" {...L()} /><path d="M7.2 16.2 L11.8 15.2 L16.2 17" {...L()} />
    </>
  ),
  farmers_carry: (
    <>
      <circle cx="12" cy="3.6" r="2.1" {...F} /><path d="M12 6.6 L12 13.2" {...L()} />
      <path d="M12 7.2 L7.6 8.6 L5.8 13" {...L()} /><path d="M12 7.2 L16.4 8.6 L18.2 13" {...L()} />
      <path d="M12 13.2 L10.2 17 L10.2 21.2" {...L()} /><path d="M12 13.2 L13.8 17 L13.8 21.2" {...L()} />
      <path d="M4.6 13.4 L5.8 12.4 L7 13.4" {...L(1.4)} /><circle cx="5.8" cy="16.2" r="2.6" {...F} />
      <path d="M17 13.4 L18.2 12.4 L19.4 13.4" {...L(1.4)} /><circle cx="18.2" cy="16.2" r="2.6" {...F} />
    </>
  ),
  sandbag_lunges: (
    <>
      <circle cx="12.4" cy="2.8" r="2.1" {...F} /><rect x="6.4" y="5.6" width="11" height="3.2" rx="1.6" {...F} />
      <path d="M11.6 8.8 L11 13.6" {...L()} /><path d="M11 13.6 L15.6 13.8 L15.8 20.8" {...L()} />
      <path d="M11 13.6 L8.4 19.6 L4 20" {...L()} />
    </>
  ),
  wall_balls: (
    <>
      <rect x="21" y="1.6" width="1.6" height="20.8" rx="0.6" {...F} /><rect x="18.2" y="3.8" width="2.8" height="1.4" rx="0.5" {...F} />
      <circle cx="15" cy="5.4" r="2.6" {...F} /><circle cx="8.4" cy="7.8" r="2.1" {...F} />
      <path d="M8.4 10.4 L7.6 15" {...L()} /><path d="M8.6 10.8 L11.4 8.6 L13 7" {...L()} />
      <path d="M7.6 15 L11.2 16.6 L10.6 21" {...L()} /><path d="M7.6 15 L8.6 18.2 L6.8 21.2" {...L()} />
    </>
  ),
  course: (
    <>
      <circle cx="15" cy="3.4" r="2.1" {...F} /><path d="M14 6.4 L11.6 12.6" {...L()} />
      <path d="M13.8 7.2 L17 9.6 L19.6 8.4" {...L()} /><path d="M13.8 7.2 L10.2 8.6 L8 11.6" {...L()} />
      <path d="M11.6 12.6 L15 15.4 L13.8 20.6" {...L()} /><path d="M11.6 12.6 L9.4 16.2 L5 16.8" {...L()} />
    </>
  ),
  roxzone: (
    <>
      <path d="M4 8 L18 8" {...L(2)} /><path d="M14.6 4.6 L18 8 L14.6 11.4" {...L(2)} />
      <path d="M20 16 L6 16" {...L(2)} /><path d="M9.4 12.6 L6 16 L9.4 19.4" {...L(2)} />
    </>
  ),
  autre: (
    <>
      <rect x="2" y="9.6" width="2.6" height="4.8" rx="1" {...F} /><rect x="5" y="7" width="3.2" height="10" rx="1.2" {...F} />
      <rect x="15.8" y="7" width="3.2" height="10" rx="1.2" {...F} /><rect x="19.4" y="9.6" width="2.6" height="4.8" rx="1" {...F} />
      <path d="M8 12 L16 12" {...L(2.2)} />
    </>
  ),
};

export function HyroxPicto({ station, size = 24, color, title }: { station: HyroxStation; size?: number; color?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color: color ?? hyroxPictoColor(station), flex: "none" }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {SHAPES[station]}
    </svg>
  );
}
