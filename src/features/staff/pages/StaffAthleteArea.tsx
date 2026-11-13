/**
 * Fiche athlète vue par un professionnel — /staff/athletes/:athleteId.
 * N'affiche que les onglets des domaines ouverts par le coach principal. La
 * RLS filtre de toute façon côté base : un onglet masqué ici n'est qu'un
 * confort, jamais la protection.
 */
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { C } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { AthleteProvider } from "@/features/shared/context/AthleteContext";
import { MedicalEntriesSection } from "@/features/shared/components/medical/MedicalEntriesSection";
import AthleteTestPage from "@/features/athlete/pages/AthleteTestPage";
import AlimPage from "@/features/athlete/pages/AlimPage";
import { useMyStaffLinks, type MyStaffAthlete } from "../hooks/useMyStaffLinks";
import { useStaffAthleteProfile } from "../hooks/useStaffAthleteData";
import { useRevokeStaffLink } from "../hooks/useAthleteStaff";
import {
  DOMAIN_LABEL,
  canRead,
  canWrite,
  professionLabel,
  WRITABLE_V1,
  type StaffDomain,
} from "../lib/staffPermissions";
import { StaffAccessList } from "../components/StaffPermissionsGrid";
import {
  Avatar, DISPLAY, KICK, LockIcon, ORDI_CARD, PageHead, PenIcon, btnStyle,
} from "@/features/shared/components/ordi/OrdiUi";
import { StaffFichesTab } from "../components/tabs/StaffFichesTab";
import { StaffLogsTab } from "../components/tabs/StaffLogsTab";
import { StaffPlanningTab } from "../components/tabs/StaffPlanningTab";
import { StaffWellnessTab } from "../components/tabs/StaffWellnessTab";
import { StaffReviewsSection } from "../components/tabs/StaffReviewsSection";
import { StaffCommentsTab } from "../components/tabs/StaffCommentsTab";
import { StaffProgramTab } from "../components/program/StaffProgramTab";

const TABS: { key: StaffDomain; label: string }[] = [
  { key: "seances", label: "Programme" },
  { key: "planification", label: "Planification" },
  { key: "logs", label: "Séances réalisées" },
  { key: "wellness", label: "Bien-être" },
  { key: "medical", label: "Médical" },
  { key: "nutrition", label: "Nutrition" },
  { key: "tests", label: "Tests" },
  { key: "fiches", label: "Fiches" },
  { key: "commentaires", label: "Commentaires" },
];

/** « Tes accès sur Léa » (planche CoachOrdiBStaffFiche, colonne de droite). */
function AccessPanel({ link }: { link: MyStaffAthlete }) {
  const navigate = useNavigate();
  const revoke = useRevokeStaffLink();
  const [confirm, setConfirm] = useState(false);
  const first = link.athleteFirstName ?? link.athleteName;
  return (
    <div style={{ ...ORDI_CARD, padding: "18px 20px" }}>
      <span style={KICK}>Tes accès sur {first}</span>
      <div style={{ marginTop: 10 }}>
        <StaffAccessList value={link.permissions} />
      </div>
      <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.55, marginTop: 12 }}>
        Droits réglés par {link.coachName ?? "le coach principal"}.
        {link.canEditCoachContent
          ? " Tu peux aussi modifier ses contenus dans les domaines en écriture ;"
          : " Tu ne modifies que ce que tu as créé ;"}
        {" "}tes notes vont dans sa banque, à ton nom.
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {confirm ? (
          <>
            <button
              onClick={() => revoke.mutate(link.linkId, { onSuccess: () => navigate("/staff", { replace: true }) })}
              disabled={revoke.isPending}
              style={btnStyle("danger", "sm", revoke.isPending)}
            >
              Confirmer : me retirer
            </button>
            <button onClick={() => setConfirm(false)} style={btnStyle("ghost", "sm")}>Annuler</button>
          </>
        ) : (
          <button onClick={() => setConfirm(true)} style={btnStyle("danger", "sm")}>Me retirer du staff de {first}</button>
        )}
      </div>
    </div>
  );
}

function ConsentPending() {
  return (
    <div style={{ fontSize: 13, color: C.o, background: C.oS, border: "1px solid " + C.o + "40", borderRadius: 4, padding: "12px 14px", lineHeight: 1.6, maxWidth: 620 }}>
      En attente de l'accord de l'athlète : ses données seront visibles, selon tes droits, dès qu'il aura accepté le partage avec son staff. Lui ou son coach peuvent le lui rappeler.
    </div>
  );
}

function DomainContent({ domain, link, userId }: { domain: StaffDomain; link: MyStaffAthlete; userId: string }) {
  // Pages athlète réutilisées (nutrition, tests) : conçues pour mobile, élargies
  // sur ordinateur sans s'étirer sur tout l'écran.
  const isMobile = useIsMobile();
  const narrow = isMobile ? undefined : 760;
  if (!link.sharingConsent) return <ConsentPending />;
  switch (domain) {
    case "seances":
      return <StaffProgramTab link={link} />;
    case "planification":
      return <StaffPlanningTab athleteId={link.athleteId} />;
    case "logs":
      return <StaffLogsTab athleteId={link.athleteId} />;
    case "wellness":
      return <><StaffWellnessTab /><StaffReviewsSection athleteId={link.athleteId} /></>;
    case "medical": {
      const write = canWrite(link.permissions, "medical");
      return (
        <div style={{ maxWidth: isMobile ? undefined : 960 }}>
          <MedicalEntriesSection
            athleteId={link.athleteId}
            canEdit={write}
            asStaff
            canEditHistory={false}
            canEditEntry={(e) => e.created_by === userId || (link.canEditCoachContent && !!link.coachId && e.created_by === link.coachId)}
          />
        </div>
      );
    }
    case "nutrition":
      return <div style={{ maxWidth: narrow }}><AlimPage /></div>;
    case "tests":
      return <div style={{ maxWidth: narrow }}><AthleteTestPage /></div>;
    case "fiches":
      return <StaffFichesTab link={link} />;
    case "commentaires":
      return <StaffCommentsTab athleteId={link.athleteId} />;
  }
}

export default function StaffAthleteArea() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: links = [], isLoading } = useMyStaffLinks();
  const link = links.find((l) => l.athleteId === athleteId);
  const { data: athleteProfile } = useStaffAthleteProfile(link ? athleteId : undefined);
  const isMobile = useIsMobile();

  if (isLoading) return <div style={{ padding: 24, fontSize: 13, color: C.tx3 }}>Chargement…</div>;
  if (!link || !user) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6 }}>Accès indisponible</div>
        <div style={{ fontSize: 13, color: C.tx2, marginBottom: 14 }}>Tu ne fais pas (ou plus) partie du staff de cet athlète.</div>
        <button onClick={() => navigate("/staff")} style={{ padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Retour à mes athlètes
        </button>
      </div>
    );
  }

  const tabs = TABS.filter((t) => canRead(link.permissions, t.key));
  const requested = params.get("tab");
  const active = requested === "acces" ? "acces" : tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key ?? "acces";

  return (
    <AthleteProvider
      athleteId={athleteId}
      viewOnly
      readOnly
      athleteProfile={(athleteProfile as Profile | null | undefined) ?? null}
      userName={link.athleteName}
    >
      <div style={{ position: "sticky", top: 64, zIndex: 9, background: C.bg, borderBottom: "1px solid " + C.brd }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 0 6px", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/staff")} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: C.tx3, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth={1.5} strokeLinecap="square"><path d="M15 5L8 12L15 19" /></svg>
              Mes athlètes
            </button>
            <span style={{ width: 1, height: 20, background: C.brd }} />
            <Avatar name={link.athleteName} size={36} />
            <span style={{ ...DISPLAY, fontWeight: 400, fontSize: 17, letterSpacing: "0.08em", color: C.tx }}>{link.athleteName}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: C.tx3 }}>
              Coach principal : <span style={{ color: C.tx2 }}>{link.coachName ?? "aucun"}</span> · tu interviens en tant que <span style={{ color: C.tx2 }}>{professionLabel(link.profession).toLowerCase()}</span>
            </span>
          </div>
          <div style={{ display: "flex", margin: "0 -14px", overflowX: "auto" }}>
            {TABS.map((t) => {
              const readable = canRead(link.permissions, t.key);
              const on = t.key === active;
              const write = readable && canWrite(link.permissions, t.key) && WRITABLE_V1.has(t.key);
              return (
                <button
                  key={t.key}
                  disabled={!readable}
                  onClick={() => setParams({ tab: t.key }, { replace: true })}
                  title={readable ? `${DOMAIN_LABEL[t.key]} · ${write ? "lecture et écriture" : "lecture"}` : "Non partagé par le coach"}
                  style={{
                    height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", border: "none", background: "transparent",
                    whiteSpace: "nowrap", fontSize: 13, fontFamily: "inherit",
                    color: on ? C.tx : readable ? C.tx2 : C.tx3, opacity: readable ? 1 : 0.55,
                    boxShadow: on ? `inset 0 -2px 0 ${C.ac}` : "none", cursor: readable ? "pointer" : "default",
                  }}
                >
                  {!readable && <LockIcon size={13} />}
                  {t.label}
                  {write && <PenIcon />}
                </button>
              );
            })}
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setParams({ tab: "acces" }, { replace: true })}
              style={{
                height: 44, display: "flex", alignItems: "center", padding: "0 14px", border: "none", background: "transparent",
                fontSize: 13, fontFamily: "inherit", color: active === "acces" ? C.tx : C.tx2, cursor: "pointer",
                boxShadow: active === "acces" ? `inset 0 -2px 0 ${C.ac}` : "none", whiteSpace: "nowrap",
              }}
            >
              Mes accès
            </button>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "16px 16px 60px" : "28px 24px 48px" }}>
        {active === "acces"
          ? <div style={{ maxWidth: 520 }}><AccessPanel link={link} /></div>
          : isMobile
            ? <DomainContent domain={active} link={link} userId={user.id} />
            : (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24, alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
                  <PageHead
                    title={TABS.find((t) => t.key === active)?.label ?? ""}
                    kicker={canWrite(link.permissions, active) && WRITABLE_V1.has(active) ? "Lecture et écriture" : "Lecture seule"}
                  />
                  <DomainContent domain={active} link={link} userId={user.id} />
                </div>
                <AccessPanel link={link} />
              </div>
            )}
      </div>
    </AthleteProvider>
  );
}
