/**
 * Accueil du professionnel : ses athlètes, avec le coach principal de chacun
 * et les alertes utiles (blessure en cours, accord de l'athlète manquant).
 */
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { useMyStaffLinks, type MyStaffAthlete } from "../hooks/useMyStaffLinks";
import { canRead, professionLabel, summarizePermissions } from "../lib/staffPermissions";

function AthleteCard({ a }: { a: MyStaffAthlete }) {
  const navigate = useNavigate();
  const medical = canRead(a.permissions, "medical") && a.sharingConsent;
  const { injuries } = useActiveInjuries(medical ? a.athleteId : undefined);

  return (
    <button
      onClick={() => navigate(`/staff/athletes/${a.athleteId}`)}
      style={{
        textAlign: "left", width: "100%", background: C.s1, border: "1px solid " + C.brd, borderRadius: 6,
        padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 12, alignItems: "center",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: "50%", background: C.coach + "25", color: C.coach, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800,
      }}>
        {a.athleteName.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{a.athleteName}</div>
        <div style={{ fontSize: 11, color: C.tx3 }}>
          Coach principal : {a.coachName ?? "aucun"} · en tant que {professionLabel(a.profession).toLowerCase()}
        </div>
        <div style={{ fontSize: 11, color: C.tx2, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summarizePermissions(a.permissions)}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {injuries.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: C.r, background: C.rS, borderRadius: 3, padding: "2px 6px" }}>
              {injuries.length} blessure{injuries.length > 1 ? "s" : ""} en cours
            </span>
          )}
          {!a.sharingConsent && (
            <span style={{ fontSize: 10, fontWeight: 700, color: C.o, background: C.oS, borderRadius: 3, padding: "2px 6px" }}>
              En attente de l'accord de l'athlète : rien de visible
            </span>
          )}
        </div>
      </div>
      <span style={{ color: C.tx3, fontSize: 16 }}>›</span>
    </button>
  );
}

export default function StaffHomePage() {
  const { data = [], isLoading } = useMyStaffLinks();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 60px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: C.tx, margin: "0 0 4px" }}>Mes athlètes</h1>
      <div style={{ fontSize: 12, color: C.tx3, marginBottom: 18 }}>
        Tu vois chaque athlète selon les droits réglés par son coach principal.
      </div>
      {isLoading ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
      ) : data.length === 0 ? (
        <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: 18, fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>
          Aucun athlète pour l'instant. Demande un lien d'invitation au coach ou à l'athlète que tu suis.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((a) => <AthleteCard key={a.linkId} a={a} />)}
        </div>
      )}
    </div>
  );
}
