/**
 * Âge minimum à l'inscription (15 ans). La règle vit dans
 * `@shared/domain/age` (partagée avec l'Edge Function `claim-athlete`) ; ici,
 * seulement le « aujourd'hui » de l'appareil.
 */
import { localIsoDay } from "@shared/domain/dates";
import {
  ageOn, birthDateError, isOldEnough, INVALID_BIRTH_DATE_MESSAGE, MIN_AGE, MIN_AGE_MESSAGE,
  MISSING_BIRTH_DATE_MESSAGE, OLDEST_BIRTH_DATE,
} from "@shared/domain/age";

export {
  ageOn, isOldEnough, INVALID_BIRTH_DATE_MESSAGE, MIN_AGE, MIN_AGE_MESSAGE, MISSING_BIRTH_DATE_MESSAGE, OLDEST_BIRTH_DATE,
};

/** Message d'erreur pour la date saisie (jour local de l'appareil), ou null si acceptée. */
export function signupBirthDateError(birthDate: unknown, today: string = localIsoDay()): string | null {
  return birthDateError(birthDate, today);
}
