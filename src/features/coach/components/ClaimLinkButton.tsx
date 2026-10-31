import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAthleteClaimLink } from "@/features/shared/hooks/useAthleteClaimLink";

interface Props {
  athleteId: string;
  /** Faux = athlète déjà connecté : le bouton n'a plus lieu d'être. */
  pending: boolean;
  size?: number;
}

/** Copie le lien de première connexion d'un athlète pré-créé. */
export default function ClaimLinkButton({ athleteId, pending, size = 16 }: Props) {
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
        width: size + 12, height: size + 12, borderRadius: 4, flexShrink: 0,
        border: "1px solid " + C.b + "50", background: C.b + "18",
        color: C.b, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <Link2 size={size} />
    </button>
  );
}
