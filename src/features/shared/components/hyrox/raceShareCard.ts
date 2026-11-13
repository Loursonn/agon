/**
 * Carte à partager d'une course HYROX (planche HyroxAnaTel, écran 04) :
 * image 9:16 (1080 × 1920) dessinée sur le téléphone, rien n'est envoyé.
 * Chrono, record, rang, mini-frise, 8 stations, coach ; FC masquable.
 */
import { STATION_META, type HyroxResult, type StationKey } from "@/features/shared/types/hyrox";
import type { RaceWatchAnalysis } from "@/lib/hyrox/raceWatch";
import { fmtClock, fmtPace } from "@/lib/seance";
import { roxzoneTotal, runTotal, stationsTotal } from "@/lib/hyrox/calc";
import { C, H as HC } from "@/lib/theme";

export interface ShareCardInput {
  race: HyroxResult;
  analysis: RaceWatchAnalysis | null;
  divisionLabel: string;
  isRecord: boolean;
  coachName: string | null;
  /** « Garmin Forerunner 265 » : obligatoire si la FC est affichée. */
  attribution: string | null;
  theme: "dark" | "light";
  showHr: boolean;
  /** FC à dessiner (une valeur par seconde de course, ou moins). */
  hrSeries: Array<number | null> | null;
}

const W = 1080;
const H = 1920;

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function palette(theme: "dark" | "light") {
  const dark = theme === "dark";
  return {
    bg: dark ? cssVar("--agon-bg", C.bg) : HC.creme,
    card: dark ? HC.basalte3 : C.tx,
    tx: dark ? C.tx : C.bg,
    tx2: dark ? HC.grege : HC.taupeFonce,
    tx3: dark ? C.tx3 : HC.taupe,
    gold: cssVar("--agon-or-vif", HC.orMat),
    station: cssVar("--agon-ocre-vif", HC.orangeBrule),
    run: cssVar("--agon-hyrox-course", C.hyroxCourse),
    rox: dark ? HC.brunGris : HC.lin,
    hr: cssVar("--agon-rouge", HC.rougeDoux),
  };
}

const STATION_ORDER: StationKey[] = ["ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls"];
const STATION_SHORT: Record<StationKey, string> = {
  ski: "SkiErg", sled_push: "Sled push", sled_pull: "Sled pull", bbj: "Burpees",
  row: "Rameur", farmers: "Farmers carry", lunges: "Lunges", wall_balls: "Wall balls",
};

const font = (weight: number, size: number, mono = false) =>
  `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : '"Archivo", "Geist", system-ui, sans-serif'}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dessine la carte. Rend le canvas (1080 × 1920). */
export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput): HTMLCanvasElement {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const p = palette(input.theme);
  const { race, analysis } = input;
  const pad = 88;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // En-tête
  ctx.fillStyle = p.gold;
  ctx.font = font(800, 44);
  ctx.textBaseline = "top";
  ctx.fillText("AGON", pad, 96);
  ctx.textAlign = "right";
  ctx.fillStyle = p.station;
  ctx.fillText("HYROX", W - pad, 96);
  ctx.textAlign = "left";

  ctx.fillStyle = p.tx;
  ctx.font = font(300, 84);
  ctx.fillText(race.event_name.toUpperCase().slice(0, 22), pad, 230);
  ctx.fillStyle = p.tx2;
  ctx.font = font(500, 34, true);
  const d = race.date.split("-");
  ctx.fillText(`${d[2]}.${d[1]}.${d[0]} · ${input.divisionLabel.toUpperCase()}`, pad, 336);

  // Chrono
  ctx.fillStyle = p.tx;
  ctx.font = font(500, 220, true);
  ctx.fillText(fmtClock(race.total_s), pad - 8, 420);
  let y = 670;
  if (input.isRecord) {
    ctx.fillStyle = p.gold;
    roundRect(ctx, pad, y, 300, 64, 32);
    ctx.fill();
    ctx.fillStyle = p.bg;
    ctx.font = font(700, 30, true);
    ctx.fillText("RECORD PERSO", pad + 32, y + 17);
  }
  if (race.rank_overall && race.participants_overall) {
    ctx.fillStyle = p.tx2;
    ctx.font = font(500, 34, true);
    const top = Math.max(1, Math.round((race.rank_overall / race.participants_overall) * 100));
    ctx.fillText(`${race.rank_overall} / ${race.participants_overall} · top ${top} %`, input.isRecord ? pad + 330 : pad, y + 14);
  }

  // Mini-frise : segments à l'échelle du temps, FC par-dessus.
  y = 800;
  const fw = W - 2 * pad;
  const total = analysis?.segments.at(-1)?.endS ?? race.total_s;
  if (analysis) {
    for (const s of analysis.segments) {
      const x = pad + (s.startS / total) * fw;
      const w = Math.max(2, ((s.endS - s.startS) / total) * fw - 2);
      ctx.fillStyle = s.kind === "run" ? p.run : s.kind === "station" ? p.station : p.rox;
      ctx.fillRect(x, y + 150, w, 36);
    }
    ctx.fillStyle = p.tx3;
    ctx.font = font(500, 24, true);
    analysis.segments.filter((s) => s.kind === "run").forEach((s, i) => {
      ctx.fillText(String(i + 1), pad + (s.startS / total) * fw + 4, y + 198);
    });
  }
  const hr = input.showHr ? input.hrSeries : null;
  if (hr && hr.length > 1) {
    const vals = hr.filter((v): v is number => v != null);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    ctx.strokeStyle = p.hr;
    ctx.lineWidth = 5;
    ctx.beginPath();
    let started = false;
    hr.forEach((v, i) => {
      if (v == null) return;
      const x = pad + (i / (hr.length - 1)) * fw;
      const yy = y + 130 - ((v - lo) / Math.max(1, hi - lo)) * 120;
      if (started) ctx.lineTo(x, yy); else { ctx.moveTo(x, yy); started = true; }
    });
    ctx.stroke();
    const avg = Math.round(vals.reduce((n, v) => n + v, 0) / vals.length);
    ctx.fillStyle = p.tx2;
    ctx.font = font(500, 28, true);
    ctx.fillText(`FC moy. ${avg} bpm`, pad, y - 6);
    if (input.attribution) {
      ctx.textAlign = "right";
      ctx.fillStyle = p.tx3;
      ctx.fillText(input.attribution, W - pad, y - 6);
      ctx.textAlign = "left";
    }
  }

  // 8 stations
  y = 1060;
  const colW = (W - 2 * pad - 24) / 2;
  STATION_ORDER.forEach((k, i) => {
    const x = pad + (i % 2) * (colW + 24);
    const yy = y + Math.floor(i / 2) * 118;
    ctx.fillStyle = p.card;
    roundRect(ctx, x, yy, colW, 100, 20);
    ctx.fill();
    ctx.fillStyle = p.station;
    ctx.fillRect(x, yy + 22, 6, 56);
    ctx.fillStyle = p.tx2;
    ctx.font = font(500, 30);
    ctx.fillText(STATION_SHORT[k] ?? STATION_META[k].label, x + 30, yy + 32);
    const v = (race as unknown as Record<string, number | null>)[`${k}_s`];
    ctx.textAlign = "right";
    ctx.fillStyle = p.tx;
    ctx.font = font(600, 38, true);
    ctx.fillText(fmtClock(v), x + colW - 28, yy + 28);
    ctx.textAlign = "left";
  });

  y = 1560;
  // Totaux de la planche : « Course 38:55 · Stations 33:30 · Roxzone 6:17 » (absent → « — »).
  const runSum = runTotal(race);
  const totals: Array<[string, string]> = [
    ["Course", fmtClock(runSum)],
    ["Stations", fmtClock(stationsTotal(race))],
    ["Roxzone", fmtClock(roxzoneTotal(race))],
  ];
  const tw = (W - 2 * pad) / 3;
  totals.forEach(([label, v], i) => {
    ctx.fillStyle = p.tx3;
    ctx.font = font(500, 28, true);
    ctx.fillText(label.toUpperCase(), pad + i * tw, y);
    ctx.fillStyle = p.tx;
    ctx.font = font(600, 52, true);
    ctx.fillText(v, pad + i * tw, y + 40);
  });

  // Pied
  ctx.fillStyle = p.tx3;
  ctx.font = font(500, 28, true);
  if (runSum != null) ctx.fillText(`Allure moy. ${fmtPace(runSum / 8)} /km`, pad, H - 150);
  if (input.coachName) {
    ctx.textAlign = "right";
    ctx.fillStyle = p.tx2;
    ctx.fillText(`Coaché par ${input.coachName}`, W - pad, H - 150);
    ctx.textAlign = "left";
  }
  return canvas;
}

/** Image PNG de la carte. */
export function shareCardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
