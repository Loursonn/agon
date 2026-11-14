import type { ActiveReference } from "@/api/references";

/** « Test », « Saisie coach », « Saisie athlète ». */
export function refSource(ref: ActiveReference | undefined, athleteId: string): string | null {
  if (!ref) return null;
  if (ref.testSessionId) return "Test";
  if (ref.createdBy && ref.createdBy === athleteId) return "Saisie athlète";
  if (ref.createdBy) return "Saisie coach";
  return null;
}
