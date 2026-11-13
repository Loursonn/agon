import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { AuthButton, AuthLogo, AuthScreen, AuthTitle } from "./auth/AuthUi";

/** Page 404 (planche AccesPagesSimples, écran 04) : un seul bouton pour revenir. */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <AuthScreen
      top={<AuthLogo size="small" />}
      footer={<Link to="/" style={{ textDecoration: "none" }}><AuthButton type="button">Retour à l’accueil</AuthButton></Link>}
    >
      <div style={{ marginTop: 60, display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ ...MONO, fontSize: 64, lineHeight: 1, color: C.ac }}>404</span>
        <AuthTitle title="Page introuvable" text="Ce lien ne mène nulle part : il a peut-être changé ou expiré." />
      </div>
    </AuthScreen>
  );
};

export default NotFound;
