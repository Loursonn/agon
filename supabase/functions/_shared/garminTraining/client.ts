/**
 * Appels Training API V2 (création / suppression d'une séance, programmation
 * à une date). Le jeton est celui de l'athlète (`freshAccessToken`).
 *
 * Codes Garmin : 401 jeton inconnu, 403 interdit, 412 permission
 * « Workout Import » refusée par l'athlète, 429 quota (200 appels / athlète /
 * 24 h en Starter). Une erreur n'est jamais traitée comme un succès.
 */
import type { FetchLike } from "../oauth.ts";
import type { GarminWorkout } from "./types.ts";

export const TRAINING_ENDPOINTS = {
  createWorkout: "https://apis.garmin.com/workoutportal/workout/v2",
  workout: (id: string) => `https://apis.garmin.com/training-api/workout/v2/${encodeURIComponent(id)}`,
  createSchedule: "https://apis.garmin.com/training-api/schedule/",
  schedule: (id: string) => `https://apis.garmin.com/training-api/schedule/${encodeURIComponent(id)}`,
} as const;

export class GarminTrainingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GarminTrainingError";
  }
  /** Inutile d'insister pour cet athlète pendant ce passage. */
  get stopsAthlete(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 412 || this.status === 429;
  }
}

function explain(status: number): string {
  switch (status) {
    case 400:
      return "séance refusée par Garmin (400)";
    case 401:
      return "jeton Garmin refusé (401) : reconnexion nécessaire";
    case 403:
      return "accès refusé par Garmin (403)";
    case 412:
      return "l'athlète n'a pas autorisé l'envoi de séances dans Garmin Connect (412)";
    case 429:
      return "quota Garmin atteint (429), nouvel essai plus tard";
    default:
      return `erreur Garmin (${status})`;
  }
}

async function call(fetchImpl: FetchLike, token: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetchImpl(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new GarminTrainingError(body ? `${explain(res.status)} — ${body}` : explain(res.status), res.status);
  }
  return res;
}

/** Identifiant dans une réponse : nombre nu, ou objet portant `key`. */
export function readId(body: unknown, key: string): string | null {
  if (typeof body === "number" || (typeof body === "string" && /^\d+$/.test(body.trim()))) return String(body).trim();
  if (body && typeof body === "object") {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === "number" || (typeof v === "string" && v.trim())) return String(v).trim();
  }
  return null;
}

async function jsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface GarminTrainingClient {
  createWorkout(workout: GarminWorkout): Promise<string>;
  deleteWorkout(id: string): Promise<void>;
  scheduleWorkout(workoutId: string, date: string): Promise<string | null>;
}

export function garminTrainingClient(token: string, fetchImpl: FetchLike = fetch): GarminTrainingClient {
  return {
    async createWorkout(workout) {
      const res = await call(fetchImpl, token, TRAINING_ENDPOINTS.createWorkout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workout),
      });
      const id = readId(await jsonOrText(res), "workoutId");
      if (!id) throw new GarminTrainingError("réponse Garmin sans identifiant de séance", 502);
      return id;
    },
    async deleteWorkout(id) {
      try {
        await call(fetchImpl, token, TRAINING_ENDPOINTS.workout(id), { method: "DELETE" });
      } catch (e) {
        // Déjà supprimée par l'athlète dans Garmin Connect : c'est le résultat voulu.
        if (e instanceof GarminTrainingError && e.status === 404) return;
        throw e;
      }
    },
    async scheduleWorkout(workoutId, date) {
      const res = await call(fetchImpl, token, TRAINING_ENDPOINTS.createSchedule, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: Number(workoutId), date }),
      });
      return readId(await jsonOrText(res), "scheduleId");
    },
  };
}
