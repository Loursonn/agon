/**
 * MethodPreview — résumé textuel d'une configuration de méthode.
 * S'adapte au scope (set ou exercise) et se met à jour en temps réel.
 * Aucun nom de méthode inscrit en dur : purement paramétrique.
 */
import { C } from "@/lib/theme";
import type { MethodConfig, SetMethodConfig, ExerciseMethodConfig, ClassicMethodConfig, FullWeekConfig, MethodScope } from "@/types/trainingMethods";
import type { ExerciceParams } from "../programmation/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRepsSet(reps: SetMethodConfig["sub_sets"]["reps"]): string {
  switch (reps.type) {
    case "fixed":      return `${reps.value ?? "?"} reps`;
    case "decreasing": return "reps décroissantes";
    case "increasing": return "reps croissantes";
    case "amrap":      return "AMRAP";
    case "custom":
      return reps.pattern?.length
        ? reps.pattern.join(" → ") + " reps"
        : "pattern custom";
    default: return "reps";
  }
}

function formatCountSet(count: SetMethodConfig["sub_sets"]["count"]): string {
  if (count.type === "fixed") return `${count.value ?? "?"} sous-séries`;
  if (count.type === "range") return `${count.min ?? "?"}–${count.max ?? "?"} sous-séries`;
  return "? sous-séries";
}

function formatRestIntra(rest: SetMethodConfig["sub_sets"]["rest_intra"]): string {
  if (rest.type === "free") return "récup libre";
  return `${rest.seconds ?? "?"}s`;
}

function formatLoadSet(load: SetMethodConfig["load"]): string {
  const ref = load.reference ? ` @ ${load.reference}` : "";
  switch (load.type) {
    case "same":           return `charge identique${ref}`;
    case "free":           return "charge libre";
    case "decreasing_pct": return `charge -${load.pct_change ?? "?"}% par sous-série${ref}`;
    case "increasing_pct": return `charge +${load.pct_change ?? "?"}% par sous-série${ref}`;
    case "custom": {
      if (load.values?.length) {
        const unit = load.values_unit === "pct" ? "%" : "";
        return `charge [${load.values.map(v => `${v}${unit}`).join(" → ")}]` + ref;
      }
      return `charge custom${ref}`;
    }
    default: return "charge ?";
  }
}

function buildSetPreview(cfg: SetMethodConfig): string {
  const count = formatCountSet(cfg.sub_sets.count);
  const reps  = formatRepsSet(cfg.sub_sets.reps);
  const rest  = formatRestIntra(cfg.sub_sets.rest_intra);
  const load  = formatLoadSet(cfg.load);
  const rir   = cfg.rir_required ? " | RIR requis" : "";
  return `[${count} × ${reps} | ${rest}] | ${load}${rir}`;
}

// ── Exercise scope ──

function formatRepsEx(reps: ExerciseMethodConfig["reps"]): string {
  switch (reps.type) {
    case "fixed":      return `${reps.value ?? "?"} reps fixes`;
    case "ascending":  return "reps croissantes";
    case "descending": return "reps décroissantes";
    case "custom":
      return reps.pattern?.length
        ? `[${reps.pattern.join(",")}] reps`
        : "pattern custom";
    default: return "reps";
  }
}

function formatRestEx(rest: ExerciseMethodConfig["rest_between"]): string {
  switch (rest.type) {
    case "free":     return "récup libre";
    case "fixed":    return `récup ${rest.seconds ?? "?"}s`;
    case "variable": return `récup ${rest.min_s ?? "?"}–${rest.max_s ?? "?"}s`;
    default: return "récup ?";
  }
}

function formatLoadEx(load: ExerciseMethodConfig["load"]): string {
  switch (load.type) {
    case "same":       return "charge identique";
    case "ascending":  return "charge montante";
    case "descending": return "charge descendante";
    case "custom":
      if (load.mode === "pct_1rm") {
        const pct = load.pct_of_1rm ? `${load.pct_of_1rm}%` : "?%";
        return `charge ${pct} du 1RM (auto)`;
      }
      if (load.values?.length) {
        return `charge [${load.values.join(" → ")}]`;
      }
      return "charge custom";
    default: return "charge ?";
  }
}

function formatTempoEx(tempo?: ExerciseMethodConfig["tempo"]): string {
  if (!tempo) return "";
  const parts = [
    tempo.eccentric_s  != null ? `${tempo.eccentric_s}s exc.`  : null,
    tempo.pause_s      != null ? `${tempo.pause_s}s pause`      : null,
    tempo.concentric_s != null ? `${tempo.concentric_s}s conc.` : null,
  ].filter(Boolean);
  return parts.length ? ` | tempo ${parts.join(" / ")}` : "";
}

function buildExercisePreview(cfg: ExerciseMethodConfig): string {
  const sets  = cfg.sets?.count ?? "?";
  const reps  = formatRepsEx(cfg.reps);
  const rest  = formatRestEx(cfg.rest_between);
  const load  = formatLoadEx(cfg.load);
  const tempo = formatTempoEx(cfg.tempo);
  const rir   = cfg.rir_required ? " | RIR requis" : "";
  return `${sets} × ${reps} | ${rest} | ${load}${tempo}${rir}`;
}

// ── Classic scope ──

function formatRepsClassic(reps: ClassicMethodConfig["reps"]): string {
  switch (reps.type) {
    case "fixed": return `${reps.value ?? "?"} reps`;
    case "range": return `${reps.min ?? "?"}-${reps.max ?? "?"} reps`;
    case "amrap":  return "AMRAP";
    default: return "reps";
  }
}

function formatLoadClassic(load: ClassicMethodConfig["load"]): string {
  const ref = load.reference ? ` @ ${load.reference}` : "";
  switch (load.type) {
    case "same":       return `charge identique${ref}`;
    case "ascending":  return `charge +${load.pct_change ?? "?"}% par série${ref}`;
    case "descending": return `charge -${load.pct_change ?? "?"}% par série${ref}`;
    case "custom": {
      if (load.values?.length) {
        const unit = load.values_unit === "pct" ? "%" : "";
        return `charge [${load.values.map(v => `${v}${unit}`).join(" → ")}]` + ref;
      }
      return `charge custom${ref}`;
    }
    default: return "charge ?";
  }
}

function buildClassicPreview(cfg: ClassicMethodConfig): string {
  const sets = cfg.sets?.count ?? "?";
  const reps = formatRepsClassic(cfg.reps);
  const rest = formatRestEx(cfg.rest_between);
  const load = formatLoadClassic(cfg.load);
  const rir  = cfg.rir_required ? " | RIR requis" : "";
  return `${sets} × ${reps} | ${rest} | ${load}${rir}`;
}

// ─── Public utility ──────────────────────────────────────────────────────────

/**
 * Génère une description textuelle de la prescription d'une méthode.
 * Utilisée pour afficher la prescription dans les vues coach et athlète.
 */
export function methodConfigToText(config: MethodConfig): string {
  try {
    if (config.scope === "set")      return buildSetPreview(config as SetMethodConfig);
    if (config.scope === "classic")  return buildClassicPreview(config as ClassicMethodConfig);
    return buildExercisePreview(config as ExerciseMethodConfig);
  } catch {
    return "Méthode";
  }
}

export type WeekFields = {
  sets?: number;
  repsRange?: string;
  kg?: number;
  pct_rm?: number;
  setKgs?: number[];
  setPctRms?: number[];
  rir?: number;
};

/**
 * Dérive les champs sets/repsRange/charge/RIR depuis une config de méthode.
 * Utilisé pour pré-remplir la semaine d'exercice lors de l'attachement.
 */
export function methodConfigToWeekFields(config: MethodConfig): WeekFields {
  // ─── helpers charge ────────────────────────────────────────────────────────
  function parseKgRef(ref?: string): number | undefined {
    if (!ref) return undefined;
    const m = ref.trim().match(/^(\d+(?:\.\d+)?)\s*kg$/i);
    return m ? parseFloat(m[1]) : undefined;
  }
  function parsePctRef(ref?: string): number | undefined {
    if (!ref) return undefined;
    const m = ref.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
    return m ? parseFloat(m[1]) : undefined;
  }

  function loadFields(
    load: ClassicMethodConfig["load"] | SetMethodConfig["load"],
    sets: number,
  ): Pick<WeekFields, "kg" | "pct_rm" | "setKgs" | "setPctRms"> {
    const isPct = load.values_unit === "pct";

    // Charges par série explicites
    if (load.type === "custom" && load.values && load.values.length > 0) {
      if (isPct) return { setPctRms: load.values.slice(0, sets) };
      return { setKgs: load.values.slice(0, sets) };
    }

    // Charge globale depuis reference texte libre
    const kgRef = parseKgRef((load as ClassicMethodConfig["load"]).reference);
    if (kgRef) return { kg: kgRef };
    const pctRef = parsePctRef((load as ClassicMethodConfig["load"]).reference);
    if (pctRef) return { pct_rm: pctRef };

    return {};
  }

  function loadFieldsEx(
    load: ExerciseMethodConfig["load"],
    sets: number,
  ): Pick<WeekFields, "kg" | "pct_rm" | "setKgs" | "setPctRms"> {
    // Mode 1RM auto
    if (load.mode === "pct_1rm" && load.pct_of_1rm != null) {
      return { pct_rm: load.pct_of_1rm };
    }
    const isPct = load.values_unit === "pct";
    if (load.type === "custom" && load.values && load.values.length > 0) {
      if (isPct) return { setPctRms: load.values.slice(0, sets) };
      return { setKgs: load.values.slice(0, sets) };
    }
    return {};
  }

  // ─── Classic ───────────────────────────────────────────────────────────────
  if (config.scope === "classic") {
    const sets = config.sets.count;
    const r = config.reps;
    const repsRange =
      r.type === "range"  ? `${r.min ?? "?"}–${r.max ?? "?"}` :
      r.type === "fixed"  ? String(r.value ?? "?") :
      r.type === "amrap"  ? "AMRAP" : undefined;
    const rir = config.rir_required ? 2 : undefined;
    return {
      sets,
      ...(repsRange ? { repsRange } : {}),
      ...(rir != null ? { rir } : {}),
      ...loadFields(config.load, sets),
    };
  }

  // ─── Exercise ──────────────────────────────────────────────────────────────
  if (config.scope === "exercise") {
    const sets = config.sets.count;
    const r = config.reps;
    const repsRange =
      r.type === "fixed"      ? String(r.value ?? "?") :
      r.type === "ascending"  ? "Pyramide ↑" :
      r.type === "descending" ? "Pyramide ↓" :
      r.type === "custom" && r.pattern?.length ? r.pattern.join(",") : undefined;
    const rir = config.rir_required ? 2 : undefined;
    return {
      sets,
      ...(repsRange ? { repsRange } : {}),
      ...(rir != null ? { rir } : {}),
      ...loadFieldsEx(config.load, sets),
    };
  }

  // ─── Set scope — dérive les champs des sous-séries ────────────────────────
  if (config.scope === "set") {
    const ss = config.sub_sets;

    // repsRange : "3×5" (nb sous-séries × reps par sous-série)
    const subReps =
      ss.reps.type === "fixed"   ? String(ss.reps.value ?? "?") :
      ss.reps.type === "custom" && ss.reps.pattern?.length ? ss.reps.pattern.join(",") :
      ss.reps.type === "amrap"   ? "AMRAP" :
      ss.reps.type === "decreasing" && ss.reps.value ? `${ss.reps.value},${ss.reps.value - 1},…` :
      ss.reps.type === "increasing" && ss.reps.value ? `${ss.reps.value},${ss.reps.value + 1},…` :
      undefined;
    const subCount =
      ss.count.type === "fixed" ? ss.count.value :
      ss.count.type === "range" ? ss.count.min : undefined;
    const repsRange = subCount && subReps ? `${subCount}×${subReps}` : subReps;

    // Pour scope="set", les valeurs load sont celles des sous-séries (gérées par method_attachment).
    // On extrait uniquement une référence globale kg/% si définie explicitement en texte libre.
    const kgRef = parseKgRef((config.load as ClassicMethodConfig["load"]).reference);
    const pctRef = parsePctRef((config.load as ClassicMethodConfig["load"]).reference);
    const loadF = kgRef ? { kg: kgRef } : pctRef ? { pct_rm: pctRef } : {};

    return { ...(repsRange ? { repsRange } : {}), ...loadF };
  }

  return {};
}

// ─── Component ───────────────────────────────────────────────────────────────

interface MethodPreviewProps {
  config: Partial<MethodConfig> | null;
  compact?: boolean;
}

export function MethodPreview({ config, compact = false }: MethodPreviewProps) {
  if (!config || !config.scope) {
    return (
      <div style={{ fontSize: 12, color: C.tx3, fontStyle: "italic" }}>
        Aperçu disponible après configuration
      </div>
    );
  }

  let preview: string;
  try {
    if (config.scope === "set") {
      preview = buildSetPreview(config as SetMethodConfig);
    } else if (config.scope === "classic") {
      preview = buildClassicPreview(config as ClassicMethodConfig);
    } else {
      preview = buildExercisePreview(config as ExerciseMethodConfig);
    }
  } catch {
    preview = "Configuration incomplète";
  }

  if (compact) {
    return (
      <div style={{
        fontSize: 11, color: C.tx3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {preview}
      </div>
    );
  }

  return (
    <div style={{
      background: C.s2, borderRadius: 4, padding: "10px 14px",
      border: `1px solid ${C.brdL}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Aperçu
      </div>
      <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5, fontFamily: "monospace" }}>
        {preview}
      </div>
    </div>
  );
}

// ─── RestConfig (shared with MethodBuilder) ───────────────────────────────────

export interface RestConfig {
  type: 'free' | 'fixed' | 'variable'
  seconds: number
  min_s: number
  max_s: number
}

// ─── ExerciceParams ↔ MethodConfig converters ─────────────────────────────────

export function exerciceParamsToMethodConfig(
  params: ExerciceParams,
  rest: RestConfig,
  scope: MethodScope,
): Partial<MethodConfig> {

  const rest_between = {
    type: rest.type,
    seconds:  rest.type === 'fixed'    ? rest.seconds : undefined,
    min_s:    rest.type === 'variable' ? rest.min_s   : undefined,
    max_s:    rest.type === 'variable' ? rest.max_s   : undefined,
  }

  const rirRequired = !(params.rir.mode === 'global' && params.rir.value === null)

  // Charge → ClassicMethodConfig load
  function buildLoadClassic(): ClassicMethodConfig['load'] {
    if (params.charge_unit === 'PDC') return { type: 'same', reference: 'PDC' }
    if (params.charge.mode === 'par_serie') {
      const values = params.charge.values.filter((v): v is number => v !== null)
      return { type: 'custom', values, values_unit: params.charge_unit === '%RM' ? 'pct' : undefined }
    }
    const val = params.charge.value
    if (val === null) return { type: 'same' }
    return { type: 'same', reference: params.charge_unit === '%RM' ? `${val}%` : `${val}kg` }
  }

  // Charge → ExerciseMethodConfig load
  function buildLoadEx(): ExerciseMethodConfig['load'] {
    if (params.charge_unit === 'PDC') return { type: 'same' }
    if (params.charge.mode === 'par_serie') {
      const values = params.charge.values.filter((v): v is number => v !== null)
      return { type: 'custom', values, values_unit: params.charge_unit === '%RM' ? 'pct' : undefined }
    }
    const val = params.charge.value
    if (val === null) return { type: 'same' }
    if (params.charge_unit === '%RM') return { type: 'custom', mode: 'pct_1rm', pct_of_1rm: val }
    return { type: 'same', reference: `${val}kg` }
  }

  // ── Set scope ──
  if (scope === 'set') {
    const cluster = params.cluster ?? { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 }
    const safeReps: number[] = Array.isArray(cluster.reps) ? cluster.reps : Array(cluster.nb_clusters).fill(5)
    return {
      scope: 'set',
      sub_sets: {
        count: { type: 'fixed', value: cluster.nb_clusters },
        reps: { type: 'custom', pattern: safeReps },
        rest_intra: cluster.recup_sec > 0
          ? { type: 'fixed', seconds: cluster.recup_sec }
          : { type: 'free' },
      },
      load: buildLoadClassic(),
      rir_required: rirRequired,
    } as SetMethodConfig
  }

  // ── Reps for classic ──
  function buildRepsClassic(): ClassicMethodConfig['reps'] {
    if (params.reps.mode === 'par_serie') {
      const vals = params.reps.values
      if (vals.length > 0) {
        const mn = Math.min(...vals), mx = Math.max(...vals)
        return mn === mx ? { type: 'fixed', value: mn } : { type: 'range', min: mn, max: mx }
      }
    }
    return { type: 'fixed', value: params.reps.mode === 'global' ? params.reps.value : 8 }
  }

  // ── Reps for exercise ──
  function buildRepsEx(): ExerciseMethodConfig['reps'] {
    if (params.reps.mode === 'par_serie') {
      return { type: 'custom', pattern: params.reps.values }
    }
    return { type: 'fixed', value: params.reps.mode === 'global' ? params.reps.value : 8 }
  }

  if (scope === 'classic') {
    return {
      scope: 'classic',
      sets: { count: params.nb_series },
      reps: buildRepsClassic(),
      rest_between,
      load: buildLoadClassic(),
      rir_required: rirRequired,
    } as ClassicMethodConfig
  }

  // ── Exercise scope ──
  const tempoStr = params.tempo.mode === 'global' ? params.tempo.value : ''
  let tempo: ExerciseMethodConfig['tempo'] | undefined
  if (tempoStr) {
    const parts = tempoStr.split('-').map(Number)
    if (parts.length >= 3) {
      tempo = {
        eccentric_s:  isNaN(parts[0]) || parts[0] === 0 ? undefined : parts[0],
        pause_s:      isNaN(parts[1]) || parts[1] === 0 ? undefined : parts[1],
        concentric_s: isNaN(parts[2]) || parts[2] === 0 ? undefined : parts[2],
      }
    }
  }

  return {
    scope: 'exercise',
    sets: { count: params.nb_series },
    reps: buildRepsEx(),
    rest_between,
    load: buildLoadEx(),
    ...(tempo ? { tempo } : {}),
    rir_required: rirRequired,
  } as ExerciseMethodConfig
}

export function methodConfigToExerciceParams(config: MethodConfig, _scope: MethodScope): ExerciceParams {
  function parseRef(ref?: string): { unit: '%RM' | 'kg' | 'PDC'; value: number | null } {
    if (!ref) return { unit: 'kg', value: null }
    if (ref === 'PDC') return { unit: 'PDC', value: null }
    const pct = ref.match(/^(\d+(?:\.\d+)?)\s*%/)
    if (pct) return { unit: '%RM', value: parseFloat(pct[1]) }
    const kg = ref.match(/^(\d+(?:\.\d+)?)\s*kg/i)
    if (kg) return { unit: 'kg', value: parseFloat(kg[1]) }
    return { unit: 'kg', value: null }
  }

  // ── Set scope ──
  if (config.scope === 'set') {
    const ss = config.sub_sets ?? { count: { type: 'fixed' as const, value: 3 }, reps: { type: 'fixed' as const, value: 5 }, rest_intra: { type: 'free' as const } }
    const nbClusters = ss.count?.type === 'fixed' ? (ss.count.value ?? 3) : (ss.count?.min ?? 3)
    const reps: number[] = ss.reps?.type === 'custom' && ss.reps.pattern?.length
      ? ss.reps.pattern
      : Array(nbClusters).fill(ss.reps?.value ?? 5)
    const recupSec = ss.rest_intra?.type === 'fixed' ? (ss.rest_intra.seconds ?? 15) : 15

    let charge_unit: ExerciceParams['charge_unit'] = 'kg'
    let charge: ExerciceParams['charge'] = { mode: 'global', value: null }
    const load = config.load ?? {}
    if ((load as SetMethodConfig['load']).type === 'custom' && (load as SetMethodConfig['load']).values?.length) {
      const l = load as SetMethodConfig['load']
      charge_unit = l.values_unit === 'pct' ? '%RM' : 'kg'
      charge = { mode: 'par_serie', values: l.values! }
    } else {
      const ref = parseRef((load as SetMethodConfig['load']).reference)
      charge_unit = ref.unit === 'PDC' ? 'PDC' : ref.unit
      charge = { mode: 'global', value: ref.value }
    }

    return {
      nb_series: nbClusters,
      cluster: { nb_clusters: nbClusters, reps, recup_sec: recupSec },
      reps: { mode: 'global', value: reps[0] ?? 5 },
      reps_mode: { mode: 'global', value: 'EC' },
      charge_unit,
      charge,
      rir: { mode: 'global', value: config.rir_required ? 2 : null },
      tempo: { mode: 'global', value: '' },
    }
  }

  // ── Classic / Exercise ──
  const sets = (config as ClassicMethodConfig | ExerciseMethodConfig).sets?.count ?? 4
  const repsConfig = (config as ClassicMethodConfig | ExerciseMethodConfig).reps ?? { type: 'fixed', value: 8 }

  let reps: ExerciceParams['reps']
  if ('pattern' in repsConfig && repsConfig.pattern?.length) {
    reps = { mode: 'par_serie', values: repsConfig.pattern as number[] }
  } else if ('max' in repsConfig && repsConfig.max != null) {
    reps = { mode: 'global', value: repsConfig.max }
  } else if ('value' in repsConfig && repsConfig.value != null) {
    reps = { mode: 'global', value: repsConfig.value }
  } else {
    reps = { mode: 'global', value: 8 }
  }

  let charge_unit: ExerciceParams['charge_unit'] = 'kg'
  let charge: ExerciceParams['charge'] = { mode: 'global', value: null }
  const load = ((config as ClassicMethodConfig | ExerciseMethodConfig).load ?? {}) as Record<string, unknown>

  if (load.mode === 'pct_1rm') {
    charge_unit = '%RM'
    charge = { mode: 'global', value: (load.pct_of_1rm as number | null) ?? null }
  } else if (load.type === 'custom' && Array.isArray(load.values) && load.values.length) {
    charge_unit = load.values_unit === 'pct' ? '%RM' : 'kg'
    charge = { mode: 'par_serie', values: load.values as number[] }
  } else {
    const ref = parseRef(load.reference as string | undefined)
    charge_unit = ref.unit
    charge = { mode: 'global', value: ref.value }
  }

  // Tempo (exercise scope)
  let tempo: ExerciceParams['tempo'] = { mode: 'global', value: '' }
  if (config.scope === 'exercise' && config.tempo) {
    const t = config.tempo
    const parts = [t.eccentric_s ?? 0, t.pause_s ?? 0, t.concentric_s ?? 0]
    tempo = { mode: 'global', value: parts.join('-') }
  }

  return {
    nb_series: sets,
    reps,
    reps_mode: { mode: 'global', value: 'EC' },
    charge_unit,
    charge,
    rir: { mode: 'global', value: config.rir_required ? 2 : null },
    tempo,
  }
}

// ─── Builder for partial form values → MethodConfig ──────────────────────────

/** Convertit les valeurs brutes du formulaire en MethodConfig partielle pour preview. */
export function formValuesToConfig(vals: Record<string, unknown>): Partial<MethodConfig> | null {
  // Bypass: if a pre-built config is passed (from ExerciceParams-based Step2), use it directly
  if (vals._method_config) {
    try { return JSON.parse(vals._method_config as string) as Partial<MethodConfig> } catch { /* fall through */ }
  }
  const scope = vals.scope as "set" | "exercise" | undefined;
  if (!scope) return null;
  const weekly_configs = vals.weekly_configs as FullWeekConfig[] | undefined;

  if (scope === "classic") {
    return {
      scope: "classic",
      sets:  { count: Number(vals.cl_sets_count) || 4 },
      reps: {
        type:  (vals.cl_reps_type as ClassicMethodConfig["reps"]["type"]) ?? "range",
        value: vals.cl_reps_type === "fixed" ? Number(vals.cl_reps_value) || undefined : undefined,
        min:   vals.cl_reps_type === "range" ? Number(vals.cl_reps_min)   || undefined : undefined,
        max:   vals.cl_reps_type === "range" ? Number(vals.cl_reps_max)   || undefined : undefined,
      },
      rest_between: {
        type:    (vals.cl_rest_type as "free" | "fixed" | "variable") ?? "free",
        seconds: vals.cl_rest_type === "fixed"    ? Number(vals.cl_rest_seconds) || undefined : undefined,
        min_s:   vals.cl_rest_type === "variable" ? Number(vals.cl_rest_min_s)   || undefined : undefined,
        max_s:   vals.cl_rest_type === "variable" ? Number(vals.cl_rest_max_s)   || undefined : undefined,
      },
      load: {
        type:       (vals.cl_load_type as ClassicMethodConfig["load"]["type"]) ?? "same",
        pct_change: (vals.cl_load_type === "ascending" || vals.cl_load_type === "descending")
          ? Number(vals.cl_load_pct_change) || undefined : undefined,
        values: vals.cl_load_type === "custom"
          ? String(vals.cl_load_custom_values ?? "").split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0)
          : undefined,
        values_unit: vals.cl_load_type === "custom" && vals.cl_load_values_unit === "pct" ? "pct" : undefined,
        reference: String(vals.cl_load_reference ?? "").trim() || undefined,
      },
      rir_required: Boolean(vals.cl_rir_required),
      ...(weekly_configs?.length ? { weekly_configs } : {}),
    } as ClassicMethodConfig;
  }

  if (scope === "set") {
    return {
      scope: "set",
      sub_sets: {
        count: {
          type:  (vals.set_sub_sets_count_type as "fixed" | "range") ?? "fixed",
          value: vals.set_sub_sets_count_type === "fixed"  ? Number(vals.set_sub_sets_count_value) || undefined : undefined,
          min:   vals.set_sub_sets_count_type === "range"  ? Number(vals.set_sub_sets_count_min)   || undefined : undefined,
          max:   vals.set_sub_sets_count_type === "range"  ? Number(vals.set_sub_sets_count_max)   || undefined : undefined,
        },
        reps: {
          type:    (vals.set_reps_type as SetMethodConfig["sub_sets"]["reps"]["type"]) ?? "fixed",
          value:   vals.set_reps_type === "fixed"  ? Number(vals.set_reps_value) || undefined : undefined,
          pattern: vals.set_reps_type === "custom"
            ? String(vals.set_reps_pattern ?? "").split(",").map(Number).filter(Boolean)
            : undefined,
        },
        rest_intra: {
          type:    (vals.set_rest_intra_type as "free" | "fixed") ?? "free",
          seconds: vals.set_rest_intra_type === "fixed" ? Number(vals.set_rest_intra_seconds) || undefined : undefined,
        },
      },
      load: {
        type:       (vals.set_load_type as SetMethodConfig["load"]["type"]) ?? "same",
        pct_change: (vals.set_load_type === "decreasing_pct" || vals.set_load_type === "increasing_pct")
          ? Number(vals.set_load_pct_change) || undefined
          : undefined,
        values: vals.set_load_type === "custom"
          ? String(vals.set_load_custom_values ?? "")
              .split(",")
              .map((s) => parseFloat(s.trim()))
              .filter((n) => !isNaN(n) && n > 0)
          : undefined,
        values_unit: vals.set_load_type === "custom" && vals.set_load_values_unit === "pct" ? "pct" : undefined,
        reference: String(vals.set_load_reference ?? "").trim() || undefined,
      },
      rir_required: Boolean(vals.set_rir_required),
      ...(weekly_configs?.length ? { weekly_configs } : {}),
    } as SetMethodConfig;
  }

  // exercise
  const tempoEnabled = Boolean(vals.ex_tempo_enabled);
  return {
    scope: "exercise",
    sets:  { count: Number(vals.ex_sets_count) || 3 },
    reps: {
      type:    (vals.ex_reps_type as ExerciseMethodConfig["reps"]["type"]) ?? "fixed",
      value:   vals.ex_reps_type === "fixed"  ? Number(vals.ex_reps_value)   || undefined : undefined,
      pattern: vals.ex_reps_type === "custom"
        ? String(vals.ex_reps_pattern ?? "").split(",").map(Number).filter(Boolean)
        : undefined,
    },
    rest_between: {
      type:    (vals.ex_rest_type as "free" | "fixed" | "variable") ?? "free",
      seconds: vals.ex_rest_type === "fixed"    ? Number(vals.ex_rest_seconds) || undefined : undefined,
      min_s:   vals.ex_rest_type === "variable" ? Number(vals.ex_rest_min_s)   || undefined : undefined,
      max_s:   vals.ex_rest_type === "variable" ? Number(vals.ex_rest_max_s)   || undefined : undefined,
    },
    load: {
      type:       (vals.ex_load_type as ExerciseMethodConfig["load"]["type"]) ?? "same",
      ...(vals.ex_load_type === "custom" && vals.ex_load_1rm_mode ? {
        mode:       "pct_1rm" as const,
        pct_of_1rm: Number(vals.ex_load_pct_1rm) || undefined,
      } : {}),
      ...(vals.ex_load_type === "custom" && !vals.ex_load_1rm_mode ? {
        values: String(vals.ex_load_values ?? "")
          .split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0),
        values_unit: vals.ex_load_values_unit === "pct" ? "pct" as const : undefined,
      } : {}),
    },
    tempo: tempoEnabled ? {
      eccentric_s:  Number(vals.ex_tempo_eccentric)  || undefined,
      pause_s:      Number(vals.ex_tempo_pause)       || undefined,
      concentric_s: Number(vals.ex_tempo_concentric)  || undefined,
    } : undefined,
    rir_required: Boolean(vals.ex_rir_required),
    ...(weekly_configs?.length ? { weekly_configs } : {}),
  } as ExerciseMethodConfig;
}
