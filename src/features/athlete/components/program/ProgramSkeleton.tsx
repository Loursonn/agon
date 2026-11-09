import { Skeleton } from "@/ui/Skeleton";

/** Chargement de l'onglet Programme : même découpage que la page (rail + semaine sur PC). */
export function ProgramSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-agon-lg px-agon-lg pb-8 pt-agon-lg lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-agon-xl lg:px-agon-xl">
      <div className="flex flex-col gap-agon-md rounded-lg border border-agon-brd bg-agon-s1 p-5 lg:self-start">
        <div className="flex gap-agon-md">
          <Skeleton className="h-[22px] w-20" />
          <Skeleton className="h-4 w-[60px]" />
        </div>
        <Skeleton className="h-[22px] w-[70%]" />
        <Skeleton className="h-1 w-full" />
        <div className="flex gap-agon-md">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-agon-xs">
              <Skeleton className="h-[18px] w-[60%]" />
              <Skeleton className="h-3 w-[80%]" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-agon-md">
        <Skeleton className="h-[22px] w-40" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex flex-col gap-agon-sm rounded-lg border border-agon-brd bg-agon-s1 px-agon-lg py-agon-md">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
