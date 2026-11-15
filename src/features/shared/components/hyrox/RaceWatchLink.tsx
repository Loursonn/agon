import { useMemo } from "react";
import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { RaceActivityCandidate } from "@/api/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { ALIGN_METHOD_LABEL, MANUAL_RANGE_S, fmtOffset, segmentHrDynamics, type AutoOffset } from "@/lib/hyrox/watchAlign";
import { fmtClock } from "@/lib/seance";

/**
 * Lier la course à la montre et recaler la FC sur les splits officiels
 * (demande d'Hugo, 16/11/2026). Deux appareils, deux départs : on propose un
 * décalage, l'athlète ou le coach l'ajuste à la seconde ; la frise et les
 * chiffres de la course se mettent à jour en direct, puis on enregistre.
 * Données de montre : jamais envoyées à une IA.
 */

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
const SOURCE_LABEL: Record<string, string> = { garmin: "Garmin", coros: "COROS", strava: "Strava", polar: "Polar", suunto: "Suunto", file_import: "Fichier" };

/** Libellé d'une activité ; attribution Garmin obligatoire : « Garmin [appareil] ». */
function candidateLabel(c: RaceActivityCandidate): string {
  const brand = SOURCE_LABEL[c.source] ?? c.source;
  const device = c.deviceName?.trim() || null;
  const who = c.source === "garmin"
    ? (device ? (/^garmin/i.test(device) ? device : `Garmin ${device}`) : "Garmin")
    : device ?? brand;
  return `${who} · départ ${hhmm(c.startedAt)} · ${c.durationS != null ? fmtClock(c.durationS) : "—"}${c.title ? ` · ${c.title}` : ""}`;
}

const signed = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}`;

export default function RaceWatchLink({
  race, candidates, activityId, linked, stream, loading, auto, offset, edited, canSave, onOffset, onPickActivity, onSave, onUnlink, saving, phone,
}: {
  race: HyroxResult;
  candidates: RaceActivityCandidate[];
  activityId: string | null;
  /** Un lien est enregistré pour cette course. */
  linked: boolean;
  stream: ActivityStream | null;
  loading: boolean;
  auto: AutoOffset | null;
  /** Décalage appliqué (réglage en cours, enregistré ou proposé). */
  offset: number;
  /** Réglage modifié à la main depuis le dernier enregistrement. */
  edited: boolean;
  canSave: boolean;
  onOffset: (s: number) => void;
  onPickActivity: (id: string) => void;
  onSave: () => void;
  onUnlink: () => void;
  saving: boolean;
  phone: boolean;
}) {
  const dyn = useMemo(() => segmentHrDynamics(stream, race, offset), [stream, race, offset]);

  if (!loading && candidates.length === 0 && !activityId) {
    return (
      <section aria-label="Montre" style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
        <span style={{ ...KICKER, color: C.ac, display: "block", marginBottom: 6 }}>FC de la course</span>
        Aucune activité de montre ce jour-là. Synchronise la montre ou importe le fichier de la course : la FC s'affichera sur chaque segment.
      </section>
    );
  }

  const center = auto?.offsetS ?? offset;
  const lo = Math.min(center - MANUAL_RANGE_S, offset);
  const hi = Math.max(center + MANUAL_RANGE_S, offset);
  const step = (d: number) => () => onOffset(Math.max(lo, Math.min(hi, offset + d)));
  const saved = linked ? race.watch_offset_s ?? null : null;
  const status = edited
    ? "réglage modifié, pas encore enregistré"
    : saved != null && auto != null && saved !== auto.offsetS
      ? "réglé à la main"
      : auto ? `proposé : ${ALIGN_METHOD_LABEL[auto.method]}` : "";

  const stations = dyn.filter((d) => d.kind === "station");
  const roxOut = dyn.filter((d) => d.key.startsWith("rox_out_") && d.deltaHr != null);
  const roxAvg = roxOut.length ? Math.round(roxOut.reduce((n, d) => n + (d.deltaHr ?? 0), 0) / roxOut.length) : null;

  return (
    <section aria-label="Montre et chrono officiel" style={{ ...CARD, padding: phone ? 14 : "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ ...KICKER, color: C.ac }}>FC de la course · montre recalée</span>
        <span style={{ fontSize: 12, color: C.tx3 }}>{linked ? "Activité liée à la course" : "Activité proposée, pas encore liée"}</span>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: C.tx2 }}>
        Activité de la montre
        <select value={activityId ?? ""} onChange={(e) => e.target.value && onPickActivity(e.target.value)} disabled={saving || candidates.length === 0}
          style={{ height: 40, padding: "0 10px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontFamily: "inherit", fontSize: 13, maxWidth: "100%" }}>
          {!activityId && <option value="">Choisir une activité</option>}
          {activityId && !candidates.some((c) => c.id === activityId) && <option value={activityId}>Activité liée</option>}
          {candidates.map((c) => <option key={c.id} value={c.id}>{candidateLabel(c)}</option>)}
        </select>
      </label>

      {loading && <span style={{ fontSize: 12.5, color: C.tx3 }}>Lecture de la montre…</span>}
      {!loading && activityId && !stream && <span style={{ fontSize: 12.5, color: C.tx3 }}>Cette activité n'a pas de courbe seconde par seconde : rien à recaler.</span>}

      {stream && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: C.tx }}>
              {offset >= 0
                ? <>Départ de la course à <span style={{ ...MONO, color: C.ac }}>{fmtOffset(offset)}</span> dans l'enregistrement</>
                : <>Montre lancée <span style={{ ...MONO, color: C.ac }}>{fmtOffset(-offset)}</span> après le départ</>}
            </span>
            <span style={{ fontSize: 11.5, color: edited ? C.o : C.tx3 }}>{status}</span>
          </div>
          <input type="range" min={lo} max={hi} step={1} value={offset} onChange={(e) => onOffset(Number(e.target.value))}
            aria-label="Décalage entre la montre et le chrono officiel, en secondes" style={{ width: "100%", accentColor: C.ac, height: 28 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[-10, -1, 1, 10].map((d) => (
              <button key={d} type="button" onClick={step(d)} style={{ ...buttonStyle(), ...MONO, minWidth: 52, height: 40 }}
                aria-label={`${d > 0 ? "Décaler de" : "Reculer de"} ${Math.abs(d)} s`}>{signed(d)} s</button>
            ))}
            <span style={{ flex: 1 }} />
            {auto && offset !== auto.offsetS && (
              <button type="button" onClick={() => onOffset(auto.offsetS)} style={{ ...buttonStyle(), height: 40 }}>Revenir à la proposition</button>
            )}
            {linked && !edited && (
              <button type="button" onClick={onUnlink} disabled={saving} style={{ ...buttonStyle("ghost", saving), height: 40, color: C.tx2 }}>Délier</button>
            )}
            <button type="button" onClick={onSave} disabled={!canSave || saving} style={{ ...buttonStyle("primary", !canSave || saving), height: 40 }}>
              {saving ? "Enregistrement…" : linked ? "Enregistrer le calage" : "Lier et enregistrer"}
            </button>
          </div>
          <span style={{ fontSize: 11.5, color: C.tx3, lineHeight: 1.45 }}>
            Montre et chronométrage officiel sont deux appareils : leurs départs ne coïncident pas. Décale jusqu'à ce que les montées de FC tombent sur les stations.
          </span>
        </div>
      )}

      {stream && stations.some((d) => d.deltaHr != null) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>FC dans chaque station · début → fin</span>
          <div style={{ display: "grid", gridTemplateColumns: phone ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            {stations.map((d) => (
              <div key={d.key} style={{ border: `1px solid ${C.brd}`, borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
                <span style={{ ...MONO, fontSize: 12.5 }}>
                  {d.startHr ?? "—"} → {d.endHr ?? "—"}
                  {d.deltaHr != null && <span style={{ color: d.deltaHr > 0 ? C.o : C.g }}> {signed(d.deltaHr)}</span>}
                </span>
              </div>
            ))}
          </div>
          {roxAvg != null && (
            <span style={{ fontSize: 12.5, color: C.tx2 }}>
              Roxzone après chaque station : <span style={{ ...MONO, color: roxAvg < 0 ? C.g : C.o }}>{signed(roxAvg)} bpm</span> en moyenne{roxAvg < 0 ? " (la FC redescend)" : " (la FC ne redescend pas)"}.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
