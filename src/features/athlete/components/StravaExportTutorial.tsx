import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";

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
  const { data: coachEmail } = useQuery<string | null>({
    queryKey: ["myCoachEmail"],
    staleTime: Infinity,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_my_coach_email");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
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

  return (
    <div style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Transmettre mes données Strava</div>
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
  );
}
