import { useMemo } from "react";
import { Check, ChevronLeft, ChevronRight, Watch } from "lucide-react";
import { C } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { DISPLAY, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { plannedVsDoneRows, readBlocks, type Refs } from "@/lib/energy/energyRun";
import { providerAttribution } from "@/lib/activityDisplay";
import { fmtHour } from "@/lib/seance";
import type { DoneActivity } from "@/lib/plannedVsDone";
import type { EnergySessionRow } from "@/types/energy";

/**
 * Séance d'énergie faite avec une montre (planche EnergieTel, écran 05) :
 * prévu / fait sans tout relire, accès aux tours, puis « Noter ma séance ».
 * Toute donnée de montre porte son attribution (« Garmin Forerunner 265 »).
 */
export function EnergyDoneView({
  session, refs, activity, isCompleted, onClose, onNote, onLaps, onDetail,
}: {
  session: EnergySessionRow;
  refs: Refs;
  activity: DoneActivity;
  isCompleted: boolean;
  onClose: () => void;
  onNote?: () => void;
  onLaps: () => void;
  onDetail: () => void;
}) {
  const plannedS = useMemo(
    () => session.total_duration_s ?? readBlocks(session.intervals ?? [], refs).reduce((a, b) => a + b.durationS, 0),
    [session, refs],
  );
  const rows = plannedVsDoneRows(
    { durationS: plannedS, distanceM: session.total_distance_m },
    activity,
  );
  const source = providerAttribution(activity.source, activity.deviceName);
  const fait = TYPE_COLOR.fait;

  return (
    <div role="dialog" aria-label={session.name} style={{
      position: "fixed", inset: 0, zIndex: 61, background: C.bg, color: C.tx,
      display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto",
    }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" aria-label="Retour" onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none",
        }}><ChevronLeft size={16} color={C.tx} /></button>
        <span style={{ ...KICKER, flex: 1 }}>Séance d'énergie</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill bg={TYPE_COLOR.energie}>Énergie</Pill>
          {isCompleted && <Pill bg={fait}><Check size={12} strokeWidth={2.6} aria-hidden />&nbsp;Faite</Pill>}
        </div>
        <h2 style={{ ...DISPLAY, margin: 0, fontWeight: 400, fontSize: 26, lineHeight: 1.1 }}>{session.name}</h2>
        <span style={{ ...MONO, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.tx2, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.brdL}` }}>
          <Watch size={13} color={fait} aria-hidden /> Reçue de {source}{activity.startedAt ? ` · ${fmtHour(activity.startedAt)}` : ""}
        </span>

        <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 16, padding: "6px 14px 4px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 1.1fr", padding: "8px 0" }}>
            <span /><span style={{ ...LABEL, textAlign: "right" }}>Prévu</span><span style={{ ...LABEL, color: C.tx2, textAlign: "right" }}>Fait</span>
          </div>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 1.1fr", alignItems: "baseline", padding: "10px 0", borderTop: `1px solid ${C.brd}` }}>
              <span style={{ fontSize: 14, color: C.tx2 }}>{r.label}</span>
              <span style={{ ...MONO, fontSize: 14, color: C.tx2, textAlign: "right" }}>{r.planned}</span>
              <span style={{ ...MONO, fontSize: 16, textAlign: "right" }}>{r.done}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.tx3 }}>Données : {source}</div>

        <button type="button" onClick={onLaps} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", borderRadius: 14,
          background: C.s1, border: `1px solid ${C.brd}`, color: C.tx, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit",
        }}>Voir les tours, la FC et l'allure<ChevronRight size={16} color={C.tx2} /></button>

        <button type="button" onClick={onDetail} style={{
          alignSelf: "flex-start", background: "transparent", border: 0, padding: 0, color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>Voir la séance prévue ›</button>
      </div>

      {onNote && (
        <div style={{ padding: "14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: `1px solid ${C.brd}`, background: C.bg }}>
          <button type="button" onClick={onNote} style={{
            width: "100%", height: 52, border: 0, borderRadius: 12, background: C.ac, color: C.ink,
            fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Noter ma séance</button>
        </div>
      )}
    </div>
  );
}

function Pill({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      ...MONO, height: 24, padding: "0 9px", borderRadius: 999, background: bg, color: C.ink, fontSize: 11,
      letterSpacing: "0.06em", fontWeight: 500, display: "inline-flex", alignItems: "center", textTransform: "uppercase",
    }}>{children}</span>
  );
}
