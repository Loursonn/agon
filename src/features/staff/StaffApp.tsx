/**
 * Espace professionnel — /staff.
 * Distinct de /coach et /athlete. Accessible à un compte `staff` et à tout
 * compte qui a au moins un lien staff actif (double casquette).
 */
import { Outlet, useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { professionLabel } from "./lib/staffPermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, DISPLAY, Pill } from "@/features/shared/components/ordi/OrdiUi";
import { btnStyle } from "@/features/shared/components/ordi/ordiStyles";

export default function StaffApp() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isCoach = profile?.role === "coach" || profile?.role === "coach_athlete";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.tx }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 20, background: C.bg, borderBottom: "1px solid " + C.brd,
        padding: isMobile ? "0 16px" : "0 48px", display: "flex", alignItems: "center", gap: 12, height: 64,
      }}>
        <button onClick={() => navigate("/staff")} style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", padding: 0, color: C.tx }}>
          <img src="/brand/agon-symbole-favicon-marbre.svg" alt="" style={{ width: 26, height: 26 }} />
          {!isMobile && <span style={{ ...DISPLAY, fontWeight: 400, fontSize: 15, letterSpacing: "0.22em" }}>Agon</span>}
          <Pill color={C.b} filled>Staff</Pill>
        </button>
        <span style={{ flex: 1 }} />
        <div style={{ textAlign: "right", lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.tx }}>{profile?.full_name}</div>
          {profile?.profession && <div style={{ fontSize: 11.5, color: C.tx3 }}>{professionLabel(profile.profession)}</div>}
        </div>
        {!isMobile && <Avatar name={profile?.full_name} color={C.b} size={34} />}
        {isCoach && (
          <button onClick={() => navigate("/coach")} style={{ ...btnStyle("ghost", "sm"), height: 32, fontSize: 12, color: C.coach, borderColor: C.coach + "50" }}>
            Espace coach
          </button>
        )}
        <button onClick={() => logout()} style={{ ...btnStyle("ghost", "sm"), height: 32, fontSize: 12 }}>
          Déconnexion
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
