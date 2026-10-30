import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/theme";
import { toast } from "sonner";
import { bookingUrlError, normalizeBookingUrl } from "@/lib/booking";
import { PrivacySection } from "@/features/shared/components/PrivacySection";
import { CoachApiKeysSection } from "@/features/coach/components/CoachApiKeysSection";

export default function SettingsPage() {
  const { profile } = useAuth();
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
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/login";
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
    const { error } = await supabase
      .from("profiles")
      .update({ booking_url: value })
      .eq("id", profile.id);
    setSavingBooking(false);

    if (error) {
      toast.error("Échec de l'enregistrement");
      return;
    }
    setBookingUrl(value ?? "");
    setSavedBookingUrl(value ?? "");
    toast.success(value ? "Lien de réservation enregistré" : "Lien de réservation retiré");
  }

  return (
    <div style={{ padding: "24px", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 24 }}>
        Paramètres
      </div>

      {/* Profil */}
      <div
        style={{
          background: C.s1, borderRadius: 6, padding: 16,
          border: "1px solid " + C.brd, marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
          Profil coach
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: C.coach + "25", border: "1px solid " + C.coach + "40",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, color: C.coach,
            }}
          >
            {(profile?.full_name || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
              {profile?.full_name || "—"}
            </div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {profile?.role === "coach_athlete" ? "Coach-athlète" : "Coach"}
            </div>
          </div>
        </div>
      </div>

      {/* Code coach */}
      <div
        style={{
          background: C.s1, borderRadius: 6, padding: 16,
          border: "1px solid " + C.brd, marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Code coach
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: C.coach, letterSpacing: "0.2em", flex: 1 }}>
            {profile?.coach_code || "------"}
          </div>
          <button
            onClick={handleCopyCode}
            style={{
              padding: "6px 14px", borderRadius: 4,
              border: "1px solid " + C.coach + "50", background: C.coachS,
              color: C.coach, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Copier
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 6 }}>
          Donne ce code à tes athlètes lors de leur inscription.
        </div>
      </div>

      {/* Point hebdo — lien Calendly, visible par les athlètes dans leur profil */}
      <div
        style={{
          background: C.s1, borderRadius: 6, padding: 16,
          border: "1px solid " + C.brd, marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Lien de réservation du point hebdo
        </div>
        <input
          type="url"
          inputMode="url"
          value={bookingUrl}
          onChange={(e) => setBookingUrl(e.target.value)}
          placeholder="https://calendly.com/ton-compte/30min"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 12px", borderRadius: 4,
            border: "1px solid " + (bookingError ? C.r : C.brdL),
            background: C.s2, color: C.tx,
            fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
        {bookingError ? (
          <div style={{ fontSize: 11, color: C.r, marginTop: 6 }}>{bookingError}</div>
        ) : (
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 6 }}>
            Tes athlètes verront « Réserver mon point hebdo » dans leur profil. Laisse vide pour le retirer.
          </div>
        )}
        <button
          onClick={handleSaveBooking}
          disabled={!!bookingError || !bookingDirty || savingBooking}
          style={{
            marginTop: 10, padding: "8px 16px", borderRadius: 4,
            border: "1px solid " + C.coach + "50",
            background: !bookingError && bookingDirty ? C.coachS : "transparent",
            color: !bookingError && bookingDirty ? C.coach : C.tx3,
            fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            cursor: !bookingError && bookingDirty && !savingBooking ? "pointer" : "default",
            opacity: !bookingError && bookingDirty ? 1 : 0.5,
          }}
        >
          {savingBooking ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* Clés API pour l'assistant IA personnel du coach */}
      <CoachApiKeysSection />

      {/* Confidentialité & données — mêmes droits RGPD que côté athlète */}
      <div style={{ marginTop: 24 }}>
        <PrivacySection />
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setShowLogout(true)}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 6,
            border: "1px solid rgba(239,75,75,0.3)", background: "rgba(239,75,75,0.08)",
            color: C.r, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "background 150ms",
          }}
        >
          <span>⏻</span><span>Déconnexion</span>
        </button>
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
