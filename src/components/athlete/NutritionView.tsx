import { useState, useEffect, useRef } from "react";
import { errorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { addDays, localIsoDay } from "@shared/domain/dates";
import {
  calorieMode,
  dayDepense,
  evaluateLoggedDay,
  evaluateNutritionDay,
  NUTRITION_TOLERANCE_PCT,
  NutritionDayStatus,
  NutritionStrategy,
  NutritionDailyLog,
} from "@/lib/nutrition";
import { useNutritionLog, useSaveNutritionDay } from "@/features/shared/hooks/useNutrition";
import { notifyQueued } from "@/lib/offline/writes";
import { useIsDesktop } from "@/hooks/useIsDesktop";

/** Pictos de la planche « Nutrition athlète » (traits carrés, 24×24, couleur = currentColor). */
const STRATEGY_ICON: Record<string, JSX.Element> = {
  maintenance: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></>,
  seche: <path d="M12 22C7.6 22 5 19 5 15.2C5 11 9 9 9 4C12 6 14 8 14 11C15 10 15.5 9 15.5 8C18 10 19 12.6 19 15.2C19 19 16.4 22 12 22Z" />,
  prise_de_masse: <path d="M13 2L4 14H11L10 22L20 9H13Z" />,
};

/**
 * Teintes de la planche, en classes : aplat (`fill`), texte, carte teintée à 12 %
 * avec bord à 45 % (`card`) ; pour les macros : champ rempli / vide, piste à 15 %.
 */
interface Tone { fill: string; text: string; card: string; fieldOn: string; fieldOff: string; track: string }
const TONES = {
  succes: { fill: "bg-agon-succes", text: "text-agon-succes", card: "border-agon-succes/[0.45] bg-agon-succes/[0.12]", fieldOn: "border-agon-succes/[0.5]", fieldOff: "border-agon-succes/[0.25]", track: "bg-agon-succes/[0.15]" },
  erreur: { fill: "bg-agon-erreur", text: "text-agon-erreur", card: "border-agon-erreur/[0.45] bg-agon-erreur/[0.12]", fieldOn: "border-agon-erreur/[0.5]", fieldOff: "border-agon-erreur/[0.25]", track: "bg-agon-erreur/[0.15]" },
  info: { fill: "bg-agon-info", text: "text-agon-info", card: "border-agon-info/[0.45] bg-agon-info/[0.12]", fieldOn: "border-agon-info/[0.5]", fieldOff: "border-agon-info/[0.25]", track: "bg-agon-info/[0.15]" },
  accent: { fill: "bg-agon-accent", text: "text-agon-accent", card: "border-agon-accent/[0.45] bg-agon-accent/[0.12]", fieldOn: "border-agon-accent/[0.5]", fieldOff: "border-agon-accent/[0.25]", track: "bg-agon-accent/[0.15]" },
} satisfies Record<string, Tone>;

// Planche : maintenance en vert ; sèche en rouge ; prise de masse en bleu.
const STRATEGY_META: Record<string, { label: string; tone: Tone; verb: string }> = {
  maintenance:    { label: "Maintenance",    tone: TONES.succes, verb: "Écart visé" },
  seche:          { label: "Sèche",          tone: TONES.erreur, verb: "Déficit visé" },
  prise_de_masse: { label: "Prise de masse", tone: TONES.info,   verb: "Surplus visé" },
};

const KICK = "agon-mono whitespace-nowrap text-[10px] uppercase tracking-[0.10em] text-agon-tx2";
/** Jours de la série : dans l'objectif, proche, hors objectif (rouge vif de la planche). */
const DAY_FILL: Record<NutritionDayStatus, string> = { ok: "bg-agon-succes", close: "bg-agon-alerte", off: "bg-agon-rouge" };
const SAVE_BTN = "w-full rounded-xl border-none font-[inherit] text-[14px] font-semibold";

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-col gap-2.5">
      <h2 className="agon-mono m-0 flex h-5 items-center whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.12em] text-agon-tx2">
        <span className="text-agon-accent">{n} —</span>&nbsp;{children}
      </h2>
      <div className="h-px bg-agon-brd" />
    </div>
  );
}

const ICON_SIZE = { 24: "size-6", 32: "size-8", 40: "size-10" } as const;

function IconSquare({ fill, size = 32, children }: { fill: string; size?: keyof typeof ICON_SIZE; children: React.ReactNode }) {
  const inner = Math.round(size * 0.5);
  return (
    <span aria-hidden className={cn("flex flex-none items-center justify-center rounded-[10px] text-agon-ink", ICON_SIZE[size], fill)}>
      <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">{children}</svg>
    </span>
  );
}

// Jour LOCAL : `toISOString` datait la saisie de la veille entre minuit et ~2 h.
const isoDaysAgo = (today: string, n: number) => addDays(today, -n);

function fmtKcal(n: number) {
  return n.toLocaleString("fr-FR");
}

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const frNum = (v: number, decimals: number) => Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: decimals });

function fmtPct(v: number, decimals = 1) {
  return `${sign(v)}${frNum(v, decimals)} %`;
}

function fmtWindow(wMin: number, wMax: number) {
  if (wMin === wMax) return fmtPct(wMin, 1);
  return `${sign(wMin)}${frNum(wMin, 1)} à ${sign(wMax)}${frNum(wMax, 1)} %`;
}

interface Props {
  athleteId: string;
  bmr: number | null;
  nutritionStrategy: NutritionStrategy | null;
  weightLog?: Record<string, number>;
  viewOnly?: boolean;
}

export default function NutritionView({ athleteId, bmr, nutritionStrategy, weightLog, viewOnly = false }: Props) {
  const isDesktop = useIsDesktop();
  const today = localIsoDay();
  // Journal lu par la couche API (lève en cas d'erreur, jamais `{}` à la place).
  const logQuery = useNutritionLog(athleteId);
  const history = logQuery.data;
  const saveDay = useSaveNutritionDay(athleteId);
  const [log, setLog] = useState<Partial<NutritionDailyLog>>({});
  // Saisie en cours : un rafraîchissement du journal ne l'écrase pas.
  const dirty = useRef(false);
  const logLoading = logQuery.isLoading;
  const saving = saveDay.isPending;

  useEffect(() => {
    if (history && !dirty.current) setLog(history[today] ?? {});
  }, [history, today]);

  const upd = (k: keyof NutritionDailyLog, v: number | null) => {
    dirty.current = true;
    setLog(prev => {
      const next = { ...prev, [k]: v };
      if (k === "glucides_consumed" || k === "lipides_consumed" || k === "proteines_consumed") {
        const g = k === "glucides_consumed" ? v : (prev.glucides_consumed ?? 0);
        const l = k === "lipides_consumed"  ? v : (prev.lipides_consumed  ?? 0);
        const p = k === "proteines_consumed"? v : (prev.proteines_consumed ?? 0);
        next.total_calories_consumed = (g ?? 0) * 4 + (l ?? 0) * 9 + (p ?? 0) * 4;
      }
      return next;
    });
  };

  // Une seule écriture : la journée du jour, via la RPC atomique.
  async function handleSave() {
    try {
      const status = await saveDay.mutateAsync({ day: today, log: log as NutritionDailyLog });
      dirty.current = false;
      if (status === "queued") notifyQueued();
      else toast.success("Journée enregistrée !");
    } catch (e) {
      toast.error(errorMessage(e, "Erreur lors de l'enregistrement"));
    }
  }

  if (!nutritionStrategy) {
    return (
      <div className="px-5 pb-10 pt-6">
        <div className="mb-3 rounded-[6px] border border-agon-brd bg-agon-s1 px-5 pb-8 pt-11 text-center">
          <div className="mb-1.5 text-[14px] font-semibold text-agon-tx">Pas encore de plan nutritionnel</div>
          <div className="text-[12px] leading-[1.5] text-agon-tx3">Ton coach n'a pas encore défini de stratégie. Elle apparaîtra ici dès qu'elle sera prête.</div>
        </div>
      </div>
    );
  }

  const strat = nutritionStrategy;
  const meta = STRATEGY_META[strat.strategy] || { label: strat.strategy, tone: TONES.accent, verb: "Objectif" };

  // ── Dépense & évaluation du jour ───────────────────────────────────────────
  const mode = calorieMode(strat);
  const showActiveCal = mode === "active" || mode === "hybrid";
  const activeCal = log.active_calories ?? 0;
  const dynamicDepense = dayDepense(strat, bmr, log);

  const calConsumed = log.total_calories_consumed || 0;
  const evalDay = evaluateNutritionDay(strat, calConsumed, dynamicDepense);
  // Bornes/fenêtre pour affichage même sans saisie (consumed factice)
  const displayEval = evalDay ?? evaluateNutritionDay(strat, 1, dynamicDepense);

  const wMin = displayEval?.windowMin ?? 0;
  const wMax = displayEval?.windowMax ?? 0;
  const hasWindow = displayEval != null && (wMin !== 0 || wMax !== 0);
  const targetMin = displayEval?.targetMin ?? 0;
  const targetMax = displayEval?.targetMax ?? 0;

  // ── Macros ─────────────────────────────────────────────────────────────────
  const macroTargets = [
    { key: "glucides_consumed" as const,  label: "Glucides",  targetG: strat.macros_glucides,  targetPct: strat.macros_glucides_pct,  tone: TONES.info },
    { key: "lipides_consumed"  as const,  label: "Lipides",   targetG: strat.macros_lipides,   targetPct: strat.macros_lipides_pct,   tone: TONES.accent },
    { key: "proteines_consumed" as const, label: "Protéines", targetG: strat.macros_proteines, targetPct: strat.macros_proteines_pct, tone: TONES.erreur },
  ];
  const hasMacroTargets = macroTargets.some(m => m.targetG || m.targetPct);
  const hasPcts = macroTargets.every(m => m.targetPct != null && m.targetPct > 0);

  const statusText = evalDay?.status === "ok" ? "text-agon-succes" : evalDay?.status === "close" ? "text-agon-alerte" : evalDay ? "text-agon-erreur" : "text-agon-tx3";

  // ── Streak & historique ────────────────────────────────────────────────────
  const statusFor = (dateISO: string): NutritionDayStatus | null => {
    return evaluateLoggedDay(strat, bmr, history?.[dateISO])?.status ?? null;
  };

  const streakData = (() => {
    if (!history) return null;
    // Streak : jours consécutifs "ok" en remontant depuis aujourd'hui
    // (si aujourd'hui pas encore rempli, on part d'hier sans casser la série)
    let streak = 0;
    let i = statusFor(today) === null ? 1 : 0;
    let startISO = today;
    for (; i < 365; i++) {
      const iso = isoDaysAgo(today, i);
      const st = statusFor(iso);
      if (st === "ok") { streak++; startISO = iso; }
      else break;
    }
    const days = Array.from({ length: 14 }, (_, k) => {
      const iso = isoDaysAgo(today, 13 - k);
      return { iso, status: statusFor(iso) };
    });
    return { streak, startISO, days };
  })();

  const weightData = (() => {
    if (!weightLog) return null;
    const entries = Object.entries(weightLog)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return null;
    const last30 = entries.filter(([d]) => d >= isoDaysAgo(today, 30));
    const series = (last30.length >= 2 ? last30 : entries.slice(-10)).map(([d, v]) => ({ d, v }));
    const current = entries[entries.length - 1][1];
    // Delta depuis le début de la streak (ou sur la fenêtre affichée)
    const refDate = streakData && streakData.streak > 0 ? streakData.startISO : (series[0]?.d ?? entries[0][0]);
    const ref = entries.filter(([d]) => d <= refDate).pop()?.[1] ?? series[0]?.v ?? current;
    return { series, current, delta: +(current - ref).toFixed(1) };
  })();

  const deltaGood = weightData
    ? (strat.strategy === "seche" ? weightData.delta <= 0 : strat.strategy === "prise_de_masse" ? weightData.delta >= 0 : Math.abs(weightData.delta) <= 0.5)
    : true;

  // Anneau « Total du jour » : part de la borne haute de la zone.
  const ringPct = targetMax > 0 ? Math.min(1, calConsumed / targetMax) : 0;
  const R = 73, CIRC = 2 * Math.PI * R;

  return (
    <div className="flex flex-col gap-4 px-5 pb-10 pt-6">
      {/* Titre et date : en-tête de page (AlimPage) */}

      {/* Ordinateur (planche AthOrdiBAlimentation) : objectif, série et poids sur une rangée 1,75 / 1 / 1. */}
      <div className={isDesktop ? "grid grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-4" : "contents"}>
      {/* ── Objectif ── */}
      <div className={cn("relative overflow-hidden rounded-[14px] border p-4", meta.tone.card)}>
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", meta.tone.fill)} />
        <div className="flex items-start gap-3">
          <IconSquare fill={meta.tone.fill} size={40}>{STRATEGY_ICON[strat.strategy] ?? STRATEGY_ICON.maintenance}</IconSquare>
          <div className="min-w-0 flex-1">
            <div className="agon-display text-[17px] font-normal leading-[1.2] tracking-[0.06em] text-agon-tx">{meta.label}</div>
            {hasWindow && (
              <div className="mt-[3px] text-[12px] leading-[1.45] text-agon-tx2">
                {meta.verb} : <span className="agon-mono text-agon-tx">{fmtWindow(wMin, wMax)}</span> vs dépense
              </div>
            )}
          </div>
          {strat.target_weight && (
            <div className="flex-none text-right">
              <div className={KICK}>Poids cible</div>
              <div className={cn("agon-mono mt-1 text-[22px]", meta.tone.text)}>
                {Number(strat.target_weight).toLocaleString("fr-FR")}<span className="text-[11px] text-agon-tx2"> kg</span>
              </div>
            </div>
          )}
        </div>

        {/* Zone kcal estimée */}
        <div className="mt-[18px]">
          <div className={KICK}>{dynamicDepense != null ? "Zone du jour (BMR + activité)" : "Zone kcal estimée"}</div>
          {targetMin > 0 ? (
            <div className="agon-mono mt-1.5 flex items-baseline gap-2">
              <span className="text-[30px] leading-none text-agon-tx">{fmtKcal(targetMin)}</span>
              {targetMin !== targetMax && <><span className="text-[13px] text-agon-tx3">–</span><span className="text-[30px] leading-none text-agon-tx">{fmtKcal(targetMax)}</span></>}
              <span className="text-[12px] text-agon-tx2">kcal</span>
            </div>
          ) : (
            <div className="agon-mono mt-1.5 text-[30px] text-agon-tx3">—</div>
          )}
          <div className="mt-1.5 text-[12px] text-agon-tx2">
            {dynamicDepense != null
              ? `Dépense : BMR ${fmtKcal(bmr!)} + ${fmtKcal(activeCal)} actives = ${fmtKcal(dynamicDepense)} kcal`
              : showActiveCal ? "S'ajuste quand tu saisis tes calories actives" : displayEval ? `Base dépense ${fmtKcal(displayEval.reference)} kcal` : ""}
          </div>
        </div>

        {/* Répartition macros cible */}
        {hasMacroTargets && (
          <div className="mt-3.5">
            {hasPcts && (
              <div className="mb-2.5 flex h-2 gap-1">
                {macroTargets.map(m => (
                  <div key={m.key} className={cn("rounded-[4px]", m.tone.fill)} style={{ width: (m.targetPct || 0) + "%" }} />
                ))}
              </div>
            )}
            <div className="flex justify-between gap-1.5">
              {macroTargets.map(m => (
                <span key={m.key} className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-agon-tx2">
                  <span className={cn("size-2 flex-none rounded-[2px]", m.tone.fill)} />
                  <span className="agon-mono text-[13px] text-agon-tx">{m.targetG ?? "—"}</span>
                  <span className="agon-mono">g{m.targetPct != null ? ` · ${m.targetPct} %` : ""}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Série + poids ── */}
      {(streakData || weightData) && (
        <div className={isDesktop ? "contents" : cn("grid gap-2.5", streakData && weightData ? "grid-cols-2" : "grid-cols-1")}>
          {streakData && (
            <div className="flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-agon-alerte/[0.4] bg-agon-alerte/[0.12] p-3.5">
              <div className="flex items-center gap-2">
                <IconSquare fill="bg-agon-alerte" size={24}>{STRATEGY_ICON.seche}</IconSquare>
                <span className={KICK}>Série en cours</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("agon-mono text-[40px] leading-none", streakData.streak > 0 ? "text-agon-alerte" : "text-agon-tx3")}>{streakData.streak}</span>
                <span className="text-[12px] leading-[1.3] text-agon-tx2">jour{streakData.streak > 1 ? "s" : ""} dans l'objectif</span>
              </div>
              <div className="flex gap-[3px]">
                {streakData.days.map(d => (
                  <div key={d.iso} title={d.iso} className={cn(
                    "box-border h-5 flex-1 rounded-[4px]",
                    d.status ? DAY_FILL[d.status] : "border border-dashed border-agon-tx3 bg-transparent",
                  )} />
                ))}
              </div>
              <div className="agon-mono flex justify-between text-[10px] text-agon-tx3">
                <span>J−13</span><span>aujourd'hui</span>
              </div>
            </div>
          )}

          {weightData && (
            <div className="flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-agon-info/[0.4] bg-agon-info/[0.12] p-3.5">
              <div className="flex items-center gap-2">
                <IconSquare fill="bg-agon-info" size={24}><path d="M5 20H19L17 8H7Z" /><circle cx="12" cy="5" r="2" /></IconSquare>
                <span className={KICK}>Poids</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="agon-mono text-[36px] leading-none text-agon-tx">{weightData.current.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</span>
                <span className="agon-mono text-[11px] text-agon-tx2">kg</span>
              </div>
              {weightData.delta !== 0 && (
                <span className={cn(
                  "agon-mono self-start whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] tracking-[0.06em] text-agon-ink",
                  deltaGood ? "bg-agon-succes" : "bg-agon-alerte",
                )}>
                  {weightData.delta > 0 ? "▲ +" : "▼ −"}{Math.abs(weightData.delta).toLocaleString("fr-FR")} kg
                </span>
              )}
              {weightData.series.length >= 2 ? (() => {
                const vs = weightData.series.map(p => p.v);
                const min = Math.min(...vs), max = Math.max(...vs);
                const span = max - min || 1;
                const pts = weightData.series.map((p, idx) => {
                  const x = (idx / (weightData.series.length - 1)) * 100;
                  const y = 22 - ((p.v - min) / span) * 18;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");
                return (
                  <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="block h-[26px] w-full">
                    <polyline points={pts} fill="none" stroke={C.b} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                );
              })() : (
                <div className="text-[10px] text-agon-tx3">Pas assez de pesées récentes</div>
              )}
            </div>
          )}
        </div>
      )}

      </div>

      {/* ── Mon suivi du jour ── */}
      <section className="mt-2">
        <SectionTitle n="01">Mon suivi du jour</SectionTitle>

        {logLoading ? (
          <div className="py-3.5 text-center text-[13px] text-agon-tx3">Chargement…</div>
        ) : logQuery.isError ? (
          <div className="py-3.5 text-center text-[13px] text-agon-tx3">
            Impossible de charger ton journal.{" "}
            <button onClick={() => logQuery.refetch()} className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[13px] font-bold text-agon-accent">
              Réessayer
            </button>
          </div>
        ) : (
          <div className={isDesktop
            ? "grid grid-cols-[minmax(0,1fr)_380px] grid-rows-[auto_1fr] items-start gap-4"
            : "flex flex-col gap-3.5"}>

            {/* Calories actives (PC : colonne de droite, planche AthOrdiBAlimentation) */}
            {showActiveCal && (
              <label className={cn(
                "flex items-center gap-3 rounded-[14px] border border-agon-rouge/[0.45] bg-agon-rouge/[0.12]",
                isDesktop ? "col-start-2 row-start-1 px-[18px] py-4" : "px-3 py-2.5",
              )}>
                <IconSquare fill="bg-agon-rouge" size={32}>{STRATEGY_ICON.seche}</IconSquare>
                <span className="flex-1 text-[13px]">
                  Calories actives brûlées
                  {mode === "hybrid" && <span className="block text-[11px] text-agon-tx3">optionnel</span>}
                </span>
                <input
                  aria-label="Calories actives brûlées"
                  className="agon-mono box-border h-[34px] w-[74px] rounded-[8px] border border-agon-rouge/[0.5] bg-agon-s2 px-2.5 text-right text-[15px] text-agon-rouge [outline:none]"
                  type="number" inputMode="numeric" min={0} max={5000} placeholder="0"
                  value={log.active_calories ?? ""}
                  onChange={viewOnly ? undefined : (e => upd("active_calories", e.target.value ? parseInt(e.target.value) : null))}
                  readOnly={viewOnly}
                />
                <span className="agon-mono text-[11px] text-agon-tx2">kcal</span>
              </label>
            )}

            {/* Total du jour + macros */}
            <div className={cn(
              "flex border border-agon-brd-l bg-agon-s1",
              isDesktop ? "col-start-1 row-span-2 row-start-1 flex-row flex-wrap items-center gap-9 rounded-2xl px-7 py-6" : "flex-col gap-4 rounded-[14px] p-4",
            )}>
              <div className="flex flex-none items-center gap-4">
                <div className="relative size-40 flex-none">
                  <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden>
                    <defs><linearGradient id="nutri-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.o} /><stop offset="1" stopColor={C.ac} /></linearGradient></defs>
                    <circle cx="80" cy="80" r={R} fill="none" stroke={C.brd} strokeWidth="14" />
                    {ringPct > 0 && <circle cx="80" cy="80" r={R} fill="none" stroke="url(#nutri-ring)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(ringPct * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`} transform="rotate(-90 80 80)" />}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={KICK}>Total du jour</span>
                    <span className={cn("agon-mono text-[32px] leading-[1.15]", calConsumed > 0 ? "text-agon-tx" : "text-agon-tx3")}>{calConsumed > 0 ? fmtKcal(calConsumed) : "—"}</span>
                    {targetMin > 0 && (
                      <span className="agon-mono text-center text-[10px] leading-[1.4] text-agon-tx2">
                        / {fmtKcal(targetMin)}{targetMin !== targetMax ? `–${fmtKcal(targetMax)}` : ""}<br />kcal
                      </span>
                    )}
                  </div>
                </div>
                {calConsumed > 0 && evalDay && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={KICK}>{evalDay.actualPct <= 0 ? "Déficit réel" : "Surplus réel"}</span>
                    <span className={cn("agon-mono text-[30px] leading-none", statusText)}>{fmtPct(evalDay.actualPct, 0)}</span>
                  </div>
                )}
              </div>

              {/* 260 px mini : en dessous, les macros passent sous l'anneau (sinon « / 360 g » s'écrivait sur 3 lignes). */}
              <div className={cn("flex min-w-0 flex-col", isDesktop ? "flex-[1_1_260px] gap-[18px]" : "flex-1 gap-4")}>
              {macroTargets.map(m => {
                const consumed = log[m.key] ?? null;
                const target = m.targetG;
                const ratio = consumed != null && target ? consumed / target : null;
                const pct = ratio != null ? Math.round(ratio * 100) : null;
                const over = ratio != null && ratio > 1.05;
                return (
                  <div key={m.key} className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2">
                      <span className={cn("size-2 flex-none rounded-[2px]", m.tone.fill)} />
                      <span className="w-[72px] text-[13px] text-agon-tx2">{m.label}</span>
                      <input
                        aria-label={`${m.label} consommés (g)`}
                        className={cn(
                          "agon-mono box-border h-8 w-16 rounded-[8px] border bg-agon-s2 px-2 text-right text-[18px] [outline:none]",
                          consumed != null ? m.tone.fieldOn : m.tone.fieldOff,
                          over ? "text-agon-alerte" : m.tone.text,
                        )}
                        type="number" inputMode="numeric" min={0} max={1000} placeholder="—"
                        value={log[m.key] ?? ""}
                        onChange={viewOnly ? undefined : (e => upd(m.key, e.target.value ? parseInt(e.target.value) : null))}
                        readOnly={viewOnly}
                      />
                      <span className="agon-mono flex-none whitespace-nowrap text-[11px] text-agon-tx3">{target != null ? `/ ${target} g` : "g"}</span>
                      <span className="flex-1" />
                      <span className="agon-mono text-[11px] text-agon-tx2">{pct != null ? `${pct} %` : ""}</span>
                    </label>
                    {target != null && (
                      <div className={cn("h-2.5 rounded-[5px]", m.tone.track)}>
                        <div
                          className={cn("h-2.5 rounded-[5px] [transition:width_0.3s]", over ? "bg-agon-alerte" : m.tone.fill)}
                          style={{ width: Math.min(pct ?? 0, 100) + "%" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {!viewOnly && !isDesktop && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={cn(SAVE_BTN, "h-[54px]", saving ? "cursor-default bg-agon-s2 text-agon-tx3" : "cursor-pointer bg-agon-accent text-agon-ink")}
                >
                  {saving ? "Enregistrement…" : "Enregistrer ma journée"}
                </button>
              )}
            </div>
            {!viewOnly && isDesktop && (
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(SAVE_BTN, "col-start-2 row-start-2 h-12 self-end rounded-[10px]", saving ? "cursor-default bg-agon-s2 text-agon-tx3" : "cursor-pointer bg-agon-accent text-agon-ink")}
              >
                {saving ? "Enregistrement…" : "Enregistrer ma journée"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Retour sur l'objectif ── */}
      {evalDay && (() => {
        const objectif = hasWindow ? `Objectif ${fmtWindow(wMin, wMax)} (±${NUTRITION_TOLERANCE_PCT} pts)` : `Cible ${fmtKcal(evalDay.target)} kcal ±${NUTRITION_TOLERANCE_PCT} %`;
        const reel = `${evalDay.actualPct <= 0 ? "Déficit" : "Surplus"} réel ${fmtPct(evalDay.actualPct)}`;
        const title = evalDay.status === "ok"
          ? `Objectif ${meta.label} atteint`
          : evalDay.status === "close" ? `Proche de l'objectif (${fmtPct(evalDay.diffPct)} d'écart)` : `Hors objectif (${fmtPct(evalDay.diffPct)} d'écart)`;
        return (
          <div className={cn("flex items-start gap-3 rounded-[14px] px-4 py-3.5 text-agon-ink", DAY_FILL[evalDay.status])}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" className="mt-px flex-none">
              {evalDay.status === "ok" ? <path d="M4 12.5L9.5 18L20 6" /> : <><path d="M12 3L22 20H2Z" /><path d="M12 10V14M12 17V17.5" /></>}
            </svg>
            <div>
              <div className="text-[14px] font-semibold">{title}</div>
              <div className="mt-[3px] text-[12px] leading-[1.5]">{objectif} · {reel}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
