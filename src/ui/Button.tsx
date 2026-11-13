import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button as BaseButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Styles Agon du bouton (sur un lien : `asChild`). Couleurs : src/styles/tokens.css.
 * Charte finale (P10) : aplat, aucun dégradé, aucune ombre floue, aucun halo.
 * Hauteurs et rayon : --agon-btn-* de tokens.css.
 *  - primary   : aplat or, texte noir, demi-gras. Un seul par écran.
 *  - secondary : contour fin, texte blanc.
 *  - link      : texte or, sans cadre.
 *  - valider   : vert « Fait » (séance en cours uniquement).
 *  - danger    : contour rouge, jamais plein.
 * Tailles : `md` 44 px (ordinateur), `lg` 52 px (action principale au pouce), `touch` 48 px.
 */
const buttonStyles = cva(
  "font-ui rounded-[var(--agon-btn-radius)] transition-colors focus-visible:ring-2 focus-visible:ring-agon-accent disabled:opacity-40 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-agon-accent text-agon-ink font-semibold hover:opacity-90",
        secondary: "border border-agon-brd-l bg-transparent text-agon-tx font-medium hover:bg-agon-s2",
        ghost: "bg-transparent text-agon-tx2 font-medium hover:bg-agon-s2 hover:text-agon-tx",
        link: "bg-transparent text-agon-accent font-medium px-1.5 hover:underline underline-offset-4",
        valider: "bg-agon-type-fait text-agon-ink font-semibold hover:opacity-90",
        danger: "border border-agon-rouge bg-transparent text-agon-rouge font-medium hover:bg-agon-rouge/10",
      },
      size: {
        sm: "h-9 px-agon-md text-agon-sm",
        md: "h-11 px-[18px] text-agon-base",
        touch: "h-[var(--agon-btn-h-tel-2)] px-[18px] text-agon-base",
        lg: "h-[var(--agon-btn-h-tel)] px-[18px] text-agon-bouton",
        icon: "h-[var(--agon-btn-h-ordi)] w-[var(--agon-btn-h-ordi)] p-0 text-agon-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonStyles> {
  /** Rend l'enfant (ex. `<Link>`) avec les styles du bouton. */
  asChild?: boolean;
}

/** Bouton Agon, sur la primitive shadcn (focus, `asChild`, icônes). `type="button"` par défaut. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, block, className, type, asChild, ...props }, ref) => (
    <BaseButton
      ref={ref}
      variant={null}
      size={null}
      asChild={asChild}
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
