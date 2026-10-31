/**
 * Espace professionnel — /staff.
 * Distinct de /coach et /athlete. Accessible à un compte `staff` et à tout
 * compte qui a au moins un lien staff actif (double casquette).
 */
import { Outlet, useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { professionLabel } from "./lib/staffPermissions";

export default function StaffApp() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const isCoach = profile?.role === "coach" || profile?.role === "coach_athlete";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.tx }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 20, background: C.s1, borderBottom: "1px solid " + C.brd,
        padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, minHeight: 48,
      }}>
        <button onClick={() => navigate("/staff")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <img src="/brand/agon-symbole-favicon-marbre.svg" alt="" style={{ width: 26, height: 26 }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.tx }}>Agon</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.b, border: "1px solid " + C.b + "50", borderRadius: 3, padding: "1px 6px" }}>STAFF</span>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: C.tx2, textAlign: "right", lineHeight: 1.2 }}>
          <div style={{ fontWeight: 600, color: C.tx }}>{profile?.full_name}</div>
          {profile?.profession && <div style={{ fontSize: 10, color: C.tx3 }}>{professionLabel(profile.profession)}</div>}
        </div>
        {isCoach && (
          <button
            onClick={() => navigate("/coach")}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid " + C.coach + "40", background: C.coach + "15", color: C.coach, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Espace coach
          </button>
        )}
        <button
          onClick={() => logout()}
          style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          Déconnexion
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
