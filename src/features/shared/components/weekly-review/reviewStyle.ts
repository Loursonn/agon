import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import type { Light } from "@shared/domain/wellnessLight";

export const REVIEW_CARD: CSSProperties = { borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, padding: "12px 14px" };

/** Feux de la weekly review en couleurs de marque (succès / alerte / erreur). Avant le 14/11 : vert sapin, orange doux, rouge brique (hors charte). */
export const LIGHT_COLOR: Record<Light, string> = { green: C.g, orange: C.o, red: C.r };
export const LIGHT_LABEL: Record<Light, string> = { green: "Vert", orange: "Orange", red: "Rouge" };
