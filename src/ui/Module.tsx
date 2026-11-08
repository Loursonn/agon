import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ModuleProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Titre du module (petites capitales). */
  title?: React.ReactNode;
  /** Action à droite du titre (bouton, lien). */
  action?: React.ReactNode;
}

/** Carte Agon (fond basalte, bordure sable), sur la Card shadcn. */
export const Module = React.forwardRef<HTMLDivElement, ModuleProps>(
  ({ title, action, className, children, ...props }, ref) => {
    const titleId = React.useId();
    return (
      <Card
        ref={ref}
        role={title ? "region" : undefined}
        aria-labelledby={title ? titleId : undefined}
        className={cn("rounded-lg border-agon-brd bg-agon-s1 p-agon-lg font-ui text-agon-tx", className)}
        {...props}
      >
        {(title || action) && (
          <header className="mb-agon-md flex items-center justify-between gap-agon-sm">
            {title && (
              <h2 id={titleId} className="text-agon-sm font-semibold uppercase tracking-wide text-agon-tx2">
                {title}
              </h2>
            )}
            {action}
          </header>
        )}
        {children}
      </Card>
    );
  },
);
Module.displayName = "Module";
