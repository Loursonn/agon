import { FlaskConical, X, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SHEET_CLOSE, SHEET_HEAD, SHEET_OVERLAY, SHEET_PANEL, SHEET_SUB, SHEET_TITLE, SMALL_KICK, STAT_CARD, STAT_LABEL, STAT_VALUE, TYPE_TAG } from "./detailSheet";
import { EmptyState } from "@/features/shared/components/EmptyState";
import type { TestDetail } from "@/features/shared/types/retours.types";

interface TestsDetailViewProps {
  tests: TestDetail[];
  onClose: () => void;
}

export function TestsDetailView({ tests, onClose }: TestsDetailViewProps) {
  const completed  = tests.filter((t) => t.completed).length;
  const validated  = tests.filter((t) => t.coach_validated).length;
  const rate       = tests.length > 0 ? Math.round(completed / tests.length * 100) : null;

  return (
    <div className={SHEET_OVERLAY}>
      <div className={SHEET_PANEL}>
        {/* Header */}
        <div className={SHEET_HEAD}>
          <div>
            <div className={SHEET_TITLE}>Tests — détails</div>
            <div className={SHEET_SUB}>
              {completed} / {tests.length} réalisé{completed !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} className={SHEET_CLOSE}><X size={16} /></button>
        </div>

        {/* Stats row */}
        {tests.length > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-2">
            {[
              { label: "Réalisés",          value: `${completed}/${tests.length}`, tone: completed === tests.length ? "text-agon-succes" : "text-agon-alerte" },
              { label: "Taux réalisation",  value: rate != null ? `${rate}%` : "—", tone: rate != null && rate >= 70 ? "text-agon-succes" : "text-agon-alerte" },
              { label: "Validés coach",     value: `${validated}/${completed || 1}`, tone: "text-agon-accent" },
            ].map(({ label, value, tone }) => (
              <div key={label} className={STAT_CARD}>
                <div className={STAT_LABEL}>{label}</div>
                <div className={cn(STAT_VALUE, "text-[17px] leading-none", tone)}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {tests.length === 0 ? (
          <EmptyState icon={FlaskConical} title="Aucun test ce mois" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {tests.map((t) => (
              <div key={t.id} className="rounded-[4px] bg-agon-s2 px-3.5 py-3">
                {/* Title + status row */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-agon-tx">{t.title}</span>
                    {t.type && (
                      <span className={TYPE_TAG}>
                        {t.type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {t.coach_validated && (
                      <div className="flex items-center gap-[3px]">
                        <ShieldCheck size={11} color={C.g} />
                        <span className="text-[9px] text-agon-succes">Validé</span>
                      </div>
                    )}
                    <div className="flex items-center gap-[3px]">
                      {t.completed
                        ? <CheckCircle2 size={11} color={C.g} />
                        : <Clock size={11} color={C.o} />}
                      <span className={cn("text-[9px]", t.completed ? "text-agon-succes" : "text-agon-alerte")}>
                        {t.completed ? "Réalisé" : "Non réalisé"}
                      </span>
                    </div>
                    <span className="text-[10px] text-agon-tx3">
                      {format(parseISO(t.date), "d MMM", { locale: fr })}
                    </span>
                  </div>
                </div>

                {/* Results note */}
                {t.results_note && (
                  <div className="rounded-[4px] bg-agon-s1 px-2.5 py-2">
                    <div className={SMALL_KICK}>
                      Résultats
                    </div>
                    <div className="text-[12px] text-agon-tx2">{t.results_note}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
