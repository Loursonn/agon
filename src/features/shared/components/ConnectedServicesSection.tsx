import { useEffect, useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import {
  CONSENT_COPY,
  isGranted,
  useConsents,
  useSetConsent,
} from "@/features/shared/hooks/useConsent";
import {
  COROS_REGIONS,
  connectionFor,
  useConnectCoros,
  useDisconnectProvider,
  useProviderConnections,
  type CorosRegion,
  type ProviderConnection,
} from "@/features/shared/hooks/useProviderConnections";

/**
 * Panneau « Services connectés » du profil athlète.
 *
 * Deux principes tenus ici :
 *
 *  1. **Le consentement est demandé au moment où il sert.** Une case
 *     « synchroniser ma montre COROS » cochée à l'inscription, alors que
 *     l'athlète n'a pas encore de compte COROS relié, n'est pas un
 *     consentement éclairé : il ne sait pas ce qu'il autorise ni quand. Il est
 *     donc demandé juste avant la redirection, avec le libellé exact qui sera
 *     archivé dans `user_consents.statement`.
 *  2. **La déconnexion est aussi accessible que la connexion.** Même panneau,
 *     même nombre de clics. Le RGPD l'exige pour le retrait du consentement,
 *     et il n'y a aucune raison de traiter différemment le fait de débrancher
 *     un compte.
 */

/** Ce que le retour d'autorisation peut valoir, et quoi en dire à l'athlète. */
const OUTCOMES: Record<string, { kind: "success" | "warning" | "error"; title: string; detail?: string }> = {
  ok: {
    kind: "success",
    title: "Compte COROS connecté",
    detail: "Tes activités seront récupérées automatiquement chaque jour.",
  },
  partiel: {
    kind: "warning",
    title: "Connexion incomplète",
    detail:
      "COROS n'a pas accordé l'accès durable. La synchronisation s'arrêtera dans quelques heures — reconnecte ton compte en acceptant toutes les autorisations.",
  },
  refus: {
    kind: "warning",
    title: "Autorisation annulée",
    detail: "Rien n'a été connecté. Tu peux réessayer quand tu veux.",
  },
  expire: {
    kind: "error",
    title: "Demande expirée",
    detail:
      "Une autorisation reste valable dix minutes. Relance la connexion depuis cette page.",
  },
  consentement_absent: {
    kind: "error",
    title: "Accord manquant",
    detail:
      "Ton accord pour la synchronisation COROS n'était plus actif au retour. Aucune donnée n'a été récupérée.",
  },
  parametres_manquants: {
    kind: "error",
    title: "Retour incomplet",
    detail: "COROS n'a pas renvoyé les informations attendues. Réessaie.",
  },
  client_introuvable: {
    kind: "error",
    title: "Configuration COROS introuvable",
    detail: "Réessaie ; si le problème persiste, signale-le à ton coach.",
  },
  erreur: {
    kind: "error",
    title: "La connexion a échoué",
    detail: "Réessaie dans un moment.",
  },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const STATUS_COPY: Record<ProviderConnection["status"], { label: string; tone: "ok" | "warn" | "bad" }> = {
  active: { label: "Connecté", tone: "ok" },
  expired: { label: "Autorisation expirée", tone: "warn" },
  revoked: { label: "Accès révoqué", tone: "bad" },
  consent_withdrawn: { label: "Accord retiré", tone: "bad" },
  error: { label: "En erreur", tone: "bad" },
};

export function ConnectedServicesSection() {
  const [open, setOpen] = useState(false);
  const { data: connections, isLoading } = useProviderConnections();
  const coros = connectionFor(connections, "coros");

  /*
    Le résultat de l'autorisation arrive dans l'URL, posé par la fonction de
    retour. Il est lu une fois puis retiré de la barre d'adresse : laissé là, un
    rafraîchissement rejouerait le message « compte connecté » alors que rien ne
    vient de se passer.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("coros");
    if (!outcome) return;

    const copy = OUTCOMES[outcome] ?? OUTCOMES.erreur;
    toast[copy.kind](copy.title, { description: copy.detail });
    if (copy.kind !== "success") setOpen(true);

    params.delete("coros");
    const q = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (q ? `?${q}` : "") + window.location.hash,
    );
  }, []);

  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Montres &amp; services connectés
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {coros?.status === "active" && (
            <span style={{ fontSize: 10, color: C.g, border: "1px solid " + C.g + "40", background: C.gS, borderRadius: 10, padding: "2px 7px" }}>
              COROS
            </span>
          )}
          <span style={{ fontSize: 12, color: C.tx3, display: "inline-block", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>∨</span>
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
          {isLoading ? (
            <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
          ) : (
            <>
              <CorosRow connection={coros} />

              {/* ── Garmin : dossier déposé, pas encore d'accès ── */}
              <div style={{ borderTop: "1px solid " + C.brd, paddingTop: 14, opacity: 0.6 }}>
                <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>Garmin</div>
                <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5, marginTop: 4 }}>
                  En attente de validation du programme développeur Garmin. Dès l'accord, la
                  connexion se fera exactement comme pour COROS. En attendant, tu peux importer tes
                  fichiers d'activité à la main.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Ligne COROS : connecter, surveiller, déconnecter. */
function CorosRow({ connection }: { connection: ProviderConnection | undefined }) {
  const { data: consents } = useConsents();
  const setConsent = useSetConsent();
  const connect = useConnectCoros();
  const disconnect = useDisconnectProvider();

  const [region, setRegion] = useState<CorosRegion>("eu");
  const [accepte, setAccepte] = useState(false);

  const consentGranted = isGranted(consents, "coros_sync");
  // L'accord déjà donné n'est pas redemandé — le redemander à chaque
  // reconnexion ferait du consentement une formalité qu'on clique sans lire.
  const pretAConnecter = consentGranted || accepte;
  const busy = connect.isPending || setConsent.isPending;

  const lancer = () => {
    const demarrer = () =>
      connect.mutate(
        { region },
        {
          onError: (e) =>
            toast.error("Impossible de démarrer la connexion", { description: e.message }),
        },
      );

    /*
      L'accord est enregistré AVANT la redirection, et la redirection n'a lieu
      qu'en cas de succès. Dans l'autre ordre, l'athlète autoriserait chez COROS
      puis se verrait refusé au retour par le déclencheur
      `require_sync_consent`, sans comprendre ce qu'il a raté.
    */
    if (!consentGranted) {
      setConsent.mutate([{ purpose: "coros_sync", granted: true }], {
        onSuccess: demarrer,
        onError: (e) =>
          toast.error("Accord non enregistré", { description: e.message }),
      });
      return;
    }
    demarrer();
  };

  const couper = () => {
    disconnect.mutate("coros", {
      onSuccess: (r) => {
        if (r.revoked) {
          toast.success("Compte COROS déconnecté", {
            description: "L'accès a été révoqué chez COROS. Tes activités déjà importées restent.",
          });
        } else {
          /*
            Distinction volontairement visible : « j'ai effacé ma copie du
            jeton » n'est pas « l'accès est coupé ». Le masquer donnerait à
            l'athlète une certitude qu'on n'a pas.
          */
          toast.warning("Déconnecté côté Agon", {
            description:
              "COROS n'a pas confirmé la révocation. Nos jetons sont supprimés ; retire aussi l'autorisation depuis ton compte COROS pour en être sûr.",
          });
        }
      },
      onError: (e) => toast.error("Déconnexion impossible", { description: e.message }),
    });
  };

  if (connection) {
    const status = STATUS_COPY[connection.status];
    const tone = status.tone === "ok" ? C.g : status.tone === "warn" ? C.o : C.r;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>COROS</div>
          <div style={{ fontSize: 11, color: tone }}>{status.label}</div>
        </div>

        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
          Connecté le {fmtDate(connection.connectedAt)}
          {connection.lastSyncAt
            ? ` · dernière synchronisation le ${fmtDate(connection.lastSyncAt)}`
            : " · première synchronisation en attente"}
          {connection.syncedThrough && ` · historique récupéré jusqu'au ${fmtDate(connection.syncedThrough)}`}
        </div>

        {connection.lastError && (
          <div style={{ fontSize: 11, color: C.r, background: C.rS, border: "1px solid " + C.r + "30", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5 }}>
            {connection.lastError}
          </div>
        )}

        <button
          onClick={couper}
          disabled={disconnect.isPending}
          style={{ padding: "10px 0", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 12, fontWeight: 600, cursor: disconnect.isPending ? "wait" : "pointer", fontFamily: "inherit" }}
        >
          {disconnect.isPending ? "Déconnexion…" : "Déconnecter mon compte COROS"}
        </button>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
          L'accès est révoqué chez COROS. Les activités déjà importées restent dans ton historique.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>COROS</div>
      <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
        Récupère automatiquement tes activités, ta fréquence cardiaque, ton sommeil et tes
        indicateurs de récupération, et les partage avec ton coach.
      </div>

      <div>
        <label htmlFor="coros-region" style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6 }}>
          Région de ton compte COROS
        </label>
        <select
          id="coros-region"
          value={region}
          onChange={(e) => setRegion(e.target.value as CorosRegion)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit" }}
        >
          {COROS_REGIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 6, lineHeight: 1.45 }}>
          Celle où tu as créé ton compte COROS. En cas d'erreur, l'autorisation échoue sans
          conséquence et tu peux recommencer.
        </div>
      </div>

      {/* ── Accord, demandé au moment où il sert ── */}
      {!consentGranted && (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <span style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5 }}>
            {CONSENT_COPY.coros_sync.label}
            <span style={{ display: "block", color: C.tx3, marginTop: 3 }}>
              {CONSENT_COPY.coros_sync.detail} Tu pourras le retirer dans « Confidentialité &amp;
              données ».
            </span>
          </span>
        </label>
      )}

      <button
        onClick={lancer}
        disabled={!pretAConnecter || busy}
        style={{ padding: "11px 0", borderRadius: 6, border: "1px solid " + (pretAConnecter ? C.g + "40" : C.brd), background: pretAConnecter ? C.gS : C.s2, color: pretAConnecter ? C.g : C.tx3, fontSize: 12, fontWeight: 600, cursor: pretAConnecter && !busy ? "pointer" : "not-allowed", opacity: pretAConnecter ? 1 : 0.6, fontFamily: "inherit" }}
      >
        {busy ? "Redirection vers COROS…" : "Connecter mon compte COROS"}
      </button>
    </div>
  );
}
