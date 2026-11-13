/**
 * Accueil du professionnel (planche CoachOrdiBStaffAccueil) : ses athlètes,
 * le coach principal de chacun, ses droits (écriture / lecture) et, à côté,
 * ce qui est à surveiller (blessures en cours sur les athlètes dont il lit le
 * médical).
 */
import { useNavigate } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { initials } from "@/lib/initials";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { useMyStaffLinks, type MyStaffAthlete } from "../hooks/useMyStaffLinks";
import { DOMAIN_LABEL, STAFF_DOMAINS, canRead, professionLabel } from "../lib/staffPermissions";

const fmtDay = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

function AthleteCard({ a }: { a: MyStaffAthlete }) {
  const navigate = useNavigate();
  const medical = canRead(a.permissions, "medical") && a.sharingConsent;
  const { injuries } = useActiveInjuries(medical ? a.athleteId : undefined);
  const w = STAFF_DOMAINS.filter((d) => a.permissions[d] === "write").map((d) => DOMAIN_LABEL[d]);
  const r = STAFF_DOMAINS.filter((d) => a.permissions[d] === "read").map((d) => DOMAIN_LABEL[d]);

  return (
    <button
      type="button"
      onClick={() => navigate(`/staff/athletes/${a.athleteId}`)}
      style={{ textAlign: "left", width: "100%", background: C.s1, border: "1px solid " + C.brd, borderRadius: 14, padding: "14px 16px", cursor: "pointer", fontFamily: "inherit", color: C.tx, display: "flex", gap: 14, alignItems: "flex-start" }}
    >
      <span style={{ width: 40, height: 40, borderRadius: "50%", background: alpha(C.ac, 0.14), color: C.ac, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 14 }}>
        {initials(a.athleteName)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{a.athleteName}</span>
        <span style={{ fontSize: 12, color: C.tx3 }}>
          Coach principal : {a.coachName ?? "aucun"} · en tant que {professionLabel(a.profession).toLowerCase()}
        </span>
        {a.sharingConsent ? (
          <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, marginTop: 2 }}>
            {w.length > 0 && <><span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ac }}>Écriture</span> {w.join(", ")}</>}
            {w.length > 0 && r.length > 0 && <span style={{ color: C.tx3 }}>&nbsp; · &nbsp;</span>}
            {r.length > 0 && <><span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.tx3 }}>Lecture</span> {r.join(", ")}</>}
            {w.length + r.length === 0 && "Aucun accès"}
          </span>
        ) : (
          <span style={{ alignSelf: "flex-start", fontSize: 11.5, color: C.o, background: alpha(C.o, 0.12), border: `1px solid ${alpha(C.o, 0.35)}`, borderRadius: 999, padding: "3px 10px", marginTop: 2 }}>
            En attente de l’accord de l’athlète : rien de visible
          </span>
        )}
        {injuries.length > 0 && (
          <span style={{ alignSelf: "flex-start", fontSize: 11.5, color: C.r, background: alpha(C.r, 0.12), border: `1px solid ${alpha(C.r, 0.35)}`, borderRadius: 999, padding: "3px 10px", marginTop: 2 }}>
            {injuries.length} blessure{injuries.length > 1 ? "s" : ""} en cours
          </span>
        )}
      </span>
      <span aria-hidden style={{ color: C.tx3, fontSize: 18 }}>›</span>
    </button>
  );
}

/** Lignes « À surveiller » d'un athlète : ses blessures en cours (si le médical est lisible). */
function WatchRows({ a }: { a: MyStaffAthlete }) {
  const navigate = useNavigate();
  const medical = canRead(a.permissions, "medical") && a.sharingConsent;
  const { injuries } = useActiveInjuries(medical ? a.athleteId : undefined);
  return (
    <>
      {injuries.map((inj) => (
        <button key={inj.id} type="button" onClick={() => navigate(`/staff/athletes/${a.athleteId}`)}
          style={{ textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C.brd}`, padding: "12px 0", cursor: "pointer", fontFamily: "inherit", color: C.tx, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: C.r, marginTop: 6, flex: "none" }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>{a.athleteName} · {inj.zone || inj.title}</span>
            {(inj.notes || inj.title) && <span style={{ display: "block", fontSize: 12, color: C.tx3, marginTop: 2, lineHeight: 1.45 }}>{inj.zone ? inj.title : inj.notes}</span>}
          </span>
          <span style={{ ...MONO, fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>{fmtDay(inj.date)}</span>
        </button>
      ))}
    </>
  );
}

export default function StaffHomePage() {
  const { data = [], isLoading } = useMyStaffLinks();
  const isDesktop = useIsDesktop();

  return (
    <div style={{ maxWidth: isDesktop ? 1248 : 760, margin: "0 auto", padding: isDesktop ? "32px 48px 60px" : "20px 16px 60px", boxSizing: "border-box", color: C.tx }}>
      <h1 style={{ ...DISPLAY, fontWeight: 300, fontSize: 28, letterSpacing: "0.06em", margin: 0 }}>Mes athlètes</h1>
      <div style={{ fontSize: 13.5, color: C.tx2, margin: "6px 0 22px" }}>
        Tu vois chaque athlète selon les droits réglés par son coach principal.
      </div>
      {isLoading ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
      ) : data.length === 0 ? (
        <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 14, padding: 18, fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>
          Aucun athlète pour l’instant. Demande un lien d’invitation au coach ou à l’athlète que tu suis.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "minmax(0, 1.6fr) minmax(0, 1fr)" : "1fr", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.map((a) => <AthleteCard key={a.linkId} a={a} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 14, padding: "14px 16px 4px", display: "flex", flexDirection: "column" }}>
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2, paddingBottom: 10 }}>À surveiller</span>
              {data.map((a) => <WatchRows key={a.linkId} a={a} />)}
              <span style={{ fontSize: 12, color: C.tx3, borderTop: `1px solid ${C.brd}`, padding: "12px 0" }}>Les blessures en cours de tes athlètes s’affichent ici.</span>
            </div>
            <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.55 }}>
              Ce que tu crées (fiches, blessures saisies) va dans la banque du coach de chaque athlète, à ton nom. Les données des montres ne sont pas partagées avec le staff.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
