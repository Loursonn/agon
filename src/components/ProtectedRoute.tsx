import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ConsentGate from "@/components/ConsentGate";

// Redirige vers /login si non connecté
// Redirige vers /coach ou /athlete selon le rôle une fois connecté
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  /*
    Le consentement est vérifié ici et non dans chaque page : les données de
    santé relèvent de l'article 9 du RGPD, donc aucune route authentifiée ne
    doit pouvoir s'afficher sans base légale. Un oubli dans une page isolée
    suffirait à créer un traitement illicite.
  */
  /*
    Exception : un compte professionnel pur (rôle `staff` : kiné, ostéo…) ne
    confie aucune donnée de santé le concernant à l'app. Il consulte celles des
    athlètes qui l'ont accepté, sur la base de leur propre accord
    (`staff_sharing`, vérifié côté base par staff_can). L'écran d'accord santé,
    écrit pour un athlète, ne s'applique donc pas à lui. Un coach qui est aussi
    pro (double casquette) garde son rôle coach et passe toujours la barrière.
  */
  if (profile?.role === "staff") return <>{children}</>;

  return <ConsentGate>{children}</ConsentGate>;
}

// Redirige selon le rôle depuis la page d'accueil "/"
export function RoleRedirect() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-black px-4">
        <div className="text-center space-y-3">
          <p className="text-white font-semibold">Profil introuvable</p>
          <p className="text-sm text-zinc-400">Ton compte existe mais ton profil n'a pas été créé.<br />Contacte l'administrateur ou recrée ton compte.</p>
        </div>
      </div>
    );
  }
  if (profile.role === "coach" || profile.role === "coach_athlete") return <Navigate to="/coach" replace />;
  if (profile.role === "staff") return <Navigate to="/staff" replace />;
  return <Navigate to="/athlete" replace />;
}
