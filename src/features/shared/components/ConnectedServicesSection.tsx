import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { ActivityFileImport } from "@/features/shared/components/ActivityFileImport";
import {
  CONSENT_COPY,
  isGranted,
  useConsents,
  useSetConsent,
} from "@/features/shared/hooks/useConsent";
import {
  COROS_REGIONS,
  GARMIN_ENABLED,
  connectionFor,
  useConnectCoros,
  useConnectGarmin,
  useDisconnectProvider,
  useProviderConnections,
  useSetWorkoutPush,
  useSyncCoros,
  useWorkoutPushes,
  type CorosRegion,
  type ProviderConnection,
  type ProviderName,
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
 *     pas plus d'étapes que pour connecter. Le RGPD l'exige pour le retrait du
 *     consentement. Une seule confirmation, parce que depuis le 07/11/2026 la
 *     déconnexion supprime les données importées par ce fournisseur.
 *
 * Une ligne par fournisseur (COROS, Garmin). Garmin reste « bientôt
 * disponible » tant que `VITE_GARMIN_ENABLED` n'est pas activé.
 */

const PROVIDER_LABEL: Record<ProviderName, string> = { coros: "COROS", garmin: "Garmin" };

type Outcome = { kind: "success" | "warning" | "error"; title: string; detail?: string };

/**
 * Ce que le retour d'autorisation peut valoir, et quoi en dire à l'athlète.
 * Le paramètre d'URL porte le nom du fournisseur (`?coros=ok`, `?garmin=ok`).
 */
function outcomesFor(provider: ProviderName): Record<string, Outcome> {
  const nom = PROVIDER_LABEL[provider];
  return {
    ok: {
      kind: "success",
      title: `Compte ${nom} connecté`,
      detail: provider === "garmin"
        ? "Tes prochaines activités arriveront automatiquement après chaque synchronisation de ta montre avec Garmin Connect."
        : "Tes activités seront récupérées automatiquement chaque jour.",
    },
    partiel: {
      kind: "warning",
      title: "Connexion incomplète",
      detail: provider === "garmin"
        ? "Garmin n'a autorisé ni les activités ni les données de santé : rien ne sera importé. Reconnecte ton compte en cochant ces autorisations."
        : "COROS n'a pas accordé l'accès durable. La synchronisation s'arrêtera dans quelques heures — reconnecte ton compte en acceptant toutes les autorisations.",
    },
    refus: {
      kind: "warning",
      title: "Autorisation annulée",
      detail: "Rien n'a été connecté. Tu peux réessayer quand tu veux.",
    },
    expire: {
      kind: "error",
      title: "Demande expirée",
      detail: "Une autorisation reste valable dix minutes. Relance la connexion depuis cette page.",
    },
    consentement_absent: {
      kind: "error",
      title: "Accord manquant",
      detail: `Ton accord pour la synchronisation ${nom} n'était plus actif au retour. Aucune donnée n'a été récupérée.`,
    },
    compte_deja_lie: {
      kind: "error",
      title: `Compte ${nom} déjà utilisé`,
      detail: `Ce compte ${nom} est déjà relié à un autre compte Agon. Déconnecte-le de l'autre compte d'abord.`,
    },
    indisponible: {
      kind: "error",
      title: `Connexion ${nom} pas encore ouverte`,
      detail: "Agon attend la validation du fournisseur. Rien n'a été connecté.",
    },
    parametres_manquants: {
      kind: "error",
      title: "Retour incomplet",
      detail: `${nom} n'a pas renvoyé les informations attendues. Réessaie.`,
    },
    client_introuvable: {
      kind: "error",
      title: `Configuration ${nom} introuvable`,
      detail: "Réessaie ; si le problème persiste, signale-le à ton coach.",
    },
    erreur: {
      kind: "error",
      title: "La connexion a échoué",
      detail: "Réessaie dans un moment.",
    },
  };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/*
  Les quatre états de `provider_status`, et rien d'autre. La version précédente
  inventait `expired` et `error` et oubliait `needs_reauth` — donc le seul état
  qui demande une action de l'athlète s'affichait comme « undefined ».
*/
const STATUS_COPY: Record<ProviderConnection["status"], { label: string; tone: "ok" | "warn" | "bad" }> = {
  active: { label: "Connecté", tone: "ok" },
  needs_reauth: { label: "Reconnexion nécessaire", tone: "warn" },
  consent_withdrawn: { label: "Accord retiré", tone: "bad" },
  revoked: { label: "Accès révoqué", tone: "bad" },
};

/** Résultat de l'autorisation posé dans l'URL par la fonction de retour : toast, puis retiré. */
function useProviderOutcomes(onProblem: () => void) {

  /*
    Le résultat de l'autorisation arrive dans l'URL, posé par la fonction de
    retour. Il est lu une fois puis retiré de la barre d'adresse : laissé là, un
    rafraîchissement rejouerait le message « compte connecté » alors que rien ne
    vient de se passer.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let touched = false;
    for (const provider of ["coros", "garmin"] as const) {
      const outcome = params.get(provider);
      if (!outcome) continue;
      const outcomes = outcomesFor(provider);
      const copy = outcomes[outcome] ?? outcomes.erreur;
      toast[copy.kind](copy.title, { description: copy.detail });
      if (copy.kind !== "success") onProblem();
      params.delete(provider);
      touched = true;
    }
    if (!touched) return;

    const q = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (q ? `?${q}` : "") + window.location.hash,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Dans une carte de « Montres et données », le nom est déjà dans l'en-tête de la carte. */
const InCard = createContext(false);
function RowTitle({ children }: { children: ReactNode }) {
  return useContext(InCard) ? null : <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>{children}</div>;
}

const CARD_S: CSSProperties = { borderRadius: 14, background: C.s1, border: "1px solid " + C.brd, padding: "14px 14px 16px" };

/**
 * Page « Montres et données » (planche Ath2Montres) : une carte par montre,
 * mêmes accords et mêmes actions que le panneau replié du tiroir.
 */
export function ProviderCards() {
  const { data: connections, isLoading } = useProviderConnections();
  useProviderOutcomes(() => {});
  if (isLoading) return <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>;
  const garmin = connectionFor(connections, "garmin");
  const coros = connectionFor(connections, "coros");
  // Montre connectée en premier (planche : Garmin connectée, COROS à connecter).
  const order = coros?.status === "active" && garmin?.status !== "active" ? (["coros", "garmin"] as const) : (["garmin", "coros"] as const);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {order.map((p) => (
        <div key={p} style={CARD_S}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: C.s2, border: "1px solid " + C.brd, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--agon-font-data)", fontSize: 10.5, color: C.tx2, flex: "none" }}>
              {p === "garmin" ? "GRM" : "CRS"}
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{PROVIDER_LABEL[p]}</span>
          </div>
          <InCard.Provider value>
            {p === "garmin" ? <GarminRow connection={garmin} /> : <CorosRow connection={coros} />}
          </InCard.Provider>
        </div>
      ))}
    </div>
  );
}

export function ConnectedServicesSection() {
  const [open, setOpen] = useState(false);
  const { data: connections, isLoading } = useProviderConnections();
  const coros = connectionFor(connections, "coros");
  const garmin = connectionFor(connections, "garmin");
  useProviderOutcomes(() => setOpen(true));

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
          {([["coros", coros], ["garmin", garmin]] as const).map(([p, c]) =>
            c?.status === "active" ? (
              <span key={p} style={{ fontSize: 10, color: C.g, border: "1px solid " + C.g + "40", background: C.gS, borderRadius: 10, padding: "2px 7px" }}>
                {PROVIDER_LABEL[p]}
              </span>
            ) : null,
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

              <div style={{ borderTop: "1px solid " + C.brd, paddingTop: 14 }}>
                <GarminRow connection={garmin} />
              </div>

              {/*
                L'import de fichiers vit dans ce panneau et non dans une page à
                part : c'est ici qu'on vient quand on veut que ses données
                entrent dans Agon, qu'elles arrivent par une montre connectée ou
                par une archive. Et c'est aussi le seul moyen de récupérer un
                historique ancien — Garmin n'expose que quatre-vingt-dix jours,
                COROS limite les téléchargements quotidiens.
              */}
              <div style={{ borderTop: "1px solid " + C.brd, paddingTop: 14 }}>
                <ActivityFileImport />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Choix de la région du compte COROS, à la connexion comme à la reconnexion. */
function RegionPicker({
  region,
  onChange,
}: {
  region: CorosRegion;
  onChange: (r: CorosRegion) => void;
}) {
  return (
    <div>
      <label htmlFor="coros-region" style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6 }}>
        Région de ton compte COROS
      </label>
      <select
        id="coros-region"
        value={region}
        onChange={(e) => onChange(e.target.value as CorosRegion)}
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
  );
}

/** Ligne COROS : connecter, surveiller, synchroniser, déconnecter. */
function CorosRow({ connection }: { connection: ProviderConnection | undefined }) {
  const { data: consents } = useConsents();
  const setConsent = useSetConsent();
  const connect = useConnectCoros();
  const sync = useSyncCoros();

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

  /*
    Le compte rendu est affiché tel quel, refus compris. « 12 activités
    importées » sans mention des 3 fichiers illisibles laisse croire à un
    succès complet, et l'athlète cherche ensuite pourquoi une sortie manque.
  */
  const synchroniser = () => {
    sync.mutate(undefined, {
      onSuccess: (r) => {
        if (!r) {
          toast.success("Synchronisation lancée");
          return;
        }
        if (r.error) {
          toast.error("Synchronisation interrompue", { description: r.error });
          return;
        }

        const parts: string[] = [];
        if (r.imported > 0) parts.push(`${r.imported} activité${r.imported > 1 ? "s" : ""} importée${r.imported > 1 ? "s" : ""}`);
        if (r.duplicates > 0) parts.push(`${r.duplicates} déjà connue${r.duplicates > 1 ? "s" : ""}`);
        if (r.dailies > 0) parts.push(`${r.dailies} journée${r.dailies > 1 ? "s" : ""} de données de santé`);
        if (r.rejected.length > 0) parts.push(`${r.rejected.length} fichier${r.rejected.length > 1 ? "s" : ""} non lu${r.rejected.length > 1 ? "s" : ""}`);

        if (parts.length === 0) {
          toast.success("Déjà à jour", { description: "Aucune nouvelle activité chez COROS." });
          return;
        }
        toast[r.rejected.length > 0 ? "warning" : "success"]("Synchronisation terminée", {
          description: parts.join(" · "),
        });
      },
      onError: (e) => toast.error("Synchronisation impossible", { description: e.message }),
    });
  };

  if (connection) {
    const status = STATUS_COPY[connection.status];
    const tone = status.tone === "ok" ? C.g : status.tone === "warn" ? C.o : C.r;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <RowTitle>COROS</RowTitle>
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

        {connection.status !== "active" && (
          /*
            Le choix de région est reproposé à la reconnexion. L'interface ne lit
            pas `api_host` — l'athlète n'a rien à faire d'un hôte régional — donc
            au moment de reconnecter, rien ne dit où est son compte. Garder le
            défaut européen en silence ferait échouer chaque reconnexion d'un
            athlète américain, sans que la cause soit visible nulle part.
          */
          <RegionPicker region={region} onChange={setRegion} />
        )}

        {connection.status === "active" ? (
          <>
            <button
              onClick={synchroniser}
              disabled={sync.isPending}
              style={{ padding: "10px 0", borderRadius: 6, border: "1px solid " + C.g + "40", background: C.gS, color: C.g, fontSize: 12, fontWeight: 600, cursor: sync.isPending ? "wait" : "pointer", fontFamily: "inherit" }}
            >
              {sync.isPending ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
            <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
              La synchronisation a lieu automatiquement chaque nuit. COROS limite le nombre de
              fichiers téléchargeables par jour : un historique long se remplit donc sur plusieurs
              jours, par tranches.
            </div>
          </>
        ) : (
          <>
            <button
              onClick={lancer}
              disabled={busy}
              style={{ padding: "10px 0", borderRadius: 6, border: "1px solid " + C.o + "40", background: C.s2, color: C.o, fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}
            >
              {busy ? "Redirection vers COROS…" : "Reconnecter mon compte COROS"}
            </button>
            <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
              {connection.status === "consent_withdrawn"
                ? "Tu as retiré ton accord : la synchronisation est arrêtée. La reconnecter le redonnera."
                : "COROS n'accepte plus notre autorisation. Reconnecter ton compte relance la synchronisation là où elle s'est arrêtée."}
            </div>
          </>
        )}

        <DisconnectBlock provider="coros" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <RowTitle>COROS</RowTitle>
      <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
        Récupère automatiquement tes activités, ta fréquence cardiaque, ton sommeil et tes
        indicateurs de récupération, et les partage avec ton coach.
      </div>

      <RegionPicker region={region} onChange={setRegion} />

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

/**
 * Déconnexion, avec confirmation.
 *
 * Décision du 07/11/2026 : déconnecter supprime les activités et les données
 * quotidiennes importées par ce fournisseur (les fichiers importés à la main
 * restent). C'est irréversible : un premier clic explique, le second confirme.
 */
function DisconnectBlock({ provider }: { provider: ProviderName }) {
  const disconnect = useDisconnectProvider();
  const [confirmer, setConfirmer] = useState(false);
  const nom = PROVIDER_LABEL[provider];

  const couper = () => {
    disconnect.mutate(provider, {
      onSuccess: (r) => {
        setConfirmer(false);
        const n = r.deleted?.activities ?? 0;
        const supprime = n > 0 ? ` ${n} activité${n > 1 ? "s" : ""} ${nom} supprimée${n > 1 ? "s" : ""}.` : "";
        if (r.revoked) {
          toast.success(`Compte ${nom} déconnecté`, {
            description: `L'accès a été révoqué chez ${nom}.${supprime}`,
          });
        } else {
          /*
            « J'ai effacé ma copie du jeton » n'est pas « l'accès est coupé ».
            Le masquer donnerait à l'athlète une certitude qu'on n'a pas.
          */
          toast.warning("Déconnecté côté Agon", {
            description: `${nom} n'a pas confirmé la révocation. Nos jetons et tes données ${nom} sont supprimés ; retire aussi l'autorisation depuis ton compte ${nom} pour en être sûr.`,
          });
        }
      },
      onError: (e) => toast.error("Déconnexion impossible", { description: e.message }),
    });
  };

  if (!confirmer) {
    return (
      <>
        <button
          onClick={() => setConfirmer(true)}
          style={{ padding: "10px 0", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Déconnecter mon compte {nom}
        </button>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
          L'accès est révoqué chez {nom}, et les données que {nom} a envoyées à Agon sont
          supprimées. Les fichiers que tu as importés toi-même restent.
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid " + C.r + "40", background: C.rS, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: C.tx, lineHeight: 1.5 }}>
        Tes activités et données de santé importées depuis {nom} seront supprimées d'Agon, pour
        toi comme pour ton coach. C'est définitif. Les activités importées par fichier restent.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setConfirmer(false)}
          disabled={disconnect.isPending}
          style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Annuler
        </button>
        <button
          onClick={couper}
          disabled={disconnect.isPending}
          style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid " + C.r + "60", background: C.s2, color: C.r, fontSize: 12, fontWeight: 600, cursor: disconnect.isPending ? "wait" : "pointer", fontFamily: "inherit" }}
        >
          {disconnect.isPending ? "Déconnexion…" : "Déconnecter et supprimer"}
        </button>
      </div>
    </div>
  );
}

/**
 * Erreur d'envoi lisible par l'athlète : la partie française seulement (le
 * corps brut renvoyé par Garmin reste pour le diagnostic), et la marche à
 * suivre quand l'autorisation « séances » manque.
 */
function pushErrorText(raw: string): string {
  if (raw.includes("(412)")) {
    return "autorise l'import de séances dans Garmin Connect (reconnecte ton compte et coche cette autorisation).";
  }
  if (raw.includes("(401)")) return "reconnecte ton compte Garmin.";
  return raw.split(" — ")[0];
}

/**
 * Envoi des séances programmées sur la montre Garmin.
 *
 * Actif par défaut ; l'athlète peut le couper. Les séances des 7 prochains
 * jours partent dans le calendrier Garmin Connect, puis sur la montre à la
 * prochaine synchronisation. Couper l'envoi retire les séances à venir déjà
 * envoyées (au prochain passage du serveur, toutes les 10 minutes).
 */
function WorkoutPushBlock({ connection }: { connection: ProviderConnection }) {
  const setPush = useSetWorkoutPush();
  const { data: pushes } = useWorkoutPushes();
  const on = connection.pushWorkouts;
  const sent = (pushes ?? []).filter((p) => p.provider === "garmin" && p.status === "sent");
  const failed = (pushes ?? []).filter((p) => p.provider === "garmin" && p.status !== "sent");

  const toggle = () =>
    setPush.mutate(
      { provider: "garmin", enabled: !on },
      {
        onSuccess: () =>
          toast.success(on ? "Envoi sur la montre coupé" : "Envoi sur la montre activé", {
            description: on
              ? "Les séances déjà envoyées pour les prochains jours vont être retirées de ta montre."
              : "Tes séances des 7 prochains jours partent sur Garmin Connect dans les minutes qui viennent.",
          }),
        onError: (e) => toast.error("Réglage non enregistré", { description: e.message }),
      },
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.brd, background: C.s2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>Envoyer mes séances sur ma montre</div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Envoyer mes séances sur ma montre"
          onClick={toggle}
          disabled={setPush.isPending}
          style={{ position: "relative", width: 38, height: 22, flexShrink: 0, borderRadius: 11, border: "none", padding: 0, background: on ? C.g : C.brd, cursor: setPush.isPending ? "wait" : "pointer", transition: "background .15s" }}
        >
          <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
        {on
          ? "Les séances programmées par ton coach pour les 7 prochains jours arrivent dans ton calendrier Garmin Connect, puis sur ta montre à la synchronisation. Une séance modifiée ou supprimée est mise à jour."
          : "Tes séances ne sont pas envoyées sur ta montre."}
      </div>
      {on && sent.length > 0 && (
        <div style={{ fontSize: 11, color: C.g, lineHeight: 1.5 }}>
          {sent.length === 1 ? "1 séance à venir envoyée" : `${sent.length} séances à venir envoyées`}
        </div>
      )}
      {on && connection.grantedScopes.length > 0 && !connection.grantedScopes.includes("WORKOUT_IMPORT") && (
        <div style={{ fontSize: 11, color: C.o, lineHeight: 1.5 }}>
          Envoi bloqué : {pushErrorText("(412)")}
        </div>
      )}
      {on && failed.length > 0 && (
        <div style={{ fontSize: 11, color: C.o, lineHeight: 1.5 }}>
          {failed.length === 1 ? "1 séance n'a pas pu être envoyée" : `${failed.length} séances n'ont pas pu être envoyées`}
          {failed[0].lastError ? ` : ${pushErrorText(failed[0].lastError)}` : "."}
        </div>
      )}
    </div>
  );
}

/**
 * Ligne Garmin.
 *
 * Tant que `VITE_GARMIN_ENABLED` n'est pas activé (dossier Garmin en cours
 * d'examen), la ligne est désactivée et dit pourquoi. Une fois ouverte :
 * consentement `garmin_sync` demandé au moment où il sert, puis OAuth. Pas de
 * bouton « synchroniser » : Garmin pousse les données lui-même (palier
 * Starter), et sans historique — d'où le renvoi vers l'import de fichiers.
 */
function GarminRow({ connection }: { connection: ProviderConnection | undefined }) {
  const { data: consents } = useConsents();
  const setConsent = useSetConsent();
  const connect = useConnectGarmin();
  const [accepte, setAccepte] = useState(false);

  const consentGranted = isGranted(consents, "garmin_sync");
  const pretAConnecter = consentGranted || accepte;
  const busy = connect.isPending || setConsent.isPending;

  const lancer = () => {
    const demarrer = () =>
      connect.mutate(undefined, {
        onError: (e) => {
          if (e.code === "garmin_indisponible") {
            toast.info("Garmin bientôt disponible", { description: e.message });
          } else {
            toast.error("Impossible de démarrer la connexion", { description: e.message });
          }
        },
      });
    // Accord enregistré AVANT la redirection (voir CorosRow).
    if (!consentGranted) {
      setConsent.mutate([{ purpose: "garmin_sync", granted: true }], {
        onSuccess: demarrer,
        onError: (e) => toast.error("Accord non enregistré", { description: e.message }),
      });
      return;
    }
    demarrer();
  };

  if (!GARMIN_ENABLED && !connection) {
    return (
      <div style={{ opacity: 0.6 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <RowTitle>Garmin</RowTitle>
          <div style={{ fontSize: 11, color: C.tx3 }}>Bientôt disponible</div>
        </div>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5, marginTop: 4 }}>
          En attente de validation du programme développeur Garmin. En attendant, l'import de
          fichiers ci-dessous récupère le même contenu.
        </div>
        <button
          disabled
          style={{ marginTop: 10, width: "100%", padding: "10px 0", borderRadius: 6, border: "1px solid " + C.brd, background: C.s2, color: C.tx3, fontSize: 12, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" }}
        >
          Connecter mon compte Garmin
        </button>
      </div>
    );
  }

  const historique = (
    <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
      Garmin n'envoie que les activités enregistrées après la connexion, sans historique. Pour tes
      sorties plus anciennes, utilise l'import de fichiers ci-dessous.
    </div>
  );

  if (connection) {
    const status = STATUS_COPY[connection.status];
    const tone = status.tone === "ok" ? C.g : status.tone === "warn" ? C.o : C.r;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <RowTitle>Garmin</RowTitle>
          <div style={{ fontSize: 11, color: tone }}>{status.label}</div>
        </div>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
          Connecté le {fmtDate(connection.connectedAt)}
          {connection.lastSyncAt
            ? ` · dernière donnée reçue le ${fmtDate(connection.lastSyncAt)}`
            : " · aucune donnée reçue pour l'instant"}
        </div>
        {connection.lastError && (
          <div style={{ fontSize: 11, color: C.r, background: C.rS, border: "1px solid " + C.r + "30", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5 }}>
            {connection.lastError}
          </div>
        )}
        {connection.status === "active" && <WorkoutPushBlock connection={connection} />}
        {connection.status === "active" ? historique : (
          <>
            <button
              onClick={lancer}
              disabled={busy}
              style={{ padding: "10px 0", borderRadius: 6, border: "1px solid " + C.o + "40", background: C.s2, color: C.o, fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}
            >
              {busy ? "Redirection vers Garmin…" : "Reconnecter mon compte Garmin"}
            </button>
            <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
              {connection.status === "consent_withdrawn"
                ? "Tu as retiré ton accord : la connexion va être fermée chez Garmin et tes données Garmin supprimées."
                : "Garmin n'accepte plus notre autorisation. Reconnecte ton compte pour continuer à recevoir tes activités."}
            </div>
          </>
        )}
        <DisconnectBlock provider="garmin" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <RowTitle>Garmin</RowTitle>
      <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
        Récupère automatiquement tes activités, ta fréquence cardiaque, ton sommeil et tes
        indicateurs de récupération, et les partage avec ton coach. Les données Garmin ne sont
        jamais envoyées à un service d'intelligence artificielle.
      </div>
      {historique}

      {!consentGranted && (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <span style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5 }}>
            {CONSENT_COPY.garmin_sync.label}
            <span style={{ display: "block", color: C.tx3, marginTop: 3 }}>
              {CONSENT_COPY.garmin_sync.detail} Tu pourras le retirer dans « Confidentialité &amp;
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
        {busy ? "Redirection vers Garmin…" : "Connecter mon compte Garmin"}
      </button>
    </div>
  );
}
