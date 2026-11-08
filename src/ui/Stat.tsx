import * as React from "react";
import { cn } from "@/lib/utils";

export type StatValue = number | string | null | undefined;

export interface StatProps {
  value: StatValue;
  label: React.ReactNode;
  /** Unité affichée après la valeur (kg, bpm…), seulement si la valeur existe. */
  unit?: React.ReactNode;
  /** Mise en forme d'une valeur numérique (ex. `(v) => v.toFixed(1)`). */
  format?: (value: number) => string;
  className?: string;
}

/** Vrai si la mesure manque : null, undefined, chaîne vide, NaN ou infini. 0 est une vraie mesure. */
function isMissing(value: StatValue): value is null | undefined | "" {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  return value.trim() === "";
}

/** Valeur + libellé. Une mesure absente s'affiche « — », jamais 0. */
export function Stat({ value, label, unit, format, className }: StatProps) {
  const missing = isMissing(value);
  const shown = missing ? "—" : typeof value === "number" && format ? format(value) : String(value);
  return (
    <div className={cn("flex min-w-0 flex-col gap-agon-2xs font-ui", className)}>
      <span className="font-data text-agon-2xl font-semibold leading-none text-agon-tx">
        {shown}
        {!missing && unit && <span className="ml-agon-2xs text-agon-sm font-normal text-agon-tx2">{unit}</span>}
      </span>
      <span className="text-agon-xs uppercase tracking-wide text-agon-tx3">{label}</span>
    </div>
  );
}
