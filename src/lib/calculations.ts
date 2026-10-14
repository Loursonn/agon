import { normalizeExName, e1rm, parseReps } from "@/lib/exercises";
import { normPrimary } from "@/lib/muscles";

/** Tous les PRs (1RM estimés) extraits des données d'exercices. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAllPRs = (exos: Record<string, any[]>) => {
  const p: Record<string, { kg:number; reps:number; est:number; week:number; name:string }> = {};
  Object.values(exos).flat().forEach((ex) => {
    const norm = normalizeExName(ex.name);
    Object.entries(ex.weeks || {}).forEach(([wk, w]: [string, any]) => {
      if (!w?.kg) return;
      const est = e1rm(w.kg, parseReps(w.repsRange) || 1);
      if (!p[norm] || est > p[norm].est)
        p[norm] = { kg: w.kg, reps: parseReps(w.repsRange), est, week: +wk, name: norm };
    });
  });
  return p;
};

/** Volume de séries par groupe musculaire pour la dernière semaine. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getMuscSets = (exos: Record<string, any[]>, exMeta: Record<string, any>) => {
  const s: Record<string, number> = {};
  Object.values(exos).flat()
    .filter((ex) => {
      const et = ex.exType || (ex.isFlexibility ? "mobilite" : "muscu");
      return et === "muscu";
    })
    .forEach((ex) => {
      const lw = Math.max(...Object.keys(ex.weeks || {}).map(Number).filter(Boolean), 0);
      if (!lw) return;
      const sets = ex.weeks[lw].sets || 0;
      const meta = exMeta?.[ex.name] || exMeta?.[normalizeExName(ex.name)] || {};
      normPrimary(meta.primary || ex.target).forEach((m) => { s[m] = (s[m] || 0) + sets; });
      (meta.secondary || []).forEach((m: string) => { s[m] = (s[m] || 0) + sets * 0.5; });
    });
  const r: Record<string, number> = {};
  Object.entries(s).forEach(([k, v]) => { r[k] = Math.round(v); });
  return r;
};

/** Progression du 1RM estimé par semaine pour un exercice donné. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const get1rmByWeek = (exos: Record<string, any[]>, name: string, tw: number) => {
  const b: Record<number, number> = {};
  const normTarget = normalizeExName(name).toLowerCase();
  Object.values(exos).flat()
    .filter((e) => normalizeExName(e.name).toLowerCase() === normTarget)
    .forEach((ex) => {
      Object.entries(ex.weeks || {}).forEach(([wk, w]: [string, any]) => {
        if (!w?.kg) return;
        const est = e1rm(w.kg, parseReps(w.repsRange) || 1);
        if (!b[+wk] || est > b[+wk]) b[+wk] = est;
      });
    });
  return Array.from({ length: tw || 6 }, (_, i) => i + 1).map((w) => ({
    week: "S" + w,
    val: b[w] || null,
  }));
};

/** Données combinées volume/intensité/wellness par semaine pour les graphiques. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getCombinedData = (exos: Record<string, any[]>, sets: any, wh: any, tw: number) => {
  const totalW = tw || 6;
  const all = Object.values(exos).flat().filter((ex) => {
    const et = ex.exType || (ex.isFlexibility ? "mobilite" : "muscu");
    return et === "muscu";
  });
  return Array.from({ length: totalW }, (_, i) => i + 1).map((w) => {
    const volProg = all.reduce((a, ex) => {
      const wd = ex.weeks[w];
      return a + (wd ? (wd.sets || 0) * parseReps(wd.repsRange) : 0);
    }, 0);
    const hasData = all.some((ex) => (sets[ex.id + "_" + w] || []).length > 0);
    const volReal = hasData
      ? all.reduce((a, ex) => (sets[ex.id + "_" + w] || []).filter((s: any) => s.done).reduce((b: number, s: any) => b + (s.reps || 0), a), 0)
      : null;
    const intensity = parseFloat(
      all.reduce((a, ex) => {
        const wd = ex.weeks[w];
        return a + (wd ? (wd.sets || 0) * (typeof wd.rir === "number" ? wd.rir : 2) : 0);
      }, 0).toFixed(1)
    );
    return { s: "S" + w, volProg, volReal, intensity, wellness: wh[w] ?? null };
  });
};

/** Les 3 exercices principaux (Bench / Squat / Traction) détectés dynamiquement. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getBig3 = (exos: Record<string, any[]>) => {
  const find = (sids: string[]) => {
    for (const sid of sids) {
      const perf = (exos[sid] || []).find((e) => e.bloc === "PERF");
      if (perf) return normalizeExName(perf.name);
    }
    return null;
  };
  return [
    { label: "Bench",   name: find(["bi","bv"]), c: "#FF5A33" },
    { label: "Squat",   name: find(["si","sv"]), c: "#33B5FF" },
    { label: "Traction",name: find(["ti","tv"]), c: "#66F03C" },
  ].filter((x) => x.name);
};

/** Données pour le graphique de poids de corps. */
export const getWeightChartData = (
  log: Record<string, number>,
  milestones: Array<{ date: string }>,
  target: number
) =>
  Object.entries(log)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, kg]) => ({
      d: date.slice(6) + "/" + date.slice(4, 6),
      kg,
      target,
      isMilestone: milestones?.some((m) => m.date === date) ? 1 : null,
    }));

/** Données pour le graphique de wellness (week / month / year). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getWellnessChartData = (wh: Record<string, any>, period: string) => {
  const DAY = ["D","L","M","Me","J","V","S"];
  const MON = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
  const dateEntries = Object.entries(wh).filter(([k, v]) => /^\d{8}$/.test(k) && v && typeof v === "object");
  const byDate = Object.fromEntries(dateEntries);

  if (period === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const k = String(d.getFullYear()) + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0");
      const e = byDate[k];
      return { label: DAY[d.getDay()], score: e?.score ?? null, sleep: e?.sleepDur ?? null };
    });
  }
  if (period === "month") {
    return [...dateEntries].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30).map(([k, e]) => {
      const y = +k.slice(0,4), m = +k.slice(4,6)-1, dd = +k.slice(6,8);
      return { label: dd===1 ? MON[m] : String(dd), score: e?.score ?? null, sleep: e?.sleepDur ?? null };
    });
  }
  if (period === "year") {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth()-11+i, 1);
      const pfx = String(d.getFullYear()) + String(d.getMonth()+1).padStart(2,"0");
      const mes = dateEntries.filter(([k]) => k.startsWith(pfx)).map(([, v]) => v);
      const sc = mes.filter((v) => v?.score != null).map((v) => v.score);
      const sl = mes.filter((v) => v?.sleepDur != null).map((v) => v.sleepDur);
      return {
        label: MON[d.getMonth()],
        score: sc.length ? Math.round(sc.reduce((a:number,b:number)=>a+b,0)/sc.length) : null,
        sleep: sl.length ? Math.round(sl.reduce((a:number,b:number)=>a+b,0)/sl.length*10)/10 : null,
      };
    });
  }
  return [];
};
