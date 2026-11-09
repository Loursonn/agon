import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Sélecteur Séances | Fiches (?vue=fiches). */
function ProgramViewSwitch() {
  const [params, setParams] = useSearchParams();
  const vue = params.get("vue") === "fiches" ? "fiches" : "seances";
  const go = (v: "seances" | "fiches") => {
    const next = new URLSearchParams(params);
    if (v === "fiches") next.set("vue", "fiches");
    else next.delete("vue");
    setParams(next, { replace: true });
  };
  return (
    <div role="tablist" className="mx-auto mt-agon-md flex max-w-[480px] gap-agon-2xs rounded-md bg-black/25 p-[3px]">
      {([["seances", "Séances"], ["fiches", "Fiches"]] as const).map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={vue === k}
          onClick={() => go(k)}
          className={cn(
            "min-h-9 flex-1 rounded-md text-agon-base font-bold",
            vue === k ? "bg-agon-accent-doux text-agon-accent" : "bg-transparent text-agon-tx3",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** En-tête collant de l'onglet Programme (titre + sélecteur de vue). */
export function ProgramHeader() {
  return (
    <header className="sticky top-[45px] z-[5] border-b border-agon-accent/25 bg-gradient-to-br from-agon-accent/[0.18] to-agon-s1 to-70% px-agon-lg py-[14px] text-center font-ui">
      <div className="text-agon-lg font-bold tracking-tight text-agon-tx">Programme</div>
      <ProgramViewSwitch />
    </header>
  );
}
