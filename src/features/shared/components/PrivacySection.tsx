import { useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
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

const OPTIONAL_PURPOSES: ConsentPurpose[] = ["ai_programming", "garmin_sync", "coros_sync"];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function PrivacySection() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
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
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Confidentialité &amp; données
        </div>
        <span style={{ fontSize: 12, color: C.tx3, display: "inline-block", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>∨</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
          {isLoading ? (
            <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
          ) : (
            <>
              {/* ── Accord socle : informatif, car le retirer = quitter le service ── */}
              {core && (
                <div style={{ background: C.s2, borderRadius: 6, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, color: C.tx, fontWeight: 600, marginBottom: 4 }}>
                    Traitement de tes données de santé
                  </div>
                  <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5 }}>
                    Accord donné le {fmtDate(core.decidedAt)}. C'est la base de fonctionnement
                    d'Agon : le retirer revient à ne plus pouvoir utiliser l'application. Pour cela,
                    utilise la suppression de compte ci-dessous — elle efface aussi tes données.
                  </div>
                </div>
              )}

              {/* ── Accords facultatifs : retirables en un clic ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {OPTIONAL_PURPOSES.map((p) => {
                  const granted = isGranted(consents, p);
                  const row = consents?.find((c) => c.purpose === p);
                  // Les accords montre ne sont demandés qu'au moment de la
                  // connexion du compte : afficher un interrupteur pour une
                  // montre jamais connectée n'aurait rien à désactiver.
                  if (!row && p !== "ai_programming") return null;
                  return (
                    <div key={p} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <button
                        onClick={() => toggle(p, !granted)}
                        disabled={setConsent.isPending}
                        aria-pressed={granted}
                        style={{ flexShrink: 0, width: 40, height: 22, borderRadius: 11, border: "1px solid " + (granted ? C.g + "50" : C.brd), background: granted ? C.gS : C.s2, cursor: setConsent.isPending ? "wait" : "pointer", padding: 0, position: "relative", transition: "background 0.15s" }}
                      >
                        <span style={{ position: "absolute", top: 2, left: granted ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: granted ? C.g : C.tx3, transition: "left 0.15s" }} />
                      </button>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.45 }}>{CONSENT_COPY[p].label}</div>
                        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45, marginTop: 3 }}>{CONSENT_COPY[p].detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Export ── */}
              <div>
                <button
                  onClick={runExport}
                  disabled={exportData.isPending}
                  style={{ width: "100%", padding: "11px 0", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 12, fontWeight: 600, cursor: exportData.isPending ? "wait" : "pointer", fontFamily: "inherit" }}
                >
                  {exportData.isPending ? "Préparation…" : "Télécharger toutes mes données (JSON)"}
                </button>
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 6, lineHeight: 1.45 }}>
                  Tout ce qu'Agon détient à ton sujet, dans un fichier lisible et réutilisable
                  ailleurs.
                </div>
              </div>

              {/* ── Documents ── */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11 }}>
                <a href={LEGAL_ROUTES.privacy} target="_blank" rel="noreferrer" style={{ color: C.tx3, textDecoration: "underline" }}>Confidentialité</a>
                <a href={LEGAL_ROUTES.terms} target="_blank" rel="noreferrer" style={{ color: C.tx3, textDecoration: "underline" }}>CGU</a>
                <a href={LEGAL_ROUTES.notice} target="_blank" rel="noreferrer" style={{ color: C.tx3, textDecoration: "underline" }}>Mentions légales</a>
              </div>

              {/* ── Suppression ── */}
              <div style={{ borderTop: "1px solid " + C.brd, paddingTop: 14 }}>
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ width: "100%", padding: "11px 0", borderRadius: 6, border: "1px solid " + C.r + "30", background: C.rS, color: C.r, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
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
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.s1, border: "1px solid " + C.r + "30", borderRadius: 8, padding: 20, maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>Supprimer définitivement ton compte</div>

        <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.6 }}>
          Cette action est <strong style={{ color: C.r }}>irréversible</strong>. Seront effacés :
        </div>
        <ul style={{ fontSize: 12, color: C.tx2, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
          <li>tes séances, charges, records et tests</li>
          <li>ton wellness, ton poids, tes mensurations</li>
          <li>tes blessures déclarées et tes documents médicaux déposés</li>
          <li>tes accès aux montres connectées, révoqués chez le fournisseur</li>
        </ul>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.6 }}>
          Ton coach perdra l'accès à ton suivi. Les programmes qu'il a construits restent dans son
          espace, sans tes données. Télécharge ton export avant de continuer si tu veux en garder
          une copie.
        </div>

        <div>
          <label htmlFor="confirm-delete" style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6 }}>
            Tape <strong style={{ color: C.tx }}>SUPPRIMER</strong> pour confirmer
          </label>
          <input
            id="confirm-delete"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={del.isPending}
            style={{ flex: 1, padding: "11px 0", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!ready || del.isPending}
            style={{ flex: 1, padding: "11px 0", borderRadius: 6, border: "1px solid " + C.r + "30", background: ready ? C.r : C.rS, color: ready ? "#0E0C0A" : C.r, fontSize: 12, fontWeight: 700, cursor: ready && !del.isPending ? "pointer" : "not-allowed", opacity: ready ? 1 : 0.5, fontFamily: "inherit" }}
          >
            {del.isPending ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
