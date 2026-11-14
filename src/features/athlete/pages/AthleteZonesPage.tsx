import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Lock, Watch } from "lucide-react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
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
const CARD: CSSProperties = { borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}` };

function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 6, height: 22, display: "flex", alignItems: "center" }}>
      <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{n} —</span> {children}
      </span>
    </div>
  );
}

function Threshold({ label, value, color, note, source }: { label: string; value: number | null; color?: string; note: string; source?: string | null }) {
  return (
    <div style={{ ...CARD, padding: "12px 13px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.tx2, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ marginTop: 4, whiteSpace: "nowrap" }}>
        <span style={{ ...MONO, fontSize: 24, lineHeight: 1.1, color: value != null ? color ?? C.tx : C.tx3 }}>{value ?? "—"}</span>
        {value != null && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}> bpm</span>}
      </div>
      <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 3, whiteSpace: "nowrap" }}>{note}</div>
      {source && (
        <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6, ...MONO, fontSize: 10.5, color: C.tx3, whiteSpace: "nowrap" }}>
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
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <AthletePageHeader title="Mes seuils et mes zones" titleSize={22} />
      <div style={{ padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {isLoading ? null : (
          <>
            <div style={{ ...CARD, display: "flex", gap: 10, alignItems: "center", padding: "12px 14px" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.ac}`, display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 10.5, color: C.ac, flex: "none" }}>
                {who === "ton coach" ? "—" : initials(who)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{bounds ? `Fixé par ${who}` : "Pas encore fixé par ton coach"}</div>
                <div style={{ fontSize: 12, color: C.tx3 }}>
                  {fcMaxRef ? `Dernier test le ${fmtShort(fcMaxRef.date)}` : since ? `Depuis le ${fmtShort(since)}` : "En attente"} · lecture seule
                </div>
              </div>
              <Lock size={15} color={C.tx3} strokeWidth={1.5} />
            </div>

            <SectionTitle n="01">Mes seuils</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Threshold label="SV1" value={sv1} color={C.o} note="fin de l’effort facile" />
              <Threshold label="SV2" value={sv2} color={C.r} note="limite de l’effort tenu" />
              <Threshold label="FC max" value={fcMax} note={fcMaxRef ? `fixée le ${fmtShort(fcMaxRef.date)}` : "pas encore mesurée"} />
              <Threshold label="FC de repos" value={resting?.bpm ?? refs?.FCrepos?.value ?? null} note={resting ? `moyenne ${resting.nights} nuit${resting.nights > 1 ? "s" : ""}` : refs?.FCrepos ? `mesurée le ${fmtShort(refs.FCrepos.date)}` : "montre non reliée"} source={resting?.source} />
            </div>

            <SectionTitle n="02">Modèle de zones</SectionTitle>
            {bounds && scale ? (
              <>
                <div style={{ display: "flex", padding: 3, borderRadius: 11, background: C.s2, fontSize: 12 }} aria-label="Modèle choisi par ton coach">
                  {([["five", "5 zones"], ["three", "3 zones SV1-SV2"], ["custom", "Personnalisé"]] as const).map(([k, l]) => (
                    <span key={k} style={{
                      flex: 1, height: 30, padding: "0 8px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, whiteSpace: "nowrap",
                      ...(kind === k ? { background: C.s1, color: C.tx, border: `1px solid ${C.brdL}` } : { color: C.tx3 }),
                    }}>{l}</span>
                  ))}
                </div>
                <div style={{ ...CARD, borderRadius: 14, padding: "14px 14px 6px" }}>
                  <div style={{ position: "relative", height: 72, margin: "0 6px" }}>
                    <div style={{ position: "absolute", left: 0, right: 0, top: 18, display: "flex", height: 16, borderRadius: 5, overflow: "hidden", gap: 2 }}>
                      {scale.widths.map((w, i) => <span key={i} style={{ width: `${w}%`, background: zoneColor(i + 1, n) }} />)}
                    </div>
                    {([["SV1", sv1], ["SV2", sv2]] as const).filter(([, v]) => v != null).map(([l, v]) => (
                      <span key={l}>
                        <span style={{ position: "absolute", left: `${scale.at(v!)}%`, top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ ...MONO, fontSize: 10, color: C.tx2 }}>{l}</span>
                          <span style={{ width: 1.5, height: 22, background: C.tx }} />
                        </span>
                        <span style={{ position: "absolute", left: `${scale.at(v!)}%`, top: 40, transform: "translateX(-50%)", ...MONO, fontSize: 10, color: C.tx3 }}>{v}</span>
                      </span>
                    ))}
                    <div style={{ position: "absolute", left: 0, right: 0, top: 58, display: "flex", justifyContent: "space-between", ...MONO, fontSize: 10, color: C.tx3 }}>
                      <span>{scale.min}</span><span>{fcMax ? `FC max ${fcMax}` : scale.max}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {zoneRows(b, fcMax).map((z) => (
                      <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40, borderTop: `1px solid ${C.brd}` }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 20, minWidth: 28, padding: "0 6px", borderRadius: 999, background: zoneColor(z.zone, n), color: C.bg, ...MONO, fontSize: 10.5, fontWeight: 500, boxSizing: "border-box" }}>Z{z.zone}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{z.label}</span>
                        <span style={{ ...MONO, fontSize: 13, color: C.tx, whiteSpace: "nowrap" }}>{z.range}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.tx3 }}>Ces zones colorent ta courbe de FC et le temps par zone de chaque séance.</div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: C.tx2, lineHeight: 1.5 }}>
                Ton coach n'a pas encore fixé tes zones de fréquence cardiaque. Elles apparaîtront ici, et dans tes séances, dès qu'il les aura réglées.
              </div>
            )}
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.tx2 }}>Une valeur te semble fausse ? Parles-en à ton coach : lui seul peut la changer.</div>
          </>
        )}
      </div>
    </div>
  );
}
