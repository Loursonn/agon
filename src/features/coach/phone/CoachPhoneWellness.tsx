import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { wellnessScore, WELLNESS_ITEMS, WELLNESS_ITEM_SHORT, type WellnessEntry } from "@shared/domain/wellness";
import { bodyZoneLabel, DOMS_LEVEL_LABEL } from "@/lib/bodyZones";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { toWellnessDay } from "@/lib/retoursWellness";
import { WellnessDetailView } from "@/features/coach/components/retours/WellnessDetailView";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { CARD, Chevron, KICKER, MONO, PhonePage, fmtDec, lightColor } from "./phoneUi";

const LIGHT_LABEL = { green: "Vert", orange: "Orange", red: "Rouge" } as const;

function Tile({ label, value, unit, state, stateColor, foot }: {
  label: string; value: string; unit?: string; state: string; stateColor: string; foot: string;
}) {
  return (
    <div style={{ ...CARD, padding: "12px 12px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11.5, color: C.tx3 }}>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>
        <span style={{ ...MONO, fontSize: 20 }}>{value}</span>
        {unit && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}> {unit}</span>}
      </span>
      <span style={{ fontSize: 12, color: stateColor }}>{state}</span>
      <span style={{ fontSize: 11, color: C.tx3 }}>{foot}</span>
    </div>
  );
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Wellness d'un athlète sur téléphone (planche CoachPhoneWellness) : feu du
 * matin et pourquoi, 4 signaux (VFC, FC de repos, ressenti, courbatures),
 * saisie du matin.
 */
export default function CoachPhoneWellness() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const today = localIsoDay();
  const light = useWellnessLight(athleteId);
  const from = addDays(today, -35);
  const hist = useWellnessHistory(athleteId, { from } as never);
  const [why, setWhy] = useState(false);
  const [detail, setDetail] = useState(false);
  const { goals } = useAthleteContext();

  const r = light.data ?? null;
  const col = lightColor(r?.light) ?? C.tx3;

  const { todayEntry, scoreNow, scoreHabit, doms, daily } = useMemo(() => {
    const h = (hist.data ?? {}) as Record<string, WellnessEntry>;
    const days = Object.keys(h).sort();
    const last = days.length ? h[days[days.length - 1]] : null;
    const todayEntry = h[today] ?? null;
    const scoreNow = wellnessScore(todayEntry ?? undefined);
    const base = days.filter((d) => d < today && d >= addDays(today, -28)).map((d) => wellnessScore(h[d])).filter((s): s is number => s != null);
    // Courbatures : zone la plus marquée de la dernière saisie, et jours avec courbatures sur 7.
    let doms: { zone: string; level: string; days7: number; after: string | null } | null = null;
    if (last && Object.keys(last.domsLevels ?? {}).length > 0) {
      const [zone, lvl] = Object.entries(last.domsLevels).sort((a, b) => b[1] - a[1])[0];
      const days7 = days.filter((d) => d > addDays(today, -7) && Object.keys(h[d].domsLevels ?? {}).length > 0).length;
      doms = { zone: bodyZoneLabel(zone), level: DOMS_LEVEL_LABEL[lvl], days7, after: last.domsWorkout?.name ?? null };
    } else if (last && last.domsZones.length > 0) {
      doms = { zone: bodyZoneLabel(last.domsZones[0]), level: "Signalées", days7: 0, after: last.domsWorkout?.name ?? null };
    }
    const daily = Object.fromEntries(days.filter((d) => d >= addDays(today, -27)).map((d) => [d, {
      date: d, wellness: toWellnessDay(h[d]), workouts_completed: 0, has_competition: false, has_test: false,
    }]));
    return { todayEntry, scoreNow, scoreHabit: mean(base), doms, daily };
  }, [hist.data, today]);

  // Feu : VFC en ln(ms) (moyenne et zone) → reconverties en ms à l'affichage.
  const hrv = r?.hrv;
  const rhr = r?.restingHr;
  const signals = r ? [...r.redSigns, ...r.orange].map((s) => s.text).filter((t, i, a) => a.indexOf(t) === i) : [];

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <div style={{
        padding: 14, borderRadius: 14, display: "flex", flexDirection: "column", gap: 6,
        background: alpha(col, 0.1), border: `1px solid ${alpha(col, 0.35)}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%", background: r ? col : "transparent", border: r ? "none" : `1px solid ${C.brdL}` }} />
          <span style={{ fontSize: 17, fontWeight: 500, color: r ? col : C.tx3, flex: 1 }}>{r ? LIGHT_LABEL[r.light] : "Feu du matin —"}</span>
          {r && signals.length > 0 && (
            <button type="button" aria-expanded={why} onClick={() => setWhy((v) => !v)} style={{ background: "none", border: "none", color: C.ac, fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
              Pourquoi {why ? "⌃" : "›"}
            </button>
          )}
        </div>
        {r && <div style={{ fontSize: 13.5 }}>{r.sentence}</div>}
        {!r && !light.isLoading && <div style={{ fontSize: 12.5, color: C.tx3 }}>Pas assez de données ce matin (montre ou wellness).</div>}
        {why && signals.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: C.tx2, display: "flex", flexDirection: "column", gap: 2 }}>
            {signals.map((s) => <li key={s}>{s}</li>)}
          </ul>
        )}
        {r && (
          <div style={{ fontSize: 11.5, color: C.tx3 }}>
            {r.brand ? `Mesures ${r.brand === "garmin" ? "Garmin" : r.brand === "coros" ? "COROS" : r.brand}` : "Sans montre : rouge seulement si malade"}
            {hrv?.dayIndex != null && hrv.dayIndex < 14 ? ` · alerte VFC active au 14e jour (J${hrv.dayIndex})` : ""}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <Tile
          label="VFC de nuit" value={hrv?.mean7 != null ? fmtDec(Math.exp(hrv.mean7), 0) : "—"} unit={hrv?.mean7 != null ? "ms" : undefined}
          state={hrv?.mean7 == null ? "Pas de mesure" : hrv.below ? `Basse${hrv.belowDays ? ` · ${hrv.belowDays} j` : ""}` : "Dans sa zone"}
          stateColor={hrv?.below ? C.o : hrv?.mean7 != null ? C.g : C.tx3}
          foot={hrv?.zoneLow != null && hrv.zoneHigh != null ? `Zone ${fmtDec(Math.exp(hrv.zoneLow), 0)}–${fmtDec(Math.exp(hrv.zoneHigh), 0)}` : "Zone en construction"}
        />
        <Tile
          label="FC de repos" value={rhr?.mean7 != null ? fmtDec(rhr.mean7, 1) : "—"} unit={rhr?.mean7 != null ? "bpm" : undefined}
          state={rhr?.z == null ? (rhr?.mean7 == null ? "Pas de mesure" : "—") : rhr.z >= 1 ? "En hausse" : rhr.z <= -1 ? "En baisse" : "Stable"}
          stateColor={rhr?.z != null && rhr.z >= 1 ? C.o : rhr?.mean7 != null ? C.g : C.tx3}
          foot={rhr?.baselineMean != null ? `Habitude ${fmtDec(rhr.baselineMean, 1)}` : "Habitude —"}
        />
        <Tile
          label="Ressenti" value={scoreNow != null ? String(Math.round(scoreNow)) : "—"} unit={scoreNow != null ? "/ 100" : undefined}
          state={scoreNow == null ? "Pas de saisie ce matin" : scoreHabit != null && scoreNow < scoreHabit - 5 ? "Un peu bas" : "Dans ses habitudes"}
          stateColor={scoreNow == null ? C.tx3 : scoreHabit != null && scoreNow < scoreHabit - 5 ? C.o : C.g}
          foot={scoreHabit != null ? `Habitude ${Math.round(scoreHabit)}` : "Habitude —"}
        />
        <Tile
          label="Courbatures" value={doms?.zone ?? "—"}
          state={doms ? `${doms.level}${doms.days7 ? ` · ${doms.days7} j / 7` : ""}` : "Aucune signalée"}
          stateColor={doms ? C.o : C.g}
          foot={doms?.after ? `Après ${doms.after}` : " "}
        />
      </div>

      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ ...KICKER, color: C.tx2 }}>Ce matin</span>
          <button type="button" onClick={() => setDetail(true)} style={{ background: "none", border: "none", color: C.ac, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Détails ›</button>
        </div>
        {todayEntry ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {[...WELLNESS_ITEMS.map((k) => ({ l: WELLNESS_ITEM_SHORT[k], v: todayEntry.items[k] })), { l: "Envie", v: todayEntry.envie }].map((x) => (
                <div key={x.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderRadius: 8, background: C.s2, fontSize: 12 }}>
                  <span style={{ color: C.tx2 }}>{x.l}</span>
                  <span style={{ ...MONO, color: x.v != null && x.v <= 2 ? C.o : C.tx }}>{x.v ?? "—"}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.tx2 }}>
              Douleur <span style={{ ...MONO, color: (todayEntry.pain ?? 0) > 3 ? C.o : C.tx }}>{todayEntry.pain ?? "—"}</span>
              {" · "}Malade <span style={{ color: todayEntry.sick ? C.r : C.tx }}>{todayEntry.sick == null ? "—" : todayEntry.sick ? "oui" : "non"}</span>
              {todayEntry.injuryNote ? <> · « {todayEntry.injuryNote} »</> : null}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.tx3 }}>Pas encore de wellness aujourd’hui.</div>
        )}
      </div>

      <button type="button" onClick={() => setDetail(true)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12,
        background: "transparent", border: `1px solid ${C.brdL}`, color: C.tx, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer",
      }}>
        Détails sur 28 jours <Chevron />
      </button>
      {detail && (
        <WellnessDetailView
          dailyData={daily}
          avgWellness={null}
          sleepGoals={{ bedtime: goals.sleepBedtime, wakeup: goals.sleepWakeup, durationTarget: goals.sleepTarget }}
          onClose={() => setDetail(false)}
        />
      )}
    </PhonePage>
  );
}
