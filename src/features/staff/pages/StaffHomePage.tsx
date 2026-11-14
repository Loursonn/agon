/**
 * Accueil du professionnel (planche CoachOrdiBStaffAccueil) : ses athlètes,
 * le coach principal de chacun, ses droits (écriture / lecture) et, à côté,
 * ce qui est à surveiller (blessures en cours sur les athlètes dont il lit le
 * médical).
 */
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { Avatar, ChevronRight, KICK, MONO, PageHead, PermissionsLine, SoftTag } from "@/features/shared/components/ordi/OrdiUi";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { localIsoDay } from "@shared/domain/dates";
import { wellnessDrop } from "../lib/wellnessWatch";
import { useMyStaffLinks, type MyStaffAthlete } from "../hooks/useMyStaffLinks";
import { DOMAIN_LABEL, STAFF_DOMAINS, canRead, professionLabel } from "../lib/staffPermissions";

const fmtDay = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

const CARD: CSSProperties = { background: C.s1, border: "1px solid " + C.brd, borderRadius: 14 };

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
      style={{ ...CARD, textAlign: "left", width: "100%", padding: "16px 20px", cursor: "pointer", fontFamily: "inherit", color: C.tx, display: "flex", gap: 16, alignItems: "center" }}
    >
      <Avatar name={a.athleteName} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 15.5, fontWeight: 600 }}>{a.athleteName}</span>
        <span style={{ fontSize: 12.5, color: C.tx3 }}>
          Coach principal : {a.coachName ?? "aucun"} · en tant que {professionLabel(a.profession).toLowerCase()}
        </span>
        {a.sharingConsent && <PermissionsLine write={w} read={r} />}
        {(!a.sharingConsent || injuries.length > 0) && (
          <span style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
            {!a.sharingConsent && <SoftTag color={C.o}>En attente de l’accord de l’athlète : rien de visible</SoftTag>}
            {injuries.length > 0 && <SoftTag color={C.r}>{injuries.length} blessure{injuries.length > 1 ? "s" : ""} en cours</SoftTag>}
          </span>
        )}
      </span>
      <ChevronRight />
    </button>
  );
}

function WatchRow({ color, title, text, day, onOpen }: { color: string; title: string; text: string | null; day: string | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} data-watch-row
      style={{ textAlign: "left", width: "100%", background: "none", border: "none", borderTop: `1px solid ${C.brd}`, padding: "14px 0", cursor: "pointer", fontFamily: "inherit", color: C.tx, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 6, flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{title}</span>
        {text && <span style={{ display: "block", fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>{text}</span>}
        {day && <span style={{ display: "block", ...MONO, fontSize: 11, color: C.tx3, marginTop: 3 }}>{fmtDay(day)}</span>}
      </span>
    </button>
  );
}

/** Lignes « À surveiller » d'un athlète : blessures en cours (médical lisible) et bien-être en baisse (bien-être lisible). */
function WatchRows({ a }: { a: MyStaffAthlete }) {
  const navigate = useNavigate();
  const medical = canRead(a.permissions, "medical") && a.sharingConsent;
  const { injuries } = useActiveInjuries(medical ? a.athleteId : undefined);
  const wellnessOk = canRead(a.permissions, "wellness") && a.sharingConsent;
  const { data: wellness } = useWellnessHistory(wellnessOk ? a.athleteId : undefined);
  const drop = wellnessOk && wellness ? wellnessDrop(wellness, localIsoDay()) : null;
  return (
    <>
      {injuries.map((inj) => (
        <WatchRow key={inj.id} color={C.r} day={inj.date}
          title={`${a.athleteName} · ${inj.zone || inj.title}`}
          text={inj.zone ? inj.title : inj.notes}
          onOpen={() => navigate(`/staff/athletes/${a.athleteId}`)} />
      ))}
      {drop && (
        <WatchRow color={C.o} day={drop.day}
          title={`${a.athleteName} · wellness en baisse`}
          text={`${drop.label} ${drop.value} / 5 deux matins de suite`}
          onOpen={() => navigate(`/staff/athletes/${a.athleteId}?tab=wellness`)} />
      )}
    </>
  );
}

export default function StaffHomePage() {
  const { data = [], isLoading } = useMyStaffLinks();
  const isDesktop = useIsDesktop();
  const nbCoachs = new Set(data.map((a) => a.coachName).filter((n): n is string => !!n)).size;
  const kicker = data.length > 0
    ? `${data.length} athlète${data.length > 1 ? "s" : ""}${nbCoachs > 0 ? ` · ${nbCoachs} coach${nbCoachs > 1 ? "s" : ""}` : ""}`
    : undefined;

  return (
    <div style={{ maxWidth: isDesktop ? 1248 : 760, margin: "0 auto", padding: isDesktop ? "28px 24px 48px" : "20px 16px 60px", boxSizing: "border-box", color: C.tx, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHead title="Mes athlètes" kicker={kicker} sub="Tu vois chaque athlète selon les droits réglés par son coach principal." />
      {isLoading ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
      ) : data.length === 0 ? (
        <div style={{ ...CARD, padding: 18, fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>
          Aucun athlète pour l’instant. Demande un lien d’invitation au coach ou à l’athlète que tu suis.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "minmax(0, 1fr) 360px" : "1fr", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.map((a) => <AthleteCard key={a.linkId} a={a} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Phrase d'attente masquée dès qu'une ligne existe (:has). */}
            <style>{`.staff-watch:has([data-watch-row]) .staff-watch-empty{display:none}`}</style>
            <div className="staff-watch" style={{ ...CARD, padding: "18px 20px" }}>
              <span style={{ ...KICK, color: C.tx2 }}>À surveiller</span>
              <div style={{ marginTop: 8 }}>
                {data.map((a) => <WatchRows key={a.linkId} a={a} />)}
                <div className="staff-watch-empty" style={{ fontSize: 12.5, color: C.tx3, borderTop: `1px solid ${C.brd}`, padding: "14px 0 0", lineHeight: 1.5 }}>
                  Les blessures en cours et le bien-être en baisse de tes athlètes s’affichent ici.
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 18px", borderRadius: 14, border: `1px dashed ${C.brdL}`, display: "flex", gap: 12 }}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.5" strokeLinecap="square" style={{ flex: "none" }}>
                <path d="M12 3L22 20H2Z" /><path d="M12 10V14M12 17V17.5" />
              </svg>
              <div style={{ fontSize: 12.5, color: C.tx3, lineHeight: 1.55 }}>
                Ce que tu crées (fiches, blessures saisies) va dans la banque du coach de chaque athlète, à ton nom. Les données des montres ne sont pas partagées avec le staff.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
