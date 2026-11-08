import * as React from "react";
import { Skeleton as BaseSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Bloc de chargement (fond basalte 2), sur la primitive shadcn. Dimensions via `className`. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <BaseSkeleton aria-hidden className={cn("rounded-md bg-agon-s2", className)} {...props} />;
}
