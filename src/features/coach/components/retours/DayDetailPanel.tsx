import { useState } from "react";
import { DOMS_LEVEL_COLOR, DOMS_LEVEL_LABEL, PAIN_COLORS, levelsList } from "@/lib/bodyZones";
import { WatchRunTag } from "@/features/shared/components/WatchRunTag";
import { X, Moon, Sunrise, CheckCircle2, Zap, ChevronDown, ChevronUp, Footprints, BarChart2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { wellnessView } from "@/lib/wellness";
import { WELLNESS_ITEMS, WELLNESS_ITEM_LABEL } from "@shared/domain/wellness";
import { SessionEvolutionDrawer } from "./SessionEvolutionDrawer";
import { VideoRequestsList } from "./VideoRequestsList";
import { painList } from "@/lib/painZones";
import { SessionPainDetail } from "@/features/shared/components/SessionPain";
import type { WellnessDay, WorkoutDetail, EnergySessionDetail, FreeActivityDetail } from "@/features/shared/types/retours.types";

/** Activité libre : patine de la charte (ancienne sarcelle). */
const SECTION_LABEL = "text-[9px] font-bold uppercase tracking-[0.4px] text-agon-tx3";
const SET_ROW = "flex items-center gap-1.5 rounded-[5px] border px-1.5 py-[3px]";
const SET_NUM = "min-w-[18px] text-[9px] font-bold text-agon-tx3";
const SET_KG = "text-[10px] font-bold text-agon-tx";
const SET_REPS = "text-[10px] text-agon-tx";
const SET_RIR = "text-[9px] text-agon-tx3";
const HEAD_ROW = "flex items-center justify-between px-3 py-2.5";

interface DayDetailPanelProps {
  date: string;           // "yyyy-MM-dd"
  wellness: WellnessDay | null;
  workouts?: WorkoutDetail[];
  energySessions?: EnergySessionDetail[];
  freeActivities?: FreeActivityDetail[];
  onClose: () => void;
  /** Pour ouvrir la vue évolutive (Prévu / Réalisé / Séance +1) */
  athleteId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHour(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}h${m === 0 ? "00" : String(m).padStart(2, "0")}`;
}

function decimalHour(h: number, m: number): number {
  return h + m / 60;
}

/** Simulate bedtime/wakeup from sommeil score 0-10 when no real data */
function simulateSleep(sommeil: number): { bedH: number; bedM: number; upH: number; upM: number } {
  const bedDec = 22 + (5 - sommeil) * 0.7;  // 22h–24.8h (sommeil 1-5)
  const upDec  = 6.5 + (5 - sommeil) * 0.3; // 6.5h–7.7h
  const toHM = (dec: number) => {
    const norm = dec >= 24 ? dec - 24 : dec;
    return { h: Math.floor(norm), m: Math.round((norm - Math.floor(norm)) * 60) };
  };
  const bed = toHM(bedDec);
  const up  = toHM(upDec);
  return { bedH: bed.h, bedM: bed.m, upH: up.h, upM: up.m };
}

/** Note 1-5 (5 = mieux) : vert ≥ 4, orange 3, rouge ≤ 2. */
function itemTone(v: number): { text: string; bar: string } {
  if (v >= 4) return { text: "text-agon-succes", bar: "bg-agon-succes" };
  if (v >= 3) return { text: "text-agon-alerte", bar: "bg-agon-alerte" };
  return { text: "text-agon-erreur", bar: "bg-agon-erreur" };
}

// ── Component bars ────────────────────────────────────────────────────────────

function ComponentBar({ label, value, max = 5, tone }: { label: string; value: number; max?: number; tone: { text: string; bar: string } }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-[11px] text-agon-tx3">{label}</span>
        <span className={cn("text-[11px] font-bold", tone.text)}>
          {value}<span className="text-[9px] text-agon-tx3">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-agon-s2">
        <div className={cn("h-full rounded-[3px] [transition:width_400ms_ease]", tone.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Sleep tunnel visualization ────────────────────────────────────────────────

function SleepTunnel({ wellness }: { wellness: WellnessDay }) {
  const hasReal = !!(wellness.coucher && wellness.reveil);

  let bedH: number, bedM: number, upH: number, upM: number;
  if (hasReal) {
    bedH = wellness.coucher!.h; bedM = wellness.coucher!.m;
    upH  = wellness.reveil!.h;  upM  = wellness.reveil!.m;
  } else {
    const sim = simulateSleep(wellness.sommeil);
    bedH = sim.bedH; bedM = sim.bedM; upH = sim.upH; upM = sim.upM;
  }

  const bedDec = decimalHour(bedH, bedM);
  const upDec  = decimalHour(upH,  upM);

  // Sleep duration — prefer exact minute arithmetic when real times are available
  let durH: number, durM: number;
  if (hasReal) {
    const bedMin  = bedH * 60 + bedM;
    const upMin   = upH * 60 + upM;
    const totalMin = upMin <= bedMin ? upMin + 1440 - bedMin : upMin - bedMin;
    durH = Math.floor(totalMin / 60);
    durM = totalMin % 60;
  } else if (wellness.sleepDur != null) {
    durH = Math.floor(wellness.sleepDur);
    durM = Math.round((wellness.sleepDur - durH) * 60);
  } else {
    const upAdjusted = upDec < bedDec ? upDec + 24 : upDec;
    const durDec = upAdjusted - bedDec;
    durH = Math.floor(durDec);
    durM = Math.round((durDec - durH) * 60);
  }

  // Tunnel bar: 20h to 10h(+1) = 14h span
  const RANGE_START = 20;
  const RANGE_END   = 34; // 10h next day
  const RANGE       = RANGE_END - RANGE_START;
  const bedAdj  = bedDec < 12 ? bedDec + 24 : bedDec;  // if ~00h, push to 24h+
  const upAdjusted = upDec  < 12 ? upDec + 24  : upDec;

  const sleepStart = Math.max(RANGE_START, bedAdj);
  const sleepEnd   = Math.min(RANGE_END,   upAdjusted);
  const leftPct    = ((sleepStart - RANGE_START) / RANGE) * 100;
  const widthPct   = Math.max(0, ((sleepEnd - sleepStart) / RANGE) * 100);

  return (
    <div>
      {/* Meta row */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-[5px]">
          <Moon size={11} color={C.b} />
          <span className="text-[12px] font-bold text-agon-tx">{fmtHour(bedH, bedM)}</span>
          <span className="text-[10px] text-agon-tx3">coucher</span>
        </div>
        <div className="flex items-center gap-[5px]">
          <Sunrise size={11} color={C.y} />
          <span className="text-[12px] font-bold text-agon-tx">{fmtHour(upH, upM)}</span>
          <span className="text-[10px] text-agon-tx3">lever</span>
        </div>
        <div className="ml-auto text-[11px] font-bold text-agon-info">
          {durH}h{durM > 0 ? String(durM).padStart(2, "0") : "00"}
          <span className="ml-0.5 text-[9px] font-normal text-agon-tx3">de sommeil</span>
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-5 overflow-hidden rounded-[4px] bg-agon-s1">
        <div className="absolute h-full rounded-[4px] bg-agon-info opacity-85" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
      </div>

      {/* Ticks */}
      <div className="mt-1 flex justify-between">
        {["20h", "22h", "00h", "02h", "04h", "06h", "08h", "10h"].map((t) => (
          <span key={t} className="text-[8px] text-agon-tx3">{t}</span>
        ))}
      </div>

      {!hasReal && (
        <div className="mt-1.5 text-[9px] italic text-agon-tx3">
          * Horaires estimés — athlète n'a pas renseigné les heures exactes
        </div>
      )}
    </div>
  );
}

// ── DOMS ──────────────────────────────────────────────────────────────────────

function DomsDisplay({ wellness }: { wellness: WellnessDay }) {
  const leveled = levelsList(wellness.domsLevels);
  const zones = wellness.domsZones;
  // Carte douleur (2ᵉ corps) : une pastille rouge par zone ; ancienne saisie : la note seule.
  const painZones = painList(wellness.painLevels).filter((z) => z.level != null && z.level > 0);
  const extras = [
    wellness.pain != null && painZones.length === 0 ? `Douleur ${wellness.pain}/10` : null,
    wellness.envie != null ? `Envie ${wellness.envie}/5` : null,
    wellness.sick ? "Malade" : null,
  ].filter(Boolean) as string[];
  if (leveled.length > 0 || extras.length > 0 || painZones.length > 0) {
    return (
      <div className="mt-4">
        <div className={cn(SECTION_LABEL, "mb-1.5")}>
          Corps
        </div>
        <div className="flex flex-wrap gap-[5px]">
          {leveled.map((z) => (
            <span key={z.id} className="inline-flex items-center gap-[5px] rounded-full border px-[9px] py-[3px] text-[10px] text-agon-tx" style={{
              background: DOMS_LEVEL_COLOR[z.level] + "1F", borderColor: DOMS_LEVEL_COLOR[z.level] + "55",
            }}>
              <span className="size-[7px] rounded-full" style={{ background: DOMS_LEVEL_COLOR[z.level] }} />
              {z.label} · {DOMS_LEVEL_LABEL[z.level].toLowerCase()}
            </span>
          ))}
          {painZones.map((z) => (
            <span key={"p-" + z.id} className="inline-flex items-center gap-[5px] rounded-full border px-[9px] py-[3px] text-[10px] text-agon-tx" style={{
              background: PAIN_COLORS[z.level!] + "1F", borderColor: PAIN_COLORS[z.level!] + "55",
            }}>
              <span className="size-[7px] rounded-full" style={{ background: PAIN_COLORS[z.level!] }} />
              Douleur {z.label.toLowerCase()} · {z.level}/10
            </span>
          ))}
          {extras.map((t) => (
            <span key={t} className="rounded-full border border-agon-brd bg-agon-s2 px-[9px] py-[3px] text-[10px] text-agon-tx2">{t}</span>
          ))}
        </div>
        {leveled.length > 0 && wellness.domsWorkout && (
          <div className="mt-1.5 text-[11px] text-agon-tx2">
            Après la séance de la veille : <span className="text-agon-tx">{wellness.domsWorkout.name ?? "séance"}</span>
          </div>
        )}
      </div>
    );
  }
  if (!zones?.length) return null;

  return (
    <div className="mt-4">
      <div className={cn(SECTION_LABEL, "mb-1.5")}>
        Courbatures
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {zones.map((zone) => (
          <span key={zone} className="rounded-[6px] border border-agon-alerte/25 bg-agon-alerte-doux px-[9px] py-[3px] text-[10px] text-agon-alerte">
            {zone}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Workout section ───────────────────────────────────────────────────────────

function fmtDuration(s: number | null): string | null {
  if (s == null) return null;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, "0") : ""}`;
}

function WorkoutCard({ w, onOpenEvolution }: { w: WorkoutDetail; onOpenEvolution?: () => void }) {
  const dur = fmtDuration(w.duration_s);

  const exIds = [...new Set([
    ...w.planned_exercises.map((p) => p.exercise_id),
    ...w.performed_exercises.map((p) => p.exercise_id),
  ])];

  return (
    <div className="mb-2 rounded-[4px] bg-agon-s2 px-3 py-2.5">
      {/* Header */}
      <div className={cn("flex items-center justify-between", exIds.length > 0 && "mb-2.5")}>
        <div className="flex items-center gap-[7px]">
          <CheckCircle2 size={13} color={w.status === "completed" ? C.g : C.tx3} />
          <span className="text-[12px] font-bold text-agon-tx">{w.session_name}</span>
          {w.occurrence != null && (
            <span className="text-[10px] font-bold text-agon-tx3">Séance n°{w.occurrence}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {dur && <span className="text-[10px] text-agon-tx3">{dur}</span>}
          {w.rpe_score != null && (
            <span className="rounded-[6px] bg-agon-accent/[0.125] px-[7px] py-px text-[10px] font-bold text-agon-accent">
              RPE {w.rpe_score}
            </span>
          )}
          {onOpenEvolution && (
            <button
              onClick={onOpenEvolution}
              title="Prévu / Réalisé / Séance +1"
              className="flex cursor-pointer items-center gap-1 rounded-[4px] border border-agon-accent/[0.376] bg-agon-accent/[0.078] px-2 py-[3px] text-[10px] font-bold text-agon-accent"
            >
              <BarChart2 size={11} /> Évolution
            </button>
          )}
        </div>
      </div>

      {w.pain_levels && Object.keys(w.pain_levels).length > 0 && (
        <div className="mb-2.5"><SessionPainDetail levels={w.pain_levels} note={w.pain_note} /></div>
      )}

      {w.video_requests?.length > 0 && (
        <div className="mb-2.5"><VideoRequestsList requests={w.video_requests} /></div>
      )}

      {/* Exercises: planned target + actual sets merged */}
      {exIds.length > 0 && (
        <div className="flex flex-col gap-2">
          {exIds.map((exId) => {
            const planned   = w.planned_exercises.find((p) => p.exercise_id === exId);
            const performed = w.performed_exercises.find((p) => p.exercise_id === exId);
            const name      = planned?.exercise_name ?? performed?.exercise_name ?? "Exercice";
            const plannedMinReps = planned?.reps_range ? parseInt(planned.reps_range.match(/^(\d+)/)?.[1] ?? "0") || undefined : undefined;
            return (
              <div key={exId}>
                <div className="mb-1 flex items-center gap-[5px]">
                  <span className="text-[10px] font-bold text-agon-tx2">{name}</span>
                  {planned?.method && (
                    <span className="rounded-[3px] bg-agon-accent/[0.12] px-1 py-px text-[7px] font-semibold text-agon-accent">
                      {planned.method}
                    </span>
                  )}
                </div>
                {/* Planned — chips */}
                {planned && planned.sets > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {[
                      { l: "Séries", v: String(planned.sets) },
                      { l: planned.is_iso ? "Durée" : "Reps", v: planned.reps_range ?? "—" },
                      ...(planned.kg != null ? [{ l: "Charge", v: `${planned.kg}kg` }] : []),
                      ...(planned.rir != null ? [{ l: "RIR", v: String(planned.rir) }] : []),
                    ].map(({ l, v }) => (
                      <div key={l} className="flex flex-col gap-px rounded-[5px] border border-agon-brd-l bg-agon-s1 px-1.5 py-[3px]">
                        <span className="text-[7px] font-bold uppercase tracking-[0.3px] text-agon-tx3">{l}</span>
                        <span className="text-[9px] font-bold text-agon-tx">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Actual sets — colored rows */}
                {performed ? (
                  <div className="flex flex-col gap-0.5">
                    {performed.sets.map((s, i) => {
                      if (!s.done) {
                        const hasData = s.kg != null || s.reps != null;
                        return (
                          <div key={i} className={cn(SET_ROW, "border-agon-erreur/40 bg-agon-erreur/10")}>
                            <span className={SET_NUM}>S{i + 1}</span>
                            {hasData ? (
                              <>
                                {s.kg != null && <span className={SET_KG}>{s.kg}kg</span>}
                                {s.reps != null && <span className={SET_REPS}>× {s.reps}</span>}
                                {s.rir != null && <span className={SET_RIR}>RIR {s.rir}</span>}
                                <span className="ml-auto text-[10px] font-bold text-agon-erreur">✗</span>
                              </>
                            ) : (
                              <span className="text-[9px] text-agon-erreur">Non réalisé</span>
                            )}
                          </div>
                        );
                      }
                      const ok = plannedMinReps === undefined || (s.reps != null && s.reps >= plannedMinReps);
                      return (
                        <div key={i} className={cn(SET_ROW, ok ? "border-agon-succes/25 bg-agon-succes/10" : "border-agon-alerte/25 bg-agon-alerte/10")}>
                          <span className={SET_NUM}>S{i + 1}</span>
                          {s.kg != null && <span className={SET_KG}>{s.kg}kg</span>}
                          {s.reps != null && <span className={SET_REPS}>× {s.reps}</span>}
                          {s.rir != null && <span className={SET_RIR}>RIR {s.rir}</span>}
                          <span className={cn("ml-auto text-[10px] font-bold", ok ? "text-agon-succes" : "text-agon-alerte")}>{ok ? "✓" : "~"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[5px] border border-agon-erreur/40 bg-agon-erreur/10 px-2 py-[5px] text-[9px] font-semibold text-agon-erreur">
                    Aucune série enregistrée
                  </div>
                )}
                {/* Athlete comment per exercise */}
                {w.athlete_exercise_comments?.[exId] && (
                  <div className="mt-[3px] rounded-[4px] border border-agon-alerte/30 bg-agon-alerte/10 px-1.5 py-[3px] text-[9px] italic text-agon-tx2">
                    {w.athlete_exercise_comments[exId]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Athlete session comment + forme */}
      {(w.athlete_forme != null || w.athlete_session_comment) && (
        <div className="mt-2 rounded-[6px] bg-agon-alerte/[0.08] px-2 py-1.5">
          {w.athlete_forme != null && (
            <div className={cn("text-[10px]", w.athlete_session_comment && "mb-[3px]")}>
              <span className="text-agon-tx3">Forme : </span>
              <span className={cn("font-bold", w.athlete_forme >= 4 ? "text-agon-succes" : w.athlete_forme >= 3 ? "text-agon-alerte" : "text-agon-erreur")}>
                {w.athlete_forme}/5
              </span>
            </div>
          )}
          {w.athlete_session_comment && (
            <div className="text-[10px] italic text-agon-tx2">« {w.athlete_session_comment} »</div>
          )}
        </div>
      )}

      {/* Note */}
      {w.notes && (
        <div className="mt-2 text-[11px] italic text-agon-tx3">"{w.notes}"</div>
      )}
    </div>
  );
}

/** Séance d'énergie du jour : liseré, pastille de type (12,5 %) et statut. */
const ENERGY_TONE = {
  partial: { bar: "border-l-agon-info",   chip: "bg-agon-info/[0.125] text-agon-info",     text: "text-agon-info" },
  done:    { bar: "border-l-agon-succes", chip: "bg-agon-succes/[0.125] text-agon-succes", text: "text-agon-succes" },
  planned: { bar: "border-l-agon-alerte", chip: "bg-agon-alerte/[0.125] text-agon-alerte", text: "text-agon-alerte" },
};

function EnergyCard({ e }: { e: EnergySessionDetail }) {
  const [open, setOpen] = useState(false);
  const dur      = e.duration_min != null ? `${e.duration_min}min` : null;
  const dist     = e.distance_m != null
    ? e.distance_m >= 1000 ? `${(e.distance_m / 1000).toFixed(1)}km` : `${e.distance_m}m`
    : null;
  const col      = e.partial ? C.b : e.completed ? C.g : C.o;
  const tone     = e.partial ? ENERGY_TONE.partial : e.completed ? ENERGY_TONE.done : ENERGY_TONE.planned;
  const blEntries  = e.block_logs ? Object.entries(e.block_logs) : [];
  const doneCount  = blEntries.filter(([, b]) => b.done).length;
  const totalCount = blEntries.length;
  const hasDetail  = blEntries.length > 0 || !!e.note || e.rpe_score != null;

  return (
    <div className={cn("mb-2 overflow-hidden rounded-[4px] border-l-[3px] bg-agon-s2", tone.bar)}>
      {/* Header */}
      <div
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(HEAD_ROW, hasDetail ? "cursor-pointer" : "cursor-default")}
      >
        <div className="flex min-w-0 items-center gap-[7px]">
          <Zap size={13} color={col} className="flex-none" />
          <span className="truncate text-[12px] font-bold text-agon-tx">
            {e.session_label}
          </span>
          {e.session_kind && (
            <span className={cn("flex-none rounded-[5px] px-1.5 py-px text-[9px] font-bold", tone.chip)}>
              {e.session_kind}
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-1.5">
          {dur  && <span className="text-[10px] text-agon-tx3">{dur}</span>}
          {dist && <span className="text-[10px] text-agon-tx3">{dist}</span>}
          {e.rpe_score != null && <span className="text-[10px] font-bold text-agon-tx3">RPE {e.rpe_score}</span>}
          {e.watch_run && !e.completed && !e.partial
            ? <WatchRunTag match={e.watch_run} size={9} />
            : (
              <span className={cn("text-[9px] font-bold", tone.text)}>
                {e.partial ? `Partielle ${doneCount}/${totalCount}` : e.completed ? "✓" : "Planifiée"}
              </span>
            )}
          {e.watch_run && (e.completed || e.partial) && <WatchRunTag match={e.watch_run} size={9} />}
          {hasDetail && (open ? <ChevronUp size={12} color={C.tx3} /> : <ChevronDown size={12} color={C.tx3} />)}
        </div>
      </div>

      {e.pain_levels && Object.keys(e.pain_levels).length > 0 && (
        <div className="px-3 pb-2"><SessionPainDetail levels={e.pain_levels} note={e.pain_note} /></div>
      )}

      {/* Expanded: blocks */}
      {open && (
        <div className="flex flex-col gap-1 border-t border-agon-brd px-3 py-2">
          {blEntries.map(([key, b], i) => (
            <div key={key} className="flex items-center gap-2 text-[11px]">
              <span className={cn(
                "flex size-[18px] flex-none items-center justify-center rounded-full border text-[9px] text-agon-tx",
                b.done ? "border-agon-succes bg-agon-succes" : "border-agon-brd bg-transparent",
              )}>
                {b.done ? "✓" : ""}
              </span>
              <span className={b.done ? "text-agon-tx" : "text-agon-tx3"}>Bloc {i + 1}</span>
              {b.note && <span className="text-[9px] italic text-agon-tx3">{b.note}</span>}
            </div>
          ))}
          {e.note && (
            <div className="mt-1 text-[11px] italic text-agon-tx3">"{e.note}"</div>
          )}
        </div>
      )}
    </div>
  );
}

function FreeActivityCard({ f }: { f: FreeActivityDetail }) {
  const [open, setOpen] = useState(false);
  const hasDetail = f.intensity != null || !!f.note;

  return (
    <div className="mb-2 overflow-hidden rounded-[4px] border-l-[3px] border-l-agon-patine bg-agon-patine/[0.082]">
      {/* Header */}
      <div
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(HEAD_ROW, hasDetail ? "cursor-pointer" : "cursor-default")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-none text-[16px]">{f.sportEmoji ?? "course"}</span>
          <div className="min-w-0">
            <span className="block truncate text-[12px] font-bold text-agon-tx">
              {f.name}
            </span>
            <span className="text-[9px] font-semibold text-agon-patine">{f.sport ?? "Activité libre"}</span>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          {f.duration != null && <span className="text-[10px] text-agon-tx3">{f.duration} min</span>}
          {f.intensity != null && <span className="text-[10px] font-bold text-agon-patine">RPE {f.intensity}/10</span>}
          {hasDetail && (open ? <ChevronUp size={12} color={C.tx3} /> : <ChevronDown size={12} color={C.tx3} />)}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="flex flex-col gap-1 border-t border-agon-patine/[0.188] px-3 py-2">
          {f.intensity != null && (
            <div className="text-[11px] font-semibold text-agon-patine">
              RPE {f.intensity}/10
            </div>
          )}
          {f.note && (
            <div className="text-[11px] italic text-agon-tx3">"{f.note}"</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DayDetailPanel({ date, wellness, workouts = [], energySessions = [], freeActivities = [], onClose, athleteId }: DayDetailPanelProps) {
  const [evolutionWorkout, setEvolutionWorkout] = useState<WorkoutDetail | null>(null);
  const dateLabel = format(parseISO(date), "EEEE d MMMM", { locale: fr });
  const titleCase = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  // Score, palier et réponse « blessé/malade » : domaine wellness (recalculés).
  const view      = wellness ? wellnessView(wellness) : null;
  const scoreCol  = view ? view.reco.c : C.tx3;

  const completedWorkouts = workouts.filter((w) => w.status === "completed");

  return (
    <>
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/55" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-[520px] overflow-y-auto rounded-t-[6px] bg-agon-s1 px-5 pb-10 pt-5" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-extrabold text-agon-tx">{titleCase}</div>
            <div className="text-[11px] text-agon-tx3">
              {[
                wellness ? "Forme" : null,
                completedWorkouts.length > 0 ? `${completedWorkouts.length} séance${completedWorkouts.length > 1 ? "s" : ""}` : null,
                energySessions.length > 0 ? `${energySessions.length} énergie` : null,
                freeActivities.length > 0 ? `${freeActivities.length} activité${freeActivities.length > 1 ? "s" : ""} libre${freeActivities.length > 1 ? "s" : ""}` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd bg-agon-s2 text-agon-tx3"><X size={16} /></button>
        </div>

        {/* Wellness section */}
        {wellness && (
          <>
            {/* Score circle + summary */}
            <div className="mb-5 flex items-center gap-5">
              <div className="flex size-[72px] flex-none flex-col items-center justify-center rounded-full border-[3px]" style={{ borderColor: scoreCol, background: scoreCol + "15" }}>
                <span className="text-[22px] font-black leading-none" style={{ color: scoreCol }}>{view?.score ?? "—"}</span>
                <span className="text-[9px] text-agon-tx3">/100</span>
              </div>
              <div>
                <div className="mb-1 text-[13px] font-bold" style={{ color: scoreCol }}>
                  {view?.reco.label ?? "—"}
                </div>
                <div className="text-[11px] text-agon-tx3">
                  {view?.score != null ? view.reco.desc : "Saisie incomplète"}
                </div>
              </div>
            </div>

            {/* Réponse « Es-tu blessé/malade ? » */}
            {view?.injuryNote && (
              <div className="mb-4 rounded-[4px] border border-agon-erreur/25 bg-agon-erreur/[0.071] px-3 py-2.5">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.4px] text-agon-erreur">
                  Blessé / malade
                </div>
                <div className="text-[12px] text-agon-tx leading-normal">{view.injuryNote}</div>
              </div>
            )}

            {/* Les 5 notes, avec les intitulés de la saisie athlète (5 = mieux) */}
            <div className="mb-1 flex flex-col gap-2.5">
              {WELLNESS_ITEMS.map((k) => {
                const v = view?.items[k];
                return v != null
                  ? <ComponentBar key={k} label={WELLNESS_ITEM_LABEL[k]} value={v} tone={itemTone(v)} />
                  : null;
              })}
            </div>

            {/* DOMS */}
            <DomsDisplay wellness={wellness} />

            {/* Sleep tunnel */}
            <div className="mt-5 rounded-[4px] bg-agon-s2 px-3.5 py-3">
              <div className={cn(SECTION_LABEL, "mb-2.5")}>
                Tunnel de sommeil
              </div>
              <SleepTunnel wellness={wellness} />
            </div>
          </>
        )}

        {/* Workouts section */}
        {(completedWorkouts.length > 0 || energySessions.length > 0 || freeActivities.length > 0) && (
          <div className={cn(wellness && "mt-5")}>
            <div className={cn(SECTION_LABEL, "mb-2.5")}>
              Séances réalisées
            </div>
            {completedWorkouts.map((w) => (
              <WorkoutCard
                key={w.id}
                w={w}
                onOpenEvolution={athleteId && w.session_id ? () => setEvolutionWorkout(w) : undefined}
              />
            ))}
            {energySessions.map((e) => <EnergyCard key={e.id} e={e} />)}
            {freeActivities.map((f) => <FreeActivityCard key={f.id} f={f} />)}
          </div>
        )}

      </div>
    </div>

    {/* Vue évolutive : Prévu / Réalisé / Séance +1 */}
    {evolutionWorkout && athleteId && evolutionWorkout.session_id && (
      <SessionEvolutionDrawer
        athleteId={athleteId}
        sessionId={evolutionWorkout.session_id}
        occurrence={evolutionWorkout.occurrence ?? 1}
        onClose={() => setEvolutionWorkout(null)}
      />
    )}
    </>
  );
}
