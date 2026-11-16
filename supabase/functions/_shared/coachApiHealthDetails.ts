/**
 * Détails santé lus par l'assistant IA du coach (`GET /athletes/:id/summary`,
 * bloc `details_sante`) : douleur et maladie du matin, envie, courbatures et
 * douleurs par zone, douleur de suivi d'une blessure, bilan hebdomadaire.
 *
 * Servis seulement si l'athlète a accepté l'accord IA sous un texte qui les
 * nomme (`AI_HEALTH_DETAILS_SINCE`, 15/11/2026). Sous l'ancien texte, ils sont
 * promis « jamais transmis » : le bloc est alors absent, et le reste du résumé
 * ne bouge pas d'un octet (des skills externes le lisent).
 *
 * Même règle que `coachApiRead.ts` : chiffres et choix dans une liste, jamais
 * le texte libre de l'athlète (engagements écrits, « ce qui a marché », mot au
 * coach, note de blessure). Seule exception, la zone de douleur du bilan, déjà
 * transmise pour les blessures : 40 caractères, une ligne (`zoneLabel`).
 *
 * Module pur pour la mise en forme (vitest), plus un lecteur de tables.
 */
import { check, type Db, type Row } from "./coachApiDb.ts";
import { addDays, type IsoDay } from "./domain/dates.ts";
import { zoneLabel } from "./domain/injuries.ts";
import type { WellnessEntry } from "./domain/wellness.ts";

// ── Lecture ───────────────────────────────────────────────────────────────────

export interface HealthDetailsInput {
  /** `weekly_reviews` envoyées : week_start, submitted_at, answers, light. */
  reviews: Row[];
  /** `weekly_retours` : week_start, athlete_reaction (le commentaire ne sort pas). */
  retours: Row[];
  /** `injury_followups` : day, entry_id, pain_level, workout_log_id, energy_assignment_id. */
  followups: Row[];
  /** `medical_entries` des suivis : id, kind, zone. */
  followupInjuries: Row[];
}

const LIMIT = 500;

export async function readHealthDetails(db: Db, athleteId: string, from: string, to: string): Promise<HealthDetailsInput> {
  // Une semaine commencée jusqu'à 6 jours avant `from` touche encore la période.
  const weekFrom = addDays(from as IsoDay, -6);
  const [reviews, retours, followups] = await Promise.all([
    db.from("weekly_reviews").select("week_start, submitted_at, answers, light")
      .eq("athlete_id", athleteId).eq("status", "submitted")
      .gte("week_start", weekFrom).lte("week_start", to)
      .order("week_start").limit(LIMIT),
    db.from("weekly_retours").select("week_start, athlete_reaction")
      .eq("athlete_id", athleteId)
      .gte("week_start", weekFrom).lte("week_start", to)
      .order("week_start").limit(LIMIT),
    // Pas `note` : texte libre.
    db.from("injury_followups").select("day, entry_id, pain_level, workout_log_id, energy_assignment_id")
      .eq("athlete_id", athleteId).gte("day", from).lte("day", to)
      .order("day").limit(LIMIT),
  ]);
  const followupRows = check<Row[] | null>(followups, "injury_followups") ?? [];
  const ids = [...new Set(followupRows.map((f) => f.entry_id).filter((v): v is string => typeof v === "string"))];
  const injuries = ids.length
    ? check<Row[] | null>(
      await db.from("medical_entries").select("id, kind, zone").eq("athlete_id", athleteId).in("id", ids),
      "medical_entries",
    ) ?? []
    : [];
  return {
    reviews: check<Row[] | null>(reviews, "weekly_reviews") ?? [],
    retours: check<Row[] | null>(retours, "weekly_retours") ?? [],
    followups: followupRows,
    followupInjuries: injuries,
  };
}

// ── Mise en forme ─────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Entier dans une plage, sinon null — jamais un zéro inventé. */
function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
const day = (v: unknown): string | null => (typeof v === "string" && DAY.test(v) ? v.slice(0, 10) : null);

/** Identifiant de zone de la carte du corps (`src/lib/bodyZones.ts`) : jamais du texte saisi. */
const ZONE_ID = /^[a-z][a-z_]{1,29}$/;

/** Carte zone → note, clés d'identifiant seulement, notes bornées. */
function zoneLevels(v: unknown, min: number, max: number): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(obj(v)).slice(0, 40)) {
    const n = int(raw, min, max);
    if (ZONE_ID.test(k) && n !== null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

function oneOf<T extends string>(v: unknown, map: Record<string, T>): T | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : null;
}

const KEPT = { kept: "tenu", partly: "en_partie", missed: "pas_tenu" } as const;
const STUCK = { moi: "moi", programme: "programme", vie: "vie" } as const;
const PAIN_KIND = { douleur: "douleur", blessure: "blessure" } as const;
const LIGHT = { green: "vert", orange: "orange", red: "rouge" } as const;
const REACTION = { like: "like", strong: "bravo", fire: "feu", heart: "coeur" } as const;

/** Notes du bilan : clé de `answers.feel` → nom transmis. */
const FEEL = { note: "semaine", energie: "energie", motivation: "motivation", vie: "charge_de_vie", nutrition: "nutrition" } as const;

function morning(e: WellnessEntry) {
  const out = {
    date: e.day,
    envie: int(e.envie, 1, 5),
    douleur: int(e.pain, 0, 10),
    douleur_zones: zoneLevels(e.painLevels, 1, 10),
    courbatures_zones: zoneLevels(e.domsLevels, 1, 3),
    malade: typeof e.sick === "boolean" ? e.sick : null,
  };
  const empty = out.envie === null && out.douleur === null && !out.douleur_zones && !out.courbatures_zones && out.malade === null;
  return empty ? null : out;
}

function review(r: Row, reactions: Map<string, string | null>) {
  const week = day(r.week_start);
  if (!week) return null;
  const a = obj(r.answers);
  const feel = obj(a.feel);
  const notes: Record<string, number | null> = {};
  for (const [k, name] of Object.entries(FEEL)) notes[name] = int(feel[k], 1, 5);
  const pain = obj(a.pain);
  const painOut = {
    zone: zoneLabel(pain.zone),
    type: oneOf(pain.kind, PAIN_KIND),
    niveau: int(pain.level, 0, 10),
  };
  return {
    semaine_du: week,
    envoye_le: day(r.submitted_at),
    feu: oneOf(r.light, LIGHT),
    notes,
    // Statut seul : le texte de l'engagement et son « pourquoi » restent chez l'athlète.
    engagements: (Array.isArray(a.kept) ? a.kept : []).slice(0, 10).map((k) => oneOf(obj(k).status, KEPT)),
    blocage: oneOf(a.stuckCause, STUCK),
    douleur: painOut.zone === null && painOut.type === null && painOut.niveau === null ? null : painOut,
    retour_coach: reactions.has(week),
    reaction_au_retour: reactions.get(week) ?? null,
  };
}

export function buildHealthDetails(wellness: WellnessEntry[], input: HealthDetailsInput, from: string, to: string) {
  const zones = new Map<string, string | null>();
  for (const m of input.followupInjuries) {
    if (typeof m.id === "string" && m.kind === "blessure") zones.set(m.id, zoneLabel(m.zone));
  }
  const reactions = new Map<string, string | null>();
  for (const r of input.retours) {
    const week = day(r.week_start);
    if (week) reactions.set(week, oneOf(r.athlete_reaction, REACTION));
  }
  const inRange = (d: string | null): d is string => d !== null && d >= from && d <= to;

  return {
    echelles: {
      envie: "1 à 5, 5 = très envie",
      douleur: "0 à 10, 0 = aucune",
      courbatures_zones: "1 légère, 2 marquée, 3 intense",
      notes_du_bilan: "1 à 5, 5 = mieux (charge_de_vie : 5 = légère)",
    },
    matin: wellness.filter((e) => inRange(e.day)).map(morning).filter((m) => m !== null),
    // Douleur notée pour une blessure déclarée (fin de séance ou suivi).
    suivi_blessures: input.followups
      .map((f) => ({
        date: day(f.day),
        // Une blessure qui n'en est plus une (ou d'un autre athlète) ne sort pas.
        known: typeof f.entry_id === "string" && zones.has(f.entry_id),
        zone: typeof f.entry_id === "string" ? zones.get(f.entry_id) ?? null : null,
        douleur: int(f.pain_level, 0, 10),
        apres_seance: f.workout_log_id != null || f.energy_assignment_id != null,
      }))
      .filter((f) => f.known && inRange(f.date) && f.douleur !== null)
      .map(({ date, zone, douleur, apres_seance }) => ({ date, zone, douleur, apres_seance })),
    bilans_hebdo: input.reviews.map((r) => review(r, reactions)).filter((r) => r !== null),
  };
}
