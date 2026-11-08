import * as React from "react";
import { Input as BaseInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Classes partagées par les champs (Input, déclencheur du Select). */
export const fieldStyles =
  "h-10 rounded-md border border-agon-brd-l bg-agon-s2 px-agon-md font-ui text-agon-tx placeholder:text-agon-tx3 " +
  // 16 px sur mobile : en dessous, iOS zoome sur le champ au focus.
  "text-agon-lg md:text-agon-base focus-visible:ring-2 focus-visible:ring-agon-accent focus:ring-2 focus:ring-agon-accent " +
  "aria-[invalid=true]:border-agon-erreur";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Bordure d'erreur + `aria-invalid`. */
  invalid?: boolean;
}

/** Champ texte Agon, sur la primitive shadcn. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ invalid, className, ...props }, ref) => (
  <BaseInput
    ref={ref}
    {...props}
    aria-invalid={invalid || props["aria-invalid"] || undefined}
    className={cn(fieldStyles, className)}
  />
));
Input.displayName = "Input";
