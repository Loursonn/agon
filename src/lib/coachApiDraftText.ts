/**
 * Description lisible des opérations d'une proposition de l'assistant IA.
 *
 * C'est ce que le coach lit avant de cliquer « Appliquer » : la phrase doit
 * dire exactement ce que l'opération fera, avec les noms qu'il connaît, pas
 * les identifiants.
 */
import type {
  DraftOp,
  ExerciceParamsShape,
  ParamValue,
  ProgSessionShape,
} from "@shared/coachApiOps.ts";
import type { EnergyDurationShape, EnergyIntervalShape, EnergyStepShape } from "@shared/coachApiEnergy.ts";
import type { EnergyTarget } from "@/types/energy";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import { DAY_THEME_DOMINANTE_LABEL, DAY_THEME_INTENSITY_LABEL } from "@/lib/dayTheme";

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function pv<T>(p: ParamValue<T> | undefined): string | null {
  if (!p) return null;
  if (p.mode === "global") return p.value === null || p.value === undefined || p.value === "" ? null : String(p.value);
  const vals = p.values.filter((v) => v !== null && v !== undefined && v !== "");
  return vals.length ? p.values.map((v) => (v === null || v === undefined || v === "" ? "–" : String(v))).join("/") : null;
}

/** « 4 × 8 @ 100 kg, RIR 2, tempo 3010 ». */
export function paramsText(p: ExerciceParamsShape): string {
  const reps = pv(p.reps) ?? "?";
  const repsMax = pv(p.reps_max);
  let out = `${p.nb_series} × ${repsMax ? `${reps}-${repsMax}` : reps}`;
  if (p.reps_mode && pv(p.reps_mode) === "iso") out += " (iso)";
  const charge = pv(p.charge);
  if (charge) out += ` @ ${charge} ${p.charge_unit === "%RM" ? "%RM" : p.charge_unit === "PDC" ? "kg (PDC)" : "kg"}`;
  else if (p.charge_unit === "PDC") out += " au poids du corps";
  const rir = pv(p.rir);
  if (rir) out += `, RIR ${rir}`;
  const tempo = pv(p.tempo);
  if (tempo) out += `, tempo ${tempo}`;
  return out;
}

interface Names {
  session: (id: string) => string;
  exercice: (sid: string, eid: string) => string;
  bloc: (sid: string, bid: string) => string;
}

/**
 * Noms lisibles des séances, blocs et exercices cités. Les séances créées
 * par la proposition elle-même (semaine) n'existent pas encore dans le
 * programme : on les prend dans ses opérations.
 */
export function namesFrom(prog: ProgSessionShape[] | undefined, ops: readonly DraftOp[] = []): Names {
  const created = ops.flatMap((o) => (o.op === "create_session" ? [o.session] : []));
  const s = (id: string) => prog?.find((x) => x.id === id) ?? created.find((x) => x.id === id);
  return {
    session: (id) => s(id)?.name ?? "séance supprimée",
    exercice: (sid, eid) => {
      for (const b of s(sid)?.blocs ?? []) for (const e of b.exercices) if (e.id === eid) return e.exercise_name;
      return "exercice supprimé";
    },
    bloc: (sid, bid) => s(sid)?.blocs.find((b) => b.id === bid)?.name ?? "bloc supprimé",
  };
}

const ROLE_LABEL: Record<string, string> = {
  warmup: "Échauffement",
  work: "Effort",
  recovery: "Récup",
  rest: "Repos",
  cooldown: "Retour au calme",
  open: "Libre",
};

export const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max / VMA",
  tempo: "Tempo",
  seuil: "Seuil",
  footing: "Footing",
  fartlek: "Fartlek",
  autre: "Autre",
};

function durationText(d: EnergyDurationShape): string {
  switch (d.kind) {
    case "time": return d.value % 60 === 0 && d.value < 3600 ? `${d.value / 60}'` : formatS(d.value);
    case "distance": return d.value >= 1000 ? `${(d.value / 1000).toString().replace(".", ",")} km` : `${d.value} m`;
    case "calories": return `${d.value} cal`;
    case "lap_button": return "jusqu'au tour";
  }
}

function intervalText(iv: EnergyIntervalShape): string {
  const target = formatTarget(iv.target as EnergyTarget);
  let out = `${ROLE_LABEL[iv.role] ?? iv.role} ${durationText(iv.duration)}`;
  if (target && iv.target.kind !== "none") out += ` @ ${target}`;
  if (iv.notes) out += ` — ${iv.notes}`;
  return out;
}

/** Une ligne par étape, groupes indentés : « 6 × », puis leurs étapes. */
export function energyStepLines(steps: readonly EnergyStepShape[], depth = 0): string[] {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  for (const st of steps) {
    if (st.type === "interval") {
      lines.push(pad + intervalText(st));
      continue;
    }
    let head = `${pad}${st.repeat} ×`;
    if (st.departure_every_s) head += ` (départ toutes les ${formatS(st.departure_every_s)})`;
    if (st.instructions) head += ` — ${st.instructions}`;
    lines.push(head);
    lines.push(...energyStepLines(st.children, depth + 1));
    if (st.rest_between) lines.push(`${pad}  entre les répétitions : ${intervalText(st.rest_between)}`);
  }
  return lines;
}

/** « Hard · Force — Jambes lourdes » */
export function dayThemeText(t: { label: string; intensity: string | null; dominante: string | null }): string {
  const tags = [
    t.intensity ? DAY_THEME_INTENSITY_LABEL[t.intensity as keyof typeof DAY_THEME_INTENSITY_LABEL] ?? t.intensity : null,
    t.dominante ? DAY_THEME_DOMINANTE_LABEL[t.dominante as keyof typeof DAY_THEME_DOMINANTE_LABEL] ?? t.dominante : null,
  ].filter(Boolean).join(" · ");
  if (tags && t.label) return `${tags} — ${t.label}`;
  return tags || t.label;
}

export function describeOp(op: DraftOp, names: Names): string {
  switch (op.op) {
    case "add_exercice": {
      const e = op.exercice;
      const what = e.mode === "libre" ? `« ${e.libre_text ?? ""} »` : paramsText(e.params as ExerciceParamsShape);
      const where = `${names.session(op.session_id)} › ${names.bloc(op.session_id, op.bloc_id)}`;
      const lib = e.exercise_id ? "" : " (hors bibliothèque)";
      return `Ajouter ${e.exercise_name}${lib} : ${what} — ${where}`;
    }
    case "update_exercice": {
      const parts: string[] = [];
      if (op.params) parts.push(`${paramsText(op.params)} à partir de la séance n° ${op.a_partir_de}`);
      if (op.comment !== undefined) parts.push(op.comment ? `consigne « ${op.comment} »` : "consigne retirée");
      if (op.libre_text !== undefined) parts.push(`texte « ${op.libre_text} »`);
      return `Modifier ${names.exercice(op.session_id, op.exercice_id)} (${names.session(op.session_id)}) : ${parts.join(", ")}`;
    }
    case "remove_exercice":
      return `Retirer ${names.exercice(op.session_id, op.exercice_id)} de ${names.session(op.session_id)}`;
    case "set_bloc_instructions":
      return op.instructions
        ? `Consignes du bloc ${names.bloc(op.session_id, op.bloc_id)} (${names.session(op.session_id)}) : « ${op.instructions} »`
        : `Retirer les consignes du bloc ${names.bloc(op.session_id, op.bloc_id)} (${names.session(op.session_id)})`;
    case "set_session_schedule": {
      const day = op.day_of_week === null ? "sans jour fixe" : `le ${DAYS[op.day_of_week]}`;
      const rec = op.recurrence === "once" ? ", une seule fois" : op.recurrence === "weekly" ? ", chaque semaine" : "";
      return `Placer ${names.session(op.session_id)} ${day}${rec}`;
    }
    case "set_goals": {
      const hm = (v: { h: number; m: number }) => `${v.h}h${String(v.m).padStart(2, "0")}`;
      const parts: string[] = [];
      if (op.sessionsPerWeek !== undefined) parts.push(`${op.sessionsPerWeek} séances par semaine`);
      if (op.sleepTarget !== undefined) parts.push(`${op.sleepTarget} h de sommeil`);
      if (op.sleepBedtime) parts.push(`coucher à ${hm(op.sleepBedtime)}`);
      if (op.sleepWakeup) parts.push(`lever à ${hm(op.sleepWakeup)}`);
      return `Objectifs : ${parts.join(", ")}`;
    }
    case "create_session":
      return `Créer la séance ${op.session.name} (${op.session.blocs.reduce((n, b) => n + b.exercices.length, 0)} exercices)`;
    case "place_session":
      return `Placer ${names.session(op.session_id)} le ${op.date}`;
    case "create_energy_session":
      return `Créer la séance énergétique ${op.energy.name} (${ENERGY_KIND_LABEL[op.energy.session_kind] ?? op.energy.session_kind})`;
    case "place_energy_session":
      return `Placer ${op.name} le ${op.date}`;
    case "set_day_theme":
      return `Thème du ${op.date} : ${dayThemeText(op)}`;

    case "create_macrocycle":
      return `Créer le macrocycle ${op.row.name} ${span(op.row)}${op.row.objective ? ` — ${op.row.objective}` : ""}`;
    case "update_macrocycle":
      return `Modifier le macrocycle ${op.name} : ${patchText(op.patch)}`;
    case "delete_macrocycle":
      return `Supprimer le macrocycle ${op.name}, ses mésocycles, cycles et séances prévues (le réalisé reste)`;
    case "create_mesocycle": {
      const r = op.row;
      const extra = [
        r.frequency ? `${r.frequency} séances/sem.` : null,
        r.deload_week ? `décharge semaine ${r.deload_week}` : null,
        r.volume_config ? `volume ${VOLUME_LABEL[r.volume_config.type] ?? r.volume_config.type}` : null,
        r.intensity_config?.zones.length ? `zones ${r.intensity_config.zones.join(", ")}` : null,
      ].filter(Boolean).join(", ");
      return `Créer le mésocycle ${r.name} ${span(r)}${extra ? ` (${extra})` : ""}${r.objective ? ` — ${r.objective}` : ""}`;
    }
    case "update_mesocycle":
      return `Modifier le mésocycle ${op.name} : ${patchText(op.patch)}`;
    case "delete_mesocycle":
      return `Supprimer le mésocycle ${op.name}, ses cycles et séances prévues (le réalisé reste)`;
    case "create_cycle": {
      const deload = op.weeks.filter((w) => w.is_deload).map((w) => w.week_number);
      return `Créer le cycle ${op.row.name} ${span(op.row)}, ${op.weeks.length} semaine${op.weeks.length > 1 ? "s" : ""}`
        + (deload.length ? `, décharge semaine ${deload.join(" et ")}` : "")
        + (op.row.objective ? ` — ${op.row.objective}` : "");
    }
    case "update_cycle":
      return `Modifier le cycle ${op.name} : ${patchText(op.patch)}`
        + (op.patch.start_date ? " (les semaines suivent ; les séances prévues des semaines retirées partent)" : "");
    case "delete_cycle":
      return `Supprimer le cycle ${op.name} et ses séances prévues (le réalisé reste)`;
    case "set_week_deload":
      return `${op.cycle_name}, semaine ${op.week_number} : ${op.is_deload ? "décharge" : "plus de décharge"}`;
    case "schedule_session_in_cycle":
      return `Répartir ${names.session(op.session_id)} sur chaque semaine du cycle ${op.cycle_name}, à partir d'aujourd'hui`;
    case "remove_placement":
      return `Retirer ${names.session(op.session_id)} du ${op.date} (marquée sautée)`;
    case "remove_energy_placement":
      return `Retirer la séance énergétique du ${op.date}`;
    case "remove_day_theme":
      return `Retirer le thème du ${op.date}`;
    case "create_competition": {
      const r = op.row;
      return `Ajouter ${COMPETITION_LABEL[r.type] ?? r.type} ${r.name} le ${r.date} (priorité ${r.priority}${r.location ? `, ${r.location}` : ""})`;
    }
    case "update_competition":
      return `Modifier ${op.name} : ${patchText(op.patch)}`;
    case "delete_competition":
      return `Supprimer ${op.name}`;
    case "create_test":
      return `Planifier le test ${op.row.title} le ${op.row.date}${op.row.description ? ` — ${op.row.description}` : ""}`;
    case "update_test":
      return `Modifier le test ${op.title} : ${patchText(op.patch)}`;
    case "delete_test":
      return `Supprimer le test ${op.title}`;
    case "assign_fiche":
      return `Donner la fiche « ${op.title} »${op.perso ? " (rangée dans ses fiches perso)" : ""}${op.note ? ` — « ${op.note} »` : ""}`;
    case "unassign_fiche":
      return `Retirer la fiche « ${op.title} »`;
    case "attach_fiche":
      return `Rattacher la fiche « ${op.title} » à ${op.session_name}`;
    case "detach_fiche":
      return `Détacher la fiche « ${op.title} » de ${op.session_name}`;
    case "create_habit":
      return `Nouvelle habitude « ${op.row.name} »${op.enable_tracker ? " (active le suivi des habitudes)" : ""}`;
    case "update_habit":
      return `Modifier l'habitude « ${op.name} » : ${[
        op.patch.name ? `nom « ${op.patch.name} »` : null,
        op.patch.emoji ? "icône" : null,
        op.patch.color ? "couleur" : null,
      ].filter(Boolean).join(", ")}`;
    case "remove_habit":
      return `Retirer l'habitude « ${op.name} » (ses jours cochés restent)`;
  }
}

const VOLUME_LABEL: Record<string, string> = { progressive: "progressif", ondulant: "ondulant", plateau: "plateau", polarize: "polarisé" };
const COMPETITION_LABEL: Record<string, string> = { competition: "la compétition", match: "le match", stage: "le stage", off: "la coupure", autre: "l'événement" };

const fr = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const span = (r: { start_date: string; end_date: string }) => `du ${fr(r.start_date)} au ${fr(r.end_date)}`;

const FIELD_LABEL: Record<string, string> = {
  name: "nom", title: "titre", objective: "objectif", date: "date", type: "type", priority: "priorité",
  location: "lieu", description: "description", frequency: "séances/sem.", deload_week: "semaine de décharge",
};

/** « du 3 nov. au 30 nov., nom « Force » ». */
function patchText(patch: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof patch.start_date === "string" && typeof patch.end_date === "string") {
    parts.push(span({ start_date: patch.start_date, end_date: patch.end_date }));
  }
  for (const [k, v] of Object.entries(patch)) {
    if (k === "start_date" || k === "end_date") continue;
    if (k === "volume_config") parts.push(`volume ${VOLUME_LABEL[(v as { type: string }).type] ?? ""}`);
    else if (k === "intensity_config") parts.push(`zones ${(v as { zones: string[] }).zones.join(", ") || "aucune"}`);
    else parts.push(v === null || v === "" ? `${FIELD_LABEL[k] ?? k} retiré` : `${FIELD_LABEL[k] ?? k} « ${String(v)} »`);
  }
  return parts.join(", ");
}
