import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Icône décorative (ex. `<AgonIcon />`). */
  icon?: React.ReactNode;
  /** Action pour sortir de l'état vide (bouton). */
  action?: React.ReactNode;
  className?: string;
}

/** Écran ou bloc vide : ce qui manque, et quoi faire. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-agon-sm px-agon-lg py-agon-2xl text-center font-ui",
        className,
      )}
    >
      {icon && (
        <div aria-hidden className="mb-agon-xs text-agon-tx3">
          {icon}
        </div>
      )}
      <p className="text-agon-lg font-semibold text-agon-tx">{title}</p>
      {description && <p className="max-w-sm text-agon-base text-agon-tx2">{description}</p>}
      {action && <div className="mt-agon-sm">{action}</div>}
    </div>
  );
}
