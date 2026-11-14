/**
 * Âge minimum à l'inscription (15 ans). La règle vit dans
 * `@shared/domain/age` (partagée avec l'Edge Function `claim-athlete`) ; ici,
 * seulement le « aujourd'hui » de l'appareil.
 */
import { localIsoDay } from "@shared/domain/dates";
import {
  ageOn, birthDateError, isOldEnough, INVALID_BIRTH_DATE_MESSAGE, MIN_AGE, MIN_AGE_MESSAGE,
  MISSING_BIRTH_DATE_MESSAGE, OLDEST_BIRTH_DATE, canOfferAiConsent as sharedCanOfferAiConsent,
} from "@shared/domain/age";

export {
  ageOn, isOldEnough, INVALID_BIRTH_DATE_MESSAGE, MIN_AGE, MIN_AGE_MESSAGE, MISSING_BIRTH_DATE_MESSAGE, OLDEST_BIRTH_DATE,
};

/** Message d'erreur pour la date saisie (jour local de l'appareil), ou null si acceptée. */
export function signupBirthDateError(birthDate: unknown, today: string = localIsoDay()): string | null {
  return birthDateError(birthDate, today);
}

export { AI_MIN_AGE } from "@shared/domain/age";

/** L'accord IA peut-il être proposé à cette date de naissance (jour local de l'appareil) ? */
export function canOfferAiConsent(birthDate: string | null | undefined, today: string = localIsoDay()): boolean {
  return sharedCanOfferAiConsent(birthDate, today);
}
