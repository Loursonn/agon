import { useMemo } from "react";
import type { BlockLogs, EnergySessionRow } from "@/types/energy";
import type { DoneActivity } from "@/lib/plannedVsDone";
import type { ActivityDetail } from "@/lib/activityDetail";
import type { Refs } from "@/lib/energy/energyRun";
import { SessionShareSheet, type ShareVariant } from "@/features/shared/components/share/SessionShareSheet";
import { tintColor } from "@/features/athlete/components/energy/energyTint";
import { useActivityDetail } from "@/features/shared/hooks/useActivityDetail";
import { buildEnergyShare, type EnergyShareInput, type ShareLap } from "@/lib/share/buildEnergyShare";
import { displayLapNames, lapKind, plannedLabel, sportFamily, zoneColor } from "@/lib/seance";
import { providerAttribution } from "@/lib/activityDisplay";
import { TYPE_COLOR } from "@/lib/peps";
import { C } from "@/lib/theme";
import { nf } from "@/lib/share/sessionShare";

/** Saisie de l'athlète pour la version « faite » (fin de séance : pas encore relue du serveur). */
export interface EnergyShareDone {
  rpe: number | null;
  durationMin: number | null;
  distanceKm: number | null;
  blockLogs: BlockLogs | null;
  comment: string | null;
}

/** Tours de la montre → segments de la carte (nom, nature, temps, allure, prévu). */
function shareLaps(detail: ActivityDetail | undefined): ShareLap[] | null {
  if (!detail?.laps?.length) return null;
  const blocks = detail.plannedBlocks ?? null;
  const names = displayLapNames(detail.laps);
  return detail.laps.map((l, i) => {
    const b = l.plannedBlockRef ? blocks?.find((x) => x.ref === l.plannedBlockRef) : undefined;
    const label = b ? plannedLabel(b) : null;
    const planned = label && label !== "—" ? (b?.loadKg ? `${label} · ${nf(b.loadKg, 1)} kg` : label) : null;
    return {
      name: names[i] ?? `Tour ${i + 1}`,
      kind: lapKind(l, blocks),
      durationS: l.metrics?.durationS ?? null,
      distanceM: l.metrics?.distanceM ?? null,
      avgPaceSPerKm: l.metrics?.avgPaceSPerKm ?? null,
      phase: l.lapType ?? null,
      plannedLabel: planned,
      plannedDurationS: b?.durationS ?? null,
    };
  });
}

/**
 * Partage d'une séance d'énergie ou de spécifique : prévue, et faite (avec
 * les données de la montre si une activité est rattachée, sinon le prévu coché).
 */
export function EnergyShareSheet({
  session, refs, day, athleteId, completed, done, activity, celebrate, onClose,
}: {
  session: EnergySessionRow;
  refs: Refs | undefined;
  day: string | null;
  athleteId: string;
  completed: boolean;
  done: EnergyShareDone | null;
  activity: DoneActivity | null;
  celebrate?: boolean;
  onClose: () => void;
}) {
  const { data: detail } = useActivityDetail(athleteId, activity?.id);
  const kind: EnergyShareInput["kind"] = session.session_kind === "specifique" ? "specifique" : "energie";

  const variants = useMemo<ShareVariant[]>(() => {
    const base = {
      kind, day, refs,
      session: {
        name: session.name, intervals: session.intervals ?? null, total_duration_s: session.total_duration_s ?? null,
        total_distance_m: session.total_distance_m ?? null, format: session.format ?? null,
        classique_structure: session.classique_structure ?? null,
      },
      accent: kind === "specifique" ? TYPE_COLOR.hyrox : TYPE_COLOR.energie,
      colors: {
        tint: tintColor,
        zones: (n: number) => Array.from({ length: n }, (_, i) => zoneColor(i + 1, n)),
        success: C.g, error: C.r, muted: C.tx2,
      },
    };
    const out: ShareVariant[] = [{
      key: "planned",
      build: (opts, people) => buildEnergyShare({ ...base, done: false, ...people }, opts),
    }];
    if (completed || activity) {
      const shareActivity = activity ? {
        distanceM: activity.distanceM, durationS: activity.durationS, avgPaceSPerKm: activity.avgPaceSPerKm ?? null,
        avgHr: activity.avgHr ?? null, isRun: sportFamily(activity.sport) === "run", zoneShares: activity.zoneShares,
      } : null;
      const source = activity ? (detail?.attribution || providerAttribution(activity.source, activity.deviceName)) : null;
      const laps = shareLaps(detail);
      out.push({
        key: "done",
        build: (opts, people) => buildEnergyShare({
          ...base, done: true, ...people,
          rpe: done?.rpe ?? null, durationMin: done?.durationMin ?? null, distanceKm: done?.distanceKm ?? null,
          blockLogs: done?.blockLogs ?? null, comment: done?.comment ?? null,
          activity: shareActivity, laps, source,
        }, opts),
      });
    }
    return out;
  }, [kind, day, refs, session, completed, activity, detail, done]);

  return (
    <SessionShareSheet variants={variants} initial={completed || activity ? "done" : "planned"} day={day} celebrate={celebrate} onClose={onClose} />
  );
}
