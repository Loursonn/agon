import { canOfferAiConsent } from "@/lib/age";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LEGAL_ROUTES } from "@/lib/legal";
import { useAuth } from "@/hooks/useAuth";
import {
  CONSENT_COPY,
  useConsents,
  useSetConsent,
  isGranted,
  type ConsentPurpose,
} from "@/features/shared/hooks/useConsent";
import { useDataExport } from "@/features/shared/hooks/useDataExport";
import { useDeleteAccount } from "@/features/shared/hooks/useDeleteAccount";

/**
 * Panneau « Confidentialité & données » du profil.
 *
 * Réunit au même endroit les trois droits qui, en pratique, ne servent à rien
 * s'ils sont dispersés : retirer un consentement (art. 7.3), récupérer ses
 * données (art. 15 et 20), supprimer son compte (art. 17). Le RGPD exige que
 * le retrait soit « aussi simple » que l'octroi : ici un interrupteur, au même
 * nombre de clics que la case cochée à l'inscription.
 */

const OPTIONAL_PURPOSES: ConsentPurpose[] = ["ai_programming", "staff_sharing", "garmin_sync", "coros_sync"];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * `coach` : version des Paramètres coach (planche CoachOrdiBParametres) — carte ouverte
 * par défaut, titre « Données et confidentialité », accord en une ligne, export en une
 * ligne et zone danger titrée. Sans cette prop, rendu athlète inchangé.
 */
export function PrivacySection({ coach = false }: { coach?: boolean } = {}) {
  const { user, profile } = useAuth();
  // Le partage avec un staff ne concerne que les comptes qui ont des données d'athlète.
  const isAthlete = profile?.role === "athlete" || profile?.role === "coach_athlete";
  const [open, setOpen] = useState(coach);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: consents, isLoading } = useConsents();
  const setConsent = useSetConsent();
  const exportData = useDataExport();

  const core = consents?.find((c) => c.purpose === "health_data");

  const toggle = (purpose: ConsentPurpose, next: boolean) => {
    setConsent.mutate([{ purpose, granted: next }], {
      onSuccess: () =>
        toast.success(next ? "Accord enregistré" : "Accord retiré", {
          description: next
            ? undefined
            : "Le traitement correspondant cesse immédiatement.",
        }),
      onError: (e) => toast.error("Échec de l'enregistrement", { description: e.message }),
    });
  };

  const runExport = () => {
    if (!user) return;
    exportData.mutate(user.id, {
      onSuccess: (r) => {
        if (r.failures.length > 0) {
          toast.warning(`Export partiel · ${r.rowCount} lignes`, {
            description: `${r.failures.length} table(s) illisible(s) : ${r.failures.map((f) => f.table).join(", ")}`,
          });
        } else {
          toast.success(`Export téléchargé · ${r.rowCount} lignes`);
        }
      },
      onError: (e) => toast.error("Export impossible", { description: e.message }),
    });
  };

  return (
    <div className="overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-4 py-3 font-[inherit]"
      >
        <div className="text-[12px] font-semibold uppercase tracking-[0.5px] text-agon-tx3">
          {coach ? "Données et confidentialité" : <>Confidentialité &amp; données</>}
        </div>
        <span className={cn("inline-block text-[12px] text-agon-tx3 [transition:transform_0.2s]", open && "rotate-180")}>∨</span>
      </button>

      {open && (
        <div className="flex flex-col gap-[18px] border-t border-agon-brd px-4 py-3.5">
          {isLoading ? (
            <div className="text-[12px] text-agon-tx3">Chargement…</div>
          ) : (
            <>
              {/* ── Accord socle : informatif, car le retirer = quitter le service ── */}
              {core && coach && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-agon-tx">Traitement de tes données de santé</div>
                    <div className="mt-0.5 text-[11px] text-agon-tx3">Accord donné le {fmtDate(core.decidedAt)}</div>
                  </div>
                  <span className="rounded-full border border-agon-succes/[0.314] bg-agon-succes-doux px-2.5 py-0.5 text-[11px] font-bold text-agon-succes">Accordé</span>
                </div>
              )}
              {core && !coach && (
                <div className="rounded-[6px] bg-agon-s2 px-3.5 py-3">
                  <div className="mb-1 text-[12px] font-semibold text-agon-tx">
                    Traitement de tes données de santé
                  </div>
                  <div className="text-[11px] leading-normal text-agon-tx2">
                    Accord donné le {fmtDate(core.decidedAt)}. C'est la base de fonctionnement
                    d'Agon : le retirer revient à ne plus pouvoir utiliser l'application. Pour cela,
                    utilise la suppression de compte ci-dessous — elle efface aussi tes données.
                  </div>
                </div>
              )}

              {/* ── Accords facultatifs : retirables en un clic ── */}
              <div className="flex flex-col gap-3">
                {OPTIONAL_PURPOSES.map((p) => {
                  const granted = isGranted(consents, p);
                  const row = consents?.find((c) => c.purpose === p);
                  // Les accords montre ne sont demandés qu'au moment de la
                  // connexion du compte : afficher un interrupteur pour une
                  // montre jamais connectée n'aurait rien à désactiver.
                  if (!row && p !== "ai_programming" && p !== "staff_sharing") return null;
                  if (p === "staff_sharing" && !isAthlete) return null;
                  // Moins de 18 ans : l'accord IA n'est pas proposé (conditions
                  // de Claude). Un accord déjà donné reste retirable.
                  if (p === "ai_programming" && !granted && !canOfferAiConsent(profile?.birth_date)) {
                    return (
                      <div key={p} className="text-[11px] leading-[1.45] text-agon-tx3">
                        Les analyses par intelligence artificielle sont réservées aux 18 ans et plus.
                      </div>
                    );
                  }
                  return (
                    <div key={p} className="flex items-start gap-3">
                      <button
                        onClick={() => toggle(p, !granted)}
                        disabled={setConsent.isPending}
                        aria-pressed={granted}
                        className={cn(
                          "relative h-[22px] w-10 shrink-0 rounded-[11px] border p-0 [transition:background_0.15s]",
                          granted ? "border-agon-succes/[0.314] bg-agon-succes-doux" : "border-agon-brd bg-agon-s2",
                          setConsent.isPending ? "cursor-wait" : "cursor-pointer",
                        )}
                      >
                        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full [transition:left_0.15s]", granted ? "left-5 bg-agon-succes" : "left-0.5 bg-agon-tx3")} />
                      </button>
                      <div className="min-w-0">
                        <div className="text-[12px] leading-[1.45] text-agon-tx">{CONSENT_COPY[p].label}</div>
                        <div className="mt-[3px] text-[11px] leading-[1.45] text-agon-tx3">{CONSENT_COPY[p].detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Export ── */}
              {coach ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-agon-tx">Exporter mes données</div>
                    <div className="mt-0.5 text-[11px] leading-[1.45] text-agon-tx3">Tout ce qu'Agon détient à ton sujet, dans un fichier lisible.</div>
                  </div>
                  <button
                    onClick={runExport}
                    disabled={exportData.isPending}
                    className={cn("rounded-[6px] font-[inherit] text-[12px] shrink-0 border border-agon-brd bg-agon-s2 px-3.5 py-2 font-semibold text-agon-tx", exportData.isPending ? "cursor-wait" : "cursor-pointer")}
                  >
                    {exportData.isPending ? "Préparation…" : "Télécharger (JSON)"}
                  </button>
                </div>
              ) : (
              <div>
                <button
                  onClick={runExport}
                  disabled={exportData.isPending}
                  className={cn("rounded-[6px] font-[inherit] text-[12px] w-full border border-agon-brd bg-agon-s2 py-[11px] font-semibold text-agon-tx", exportData.isPending ? "cursor-wait" : "cursor-pointer")}
                >
                  {exportData.isPending ? "Préparation…" : "Télécharger toutes mes données (JSON)"}
                </button>
                <div className="mt-1.5 text-[11px] leading-[1.45] text-agon-tx3">
                  Tout ce qu'Agon détient à ton sujet, dans un fichier lisible et réutilisable
                  ailleurs.
                </div>
              </div>
              )}

              {/* ── Documents ── */}
              <div className="flex flex-wrap gap-3 text-[11px]">
                <a href={LEGAL_ROUTES.privacy} target="_blank" rel="noreferrer" className="text-agon-tx3 underline">Confidentialité</a>
                <a href={LEGAL_ROUTES.terms} target="_blank" rel="noreferrer" className="text-agon-tx3 underline">CGU</a>
                <a href={LEGAL_ROUTES.notice} target="_blank" rel="noreferrer" className="text-agon-tx3 underline">Mentions légales</a>
              </div>

              {/* ── Suppression ── */}
              <div className="border-t border-agon-brd pt-3.5">
                {coach && (
                  <>
                    <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.5px] text-agon-erreur">Zone danger</div>
                    <div className="mb-2.5 text-[11px] leading-[1.45] text-agon-tx3">
                      Irréversible : ton compte et tes données sont effacés. Il faudra taper SUPPRIMER pour confirmer.
                    </div>
                  </>
                )}
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-[6px] font-[inherit] text-[12px] w-full cursor-pointer border border-agon-erreur/[0.188] bg-agon-erreur-doux py-[11px] font-semibold text-agon-erreur"
                >
                  Supprimer mon compte et mes données
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {confirmDelete && <DeleteAccountDialog onClose={() => setConfirmDelete(false)} />}
    </div>
  );
}

/**
 * Confirmation de suppression.
 *
 * Saisie du mot exact exigée : une suppression irréversible ne doit pas pouvoir
 * résulter d'un tap mal placé. Le même mot est revérifié côté serveur.
 */
function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [word, setWord] = useState("");
  const del = useDeleteAccount();
  const ready = word.trim().toUpperCase() === "SUPPRIMER";

  const submit = () => {
    del.mutate(undefined, {
      onSuccess: (r) => {
        if (r.warnings?.length) console.warn("delete-account warnings:", r.warnings);
        // Rechargement complet : tout état React encore monté référencerait un
        // compte qui n'existe plus.
        window.location.href = "/login";
      },
      onError: (e) => toast.error("Suppression impossible", { description: e.message }),
    });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[420px] flex-col gap-3.5 rounded-[8px] border border-agon-erreur/[0.188] bg-agon-s1 p-5"
      >
        <div className="text-[15px] font-bold text-agon-tx">Supprimer définitivement ton compte</div>

        <div className="text-[12px] leading-[1.6] text-agon-tx2">
          Cette action est <strong className="text-agon-erreur">irréversible</strong>. Seront effacés :
        </div>
        <ul className="m-0 pl-[18px] text-[12px] leading-[1.6] text-agon-tx2">
          <li>tes séances, charges, records et tests</li>
          <li>ton wellness, ton poids, tes mensurations</li>
          <li>tes blessures déclarées</li>
          <li>tes accès aux montres connectées, révoqués chez le fournisseur</li>
        </ul>
        <div className="text-[11px] leading-[1.6] text-agon-tx3">
          Ton coach perdra l'accès à ton suivi. Les programmes qu'il a construits restent dans son
          espace, sans tes données. Télécharge ton export avant de continuer si tu veux en garder
          une copie.
        </div>

        <div>
          <label htmlFor="confirm-delete" className="mb-1.5 block text-[11px] text-agon-tx3">
            Tape <strong className="text-agon-tx">SUPPRIMER</strong> pour confirmer
          </label>
          <input
            id="confirm-delete"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
            className="w-full rounded-[6px] border border-agon-brd bg-agon-s2 px-3 py-2.5 font-[inherit] text-[13px] text-agon-tx"
          />
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            disabled={del.isPending}
            className="rounded-[6px] font-[inherit] text-[12px] flex-1 cursor-pointer border border-agon-brd bg-agon-s2 py-[11px] font-semibold text-agon-tx"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!ready || del.isPending}
            className={cn(
              "rounded-[6px] font-[inherit] text-[12px] flex-1 border border-agon-erreur/[0.188] py-[11px] font-bold",
              ready ? "bg-agon-erreur text-agon-ink" : "bg-agon-erreur-doux text-agon-erreur opacity-50",
              ready && !del.isPending ? "cursor-pointer" : "cursor-not-allowed",
            )}
          >
            {del.isPending ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
