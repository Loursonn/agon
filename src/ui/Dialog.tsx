import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Dialog as Root,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Élément qui ouvre la fenêtre (rendu tel quel, `asChild`). */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Actions en bas (boutons), toujours visibles. */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Fenêtre responsive : feuille qui monte du bas sur mobile, dialogue centré à partir
 * de `md` (768 px). Une seule fenêtre Radix, la mise en page change en CSS : pas de
 * démontage quand on redimensionne, focus et Échap gérés par Radix.
 */
export function Dialog({ open, onOpenChange, trigger, title, description, children, footer, className }: DialogProps) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed z-50 flex flex-col border-agon-brd bg-agon-s1 font-ui text-agon-tx shadow-lg outline-none duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            // Mobile : feuille en bas
            "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg border-t pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            // PC : centré (mêmes animations que le DialogContent shadcn)
            "md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:pb-0",
            "md:data-[state=open]:fade-in-0 md:data-[state=open]:zoom-in-95 md:data-[state=open]:slide-in-from-left-1/2 md:data-[state=open]:slide-in-from-top-[48%]",
            "md:data-[state=closed]:fade-out-0 md:data-[state=closed]:zoom-out-95 md:data-[state=closed]:slide-out-to-left-1/2 md:data-[state=closed]:slide-out-to-top-[48%]",
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-agon-sm h-1 w-10 rounded-full bg-agon-brd-l md:hidden" />
          <header className="flex items-start gap-agon-md px-agon-lg pb-agon-sm pt-agon-md md:pt-agon-lg">
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-agon-xl font-semibold leading-tight text-agon-tx">{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-agon-xs text-agon-base text-agon-tx2">{description}</DialogDescription>
              )}
            </div>
            <DialogClose
              aria-label="Fermer"
              className="-mr-agon-xs flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-agon-tx2 hover:bg-agon-s2 hover:text-agon-tx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agon-accent"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-agon-lg pb-agon-lg text-agon-base">{children}</div>
          {footer && (
            <footer className="flex flex-col-reverse gap-agon-sm border-t border-agon-brd px-agon-lg py-agon-md md:flex-row md:justify-end">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Root>
  );
}
