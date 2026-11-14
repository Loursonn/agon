import { useIsDesktop } from "@/hooks/useIsDesktop";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { C, H } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { confirmLogout, logoutDevice } from "@/lib/offline/logoutDevice";
import { toast } from "sonner";
import { todayKey } from "@/lib/date";
import { MedicalEntriesSection } from "@/features/shared/components/medical/MedicalEntriesSection";
import { RunningVolumeCard } from "@/features/shared/components/RunningVolumeCard";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { AthleteStaffPanel } from "@/features/staff/components/AthleteStaffPanel";
import { CoCoachPanel } from "@/features/shared/components/CoCoachPanel";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import type { ReactNode } from "react";

const MONTHS_FR = ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];

function todayShort(): string {
  // Planche : « dim. 8 nov. »
  return new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function ageFromBirth(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

/** Clés de pesée : « 20261018 » (todayKey) ou ISO « 2026-10-18 » → ISO */
function weighKeyToISO(k: string): string {
  return /^\d{8}$/.test(k) ? `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}` : k;
}

function shortDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}


// ── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s2, color: C.tx,
  fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase",
  letterSpacing: "0.4px", marginBottom: 4, display: "block",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 4, border: "none",
  background: C.acV, color: C.ink, fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
/** Titre numéroté de la planche « Profil athlète » : « 01 — Profil » + filet. */
function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
      <h2 style={{ margin: 0, height: 20, display: "flex", alignItems: "center", ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{n} —</span>&nbsp;{children}
      </h2>
      <div style={{ height: 1, background: C.brd }} />
    </div>
  );
}
const KICKER: React.CSSProperties = { ...MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", color: C.tx3 };
const card: React.CSSProperties = {
  background: C.s1, borderRadius: 14, padding: 16,
  border: "1px solid " + C.brd,
};

export default function ProfilPage() {
  const isDesktop = useIsDesktop();
  const { profile, updateAthleteProfile } = useAuth();
  const {
    athleteId, athleteProfile, viewOnly, freeSessions,
    weightLog, saveWeighIn, nutritionStrategy, bodyWeight,
  } = useAthleteContext();

  const [editing, setEditing] = useState(false);
  const displayProfile = athleteProfile ?? profile;

  // Lien direct vers une section (#mes-coachs depuis le menu, #mon-staff…)
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => window.clearTimeout(t);
  }, [hash]);
  const { volume, isLoading: volumeLoading } = useRunningVolume(athleteId ?? undefined, freeSessions);

  // Pesées journalisées, plus récente d'abord
  const weighIns = Object.entries(weightLog ?? {})
    .filter(([, kg]) => typeof kg === "number" && kg > 0)
    .map(([k, kg]) => ({ date: weighKeyToISO(k), kg }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const currentWeight = weighIns[0]?.kg ?? null;
  const targetWeight = nutritionStrategy?.target_weight ?? (bodyWeight?.target || null);

  return (
    <div style={{ maxWidth: isDesktop ? 1248 : 480, margin: "0 auto" }}>
    <AthletePageHeader title="Profil" />
    {/* Ordinateur (planche AthOrdiBProfil) : rubriques sur deux colonnes. */}
    <div className="[&>*]:break-inside-avoid" style={{ padding: "24px 20px 40px", scrollbarWidth: "none", ...(isDesktop ? { columns: 2, columnGap: 32 } : {}) }}>
      {/* ── Profil ── */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle n="01">Profil</SectionTitle>
        {editing && athleteId ? (
          <ProfileEditForm
            profile={displayProfile}
            currentWeight={currentWeight}
            onSave={async (fields, weighIn) => {
              await updateAthleteProfile(athleteId, fields);
              if (weighIn != null && weighIn !== currentWeight) {
                // Une seule pesée côté serveur (RPC), jamais le journal entier.
                await saveWeighIn(weighIn);
              }
              setEditing(false);
              toast.success("Profil mis à jour");
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div style={{ ...card, padding: 18, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 22, backgroundImage: "url(/brand/agon-pattern-frise-meandre-sombre.svg)", backgroundSize: "auto 22px", backgroundRepeat: "repeat-x", opacity: 0.22, pointerEvents: "none", zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14, paddingTop: 8 }}>
              <span style={{
                width: 52, height: 52, flex: "none", boxSizing: "border-box", borderRadius: "50%",
                border: `2px solid ${C.ac}`, boxShadow: `0 0 0 4px ${C.ac}24`,
                display: "flex", alignItems: "center", justifyContent: "center",
                ...DISPLAY, fontSize: 20, color: H.sableClair,
              }}>
                {(displayProfile?.full_name ?? "?").charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...DISPLAY, fontSize: 16, letterSpacing: "0.05em", fontWeight: 400, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayProfile?.full_name ?? "—"}</div>
                <div style={{ fontSize: 12, color: C.tx3 }}>{todayShort()}</div>
              </div>
              {!viewOnly && (
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    height: 36, padding: "0 16px", borderRadius: 10, border: "none",
                    background: C.ac, color: C.ink, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Modifier
                </button>
              )}
            </div>
            <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { l: "Date de naissance", v: displayProfile?.birth_date ? new Date(displayProfile.birth_date + "T12:00:00").toLocaleDateString("fr-FR") : "—" },
                { l: "Âge", v: ageFromBirth(displayProfile?.birth_date) != null ? `${ageFromBirth(displayProfile?.birth_date)} ans` : displayProfile?.age ? `${displayProfile.age} ans` : "—" },
                { l: "Taille", v: displayProfile?.height_cm ? `${displayProfile.height_cm} cm` : "—" },
                { l: "Genre", v: displayProfile?.gender === "male" ? "Homme" : displayProfile?.gender === "female" ? "Femme" : "—" },
              ].map(({ l, v }) => (
                <div key={l} style={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={KICKER}>{l}</span>
                  <span style={{ fontSize: 15, fontWeight: 500, color: C.tx, whiteSpace: "nowrap" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Poids : dernière pesée + 3 dernières + poids cible */}
            <div style={{ position: "relative", zIndex: 1, overflow: "hidden", borderRadius: 14, padding: "12px 12px 12px 15px", display: "flex", flexDirection: "column", gap: 10, border: `1px solid ${C.g}66`, background: `${C.g}1F` }}>
              <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.g }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ ...KICKER, color: C.tx2 }}>Poids</span>
                  <span style={{ ...MONO, fontSize: 32, lineHeight: 1, color: currentWeight != null ? C.g : C.tx3, whiteSpace: "nowrap" }}>
                    {currentWeight != null ? currentWeight.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}
                    {currentWeight != null && <span style={{ fontSize: 12, color: C.tx2 }}> kg</span>}
                  </span>
                </div>
                {targetWeight ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, textAlign: "right" }}>
                    <span style={{ ...KICKER, color: C.tx2 }}>Poids cible</span>
                    <span style={{ ...MONO, fontSize: 18, lineHeight: 1.1, color: C.ac, whiteSpace: "nowrap" }}>
                      {Number(targetWeight).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}<span style={{ fontSize: 11, color: C.tx3 }}> kg</span>
                    </span>
                  </div>
                ) : null}
              </div>
              {weighIns.length > 0 ? (
                <div style={{ display: "flex", gap: 6 }}>
                  {weighIns.slice(0, 3).map((w, i) => (
                    <div key={w.date} style={{ flex: 1, minWidth: 0, borderRadius: 8, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2, background: i === 0 ? `${C.g}29` : C.s2, border: `1px solid ${i === 0 ? C.g + "73" : C.brd}` }}>
                      <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2 }}>{shortDate(w.date)}</span>
                      <span style={{ ...MONO, fontSize: 13, lineHeight: 1.1, color: i === 0 ? C.g : C.tx, whiteSpace: "nowrap" }}>
                        {w.kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}<span style={{ fontSize: 11, color: C.tx3 }}> kg</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.tx3 }}>Aucune pesée : ajoute ton poids dans le bilan du jour ou via « Modifier ».</div>
              )}
            </div>
          </div>
        )}
      </div>

      {!viewOnly && (
        <Link
          to="/athlete/zones"
          style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -12, marginBottom: 24, textDecoration: "none", color: C.tx, fontSize: 14, fontWeight: 600 }}
        >
          Mes seuils et zones FC
          <span aria-hidden style={{ color: C.tx3 }}>›</span>
        </Link>
      )}
      {!viewOnly && (
        <Link
          to="/athlete/montres"
          style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -16, marginBottom: 24, textDecoration: "none", color: C.tx, fontSize: 14, fontWeight: 600 }}
        >
          Montres et données
          <span aria-hidden style={{ color: C.tx3 }}>›</span>
        </Link>
      )}

      {/* ── Blessures ── */}
      {athleteId && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle n="02">Blessures</SectionTitle>
          <MedicalEntriesSection athleteId={athleteId} canEdit />
        </div>
      )}

      {/* ── Mes coachs (double coach) ── */}
      {!viewOnly && athleteId && (
        <div id="mes-coachs" style={{ marginBottom: 24, scrollMarginTop: 56 }}>
          <SectionTitle n="03">Mes coachs</SectionTitle>
          <CoCoachPanel athleteId={athleteId} athleteName={displayProfile?.full_name ?? "toi"} mode="athlete" />
        </div>
      )}

      {/* ── Mon staff (kiné, ostéo, nutritionniste…) ── */}
      {!viewOnly && athleteId && (
        <div id="mon-staff" style={{ marginBottom: 24 }}>
          <SectionTitle n="04">Mon staff</SectionTitle>
          <AthleteStaffPanel athleteId={athleteId} athleteName={displayProfile?.full_name ?? "toi"} mode="athlete" />
        </div>
      )}

      {/* ── Volume de course à pied ── */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle n="05">Volume de course à pied</SectionTitle>
        <RunningVolumeCard volume={volume} isLoading={volumeLoading} />
      </div>

      {/* Données Strava : déplacées dans « Montres et données » (planche Ath2Montres). */}

      {/* ── Déconnexion ── */}
      {!viewOnly && (
        <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.rouge}66`, background: `${C.rouge}1F` }}>
          <button
            onClick={async () => {
              if (!confirmLogout()) return;
              await logoutDevice().catch(() => {});
              window.location.href = "/login";
            }}
            style={{
              width: "100%", height: 48, border: "none", background: "transparent",
              color: C.rouge, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M12 3V11M7 6.5A7 7 0 1 0 17 6.5" /></svg>
            Déconnexion
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

// ── Profile Edit Form ─────────────────────────────────────────────────────────

interface ProfileFields {
  first_name: string;
  last_name: string;
  age: number | null;
  birth_date: string | null;
  height_cm: number | null;
  gender: "male" | "female" | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  base_metabolism: number | null;
}

function ProfileEditForm({
  profile, currentWeight, onSave, onCancel,
}: {
  profile: { first_name?: string | null; last_name?: string | null; birth_date?: string | null; height_cm?: number | null; gender?: "male" | "female" | null; weight_kg?: number | null; body_fat_pct?: number | null; base_metabolism?: number | null } | null;
  currentWeight: number | null;
  /** weighIn : pesée du jour (kg), enregistrée dans les pesées */
  onSave: (f: ProfileFields, weighIn: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [heightCm, setHeightCm] = useState(profile?.height_cm?.toString() ?? "");
  const [gender, setGender] = useState<"male" | "female" | "">(profile?.gender ?? "");
  const [weighIn, setWeighIn] = useState(currentWeight?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const bd = birthDate || null;
      const kg = weighIn ? Number(weighIn.replace(",", ".")) : null;
      await onSave({
        first_name: firstName,
        last_name: lastName,
        birth_date: bd,
        age: ageFromBirth(bd),
        height_cm: heightCm ? Number(heightCm) : null,
        gender: gender || null,
        weight_kg: profile?.weight_kg ?? null,
        body_fat_pct: profile?.body_fat_pct ?? null,
        base_metabolism: profile?.base_metabolism ?? null,
      }, kg && kg > 0 ? kg : null);
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 14 }}>Modifier mon profil</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Prénom</label>
          <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Prénom" />
        </div>
        <div>
          <label style={labelStyle}>Nom</label>
          <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nom" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Date de naissance</label>
          <input style={inputStyle} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Genre</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={gender}
            onChange={e => setGender(e.target.value as "male" | "female" | "")}
          >
            <option value="">Non renseigné</option>
            <option value="male">Homme</option>
            <option value="female">Femme</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Taille (cm)</label>
          <input style={inputStyle} type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" />
        </div>
        <div>
          <label style={labelStyle}>Pesée du jour (kg)</label>
          <input style={inputStyle} type="number" inputMode="decimal" step="0.1" value={weighIn} onChange={e => setWeighIn(e.target.value)} placeholder="75" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ ...btnPrimary, background: C.s2, color: C.tx3, border: "1px solid " + C.brd }}>Annuler</button>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? "..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
