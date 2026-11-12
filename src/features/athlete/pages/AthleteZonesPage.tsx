import { useMemo } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { useZoneBoundsAt, useZoneModels } from "@/features/shared/hooks/useZoneModels";
import { localIsoDay } from "@shared/domain/dates";
import { activeModelAt } from "@shared/domain/hrZones";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { headerGlow } from "@/features/athlete/components/headerGlow";
import { ZoneBoundsBar } from "@/features/shared/components/zones/ZoneBoundsBar";
import { modelLabel } from "@/features/shared/components/zones/zoneModelLabel";

const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * « Mes seuils et zones » : ce que le coach a fixé (modèle, bornes en bpm,
 * depuis quand, par qui). Lecture seule : seul le coach les modifie.
 */
export default function AthleteZonesPage() {
  const { athleteId } = useAthleteContext();
  const today = localIsoDay();
  const { data: rows = [], isLoading } = useZoneModels(athleteId);
  const { data: bounds } = useZoneBoundsAt(athleteId, today);
  const { data: coaches } = useAthleteCoaches(athleteId);
  const current = useMemo(() => activeModelAt(rows, today), [rows, today]);

  const who = (id: string | null) =>
    id && coaches?.referent?.id === id ? coaches.referent.full_name
      : id && coaches?.coCoach?.id === id ? coaches.coCoach.full_name
      : "ton coach";
  const since = current ? (current.validFrom === "2000-01-01" ? current.createdAt.slice(0, 10) : current.validFrom) : null;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <AthletePageHeader title="Mes seuils et zones" titleSize={24} background={headerGlow("#FF3B1F", "#66F03C")} />
      <div style={{ padding: "24px 20px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        {isLoading ? null : bounds ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>
                {current ? modelLabel(current) : `${bounds.bounds.length + 1} zones`}
              </span>
              <span style={{ fontSize: 13, color: C.tx2 }}>
                {current && since ? `Fixées par ${who(current.decidedBy ?? current.createdBy)} le ${fmtDay(since)}.` : "Calculées depuis tes références cardiaques."}
              </span>
            </div>
            <ZoneBoundsBar bounds={bounds.bounds} />
          </>
        ) : (
          <div style={{ fontSize: 14, color: C.tx2, lineHeight: 1.5 }}>
            Ton coach n'a pas encore fixé tes zones de fréquence cardiaque. Elles apparaîtront ici, et dans tes séances, dès qu'il les aura réglées.
          </div>
        )}
        <p style={{ margin: 0, fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>
          Seul ton coach peut modifier tes zones. Un changement compte à partir du jour où il est fait ; tes séances passées gardent les zones de leur date.
        </p>
      </div>
    </div>
  );
}
