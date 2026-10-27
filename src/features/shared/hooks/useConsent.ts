import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { LEGAL_VERSION } from "@/lib/legal";

/**
 * Lecture et écriture du consentement RGPD.
 *
 * Le journal `user_consents` est append-only : donner et retirer son
 * consentement sont deux INSERT, jamais un UPDATE. On lit donc l'état courant
 * via la vue `current_consents`, qui ne garde que la dernière décision par
 * finalité.
 */

/** Finalités de traitement nécessitant un consentement distinct. */
export type ConsentPurpose = "health_data" | "ai_programming" | "garmin_sync" | "coros_sync";

export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  /** Version du document acceptée — peut être antérieure à LEGAL_VERSION. */
  docVersion: string;
  decidedAt: string;
}

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
      "J'accepte que mon historique d'entraînement soit transmis à l'API Google Gemini lorsque mon coach demande la génération d'un programme.",
    detail:
      "Facultatif. Ces données ne servent pas à entraîner les modèles de Google. Si tu refuses, ton coach construira tes programmes manuellement.",
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
};

interface CurrentConsentRow {
  purpose: ConsentPurpose;
  granted: boolean;
  doc_version: string;
  decided_at: string;
}

/** État courant des consentements de l'utilisateur connecté. */
export function useConsents() {
  const { user } = useAuth();

  return useQuery({
    queryKey: QK.consents(user?.id ?? "none"),
    enabled: !!user,
    // Le consentement change rarement, mais une lecture périmée bloquerait
    // l'accès à l'app après acceptation : on garde un staleTime court.
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ConsentState[]> => {
      const { data, error } = await supabase
        .from("current_consents")
        .select("purpose, granted, doc_version, decided_at")
        .eq("user_id", user!.id);

      if (error) throw error;

      return ((data ?? []) as CurrentConsentRow[]).map((r) => ({
        purpose: r.purpose,
        granted: r.granted,
        docVersion: r.doc_version,
        decidedAt: r.decided_at,
      }));
    },
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

      const rows = decisions.map((d) => ({
        user_id: user.id,
        purpose: d.purpose,
        granted: d.granted,
        doc_version: LEGAL_VERSION,
        statement: CONSENT_COPY[d.purpose].label,
      }));

      const { error } = await supabase.from("user_consents").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.consents(user?.id ?? "none") });
    },
  });
}

/**
 * Vrai si le consentement socle est accordé *et* porte sur la version courante
 * des documents.
 *
 * Une version périmée vaut absence de consentement : si le texte a changé de
 * façon substantielle, l'utilisateur n'a pas consenti au nouveau traitement. Il
 * est alors re-sollicité par `ConsentGate`.
 */
export function hasValidCoreConsent(consents: ConsentState[] | undefined): boolean {
  if (!consents) return false;
  const core = consents.find((c) => c.purpose === "health_data");
  return !!core && core.granted && core.docVersion === LEGAL_VERSION;
}

/** État d'une finalité facultative, en traitant l'absence comme un refus. */
export function isGranted(
  consents: ConsentState[] | undefined,
  purpose: ConsentPurpose,
): boolean {
  return !!consents?.find((c) => c.purpose === purpose)?.granted;
}
