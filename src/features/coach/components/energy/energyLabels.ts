import type { EnergySessionRow, EnergyStep, EnergyGroup, SessionImage } from "@/types/energy";
import { C, H } from "@/lib/theme";

export const KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", specifique: "Spécifique", autre: "Autre", custom: "Custom",
};

export const KIND_COLOR: Record<string, string> = {
  vo2: C.ac, tempo: C.b, seuil: H.ambre,
  footing: H.emeraude, fartlek: H.rougeVif, specifique: H.miel, autre: H.gris, custom: H.gris,
};

export const ROLE_COLOR: Record<string, string> = {
  warmup:   H.ambre,
  work:     H.rougeVif,
  recovery: C.b,
  rest:     H.gris,
  cooldown: H.emeraude,
  open:     C.ac,
};

export const ROLE_LABEL_FR: Record<string, string> = {
  warmup:   "Écho",
  work:     "Effort",
  recovery: "Récup",
  rest:     "Repos",
  cooldown: "Retour",
  open:     "Libre",
};

export function buildRootGroup(session: EnergySessionRow): EnergyGroup {
  return { type: "group", id: "__root__", role: "open", repeat: 1, children: session.intervals ?? [] };
}
