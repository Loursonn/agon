import type { CSSProperties } from "react";
import { C, H } from "@/lib/theme";
import type { Light } from "@shared/domain/wellnessLight";

export const REVIEW_CARD: CSSProperties = { borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, padding: "12px 14px" };

/** Couleurs de statut validées le 05/11 (hors charte), pour les feux. */
export const LIGHT_COLOR: Record<Light, string> = { green: H.vertSapin, orange: H.orangeDoux, red: H.rougeBrique };
export const LIGHT_LABEL: Record<Light, string> = { green: "Vert", orange: "Orange", red: "Rouge" };
