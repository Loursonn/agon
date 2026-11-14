import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import type { Light } from "@shared/domain/wellnessLight";

/** Carte de la weekly review en classes (à préférer à REVIEW_CARD). */
export const REVIEW_CARD_CLASS = "rounded-xl border border-agon-brd bg-agon-s1 px-3.5 py-3";
export const REVIEW_CARD: CSSProperties = { borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, padding: "12px 14px" };

/** Feux de la weekly review en couleurs de marque (succès / alerte / erreur). Avant le 14/11 : vert sapin, orange doux, rouge brique (hors charte). */
export const LIGHT_COLOR: Record<Light, string> = { green: C.g, orange: C.o, red: C.r };
export const LIGHT_LABEL: Record<Light, string> = { green: "Vert", orange: "Orange", red: "Rouge" };
