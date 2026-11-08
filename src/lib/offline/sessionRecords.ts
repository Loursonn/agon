/**
 * Records battus pendant une séance muscu, calculés à sa validation — qu'elle
 * parte en direct (écran de séance) ou plus tard depuis la file hors ligne
 * (`writes.ts`, sans écran monté). Même préparation et même message dans les
 * deux cas ; le calcul lui-même (relecture des records actuels, insertion)
 * est `computeRecordsFromSession` (`src/api/records.ts`).
 */
import type { RecordCandidate, RecordSet } from "@shared/domain/performance";

interface DoneSet {
  done?: boolean;
  skipped?: boolean;
  kg?: number | null;
  reps?: number | null;
}

/**
 * Séries faites (ni passées ni vides) des exercices rattachés à un record.
 * `refByEx` : exercice → référence du record (`resolveRecordRef`), `null` si
 * l'exercice n'en a pas. Préparé à la validation : la file n'a besoin
 * d'aucune donnée d'écran pour calculer plus tard.
 */
export function collectRecordSets(
  doneSets: Record<string, readonly (DoneSet | null | undefined)[] | null | undefined>,
  refByEx: Record<string, string | null | undefined>,
): RecordSet[] {
  const out: RecordSet[] = [];
  for (const [exId, rows] of Object.entries(doneSets)) {
    const ref = refByEx[exId];
    if (!ref) continue;
    for (const r of rows ?? []) {
      if (r?.done && !r.skipped) out.push({ ref, kg: r.kg, reps: r.reps });
    }
  }
  return out;
}

/** « Nouveau record : Squat 120,5 kg, Développé couché 90 kg » */
export function newRecordsMessage(found: readonly Pick<RecordCandidate, "ref" | "kg">[]): string {
  const list = found.map((c) => `${c.ref} ${String(c.kg).replace(".", ",")} kg`).join(", ");
  return `Nouveau record : ${list}`;
}
