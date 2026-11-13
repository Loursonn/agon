/**
 * Accueil du professionnel (planche CoachOrdiBStaffAccueil) : ses athlètes,
 * avec le coach principal de chacun, ses droits, les alertes utiles
 * (blessure en cours, accord de l'athlète manquant), et une colonne
 * « À surveiller » (blessures en cours des athlètes dont le médical est ouvert).
 */
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { listEntries, medicalKeys } from "@/api/injuries";
import { activeInjuries } from "@/lib/injuryDetails";
import type { MedicalEntry } from "@/features/shared/types/medical";
import {
  Avatar, ChevronRight, MONO, ORDI_CARD, PageHead, PermissionsLine, SoftTag, KICK, frDate,
} from "@/features/shared/components/ordi/OrdiUi";
import { useMyStaffLinks, type MyStaffAthlete } from "../hooks/useMyStaffLinks";
import { canRead, permissionLists, professionLabel } from "../lib/staffPermissions";

function AthleteCard({ a, injuries }: { a: MyStaffAthlete; injuries: number }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/staff/athletes/${a.athleteId}`)}
      style={{ ...ORDI_CARD, textAlign: "left", width: "100%", padding: "16px 20px", cursor: "pointer", fontFamily: "inherit", color: C.tx }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar name={a.athleteName} color={C.ac} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.athleteName}</div>
          <div style={{ fontSize: 12.5, color: C.tx3 }}>
            Coach principal : {a.coachName ?? "aucun"} · en tant que {professionLabel(a.profession).toLowerCase()}
          </div>
          {a.sharingConsent && <PermissionsLine {...permissionLists(a.permissions)} />}
          {(injuries > 0 || !a.sharingConsent) && (
            <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              {injuries > 0 && <SoftTag color={C.r}>{injuries} blessure{injuries > 1 ? "s" : ""} en cours</SoftTag>}
              {!a.sharingConsent && <SoftTag color={C.o}>En attente de l'accord de l'athlète : rien de visible</SoftTag>}
            </div>
          )}
        </div>
        <ChevronRight />
      </div>
    </button>
  );
}

export default function StaffHomePage() {
  const isMobile = useIsMobile();
  const { data = [], isLoading } = useMyStaffLinks();

  // Blessures en cours : seulement là où le médical est ouvert et l'accord donné.
  const medicalOpen = data.filter((a) => a.sharingConsent && canRead(a.permissions, "medical"));
  const medical = useQueries({
    queries: medicalOpen.map((a) => ({
      queryKey: medicalKeys.entries(a.athleteId),
      queryFn: () => listEntries(a.athleteId),
      staleTime: 60_000,
    })),
  });
  const injuriesBy = new Map<string, MedicalEntry[]>();
  medicalOpen.forEach((a, i) => injuriesBy.set(a.athleteId, activeInjuries((medical[i]?.data ?? []) as MedicalEntry[])));
  const watch = medicalOpen
    .flatMap((a) => (injuriesBy.get(a.athleteId) ?? []).map((e) => ({ a, e })))
    .sort((x, y) => (y.e.date ?? y.e.created_at).localeCompare(x.e.date ?? x.e.created_at));

  const coaches = new Set(data.map((a) => a.coachId).filter(Boolean)).size;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "28px 24px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHead
        title="Mes athlètes"
        kicker={data.length ? `${data.length} athlète${data.length > 1 ? "s" : ""} · ${coaches} coach${coaches > 1 ? "s" : ""}` : undefined}
        sub="Tu vois chaque athlète selon les droits réglés par son coach principal."
      />
      {isLoading ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
      ) : data.length === 0 ? (
        <div style={{ ...ORDI_CARD, padding: 18, fontSize: 13, color: C.tx2, lineHeight: 1.6 }}>
          Aucun athlète pour l'instant. Demande un lien d'invitation au coach ou à l'athlète que tu suis.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.map((a) => <AthleteCard key={a.linkId} a={a} injuries={injuriesBy.get(a.athleteId)?.length ?? 0} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...ORDI_CARD, padding: "18px 20px" }}>
              <span style={KICK}>À surveiller</span>
              <div style={{ marginTop: 8 }}>
                {watch.length === 0 ? (
                  <div style={{ padding: "14px 0", borderTop: `1px solid ${C.brd}`, fontSize: 13, color: C.tx3 }}>Aucune blessure en cours.</div>
                ) : watch.map(({ a, e }) => (
                  <div key={e.id} style={{ display: "flex", gap: 12, padding: "14px 0", borderTop: `1px solid ${C.brd}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.r, flex: "none", marginTop: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: C.tx }}>{a.athleteName} · {(e.zone || e.title).toLowerCase()}</div>
                      {(e.notes || e.diagnosis || (e.zone && e.title)) && (
                        <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>{e.diagnosis || e.notes || e.title}</div>
                      )}
                      <div style={{ ...MONO, fontSize: 11, color: C.tx3, marginTop: 3 }}>{frDate(e.date ?? e.created_at, false)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...ORDI_CARD, padding: "16px 18px", background: "transparent", borderStyle: "dashed", borderColor: C.brdL }}>
              <div style={{ display: "flex", gap: 12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
                  <path d="M12 3L22 20H2Z" /><path d="M12 10V14M12 17V17.5" />
                </svg>
                <div style={{ fontSize: 12.5, color: C.tx3, lineHeight: 1.55 }}>
                  Ce que tu crées (fiches, notes médicales) va dans la banque du coach de chaque athlète, à ton nom. Les données des montres ne sont pas partagées avec le staff.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
