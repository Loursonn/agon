import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountKeys, getConsents, invalidateAccount, recordConsents,
  type ConsentPurpose, type ConsentState,
} from "@/api/account";
import { useAuth } from "@/hooks/useAuth";
import { CORE_CONSENT_SINCE, LEGAL_VERSION } from "@/lib/legal";

/**
 * Lecture et écriture du consentement RGPD.
 *
 * Le journal `user_consents` est append-only : donner et retirer son
 * consentement sont deux INSERT, jamais un UPDATE. On lit donc l'état courant
 * via la vue `current_consents`, qui ne garde que la dernière décision par
 * finalité.
 */

export type { ConsentPurpose, ConsentState };

/**
 * Libellés affichés à l'utilisateur.
 *
 * Archivés tels quels dans `user_consents.statement` au moment du clic : si on
 * reformule plus tard, on sait toujours à quoi l'utilisateur a dit oui.
 */
export const CONSENT_COPY: Record<
  ConsentPurpose,
  { label: string; detail: string; required: boolean }
> = {
  health_data: {
    label:
      "J'accepte que mes données d'entraînement, de bien-être et de santé soient traitées par Agon et partagées avec le coach auquel je suis rattaché.",
    detail:
      "Séances, charges, fatigue, sommeil, poids, blessures déclarées. C'est la raison d'être du service : sans cet accord, l'application ne peut pas fonctionner.",
    required: true,
  },
  ai_programming: {
    label:
      "J'accepte que mes données d'entraînement soient traitées par des outils d'intelligence artificielle, l'API Google Gemini utilisée par Agon et l'assistant Claude (Anthropic) de mon coach, pour en produire des analyses, des synthèses et des visualisations, et proposer à mon coach des axes de travail et de développement.",
    detail:
      "Facultatif, et révocable à tout moment. Ton coach reste seul à décider de tes programmes : l'IA l'aide à t'analyser et à préparer son travail, et n'inscrit rien dans Agon sans son accord. L'assistant de ton coach voit aussi les titres des événements que tu ajoutes à ton calendrier (examens, voyages…) : n'y écris rien que tu ne veux pas partager. Via Gemini, tes données ne servent pas à entraîner les modèles de Google. Via Claude, elles passent par le compte personnel de ton coach : leur usage dépend des réglages de ce compte, qu'Agon ne contrôle pas. Si tu refuses, tu gardes tes statistiques et tes graphiques, sans analyse rédigée par l'IA.",
    required: false,
  },
  garmin_sync: {
    label:
      "J'accepte qu'Agon récupère les données enregistrées par ma montre Garmin et les partage avec mon coach.",
    detail:
      "Facultatif, et révocable à tout moment. Activités, fréquence cardiaque, sommeil, pas, indicateurs de récupération.",
    required: false,
  },
  coros_sync: {
    label:
      "J'accepte qu'Agon récupère les données enregistrées par ma montre COROS et les partage avec mon coach.",
    detail: "Facultatif, et révocable à tout moment.",
    required: false,
  },
  staff_sharing: {
    label:
      "J'accepte que les professionnels ajoutés par mon coach ou par moi (kiné, ostéo, nutritionniste…) accèdent à mes données selon les droits définis par mon coach.",
    detail:
      "Facultatif, et révocable à tout moment. Chaque professionnel ne voit que les domaines que ton coach lui ouvre (programme, séances, bien-être, blessures, nutrition…), et tu retrouves la liste de tes pros et de leurs droits dans « Mon staff ». Tant que tu n'as pas accepté, ton staff ne voit aucune de tes données.",
    required: false,
  },
};

/** État courant des consentements de l'utilisateur connecté. */
export function useConsents() {
  const { user } = useAuth();

  return useQuery({
    queryKey: accountKeys.consents(user?.id ?? "none"),
    enabled: !!user,
    // Le consentement change rarement, mais une lecture périmée bloquerait
    // l'accès à l'app après acceptation : on garde un staleTime court.
    staleTime: 30 * 1000,
    queryFn: () => getConsents(user!.id),
  });
}

/**
 * Enregistre une décision de consentement.
 *
 * Toujours un INSERT, y compris pour un retrait : l'historique constitue la
 * preuve exigée par l'article 7.1 du RGPD.
 */
export function useSetConsent() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (decisions: Array<{ purpose: ConsentPurpose; granted: boolean }>) => {
      if (!user) throw new Error("Non connecté");
      await recordConsents(user.id, decisions.map((d) => ({
        purpose: d.purpose,
        granted: d.granted,
        docVersion: LEGAL_VERSION,
        statement: CONSENT_COPY[d.purpose].label,
      })));
    },
    // Consentements et bandeau « accord staff » de Mon staff (staff_sharing_consented).
    onSuccess: () => {
      if (user) void invalidateAccount(qc, user.id);
    },
  });
}

/**
 * Vrai si le consentement socle est accordé sous une version qui le couvre
 * encore (`CORE_CONSENT_SINCE` ou plus récente).
 *
 * Une version trop ancienne vaut absence de consentement : si le traitement
 * couvert a changé, l'utilisateur n'y a pas consenti. Il est alors
 * re-sollicité par `ConsentGate`. Les versions sont des dates `AAAA-MM-JJ` :
 * l'ordre alphabétique est l'ordre chronologique.
 */
export function hasValidCoreConsent(consents: ConsentState[] | undefined): boolean {
  if (!consents) return false;
  const core = consents.find((c) => c.purpose === "health_data");
  return !!core && core.granted && core.docVersion >= CORE_CONSENT_SINCE;
}

/** Vrai si l'utilisateur a déjà répondu (oui ou non) pour cette finalité. */
export function hasDecided(consents: ConsentState[] | undefined, purpose: ConsentPurpose): boolean {
  return !!consents?.some((c) => c.purpose === purpose);
}

/**
 * Vrai si l'utilisateur a répondu (oui ou non) pour cette finalité sous une
 * version du texte au moins égale à `since`. Une réponse plus ancienne portait
 * sur un autre texte : elle vaut absence de réponse.
 */
export function hasDecidedSince(
  consents: ConsentState[] | undefined,
  purpose: ConsentPurpose,
  since: string,
): boolean {
  return !!consents?.some((c) => c.purpose === purpose && c.docVersion >= since);
}

/** État d'une finalité facultative, en traitant l'absence comme un refus. */
export function isGranted(
  consents: ConsentState[] | undefined,
  purpose: ConsentPurpose,
): boolean {
  return !!consents?.find((c) => c.purpose === purpose)?.granted;
}
