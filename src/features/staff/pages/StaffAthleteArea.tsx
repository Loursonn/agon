/**
 * Fiche athlète vue par un professionnel — /staff/athletes/:athleteId.
 * N'affiche que les onglets des domaines ouverts par le coach principal. La
 * RLS filtre de toute façon côté base : un onglet masqué ici n'est qu'un
 * confort, jamais la protection.
 */
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
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
  STAFF_DOMAINS,
  canRead,
  canWrite,
  professionLabel,
  type StaffDomain,
} from "../lib/staffPermissions";
import { StaffPermissionsGrid } from "../components/StaffPermissionsGrid";
import { StaffFichesTab } from "../components/tabs/StaffFichesTab";
import { StaffLogsTab } from "../components/tabs/StaffLogsTab";
import { StaffPlanningTab } from "../components/tabs/StaffPlanningTab";
import { StaffWellnessTab } from "../components/tabs/StaffWellnessTab";
import { StaffReviewsSection } from "../components/tabs/StaffReviewsSection";
import { StaffCommentsTab } from "../components/tabs/StaffCommentsTab";
import { StaffProgramTab } from "../components/program/StaffProgramTab";
import { Avatar, KICK, LockIcon, PageHead, PenIcon } from "@/features/shared/components/ordi/OrdiUi";
import { btnStyle } from "@/features/shared/components/ordi/ordiStyles";

const TABS: { key: StaffDomain; label: string }[] = [
  { key: "seances", label: "Programme" },
  { key: "planification", label: "Planification" },
  { key: "logs", label: "Séances réalisées" },
  { key: "wellness", label: "Bien-être" },
  { key: "medical", label: "Blessures" },
  { key: "nutrition", label: "Nutrition" },
  { key: "tests", label: "Tests" },
  { key: "fiches", label: "Fiches" },
  { key: "commentaires", label: "Commentaires" },
];

function AccessTab({ link }: { link: MyStaffAthlete }) {
  const navigate = useNavigate();
  const revoke = useRevokeStaffLink();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 620 }}>
      <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.6 }}>
        Droits réglés par {link.coachName ?? "le coach principal"}. Ce que tu crées (fiches, blessures saisies) va dans
        sa banque, à ton nom.
        {link.canEditCoachContent
          ? " Tu peux aussi modifier ses contenus dans les domaines en écriture."
          : " Tu ne modifies que ce que tu as créé."}
      </div>
      <StaffPermissionsGrid value={link.permissions} />
      <button
        onClick={() => revoke.mutate(link.linkId, { onSuccess: () => navigate("/staff", { replace: true }) })}
        disabled={revoke.isPending}
        style={{ ...btnStyle("danger", "sm", revoke.isPending), alignSelf: "flex-start" }}
      >
        Me retirer du staff de {link.athleteFirstName ?? link.athleteName}
      </button>
    </div>
  );
}

const LEVEL_TXT = { write: "Écriture", read: "Lecture", none: "Non partagé" } as const;

/**
 * Onglets dont le contenu est un calendrier de 7 jours (Programme) : le panneau
 * « Tes accès » s'y replie derrière un bouton pour que la semaine tienne sans défiler.
 */
const WIDE_TABS: ReadonlySet<string> = new Set(["seances"]);

/**
 * Ordinateur (planche CoachOrdiBStaffFiche) : « Tes accès » à droite. `floating` :
 * panneau déroulé sous le bouton « Tes accès » des onglets larges.
 */
function AccessAside({ link, floating }: { link: MyStaffAthlete; floating?: boolean }) {
  const navigate = useNavigate();
  const revoke = useRevokeStaffLink();
  const first = link.athleteFirstName ?? link.athleteName;
  const row = (key: string, label: string, lvl: "write" | "read" | "none") => (
    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, height: 36, borderTop: "1px solid " + C.brd, opacity: lvl === "none" ? 0.6 : 1 }}>
      <span style={{ fontSize: 13, color: lvl === "none" ? C.tx3 : C.tx }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: lvl === "write" ? C.ac : lvl === "read" ? C.b : C.tx3 }}>
        {lvl === "none" && <LockIcon />}{LEVEL_TXT[lvl]}
      </span>
    </div>
  );
  return (
    <aside style={{
      ...(floating
        ? { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, zIndex: 8, boxShadow: "0 18px 40px " + alpha(C.bg, 0.6) }
        : { position: "sticky", top: 180 }),
      background: C.s1, border: "1px solid " + C.brd, borderRadius: 14, padding: "18px 20px", boxSizing: "border-box",
    }}>
      <span style={{ ...KICK, color: C.tx2 }}>Tes accès sur {first}</span>
      <div style={{ marginTop: 10 }}>
        {STAFF_DOMAINS.map((d) => row(d, DOMAIN_LABEL[d], link.permissions[d]))}
        {row("montres", "Montres connectées", "none")}
      </div>
      <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.55, marginTop: 12 }}>
        Droits réglés par {link.coachName ?? "le coach principal"}.{" "}
        {link.canEditCoachContent ? "Tu peux aussi modifier ses contenus dans les domaines en écriture ;" : "Tu ne modifies que ce que tu as créé ;"} tes notes vont dans sa banque, à ton nom.
      </div>
      <button
        type="button"
        onClick={() => revoke.mutate(link.linkId, { onSuccess: () => navigate("/staff", { replace: true }) })}
        disabled={revoke.isPending}
        style={{ ...btnStyle("danger", "sm", revoke.isPending), marginTop: 14 }}
      >
        Me retirer du staff de {first}
      </button>
    </aside>
  );
}

function ConsentPending() {
  return (
    <div style={{ fontSize: 13, color: C.o, background: C.o + "24", borderRadius: 14, padding: "14px 18px", lineHeight: 1.6, maxWidth: 620 }}>
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
  const [accessOpen, setAccessOpen] = useState(false);

  if (isLoading) return <div style={{ padding: 24, fontSize: 13, color: C.tx3 }}>Chargement…</div>;
  if (!link || !user) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6 }}>Accès indisponible</div>
        <div style={{ fontSize: 13, color: C.tx2, marginBottom: 14 }}>Tu ne fais pas (ou plus) partie du staff de cet athlète.</div>
        <button onClick={() => navigate("/staff")} style={btnStyle("ghost", "sm")}>
          Retour à mes athlètes
        </button>
      </div>
    );
  }

  const tabs = TABS.filter((t) => canRead(link.permissions, t.key));
  const requested = params.get("tab");
  const active = requested === "acces" ? "acces" : tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key ?? "acces";
  // Calendrier de la semaine : pleine largeur, accès repliés derrière un bouton.
  const wide = !isMobile && WIDE_TABS.has(active);
  const aside = !isMobile && active !== "acces" && !wide;

  return (
    <AthleteProvider
      athleteId={athleteId}
      viewOnly
      readOnly
      athleteProfile={(athleteProfile as Profile | null | undefined) ?? null}
      userName={link.athleteName}
    >
      <div style={{ position: "sticky", top: 64, zIndex: 9, background: C.bg, borderBottom: "1px solid " + C.brd }}>
        <div style={{ maxWidth: 1248, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 0 6px", flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <button type="button" onClick={() => navigate("/staff")} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: C.tx3, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", flex: "none" }}>
              <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.5" strokeLinecap="square"><path d="M15 5L8 12L15 19" /></svg>
              Mes athlètes
            </button>
            <span aria-hidden style={{ width: 1, height: 20, background: C.brd, flex: "none" }} />
            <Avatar name={link.athleteName} size={36} />
            <span style={{ fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 17, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{link.athleteName}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: C.tx3 }}>
              Coach principal : <span style={{ color: C.tx2 }}>{link.coachName ?? "aucun"}</span> · tu interviens en tant que <span style={{ color: C.tx2 }}>{professionLabel(link.profession).toLowerCase()}</span>
            </span>
          </div>
          <div style={{ display: "flex", margin: "0 -14px", overflowX: "auto" }}>
            {TABS.map((t) => {
              const open = canRead(link.permissions, t.key);
              const on = t.key === active;
              const write = canWrite(link.permissions, t.key) && (t.key === "medical" || t.key === "fiches" || t.key === "commentaires");
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={!open}
                  onClick={() => setParams({ tab: t.key }, { replace: true })}
                  title={open ? `${DOMAIN_LABEL[t.key]} · ${write ? "lecture et écriture" : "lecture"}` : `${DOMAIN_LABEL[t.key]} · non partagé`}
                  style={{
                    height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", border: "none", background: "transparent",
                    whiteSpace: "nowrap", fontSize: 13, fontFamily: "inherit", cursor: open ? "pointer" : "default",
                    color: on ? C.tx : open ? C.tx2 : C.tx3, opacity: open ? 1 : 0.55, boxShadow: on ? `inset 0 -2px 0 ${C.ac}` : "none",
                  }}
                >
                  {!open && <LockIcon size={13} />}
                  {t.label}
                  {write && <PenIcon />}
                </button>
              );
            })}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setParams({ tab: "acces" }, { replace: true })}
              style={{
                height: 44, display: "flex", alignItems: "center", padding: "0 14px", border: "none", background: "transparent", whiteSpace: "nowrap",
                fontSize: 13, fontFamily: "inherit", cursor: "pointer", color: active === "acces" ? C.tx : C.tx2,
                boxShadow: active === "acces" ? `inset 0 -2px 0 ${C.ac}` : "none",
              }}
            >
              Mes accès
            </button>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1248, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "16px 16px 60px" : "28px 24px 48px", display: aside ? "grid" : "block", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24, alignItems: "start" }}>
        {active === "acces" ? (
          <AccessTab link={link} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {!isMobile && (
              <div style={{ position: "relative" }}>
                <PageHead
                  title={TABS.find((t) => t.key === active)?.label ?? DOMAIN_LABEL[active]}
                  kicker={canWrite(link.permissions, active) ? "Lecture et écriture" : "Lecture seule"}
                  actions={wide ? (
                    <button
                      type="button"
                      aria-expanded={accessOpen}
                      onClick={() => setAccessOpen((o) => !o)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: 10, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13, color: C.tx, background: accessOpen ? C.s2 : C.s1, border: "1px solid " + C.brd,
                      }}
                    >
                      Tes accès sur {link.athleteFirstName ?? link.athleteName}
                      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.tx2} strokeWidth="1.6" strokeLinecap="square" style={{ transform: accessOpen ? "rotate(180deg)" : undefined }}><path d="M6 9L12 15L18 9" /></svg>
                    </button>
                  ) : undefined}
                />
                {wide && accessOpen && <AccessAside link={link} floating />}
              </div>
            )}
            <DomainContent domain={active} link={link} userId={user.id} />
          </div>
        )}
        {aside && <AccessAside link={link} />}
      </div>
    </AthleteProvider>
  );
}
