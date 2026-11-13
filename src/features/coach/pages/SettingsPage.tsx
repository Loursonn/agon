import { useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSaveBookingUrl } from "@/features/shared/hooks/useCoachBooking";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { initials } from "@/lib/initials";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { toast } from "sonner";
import { bookingUrlError, normalizeBookingUrl } from "@/lib/booking";
import { PrivacySection } from "@/features/shared/components/PrivacySection";
import { CoachApiKeysSection } from "@/features/coach/components/CoachApiKeysSection";

export default function SettingsPage() {
  const { user, profile, logout, setCoachAthleteMode } = useAuth();
  const isDesktop = useIsDesktop();
  const [switching, setSwitching] = useState(false);
  const saveBooking = useSaveBookingUrl();
  const [showLogout, setShowLogout] = useState(false);
  const [bookingUrl, setBookingUrl] = useState("");
  // Référence locale de ce qui est en base : le contexte useAuth ne se recharge
  // pas après l'update, donc comparer à profile.booking_url laisserait le bouton
  // actif en permanence.
  const [savedBookingUrl, setSavedBookingUrl] = useState("");
  const [savingBooking, setSavingBooking] = useState(false);

  // Le profil arrive après un tick : on ne pré-remplit qu'une fois chargé.
  useEffect(() => {
    setBookingUrl(profile?.booking_url ?? "");
    setSavedBookingUrl(profile?.booking_url ?? "");
  }, [profile?.booking_url]);

  const bookingError = bookingUrlError(bookingUrl);
  const bookingDirty = bookingUrl.trim() !== savedBookingUrl;

  async function handleLogout() {
    await logout();
  }

  async function handleCopyCode() {
    if (!profile?.coach_code) return;
    await navigator.clipboard.writeText(profile.coach_code);
    toast.success("Code copié");
  }

  async function handleSaveBooking() {
    if (!profile?.id || bookingError) return;
    // Champ vidé = le coach retire la réservation → NULL, pas chaîne vide
    // (la contrainte SQL refuserait '' et l'athlète verrait une entrée morte).
    const value = bookingUrl.trim() === "" ? null : normalizeBookingUrl(bookingUrl);
    if (bookingUrl.trim() !== "" && !value) return;

    setSavingBooking(true);
    try {
      await saveBooking.mutateAsync({ coachId: profile.id, url: value });
    } catch {
      toast.error("Échec de l'enregistrement");
      return;
    } finally {
      setSavingBooking(false);
    }
    setBookingUrl(value ?? "");
    setSavedBookingUrl(value ?? "");
    toast.success(value ? "Lien de réservation enregistré" : "Lien de réservation retiré");
  }

  const isCA = profile?.role === "coach_athlete";
  async function handleToggleCA() {
    if (switching) return;
    setSwitching(true);
    try {
      await setCoachAthleteMode(!isCA);
      toast.success(!isCA ? "Mode coach-athlète activé" : "Tu es maintenant uniquement coach");
    } catch {
      toast.error("Le mode n'a pas pu être changé");
    } finally {
      setSwitching(false);
    }
  }

  const card: CSSProperties = { background: C.s1, borderRadius: 14, padding: 18, border: "1px solid " + C.brd, display: "flex", flexDirection: "column", gap: 12 };
  const kick: CSSProperties = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2 };
  const goldBtn = (on: boolean): CSSProperties => ({
    padding: "8px 16px", borderRadius: 10, border: "none", background: on ? C.ac : C.s2, color: on ? C.bg : C.tx3,
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: on ? "pointer" : "default", alignSelf: "flex-start",
  });

  return (
    <div style={{ padding: isDesktop ? "32px 48px 48px" : "24px 20px 40px", maxWidth: isDesktop ? 1248 : 560, margin: "0 auto", boxSizing: "border-box" }}>
      <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 300, fontSize: 28, letterSpacing: "0.06em", color: C.tx }}>Paramètres</h1>
      <div style={{ fontSize: 13.5, color: C.tx2, marginTop: 6, marginBottom: 24 }}>Compte coach · {profile?.full_name || "—"}</div>

      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Profil */}
          <div style={card}>
            <span style={kick}>Profil coach</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: alpha(C.ac, 0.14), color: C.ac, display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 16, flex: "none" }}>
                {initials(profile?.full_name || "?")}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.tx }}>{profile?.full_name || "—"}</div>
                <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>{isCA ? "Coach-athlète" : "Coach"}{user?.email ? ` · ${user.email}` : ""}</div>
              </div>
            </div>
          </div>

          {/* Code coach */}
          <div style={card}>
            <span style={kick}>Code coach</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ ...MONO, fontSize: 28, color: C.ac, letterSpacing: "0.2em", flex: 1 }}>{profile?.coach_code || "------"}</span>
              <button type="button" onClick={handleCopyCode} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid " + alpha(C.ac, 0.45), background: alpha(C.ac, 0.1), color: C.ac, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Copier
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>
              Donne ce code à tes athlètes à leur inscription. Un autre coach s’en sert aussi pour devenir 2ᵉ coach d’un de tes athlètes.
            </div>
          </div>

          {/* Point hebdo — lien Calendly, visible par les athlètes dans leur profil */}
          <div style={card}>
            <span style={kick}>Point hebdo · lien de réservation</span>
            <input
              type="url"
              inputMode="url"
              aria-label="Lien de réservation du point hebdo"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              placeholder="https://calendly.com/ton-compte/30min"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid " + (bookingError ? C.r : C.brdL), background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }}
            />
            {bookingError ? (
              <div style={{ fontSize: 12, color: C.r }}>{bookingError}</div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>Tes athlètes voient « Réserver mon point hebdo » dans leur profil. Laisse vide pour le retirer.</div>
            )}
            <button type="button" onClick={handleSaveBooking} disabled={!!bookingError || !bookingDirty || savingBooking} style={goldBtn(!bookingError && bookingDirty && !savingBooking)}>
              {savingBooking ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>

          {/* Mode coach-athlète */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={kick}>Mode coach-athlète</span>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.tx, marginTop: 6 }}>Je m’entraîne aussi</div>
              </div>
              <button
                type="button" role="switch" aria-checked={isCA} aria-label="Je m’entraîne aussi" disabled={switching} onClick={handleToggleCA}
                style={{ width: 46, height: 26, borderRadius: 999, border: "none", padding: 3, cursor: switching ? "default" : "pointer", background: isCA ? C.ac : C.s2, display: "flex", justifyContent: isCA ? "flex-end" : "flex-start", opacity: switching ? 0.6 : 1, flex: "none" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: isCA ? C.bg : C.tx3 }} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.55 }}>
              Tu apparais dans ta liste d’athlètes et le bouton <span style={{ ...MONO, fontSize: 11, color: C.ac }}>MODE ATHLÈTE</span> ouvre ton propre espace : séance du jour, saisie des charges, wellness.
            </div>
            <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.55 }}>
              Tu te programmes toi-même, ou tu te fais suivre par un autre coach avec son code. Désactivé, tu restes uniquement coach : tes séances passées sont gardées.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Clés API pour l'assistant IA personnel du coach */}
          <CoachApiKeysSection />

          {/* Confidentialité & données — mêmes droits RGPD que côté athlète */}
          <PrivacySection />

          <button
            type="button"
            onClick={() => setShowLogout(true)}
            style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Déconnexion
          </button>
        </div>
      </div>

      {/* Logout confirm */}
      {showLogout && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
          onClick={() => setShowLogout(false)}
        >
          <div
            style={{
              background: C.s1, borderRadius: 6, padding: 24,
              maxWidth: 320, width: "100%", border: "1px solid " + C.brd,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
              Se déconnecter ?
            </div>
            <div style={{ fontSize: 13, color: C.tx3, marginBottom: 20 }}>
              Vous serez redirigé vers la page de connexion.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowLogout(false)}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: "transparent",
                  color: C.tx2, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 4,
                  border: "none", background: C.rV, color: "#0E0C0A",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
