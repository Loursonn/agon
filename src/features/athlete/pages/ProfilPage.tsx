import { useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMedicalHistory, useUpsertMedicalHistory } from "@/features/shared/hooks/useMedicalHistory";
import type { SurgeryEntry, PastInjuryEntry } from "@/features/shared/types/medical";
import { toast } from "sonner";
import { localISO } from "@/lib/date";

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

// ── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s2, color: C.tx,
  fontSize: 13, fontFamily: "inherit", outline: "none",
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
    athleteProfile, combinedData, wellnessHistory,
    prs, bodyWeight, weightLog,
  } = useAthleteContext();

  const [editing, setEditing] = useState(false);
  const displayProfile = athleteProfile ?? profile;
  const myId = profile?.id;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 40px", scrollbarWidth: "none" }}>
      {/* ── Profile section ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionTitle}>Profil</div>
        {editing && myId ? (
          <ProfileEditForm
            profile={displayProfile}
            athleteId={myId}
            onSave={async (fields) => {
              await updateAthleteProfile(myId, fields);
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
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{displayProfile?.full_name ?? "—"}</div>
                <div style={{ fontSize: 11, color: C.tx3 }}>{todayShort()}</div>
              </div>
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
            </div>
            <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { l: "Âge", v: displayProfile?.age ? `${displayProfile.age} ans` : "—" },
                { l: "Taille", v: displayProfile?.height_cm ? `${displayProfile.height_cm} cm` : "—" },
                { l: "Poids", v: bodyWeight?.current ? `${bodyWeight.current} kg` : "—" },
                { l: "Genre", v: displayProfile?.gender === "male" ? "Homme" : displayProfile?.gender === "female" ? "Femme" : "—" },
              ].map(({ l, v }) => (
                <div key={l} style={{ background: C.s2, borderRadius: 4, padding: "8px 12px", flex: 1, minWidth: 72 }}>
                  <div style={{ fontSize: 9, color: C.tx3 }}>{l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Medical history section ── */}
      {myId && <MedicalHistorySection athleteId={myId} />}

      {/* ── Stats — volume ── */}
      <StatsSection
        combinedData={combinedData}
        wellnessHistory={wellnessHistory}
        weightLog={weightLog}
        bodyWeight={bodyWeight}
        prs={prs}
      />

      {/* ── Paramètres ── */}
      <div>
        <div style={sectionTitle}>Paramètres</div>
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.brd }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, marginBottom: 4 }}>Poids de corps actuel</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {bodyWeight?.current ? `${bodyWeight.current} kg` : "Non renseigné"} — modifiable dans la séance
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
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
  profile, athleteId, onSave, onCancel,
}: {
  profile: { first_name?: string | null; last_name?: string | null; birth_date?: string | null; height_cm?: number | null; gender?: "male" | "female" | null; weight_kg?: number | null; body_fat_pct?: number | null; base_metabolism?: number | null } | null;
  athleteId: string;
  onSave: (f: ProfileFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [heightCm, setHeightCm] = useState(profile?.height_cm?.toString() ?? "");
  const [gender, setGender] = useState<"male" | "female" | "">(profile?.gender ?? "");
  const [weightKg, setWeightKg] = useState(profile?.weight_kg?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const bd = birthDate || null;
      await onSave({
        first_name: firstName,
        last_name: lastName,
        birth_date: bd,
        age: ageFromBirth(bd),
        height_cm: heightCm ? Number(heightCm) : null,
        gender: gender || null,
        weight_kg: weightKg ? Number(weightKg) : null,
        body_fat_pct: profile?.body_fat_pct ?? null,
        base_metabolism: profile?.base_metabolism ?? null,
      });
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
          <label style={labelStyle}>Poids réf. (kg)</label>
          <input style={inputStyle} type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="75" />
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

// ── Medical History Section ───────────────────────────────────────────────────

function MedicalHistorySection({ athleteId }: { athleteId: string }) {
  const { data: medical, isLoading } = useMedicalHistory(athleteId);
  const upsert = useUpsertMedicalHistory(athleteId);
  const [editing, setEditing] = useState(false);

  const [conditions, setConditions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [surgeries, setSurgeries] = useState<SurgeryEntry[]>([]);
  const [pastInjuries, setPastInjuries] = useState<PastInjuryEntry[]>([]);
  const [treatments, setTreatments] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (medical) {
      setConditions(medical.conditions);
      setAllergies(medical.allergies);
      setSurgeries(medical.surgeries);
      setPastInjuries(medical.past_injuries);
      setTreatments(medical.current_treatments);
      setNotes(medical.medical_notes);
    }
  }, [medical]);

  const handleSave = () => {
    upsert.mutate({
      conditions, allergies, surgeries,
      past_injuries: pastInjuries,
      current_treatments: treatments,
      medical_notes: notes,
    }, {
      onSuccess: () => setEditing(false),
    });
  };

  const hasData = medical && (medical.conditions || medical.allergies || medical.surgeries.length > 0 || medical.past_injuries.length > 0 || medical.current_treatments || medical.medical_notes);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={sectionTitle}>Antécédents médicaux</div>
      {isLoading ? (
        <div style={{ ...card, fontSize: 12, color: C.tx3 }}>Chargement...</div>
      ) : editing ? (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 14 }}>Modifier mes antécédents</div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Pathologies / Conditions</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Asthme, diabète, etc." />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Allergies</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Pénicilline, lactose, etc." />
          </div>

          {/* Surgeries */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Opérations chirurgicales</label>
            {surgeries.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="Zone" value={s.zone} onChange={e => { const n = [...surgeries]; n[i] = { ...n[i], zone: e.target.value }; setSurgeries(n); }} />
                <input style={{ ...inputStyle, width: 110 }} type="date" value={s.date} onChange={e => { const n = [...surgeries]; n[i] = { ...n[i], date: e.target.value }; setSurgeries(n); }} />
                <input style={{ ...inputStyle, flex: 2 }} placeholder="Détails" value={s.details} onChange={e => { const n = [...surgeries]; n[i] = { ...n[i], details: e.target.value }; setSurgeries(n); }} />
                <button onClick={() => setSurgeries(surgeries.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.r, fontSize: 16, cursor: "pointer", padding: 4 }}>×</button>
              </div>
            ))}
            <button onClick={() => setSurgeries([...surgeries, { zone: "", date: "", details: "" }])} style={{ fontSize: 11, color: C.coach, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: "4px 0" }}>+ Ajouter une opération</button>
          </div>

          {/* Past injuries */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Blessures passées</label>
            {pastInjuries.map((inj, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input style={{ ...inputStyle, flex: 1, minWidth: 80 }} placeholder="Zone" value={inj.zone} onChange={e => { const n = [...pastInjuries]; n[i] = { ...n[i], zone: e.target.value }; setPastInjuries(n); }} />
                <input style={{ ...inputStyle, flex: 1, minWidth: 80 }} placeholder="Type" value={inj.type} onChange={e => { const n = [...pastInjuries]; n[i] = { ...n[i], type: e.target.value }; setPastInjuries(n); }} />
                <input style={{ ...inputStyle, width: 110 }} type="date" value={inj.date} onChange={e => { const n = [...pastInjuries]; n[i] = { ...n[i], date: e.target.value }; setPastInjuries(n); }} />
                <input style={{ ...inputStyle, flex: 2, minWidth: 120 }} placeholder="Détails" value={inj.details} onChange={e => { const n = [...pastInjuries]; n[i] = { ...n[i], details: e.target.value }; setPastInjuries(n); }} />
                <button onClick={() => setPastInjuries(pastInjuries.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.r, fontSize: 16, cursor: "pointer", padding: 4 }}>×</button>
              </div>
            ))}
            <button onClick={() => setPastInjuries([...pastInjuries, { zone: "", type: "", date: "", details: "" }])} style={{ fontSize: 11, color: C.coach, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: "4px 0" }}>+ Ajouter une blessure</button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Traitements en cours</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={treatments} onChange={e => setTreatments(e.target.value)} placeholder="Médicaments, kinésithérapie, etc." />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Remarques</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informations complémentaires..." />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(false)} style={{ ...btnPrimary, background: C.s2, color: C.tx3, border: "1px solid " + C.brd }}>Annuler</button>
            <button onClick={handleSave} disabled={upsert.isPending} style={{ ...btnPrimary, opacity: upsert.isPending ? 0.6 : 1 }}>
              {upsert.isPending ? "..." : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasData ? 14 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: hasData ? C.tx : C.tx3 }}>
              {hasData ? "Vos antécédents" : "Aucun antécédent renseigné"}
            </div>
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "6px 14px", borderRadius: 4,
                border: "1px solid " + C.coach + "50", background: C.coach + "15",
                color: C.coach, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {hasData ? "Modifier" : "Remplir"}
            </button>
          </div>
          {hasData && <MedicalReadOnly medical={medical!} />}
        </div>
      )}
    </div>
  );
}

// ── Medical Read-Only Display ─────────────────────────────────────────────────

export function MedicalReadOnly({ medical }: { medical: { conditions: string; allergies: string; surgeries: SurgeryEntry[]; past_injuries: PastInjuryEntry[]; current_treatments: string; medical_notes: string } }) {
  const rows: { label: string; value: React.ReactNode }[] = [];

  if (medical.conditions) rows.push({ label: "Pathologies", value: medical.conditions });
  if (medical.allergies) rows.push({ label: "Allergies", value: medical.allergies });
  if (medical.surgeries.length > 0) {
    rows.push({
      label: "Opérations",
      value: (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {medical.surgeries.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: C.tx2 }}>
              <span style={{ fontWeight: 600, color: C.tx }}>{s.zone}</span>
              {s.date && <span style={{ color: C.tx3 }}> · {s.date}</span>}
              {s.details && <span> — {s.details}</span>}
            </div>
          ))}
        </div>
      ),
    });
  }
  if (medical.past_injuries.length > 0) {
    rows.push({
      label: "Blessures",
      value: (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {medical.past_injuries.map((inj, i) => (
            <div key={i} style={{ fontSize: 12, color: C.tx2 }}>
              <span style={{ fontWeight: 600, color: C.tx }}>{inj.zone}</span>
              {inj.type && <span style={{ color: C.o }}> ({inj.type})</span>}
              {inj.date && <span style={{ color: C.tx3 }}> · {inj.date}</span>}
              {inj.details && <span> — {inj.details}</span>}
            </div>
          ))}
        </div>
      ),
    });
  }
  if (medical.current_treatments) rows.push({ label: "Traitements", value: medical.current_treatments });
  if (medical.medical_notes) rows.push({ label: "Remarques", value: medical.medical_notes });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map(({ label, value }) => (
        <div key={label}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Stats Section (extracted) ─────────────────────────────────────────────────

function StatsSection({ combinedData, wellnessHistory, weightLog, bodyWeight, prs }: {
  combinedData: unknown; wellnessHistory: unknown; weightLog: unknown;
  bodyWeight: { current?: number } | null; prs: unknown;
}) {
  const weightData = Object.entries((weightLog as Record<string, number>) ?? {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-30)
    .map(([date, kg]) => ({ d: date.slice(5).replace("-", "/"), kg }));

  const wellnessTrend30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000);
    const iso = localISO(d);
    const w = (wellnessHistory as Record<string, { score?: number }>)?.[iso];
    return { d: `${d.getDate()}/${d.getMonth() + 1}`, score: w?.score ?? null };
  });

  const volData = (combinedData as Array<{ s: string; volProg: number; volReal: number | null }>)?.map(d => ({
    s: d.s, vol: d.volReal ?? d.volProg,
  })) ?? [];

  const prEntries = Object.entries((prs as Record<string, { est?: string; date?: string }>) ?? {})
    .filter(([, v]) => v?.est)
    .slice(0, 10);

  return (
    <>
      {volData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Volume · programme</div>
          <div style={card}>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={volData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <Bar dataKey="vol" fill={C.ac} radius={[2, 2, 0, 0]} />
                <XAxis dataKey="s" tick={{ fontSize: 9, fill: C.tx3 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: C.s1, border: "none", borderRadius: 4, fontSize: 11 }} labelStyle={{ color: C.tx3 }} itemStyle={{ color: C.ac }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {wellnessTrend30.some(d => d.score !== null) && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Wellness · 30 jours</div>
          <div style={card}>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={wellnessTrend30} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <Line type="monotone" dataKey="score" stroke={C.coach} strokeWidth={2} dot={false} connectNulls />
                <XAxis dataKey="d" tick={{ fontSize: 8, fill: C.tx3 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis domain={[0, 100]} hide />
                <Tooltip contentStyle={{ background: C.s1, border: "none", borderRadius: 4, fontSize: 11 }} labelStyle={{ color: C.tx3 }} itemStyle={{ color: C.coach }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {weightData.length > 0 && (() => {
        const kgValues = weightData.map(d => d.kg);
        const kgMin = Math.min(...kgValues);
        const kgMax = Math.max(...kgValues);
        const spread = kgMax - kgMin;
        const pad = spread < 1 ? 0.5 : spread * 0.12;
        const domain: [number, number] = [Math.floor((kgMin - pad) * 10) / 10, Math.ceil((kgMax + pad) * 10) / 10];
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Poids de corps · 30 jours</div>
            <div style={card}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={weightData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                  <Line type="monotone" dataKey="kg" stroke={C.b} strokeWidth={2} dot={false} />
                  <XAxis dataKey="d" tick={{ fontSize: 8, fill: C.tx3 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis domain={domain} tickCount={4} tick={{ fontSize: 8, fill: C.tx3 }} axisLine={false} tickLine={false} width={32} tickFormatter={(v: number) => `${v}`} />
                  <Tooltip contentStyle={{ background: C.s1, border: "none", borderRadius: 4, fontSize: 11 }} labelStyle={{ color: C.tx3 }} itemStyle={{ color: C.b }} formatter={(v: number) => [`${v} kg`, "Poids"]} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {prEntries.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Records personnels</div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {prEntries.map(([name, v], i) => (
              <div key={name} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: i < prEntries.length - 1 ? "1px solid " + C.brd : "none" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{name}</div>
                  {v.date && <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{v.date}</div>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.o }}>{v.est} kg</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
