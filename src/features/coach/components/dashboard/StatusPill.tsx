import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/features/shared/hooks/useCoachDashboard";

const CFG: Record<SessionStatus, { label: string; cls: string }> = {
  planned:     { label: "Planifié",  cls: "bg-[rgba(231,211,168,0.12)] text-[#7D7468]  border-[rgba(231,211,168,0.3)]" },
  in_progress: { label: "En cours",  cls: "bg-[rgba(59,141,240,0.12)]  text-[#33B5FF]  border-[rgba(59,141,240,0.3)]"  },
  completed:   { label: "Terminé",   cls: "bg-[rgba(34,201,147,0.12)]  text-[#66F03C]  border-[rgba(34,201,147,0.3)]"  },
  missed:      { label: "Manqué",    cls: "bg-[rgba(239,75,75,0.12)]   text-[#FF5A33]  border-[rgba(239,75,75,0.3)]"   },
  skipped:     { label: "Sauté",     cls: "bg-[rgba(251,146,60,0.12)]  text-[#FF9500]  border-[rgba(251,146,60,0.3)]"  },
};

interface StatusPillProps {
  status: SessionStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  const cfg = CFG[status] ?? CFG.planned;
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold border leading-none",
        cfg.cls,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}
