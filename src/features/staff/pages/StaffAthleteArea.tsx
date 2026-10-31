/**
 * Fiche athlète vue par un professionnel — /staff/athletes/:athleteId.
 * N'affiche que les onglets des domaines ouverts par le coach principal. La
 * RLS filtre de toute façon côté base : un onglet masqué ici n'est qu'un
 * confort, jamais la protection.
 */
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
  type StaffDomain,
} from "../lib/staffPermissions";
import { StaffPermissionsGrid } from "../components/StaffPermissionsGrid";
import { StaffFichesTab } from "../components/tabs/StaffFichesTab";
import { StaffLogsTab } from "../components/tabs/StaffLogsTab";
import { StaffPlanningTab } from "../components/tabs/StaffPlanningTab";
import { StaffWellnessTab } from "../components/tabs/StaffWellnessTab";
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

function AccessTab({ link }: { link: MyStaffAthlete }) {
  const navigate = useNavigate();
  const revoke = useRevokeStaffLink();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 620 }}>
      <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.6 }}>
        Droits réglés par {link.coachName ?? "le coach principal"}. Ce que tu crées (fiches, saisies médicales) va dans
        sa banque, à ton nom.
        {link.canEditCoachContent
          ? " Tu peux aussi modifier ses contenus dans les domaines en écriture."
          : " Tu ne modifies que ce que tu as créé."}
      </div>
      <StaffPermissionsGrid value={link.permissions} />
      <button
        onClick={() => revoke.mutate(link.linkId, { onSuccess: () => navigate("/staff", { replace: true }) })}
        disabled={revoke.isPending}
        style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.r + "60", background: "transparent", color: C.r, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
      >
        Me retirer du staff de {link.athleteFirstName ?? link.athleteName}
      </button>
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
      return <StaffWellnessTab />;
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
      <div style={{ position: "sticky", top: 48, zIndex: 9, background: "rgba(29,28,30,0.95)", borderBottom: "1px solid " + C.brd }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 6px", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/staff")} aria-label="Retour" style={{ background: "none", border: "none", color: C.tx3, fontSize: 18, cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{link.athleteName}</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              Coach principal : {link.coachName ?? "aucun"} · tu interviens en tant que {professionLabel(link.profession).toLowerCase()}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", padding: "0 12px", overflowX: "auto" }}>
          {[...tabs, { key: "acces" as const, label: "Mes accès" }].map((t) => {
            const on = t.key === active;
            const write = t.key !== "acces" && canWrite(link.permissions, t.key) && (t.key === "medical" || t.key === "fiches" || t.key === "commentaires");
            return (
              <button
                key={t.key}
                onClick={() => setParams({ tab: t.key }, { replace: true })}
                style={{
                  padding: "9px 12px", border: "none", background: "transparent", whiteSpace: "nowrap",
                  borderBottom: "2px solid " + (on ? C.b : "transparent"), color: on ? C.tx : C.tx3,
                  fontSize: 12, fontWeight: on ? 600 : 400, cursor: "pointer", fontFamily: "inherit",
                }}
                title={t.key !== "acces" ? `${DOMAIN_LABEL[t.key as StaffDomain]} · ${write ? "lecture et écriture" : "lecture"}` : undefined}
              >
                {t.label}{write && <span style={{ marginLeft: 4, fontSize: 9, color: C.ac }}>✎</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "16px 16px 60px" }}>
        {active === "acces"
          ? <AccessTab link={link} />
          : <DomainContent domain={active} link={link} userId={user.id} />}
      </div>
    </AthleteProvider>
  );
}
