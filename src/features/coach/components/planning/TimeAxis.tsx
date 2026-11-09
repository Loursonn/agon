import { eachMonthOfInterval, format, getMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TimeAxisProps {
  rangeStart: Date;
  rangeEnd: Date;
  containerWidth: number;
  /** Largeur de la colonne de libellés (px), identique à celle des lignes. */
  labelWidth: number;
}

export function TimeAxis({ rangeStart, rangeEnd, containerWidth, labelWidth }: TimeAxisProps) {
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
  const trackWidth = containerWidth - labelWidth;
  const colW = trackWidth / months.length;

  const todayMs = Date.now();
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  const elapsedMs = todayMs - rangeStart.getTime();
  const todayX = Math.max(0, Math.min(1, elapsedMs / rangeMs)) * trackWidth;
  const isInRange = todayMs >= rangeStart.getTime() && todayMs <= rangeEnd.getTime();
  const now = new Date();

  return (
    <div className="relative flex border-b border-agon-brd pb-agon-xs">
      <div className="shrink-0" style={{ width: labelWidth }} />

      <div className="relative flex flex-1">
        {months.map((month, i) => {
          const isJan = getMonth(month) === 0;
          const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();

          return (
            <div
              key={month.toISOString()}
              className={cn("relative shrink-0 text-center", isJan ? "pt-agon-2xs" : "pt-agon-xs")}
              style={{ width: colW }}
            >
              {(isJan || i === 0) && (
                <div className="mb-agon-2xs text-agon-xs font-extrabold uppercase leading-none tracking-wide text-agon-tx2">
                  {format(month, "yyyy")}
                </div>
              )}
              <div
                className={cn(
                  "text-agon-xs uppercase tracking-wide",
                  isCurrentMonth ? "font-bold text-agon-accent" : isJan ? "font-semibold text-agon-tx2" : "font-medium text-agon-tx3",
                )}
              >
                {format(month, "MMM", { locale: fr })}
              </div>
            </div>
          );
        })}

        {isInRange && (
          <div
            className="pointer-events-none absolute -bottom-1.5 top-0 w-0.5 rounded-sm bg-agon-accent"
            style={{ left: todayX }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-agon-accent-doux px-agon-xs text-agon-xs font-extrabold text-agon-accent">
              Auj.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
