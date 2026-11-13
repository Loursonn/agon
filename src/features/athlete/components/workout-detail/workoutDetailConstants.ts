import { C, H } from "@/lib/theme";


// ── Constants ──────────────────────────────────────────────────────────────────

export const ACCENT = C.ac;
export const ACCENT_ALT = C.o;
export const GREEN = C.g;
export const REST_DEFAULT = 90;
export const RING_R = 18;
export const RING_C = 2 * Math.PI * RING_R; // ≈ 113.097


export const FIELD_CFG = {
  kg:   { label: "Charge",                unit: "kg",   steps: [-2.5, -1.25, 1.25, 2.5] as number[] },
  reps: { label: "Répétitions",           unit: "reps", steps: [-2, -1, 1, 2] as number[] },
  rir:  { label: "RIR (reps en réserve)", unit: "",     steps: [-1, 1] as number[] },
} as const;
export const ORANGE = H.miel;
export const SS_LETTERS = "ABCDEFGH";
export const SS_ORANGE = H.miel;
export const RIR_ITEMS: Array<{ val: string; label: string; desc: string }> = [
  { val: "0",   label: "0",    desc: "Échec" },
  { val: "0.5", label: "0,5",  desc: "Quasi échec" },
  { val: "1",   label: "1",    desc: "Très difficile" },
  { val: "1.5", label: "1,5",  desc: "Difficile" },
  { val: "2",   label: "2",    desc: "Modéré" },
  { val: "2.5", label: "2,5",  desc: "" },
  { val: "3",   label: "3",    desc: "Confortable" },
  { val: "3.5", label: "3,5",  desc: "" },
  { val: "4",   label: "4",    desc: "Facile" },
  { val: "4.5", label: "4,5",  desc: "" },
  { val: "5",   label: "5",    desc: "Très facile" },
  { val: "5+",  label: "5+",   desc: "Aucun effort" },
];
