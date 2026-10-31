import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { todayKey } from "@/lib/date";
import { MedicalEntriesSection } from "@/features/shared/components/medical/MedicalEntriesSection";
import { RunningVolumeCard } from "@/features/shared/components/RunningVolumeCard";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { StravaExportTutorial } from "@/features/athlete/components/StravaExportTutorial";
import { AthleteStaffPanel } from "@/features/staff/components/AthleteStaffPanel";

const MONTHS_FR = ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];

function todayShort(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
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

const fmtKg = (kg: number) => `${kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;

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
  background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase",
  letterSpacing: "0.5px", marginBottom: 12,
};
const card: React.CSSProperties = {
  background: C.s1, borderRadius: 6, padding: 16,
  border: "1px solid " + C.brd,
};

export default function ProfilPage() {
  const { profile, updateAthleteProfile } = useAuth();
  const {
    athleteId, athleteProfile, viewOnly, freeSessions,
    weightLog, setWeightLog, nutritionStrategy, bodyWeight,
  } = useAthleteContext();

  const [editing, setEditing] = useState(false);
  const displayProfile = athleteProfile ?? profile;
  const { volume, isLoading: volumeLoading } = useRunningVolume(athleteId ?? undefined, freeSessions);

  // Pesées journalisées, plus récente d'abord
  const weighIns = Object.entries(weightLog ?? {})
    .filter(([, kg]) => typeof kg === "number" && kg > 0)
    .map(([k, kg]) => ({ date: weighKeyToISO(k), kg }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const currentWeight = weighIns[0]?.kg ?? null;
  const targetWeight = nutritionStrategy?.target_weight ?? (bodyWeight?.target || null);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 40px", scrollbarWidth: "none" }}>
      {/* ── Profil ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionTitle}>Profil</div>
        {editing && athleteId ? (
          <ProfileEditForm
            profile={displayProfile}
            currentWeight={currentWeight}
            onSave={async (fields, weighIn) => {
              await updateAthleteProfile(athleteId, fields);
              if (weighIn != null && weighIn !== currentWeight) {
                setWeightLog({ ...weightLog, [todayKey()]: weighIn });
              }
              setEditing(false);
              toast.success("Profil mis à jour");
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div style={{ ...card, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 20, backgroundImage: "url(/brand/agon-pattern-frise-meandre-sombre.svg)", backgroundSize: "600px", backgroundRepeat: "repeat-x", opacity: 0.18, pointerEvents: "none", zIndex: 0, maskImage: "linear-gradient(180deg, #000 0%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 100%)" }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: C.coach + "25", border: "1px solid " + C.coach + "40",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, color: C.coach, flexShrink: 0,
              }}>
                {(displayProfile?.full_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{displayProfile?.full_name ?? "—"}</div>
                <div style={{ fontSize: 11, color: C.tx3 }}>{todayShort()}</div>
              </div>
              {!viewOnly && (
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    padding: "6px 14px", borderRadius: 4,
                    border: "1px solid " + C.coach + "50", background: C.coach + "15",
                    color: C.coach, fontSize: 12, fontWeight: 600,
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
                <div key={l} style={{ background: C.s2, borderRadius: 4, padding: "8px 12px", minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: C.tx3 }}>{l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Poids : dernière pesée + 3 dernières + poids cible */}
            <div style={{ position: "relative", zIndex: 1, marginTop: 8, background: C.s2, borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.tx3 }}>Poids</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.tx }}>{currentWeight != null ? fmtKg(currentWeight) : "—"}</div>
                </div>
                {targetWeight ? (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: C.tx3 }}>Poids cible</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ac }}>{fmtKg(targetWeight)}</div>
                  </div>
                ) : null}
              </div>
              {weighIns.length > 0 ? (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {weighIns.slice(0, 3).map((w) => (
                    <div key={w.date} style={{ flex: 1, background: C.s1, borderRadius: 4, padding: "5px 8px", minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: C.tx3 }}>{shortDate(w.date)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx2 }}>{fmtKg(w.kg)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>Aucune pesée — ajoute ton poids dans le bilan du jour ou via « Modifier ».</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Antécédents médicaux ── */}
      {athleteId && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Antécédents médicaux</div>
          <MedicalEntriesSection athleteId={athleteId} canEdit />
        </div>
      )}

      {/* ── Mon staff (kiné, ostéo, nutritionniste…) ── */}
      {!viewOnly && athleteId && (
        <div id="mon-staff" style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Mon staff</div>
          <AthleteStaffPanel athleteId={athleteId} athleteName={displayProfile?.full_name ?? "toi"} mode="athlete" />
        </div>
      )}

      {/* ── Volume de course à pied ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionTitle}>Volume de course à pied</div>
        <RunningVolumeCard volume={volume} isLoading={volumeLoading} />
      </div>

      {/* ── Données Strava ── */}
      {!viewOnly && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Données Strava</div>
          <StravaExportTutorial />
        </div>
      )}

      {/* ── Déconnexion ── */}
      {!viewOnly && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <button
            onClick={async () => {
              await supabase.auth.signOut({ scope: "local" });
              window.location.href = "/login";
            }}
            style={{
              width: "100%", padding: "14px 16px", border: "none",
              background: "transparent", textAlign: "left",
              color: "#FF5A33", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8, minHeight: 44,
            }}
          >
            <span>⏻</span> Déconnexion
          </button>
        </div>
      )}
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
