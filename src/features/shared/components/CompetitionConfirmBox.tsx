import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Zone de confirmation (annuler / supprimer une compétition) : phrase, détails, boutons. */
export function ConfirmBox({ tone, text, extra, children }: { tone: "accent" | "rouge"; text: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div role="alertdialog" aria-label={text} className={cn(
      "mt-2 rounded-[10px] border px-3 py-2.5",
      tone === "rouge" ? "border-agon-rouge/40" : "border-agon-accent/40",
    )}>
      <div className="mb-2.5 text-[13px] leading-[1.45] text-agon-tx2">{text}</div>
      {extra}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

