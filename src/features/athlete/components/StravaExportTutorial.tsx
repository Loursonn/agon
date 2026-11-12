import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { accountKeys, getMyCoachEmail } from "@/api/account";
import { useAuth } from "@/hooks/useAuth";

const ASSET_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/public-assets`;

const STEPS = [
  "Sur strava.com (ordinateur), clique sur ta photo en haut à droite → Paramètres.",
  "Menu de gauche : Mon compte.",
  "Descends jusqu'à « Télécharger votre compte » → Commencer.",
  "Clique sur « Demander le téléchargement ». Strava t'envoie un e-mail avec le lien vers tes données (compte quelques heures).",
  "Transfère cet e-mail de Strava à ton coach.",
];

/** Tuto : exporter ses données Strava et les transmettre au coach */
export function StravaExportTutorial() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // Clé par utilisateur : avant, une clé commune gardait l'e-mail du coach du
  // compte précédent après un changement de compte sans rechargement.
  const { data: coachEmail } = useQuery<string | null>({
    queryKey: accountKeys.coachEmail(user?.id ?? "none"),
    enabled: !!user,
    staleTime: Infinity,
    queryFn: getMyCoachEmail,
  });

  const copy = async () => {
    if (!coachEmail) return;
    try {
      await navigator.clipboard.writeText(coachEmail);
      toast.success("Adresse copiée");
    } catch {
      toast.error("Copie impossible");
    }
  };

  // Planche « Profil athlète » : une ligne orange repliée ; le tuto s'ouvre au toucher.
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.o}59`, background: `radial-gradient(90% 120% at 100% 0%, ${C.o}33, transparent 60%), linear-gradient(160deg, ${C.o}1F, ${C.o}0D), ${C.s1}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: "100%", padding: "12px 16px 12px 12px", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.tx, textAlign: "left" }}
      >
        <span aria-hidden style={{ width: 36, height: 36, flex: "none", borderRadius: 10, background: C.o, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 14px ${C.o}66` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E0C0A" strokeWidth="1.8" strokeLinecap="square"><path d="M12 3V15M7 10L12 15L17 10M4 19H20" /></svg>
        </span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Transmettre mes données Strava</span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.tx2} strokeWidth="1.5" strokeLinecap="square" style={{ flex: "none", transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}><path d="M9 5L16 12L9 19" /></svg>
      </button>
      {open && (
      <div style={{ padding: "0 16px 16px" }}>
      <div style={{ fontSize: 12, color: C.tx3, marginBottom: 12, lineHeight: 1.5 }}>
        Ton historique Strava aide ton coach à connaître ton passé d'entraînement. Regarde la vidéo puis suis les étapes.
      </div>

      <video
        src={`${ASSET_BASE}/strava-export-tuto.mp4`}
        poster={`${ASSET_BASE}/strava-export-tuto.jpg`}
        controls playsInline preload="metadata"
        style={{ width: "100%", borderRadius: 4, background: "#000", marginBottom: 12, display: "block" }}
      />

      <ol style={{ margin: 0, paddingLeft: 18, listStyle: "decimal", display: "flex", flexDirection: "column", gap: 6 }}>
        {STEPS.map((s) => (
          <li key={s} style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>{s}</li>
        ))}
      </ol>

      {coachEmail && (
        <button
          onClick={copy}
          style={{
            marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2,
            color: C.tx, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          }}
        >
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ color: C.tx3 }}>Adresse de ton coach : </span>{coachEmail}
          </span>
          <Copy size={14} color={C.tx3} style={{ flexShrink: 0 }} />
        </button>
      )}
      </div>
      )}
    </div>
  );
}
