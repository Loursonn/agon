import { useMemo, type ReactNode } from "react";
import { Lock, Watch } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { useZoneBoundsAt, useZoneModels } from "@/features/shared/hooks/useZoneModels";
import { useActiveReferences } from "@/features/shared/hooks/useReferences";
import { useRestingHr } from "@/features/athlete/hooks/useRestingHr";
import { localIsoDay } from "@shared/domain/dates";
import { activeModelAt } from "@shared/domain/hrZones";
import { zoneColor } from "@/lib/seance";
import { zoneBarScale, zoneRows } from "@/lib/athleteZones";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";

const fmtShort = (d: string) => new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const CARD = "rounded-xl border border-agon-brd bg-agon-s1";

function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div className="mt-1.5 flex h-[22px] items-center">
      <span className="agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx2">
        <span className="text-agon-accent">{n} —</span> {children}
      </span>
    </div>
  );
}

function Threshold({ label, value, color, note, source }: { label: string; value: number | null; color?: string; note: string; source?: string | null }) {
  return (
    <div className={cn(CARD, "min-w-0 px-[13px] py-3")}>
      <div className="whitespace-nowrap text-[12px] text-agon-tx2">{label}</div>
      <div className="mt-1 whitespace-nowrap">
        <span className="agon-mono text-[24px] leading-[1.1]" style={{ color: value != null ? color ?? C.tx : C.tx3 }}>{value ?? "—"}</span>
        {value != null && <span className="agon-mono text-[11px] text-agon-tx3"> bpm</span>}
      </div>
      <div className="mt-[3px] whitespace-nowrap text-[11.5px] text-agon-tx3">{note}</div>
      {source && (
        <div className="agon-mono mt-1.5 inline-flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-agon-tx3">
          <Watch size={12} strokeWidth={1.5} />{source}
        </div>
      )}
    </div>
  );
}

/**
 * « Mes seuils et mes zones » (planche Ath2Zones) : seuils, modèle et bornes
 * fixés par le coach. Lecture seule : seul le coach les modifie.
 */
export default function AthleteZonesPage() {
  const { athleteId } = useAthleteContext();
  const today = localIsoDay();
  const { data: rows = [], isLoading } = useZoneModels(athleteId);
  const { data: bounds } = useZoneBoundsAt(athleteId, today);
  const { data: coaches } = useAthleteCoaches(athleteId);
  const { data: refs } = useActiveReferences(athleteId);
  const { data: resting } = useRestingHr(athleteId);
  const current = useMemo(() => activeModelAt(rows, today), [rows, today]);

  const whoId = current?.decidedBy ?? current?.createdBy ?? null;
  const who = whoId && coaches?.coCoach?.id === whoId ? coaches.coCoach.full_name : coaches?.referent?.full_name ?? "ton coach";
  const fcMaxRef = refs?.FCmax ?? null;
  const fcMax = fcMaxRef?.value ?? null;
  const b = bounds?.bounds ?? [];
  const kind = bounds?.kind ?? current?.kind ?? null;
  const sv1 = kind === "three" ? b[0] ?? null : refs?.SV1?.value ?? null;
  const sv2 = kind === "three" ? b[1] ?? null : refs?.SV2?.value ?? null;
  const since = current ? (current.validFrom === "2000-01-01" ? current.createdAt.slice(0, 10) : current.validFrom) : null;
  const scale = b.length ? zoneBarScale(b, fcMax) : null;
  const n = b.length + 1;

  return (
    <div className="mx-auto max-w-[480px]">
      <AthletePageHeader title="Mes seuils et mes zones" titleSize={22} />
      <div className="flex flex-col gap-3 px-4 pb-10 pt-5">
        {isLoading ? null : (
          <>
            <div className={cn(CARD, "flex items-center gap-2.5 px-3.5 py-3")}>
              <span className="agon-mono flex size-8 flex-none items-center justify-center rounded-full border border-agon-accent text-[10.5px] text-agon-accent">
                {who === "ton coach" ? "—" : initials(who)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px]">{bounds ? `Fixé par ${who}` : "Pas encore fixé par ton coach"}</div>
                <div className="text-[12px] text-agon-tx3">
                  {fcMaxRef ? `Dernier test le ${fmtShort(fcMaxRef.date)}` : since ? `Depuis le ${fmtShort(since)}` : "En attente"} · lecture seule
                </div>
              </div>
              <Lock size={15} color={C.tx3} strokeWidth={1.5} />
            </div>

            <SectionTitle n="01">Mes seuils</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Threshold label="SV1" value={sv1} color={C.o} note="fin de l’effort facile" />
              <Threshold label="SV2" value={sv2} color={C.r} note="limite de l’effort tenu" />
              <Threshold label="FC max" value={fcMax} note={fcMaxRef ? `fixée le ${fmtShort(fcMaxRef.date)}` : "pas encore mesurée"} />
              <Threshold label="FC de repos" value={resting?.bpm ?? refs?.FCrepos?.value ?? null} note={resting ? `moyenne ${resting.nights} nuit${resting.nights > 1 ? "s" : ""}` : refs?.FCrepos ? `mesurée le ${fmtShort(refs.FCrepos.date)}` : "montre non reliée"} source={resting?.source} />
            </div>

            <SectionTitle n="02">Modèle de zones</SectionTitle>
            {bounds && scale ? (
              <>
                <div className="flex rounded-[11px] bg-agon-s2 p-[3px] text-[12px]" aria-label="Modèle choisi par ton coach">
                  {([["five", "5 zones"], ["three", "3 zones SV1-SV2"], ["custom", "Personnalisé"]] as const).map(([k, l]) => (
                    <span key={k} className={cn(
                      "flex h-[30px] flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-2",
                      kind === k ? "border border-agon-brd-l bg-agon-s1 text-agon-tx" : "text-agon-tx3",
                    )}>{l}</span>
                  ))}
                </div>
                <div className="rounded-[14px] border border-agon-brd bg-agon-s1 px-3.5 pb-1.5 pt-3.5">
                  <div className="relative mx-1.5 h-[72px]">
                    <div className="absolute inset-x-0 top-[18px] flex h-4 gap-0.5 overflow-hidden rounded-[5px]">
                      {scale.widths.map((w, i) => <span key={i} style={{ width: `${w}%`, background: zoneColor(i + 1, n) }} />)}
                    </div>
                    {([["SV1", sv1], ["SV2", sv2]] as const).filter(([, v]) => v != null).map(([l, v]) => (
                      <span key={l}>
                        <span className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5" style={{ left: `${scale.at(v!)}%` }}>
                          <span className="agon-mono text-[10px] text-agon-tx2">{l}</span>
                          <span className="h-[22px] w-[1.5px] bg-agon-tx" />
                        </span>
                        <span className="agon-mono absolute top-10 -translate-x-1/2 text-[10px] text-agon-tx3" style={{ left: `${scale.at(v!)}%` }}>{v}</span>
                      </span>
                    ))}
                    <div className="agon-mono absolute inset-x-0 top-[58px] flex justify-between text-[10px] text-agon-tx3">
                      <span>{scale.min}</span><span>{fcMax ? `FC max ${fcMax}` : scale.max}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    {zoneRows(b, fcMax).map((z) => (
                      <div key={z.zone} className="flex min-h-10 items-center gap-2.5 border-t border-agon-brd">
                        <span className="agon-mono box-border inline-flex h-5 min-w-7 items-center justify-center rounded-full px-1.5 text-[10.5px] font-medium text-agon-bg" style={{ background: zoneColor(z.zone, n) }}>Z{z.zone}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-agon-tx2">{z.label}</span>
                        <span className="agon-mono whitespace-nowrap text-[13px] text-agon-tx">{z.range}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[12.5px] leading-normal text-agon-tx3">Ces zones colorent ta courbe de FC et le temps par zone de chaque séance.</div>
              </>
            ) : (
              <div className="text-[14px] leading-normal text-agon-tx2">
                Ton coach n'a pas encore fixé tes zones de fréquence cardiaque. Elles apparaîtront ici, et dans tes séances, dès qu'il les aura réglées.
              </div>
            )}
            <div className="text-[12.5px] leading-normal text-agon-tx2">Une valeur te semble fausse ? Parles-en à ton coach : lui seul peut la changer.</div>
          </>
        )}
      </div>
    </div>
  );
}
