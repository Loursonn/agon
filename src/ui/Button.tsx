import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button as BaseButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Styles Agon du bouton (sur un lien : `asChild`). Couleurs : src/styles/tokens.css. */
const buttonStyles = cva(
  "font-ui font-semibold rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-agon-accent disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-agon-accent text-agon-ink hover:opacity-90",
        secondary: "border border-agon-brd-l bg-agon-s2 text-agon-tx hover:bg-agon-s1",
        ghost: "bg-transparent text-agon-tx2 hover:bg-agon-s2 hover:text-agon-tx",
        danger: "border border-agon-erreur bg-agon-erreur-doux text-agon-erreur hover:bg-agon-erreur hover:text-agon-tx",
      },
      size: {
        sm: "h-8 px-agon-md text-agon-sm",
        md: "h-10 px-agon-lg text-agon-base",
        lg: "h-12 px-agon-xl text-agon-lg",
        icon: "h-10 w-10 p-0 text-agon-base",
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
