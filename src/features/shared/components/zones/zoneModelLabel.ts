import type { ZoneModelKind } from "@shared/domain/hrZones";

interface ModelLike { kind: ZoneModelKind; bounds: number[] }

/** Nombre de zones d'un modèle (five : 5, sinon bornes + 1). */
export function modelZoneCount(m: ModelLike): number {
  return m.kind === "five" ? 5 : m.bounds.length + 1;
}

/** « 3 zones · SV1 152 · SV2 172 », « 5 zones », « 7 zones ». */
export function modelLabel(m: ModelLike): string {
  if (m.kind === "three" && m.bounds.length === 2) return `3 zones · SV1 ${m.bounds[0]} · SV2 ${m.bounds[1]}`;
  return `${modelZoneCount(m)} zones`;
}
