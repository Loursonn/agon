import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tagStyles = cva(
  "inline-flex items-center gap-agon-xs whitespace-nowrap rounded-sm px-agon-sm py-agon-2xs font-ui text-agon-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-agon-s2 text-agon-tx2",
        accent: "bg-agon-accent-doux text-agon-accent",
        succes: "bg-agon-succes-doux text-agon-succes",
        alerte: "bg-agon-alerte-doux text-agon-alerte",
        erreur: "bg-agon-erreur-doux text-agon-erreur",
        info: "bg-agon-info-doux text-agon-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof tagStyles> {}

/** Étiquette courte (statut, catégorie). Texte 11 px minimum. */
export function Tag({ tone, className, ...props }: TagProps) {
  return <span className={cn(tagStyles({ tone }), className)} {...props} />;
}
