import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { useAthleteClaimLink } from "@/features/shared/hooks/useAthleteClaimLink";

interface Props {
  athleteId: string;
  /** Faux = athlète déjà connecté : le bouton n'a plus lieu d'être. */
  pending: boolean;
  size?: number;
  /** Couleur (planche CoachAthletes : orange « en attente »). */
  color?: string;
}

/** Copie le lien de première connexion d'un athlète pré-créé. */
export default function ClaimLinkButton({ athleteId, pending, size = 16, color = C.b }: Props) {
  const { data: link } = useAthleteClaimLink(athleteId, pending);
  if (!pending || !link) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!);
      toast.success("Lien copié — envoie-le à l'athlète pour sa première connexion");
    } catch {
      toast.error("Copie impossible");
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); copy(); }}
      title="Copier le lien de première connexion"
      aria-label="Copier le lien de première connexion"
      style={{
        width: size + 16, height: size + 16, boxSizing: "border-box", borderRadius: 8, flexShrink: 0,
        border: "1px solid " + color, background: alpha(color, 0.16),
        color, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <Link2 size={size} />
    </button>
  );
}
