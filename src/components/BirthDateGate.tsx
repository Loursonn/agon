import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/api/client";
import { BirthDateRefused } from "@/api/profile";
import { localIsoDay } from "@shared/domain/dates";
import { MIN_AGE, OLDEST_BIRTH_DATE } from "@/lib/age";
import { AUTH_INPUT } from "@/pages/auth/authStyles";
import { AuthButton, AuthError, AuthField, AuthLogo, AuthScreen, AuthTitle } from "@/pages/auth/AuthUi";

/**
 * Date de naissance des comptes qui n'en ont pas (créés avant le contrôle d'âge
 * du 2026-11-09). Revue juridique C2 : sans date, aucun garde-fou d'âge n'est
 * possible, en particulier pour l'IA, réservée aux 18 ans et plus.
 *
 * Demandée une seule fois, à tous les rôles, avant l'écran des accords : on ne
 * peut pas la passer. Tant qu'elle manque, l'accord IA n'est pas proposé
 * (`canOfferAiConsent`). Écrite par la RPC `set_my_birth_date` (contrôle
 * 15 ans ; avant 18 ans, l'accord IA est retiré dans la même opération).
 *
 * Ne bloque jamais l'app pour une raison technique : hors ligne, ou si le
 * serveur ne connaît pas encore la fonction (client en avance sur la base),
 * l'app s'ouvre et la question revient au lancement suivant.
 */
export default function BirthDateGate({ children }: { children: React.ReactNode }) {
  const { profile, setMyBirthDate, logout } = useAuth();
  const [day, setDay] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [later, setLater] = useState(false);

  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!profile || profile.birth_date || profile.is_pending || later || !online) return <>{children}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await setMyBirthDate(day);
    } catch (err) {
      if (err instanceof BirthDateRefused) setError(err.message);
      // Fonction absente du serveur, ou date déjà enregistrée ailleurs : on ne bloque pas.
      else if (err instanceof ApiError && (err.code === "PGRST202" || err.code === "23505")) setLater(true);
      else setError("Enregistrement impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <AuthScreen
        top={<AuthLogo size="small" />}
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <AuthButton disabled={!day || saving}>{saving ? "Enregistrement…" : "Enregistrer"}</AuthButton>
            <AuthButton type="button" variant="ghost" onClick={() => void logout()}>Se déconnecter</AuthButton>
          </div>
        }
      >
        <AuthTitle
          title="Ta date de naissance"
          text={
            <>
              Agon la demande maintenant à tous les comptes : l’application est réservée aux {MIN_AGE} ans et
              plus, et les analyses par intelligence artificielle aux 18 ans et plus. On ne te la demandera
              qu’une fois.
            </>
          }
        />
        <AuthField label="Date de naissance" hint="Elle sert seulement à vérifier ton âge, comme à l’inscription.">
          <input
            id="birthDate"
            aria-label="Date de naissance"
            type="date"
            required
            min={OLDEST_BIRTH_DATE}
            max={localIsoDay()}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            style={{ ...AUTH_INPUT, colorScheme: "dark" }}
          />
        </AuthField>
        {error && <AuthError>{error}</AuthError>}
      </AuthScreen>
    </form>
  );
}
