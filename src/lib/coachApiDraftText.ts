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

export function namesFrom(prog: ProgSessionShape[] | undefined): Names {
  const s = (id: string) => prog?.find((x) => x.id === id);
  return {
    session: (id) => s(id)?.name ?? "séance supprimée",
    exercice: (sid, eid) => {
      for (const b of s(sid)?.blocs ?? []) for (const e of b.exercices) if (e.id === eid) return e.exercise_name;
      return "exercice supprimé";
    },
    bloc: (sid, bid) => s(sid)?.blocs.find((b) => b.id === bid)?.name ?? "bloc supprimé",
  };
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
  }
}
