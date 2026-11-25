import { estimatedSeconds, flattenRun, fmtChrono, fmtDur, fmtPace, isRecovery, profileBars, readBlocks, type Refs, type Tint } from "@/lib/energy/energyRun";
import type { BlockLogs, EnergyStep } from "@/types/energy";
import type { SessionBlock } from "@/types/specific";
import { nf, shareKicker, type ProfileBarSpec, type ShareBadge, type ShareCard, type ShareOptions, type ShareRow, type ShareSection, type ShareStat } from "./sessionShare";

/**
 * Carte « Partage de séance » d'une séance d'énergie ou de spécifique (HYROX,
 * WOD, classique), maquette du 25/11/2026.
 * - Avant : profil de la séance + déroulé (énergie), enchaînement (spécifique).
 * - Faite avec une montre : distance ou temps total en gros, allure de chaque
 *   répétition, temps dans les zones (énergie) ; temps de chaque segment et
 *   écart au prévu (spécifique).
 * - Faite sans montre : le déroulé prévu, chaque bloc coché, durée et RPE
 *   saisis (Hugo, 25/11). Une case sans donnée n'apparaît pas.
 * Les mesures de montre ne servent qu'à dessiner l'image, sur le téléphone.
 */

export type ShareLapKind = "run" | "station" | "rest" | "transition";

export interface ShareLap {
  name: string;
  kind: ShareLapKind;
  durationS: number | null;
  distanceM: number | null;
  avgPaceSPerKm: number | null;
  /** Phase posée sur le tour (« Effort »…), si connue. */
  phase?: "warmup" | "work" | "recovery" | "cooldown" | null;
  /** Prévu du segment rattaché : « 1 000 m », « 50 m · 102 kg ». */
  plannedLabel?: string | null;
  plannedDurationS?: number | null;
}

export interface ShareActivity {
  distanceM: number | null;
  durationS: number | null;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  /** Course, trail, marche : l'allure a du sens. */
  isRun: boolean;
  /** Parts de temps par zone (0-100), `null` sans FC. */
  zoneShares: number[] | null;
}

export interface EnergyShareSession {
  name: string;
  intervals: EnergyStep[] | null;
  total_duration_s: number | null;
  total_distance_m: number | null;
  format?: string | null;
  classique_structure?: { blocks: SessionBlock[] } | null;
}

export interface EnergyShareInput {
  kind: "energie" | "specifique";
  done: boolean;
  day: string | null;
  session: EnergyShareSession;
  refs?: Refs;
  /** Saisie de l'athlète (faite). */
  rpe?: number | null;
  durationMin?: number | null;
  distanceKm?: number | null;
  blockLogs?: BlockLogs | null;
  comment?: string | null;
  activity?: ShareActivity | null;
  laps?: ShareLap[] | null;
  /** Attribution des données de montre (« Garmin Forerunner 265 »), obligatoire dès qu'elles sont affichées. */
  source?: string | null;
  athleteFirstName: string | null;
  coach: string | null;
  accent: string;
  colors: {
    tint: (t: Tint) => string;
    /** Couleurs des zones FC d'un modèle à n zones. */
    zones: (n: number) => string[];
    success: string;
    error: string;
    muted: string;
  };
}

const ROLE_WORDS = /^\d+\s*·\s*/;

/** « 38 min », « 1 h 05 » : durée courte pour la colonne de droite. */
function shortDur(s: number): string | null {
  if (!(s > 0)) return null;
  const t = Math.round(s / 60);
  if (t < 1) return `${Math.round(s)} s`;
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, "0")}`;
}

function tintBadge(t: Tint, color: string): ShareBadge {
  if (t.kind === "zone") return { text: `Z${t.zone}`, color, shape: "chip" };
  return { color, shape: "ring" };
}

/** État d'un bloc d'après la saisie (`block_logs` : pas d'effort, suffixe `__rN` par répétition). */
function blockState(steps: readonly EnergyStep[], blockIndex: number, logs: BlockLogs | null | undefined): "done" | "partial" | "missed" {
  if (!logs) return "done";
  const ids = new Set(
    flattenRun(steps)
      .filter((f) => f.block === blockIndex && f.step.type === "interval" && f.step.role === "work")
      .map((f) => f.step.id),
  );
  const states = Object.entries(logs)
    .filter(([k]) => ids.has(k.replace(/__r\d+$/, "")))
    .map(([, v]) => v?.done !== false);
  if (states.length === 0 || states.every(Boolean)) return "done";
  return states.some(Boolean) ? "partial" : "missed";
}

function checkBadge(state: "done" | "partial" | "missed", c: EnergyShareInput["colors"]): ShareBadge {
  return state === "missed" ? { color: c.muted, shape: "miss" } : { color: c.success, shape: "check" };
}

/** Déroulé d'une liste de pas (énergie, bloc WOD) : une ligne par bloc de premier niveau. */
function stepRows(steps: readonly EnergyStep[], input: EnergyShareInput, checks: boolean): ShareRow[] {
  return readBlocks(steps, input.refs).map((b, i) => {
    const role = b.title.replace(ROLE_WORDS, "");
    const title = role === "Effort" || !b.phrase ? b.phrase || role : `${role} · ${b.phrase}`;
    const target = b.target ? `${b.target.value}${b.target.unit}`.trim() : null;
    const sub = [target, b.target?.secondary].filter(Boolean).join(" · ") || null;
    const state = checks ? blockState(steps, i, input.blockLogs) : null;
    return {
      badge: state ? checkBadge(state, input.colors) : tintBadge(b.tint, input.colors.tint(b.tint)),
      title,
      sub: state === "partial" ? [sub, "en partie"].filter(Boolean).join(" · ") : sub,
      right: shortDur(b.durationS),
      dim: state === "missed",
    };
  });
}

/** Barres du profil ; `labels` posées sur les pas d'effort, dans l'ordre, seulement si le compte est juste. */
function profile(steps: readonly EnergyStep[], input: EnergyShareInput, labels: string[] | null): ProfileBarSpec[] {
  const flat = flattenRun(steps);
  const bars = profileBars(steps, input.refs);
  const workIdx = flat
    .map((f, i) => (!isRecovery(f.step) && f.step.role === "work" ? i : -1))
    .filter((i) => i >= 0);
  const useLabels = labels && labels.length > 0 && labels.length === workIdx.length;
  return bars.map((b, i) => ({
    width: b.width,
    height: b.height,
    color: input.colors.tint(b.tint),
    label: useLabels ? labels![workIdx.indexOf(i)] ?? null : null,
  }));
}

function profileAxis(steps: readonly EnergyStep[], input: EnergyShareInput): [string, string, string] | null {
  const total = flattenRun(steps).reduce((a, f) => a + estimatedSeconds(f.step, input.refs), 0);
  if (!(total > 0)) return null;
  return ["0", shortDur(total / 2) ?? "", shortDur(total) ?? ""];
}

/** Temps dans les zones (minutes) à partir des parts et de la durée. */
function zonesSection(a: ShareActivity, input: EnergyShareInput): ShareSection | null {
  const shares = a.zoneShares;
  if (!shares?.length || !(a.durationS && a.durationS > 0) || shares.every((s) => !(s > 0))) return null;
  const colors = input.colors.zones(shares.length);
  return {
    type: "zones",
    label: "Temps dans les zones · FC",
    zones: shares.map((s, i) => ({
      label: `Z${i + 1}`,
      value: `${Math.round(((s > 0 ? s : 0) / 100) * (a.durationS ?? 0) / 60)}'`,
      share: s > 0 ? s : 0,
      color: colors[i] ?? input.colors.muted,
    })),
  };
}

function sumS(laps: ShareLap[], kind: ShareLapKind): number {
  return laps.filter((l) => l.kind === kind).reduce((a, l) => a + (l.durationS ?? 0), 0);
}

function deltaText(real: number | null, planned: number | null | undefined): { text: string; good: boolean } | null {
  if (real == null || !(planned && planned > 0)) return null;
  const d = Math.round(real - planned);
  if (d === 0) return { text: "= prévu", good: true };
  const abs = Math.abs(d);
  const t = abs >= 60 ? fmtChrono(abs) : `${abs} s`;
  return { text: `${d < 0 ? "−" : "+"}${t}`, good: d < 0 };
}

/** Lignes d'une séance classique (blocs de la banque) ; cochées si faite sans montre. */
function classiqueSections(blocks: SessionBlock[], input: EnergyShareInput, checks: boolean): ShareSection[] {
  return blocks.map((b) => {
    if (b.kind === "wod") {
      return { type: "rows" as const, label: b.title || "WOD", rows: stepRows(b.steps ?? [], input, checks) };
    }
    const logged = input.blockLogs?.[b.id];
    const state: "done" | "missed" = checks && logged?.done === false ? "missed" : "done";
    return {
      type: "rows" as const,
      label: b.title || "Bloc",
      rows: (b.items ?? []).map((it) => ({
        badge: checks ? checkBadge(state, input.colors) : { color: input.accent, shape: "dot" as const },
        title: it.name || "Exercice",
        right: it.prescription?.trim() || null,
        sub: it.rest?.trim() ? `récup ${it.rest.trim()}` : null,
        dim: state === "missed",
      })),
    };
  });
}

/** Ligne sous le titre quand la montre a fourni les données : attribution d'abord. */
function watchMeta(source: string | null | undefined, plannedMeta: string): string | null {
  return [source?.trim() || null, plannedMeta ? `prévu ${plannedMeta}` : null].filter(Boolean).join(" · ") || null;
}

export function buildEnergyShare(input: EnergyShareInput, opts: ShareOptions): ShareCard {
  const s = input.session;
  const steps = s.intervals ?? [];
  const classique = s.format === "classique" && (s.classique_structure?.blocks?.length ?? 0) > 0;
  const blocks = classique ? s.classique_structure!.blocks : [];
  const a = input.done ? input.activity ?? null : null;
  const laps = input.done ? (input.laps ?? []).filter((l) => l.durationS != null && l.durationS > 0) : [];
  const typeLabel = input.kind === "energie" ? "Énergie" : "Spécifique";
  const sections: ShareSection[] = [];
  const stats: ShareStat[] = [];
  let hero: ShareCard["hero"] = null;
  let footerRight: string | null = input.done ? null : "Ma séance du jour";
  let meta: string | null = null;
  const rpeStat = input.rpe != null ? { value: nf(input.rpe, 1), unit: "/10", label: "RPE", color: input.accent } : null;

  const plannedS = s.total_duration_s ?? 0;
  const plannedM = s.total_distance_m ?? 0;
  const plannedMeta = [plannedS > 0 ? `≈ ${shortDur(plannedS)}` : null, plannedM > 0 ? `≈ ${nf(plannedM / 1000, 1)} km` : null].filter(Boolean).join(" · ");

  // Segments chronométrés par la montre (HYROX, WOD avec tours) : la vue « spécifique faite ».
  const segmented = input.kind === "specifique" && laps.some((l) => l.kind === "station");

  if (!input.done) {
    meta = plannedMeta || null;
    if (classique) {
      sections.push(...classiqueSections(blocks, input, false));
    } else if (steps.length) {
      const bars = profile(steps, input, null);
      if (input.kind === "energie" && bars.length > 1) sections.push({ type: "profile", label: "Profil de la séance", bars, axis: profileAxis(steps, input) });
      sections.push({ type: "rows", label: input.kind === "energie" ? "Déroulé" : "Enchaînement", rows: stepRows(steps, input, false) });
    }
  } else if (segmented) {
    const total = a?.durationS ?? laps.reduce((x, l) => x + (l.durationS ?? 0), 0);
    hero = { value: fmtChrono(total), unit: null, caption: "temps total" };
    const run = sumS(laps, "run");
    const st = sumS(laps, "station");
    if (run > 0) stats.push({ value: fmtChrono(run), label: "Courses" });
    if (st > 0) stats.push({ value: fmtChrono(st), label: "Stations", color: input.accent });
    if (rpeStat) stats.push(rpeStat);
    const shown = laps.filter((l) => l.kind === "run" || l.kind === "station");
    const max = Math.max(...shown.map((l) => l.durationS ?? 0), 1);
    sections.push({
      type: "rows",
      label: "Segments",
      right: "temps · écart au prévu",
      rows: shown.map((l) => {
        const dt = deltaText(l.durationS, l.plannedDurationS);
        return {
          badge: l.kind === "station" ? { color: input.accent, shape: "dot" as const } : { color: input.colors.muted, shape: "ring" as const },
          title: l.name,
          sub: l.plannedLabel ?? null,
          right: fmtChrono(l.durationS),
          rightSub: dt?.text ?? null,
          rightSubColor: dt ? (dt.good ? input.colors.success : input.colors.error) : undefined,
          bar: { value: (l.durationS ?? 0) / max, color: l.kind === "station" ? input.accent : input.colors.muted },
        };
      }),
    });
    const trans = sumS(laps, "transition");
    footerRight = trans > 0 ? `Roxzone ${fmtChrono(trans)}` : null;
    meta = watchMeta(input.source, plannedMeta);
  } else if (a && ((a.distanceM ?? 0) > 0 || (a.durationS ?? 0) > 0)) {
    // Énergie faite avec une montre.
    if ((a.distanceM ?? 0) > 0) hero = { value: nf((a.distanceM ?? 0) / 1000, (a.distanceM ?? 0) >= 100000 ? 0 : 1), unit: "km", caption: a.durationS ? `en ${fmtChrono(a.durationS)}` : null };
    else hero = { value: fmtChrono(a.durationS), unit: null, caption: "durée" };
    const work = laps.filter((l) => l.phase === "work" && l.avgPaceSPerKm != null && l.avgPaceSPerKm > 0);
    if (a.isRun && a.avgPaceSPerKm) stats.push({ value: fmtPace(a.avgPaceSPerKm), unit: "/km", label: "Allure moy." });
    else if (a.avgHr) stats.push({ value: String(Math.round(a.avgHr)), unit: "bpm", label: "FC moy." });
    if (a.isRun && work.length > 1) {
      const avg = work.reduce((x, l) => x + (l.avgPaceSPerKm ?? 0), 0) / work.length;
      stats.push({ value: fmtPace(avg), unit: "/km", label: "Moy. reps", color: input.accent });
    } else if (a.isRun && a.avgHr) stats.push({ value: String(Math.round(a.avgHr)), unit: "bpm", label: "FC moy." });
    if (rpeStat) stats.push(rpeStat);
    if (steps.length) {
      const labels = a.isRun && work.length ? work.map((l) => fmtPace(l.avgPaceSPerKm)) : null;
      const bars = profile(steps, input, labels);
      const labelled = bars.some((b) => b.label);
      if (bars.length > 1) sections.push({ type: "profile", label: labelled ? "Allure des répétitions" : "Profil de la séance", bars, axis: labelled ? null : profileAxis(steps, input) });
    }
    const z = zonesSection(a, input);
    if (z) sections.push(z);
    if (!z && steps.length) sections.push({ type: "rows", label: "Déroulé", rows: stepRows(steps, input, true) });
    footerRight = a.avgHr && a.isRun ? `FC moy. ${Math.round(a.avgHr)}` : null;
    meta = watchMeta(input.source, plannedMeta);
  } else {
    // Faite sans montre : le prévu, coché.
    if (input.durationMin && input.durationMin > 0) stats.push({ value: shortDur(input.durationMin * 60) ?? "", label: "Durée" });
    if (input.distanceKm && input.distanceKm > 0) stats.push({ value: nf(input.distanceKm, 1), unit: "km", label: "Distance" });
    if (rpeStat) stats.push(rpeStat);
    if (classique) {
      sections.push(...classiqueSections(blocks, input, true));
    } else if (steps.length) {
      const bars = profile(steps, input, null);
      if (input.kind === "energie" && bars.length > 1) sections.push({ type: "profile", label: "Profil de la séance", bars, axis: profileAxis(steps, input) });
      sections.push({ type: "rows", label: input.kind === "energie" ? "Déroulé" : "Enchaînement", rows: stepRows(steps, input, true) });
    }
  }

  return {
    kind: input.kind,
    done: input.done,
    accent: input.accent,
    kicker: shareKicker(typeLabel, input.done, input.day),
    who: opts.showName && input.athleteFirstName ? `Séance de ${input.athleteFirstName}` : null,
    title: s.name?.trim() || (input.kind === "energie" ? "Séance d'énergie" : "Séance spécifique"),
    meta: meta ?? (input.done ? plannedMeta ? `Prévu ${plannedMeta}` : null : null),
    hero,
    stats: stats.filter((x) => x.value).slice(0, 3),
    sections,
    quote: input.done ? input.comment?.trim() || null : null,
    coach: opts.showCoach ? input.coach : null,
    footerRight,
  };
}

/** Durée affichée d'un pas (réexport pratique pour l'écran). */
export { fmtDur };
