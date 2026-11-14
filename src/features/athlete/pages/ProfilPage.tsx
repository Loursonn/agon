import { useIsDesktop } from "@/hooks/useIsDesktop";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
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

const inputClass = "box-border w-full rounded-[4px] border border-agon-brd bg-agon-s2 px-3 py-2 font-[inherit] text-[13px] text-agon-tx [outline:none]";
const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3";
const btnBase = "cursor-pointer rounded-[4px] px-5 py-2.5 font-[inherit] text-[13px] font-bold";
/** Titre numéroté de la planche « Profil athlète » : « 01 — Profil » + filet. */
function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-col gap-2.5">
      <h2 className="agon-mono m-0 flex h-5 items-center whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.12em] text-agon-tx2">
        <span className="text-agon-accent">{n} —</span>&nbsp;{children}
      </h2>
      <div className="h-px bg-agon-brd" />
    </div>
  );
}
/** Petit intitulé mono (sans couleur : text-agon-tx3 ou text-agon-tx2 selon l'endroit). */
const KICKER = "agon-mono whitespace-nowrap text-[10px] uppercase tracking-[0.06em]";
/** Carte de base, sans padding (p-4 par défaut). */
const CARD = "rounded-[14px] border border-agon-brd bg-agon-s1";

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
    <div className={cn("mx-auto", isDesktop ? "max-w-[1248px]" : "max-w-[480px]")}>
    <AthletePageHeader title="Profil" />
    {/* Ordinateur (planche AthOrdiBProfil) : profil à gauche (1/3), le reste à droite (2/3). */}
    <div className={cn("px-5 pb-10 pt-6 [scrollbar-width:none]", isDesktop && "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-x-8")}>
      <div className={isDesktop ? "flex min-w-0 flex-col" : "contents"}>
      {/* ── Profil ── */}
      <div className="mb-6">
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
          <div className={cn(CARD, "relative flex flex-col gap-3 overflow-hidden p-[18px]")}>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[22px] bg-[url(/brand/agon-pattern-frise-meandre-sombre.svg)] bg-[length:auto_22px] bg-repeat-x opacity-[0.22]" />
            <div className="relative z-[1] flex items-center gap-3.5 pt-2">
              <span className="agon-display box-border flex size-[52px] flex-none items-center justify-center rounded-full border-2 border-agon-accent text-[20px] text-agon-h-sable-clair shadow-[0_0_0_4px_color-mix(in_srgb,var(--agon-accent)_14.1%,transparent)]">
                {(displayProfile?.full_name ?? "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="agon-display truncate text-[16px] font-normal tracking-[0.05em] text-agon-tx">{displayProfile?.full_name ?? "—"}</div>
                <div className="text-[12px] text-agon-tx3">{todayShort()}</div>
              </div>
              {!viewOnly && (
                <button
                  onClick={() => setEditing(true)}
                  className="h-9 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-agon-accent px-4 font-[inherit] text-[11px] font-semibold text-agon-ink"
                >
                  Modifier
                </button>
              )}
            </div>
            <div className="relative z-[1] grid grid-cols-[1fr_1fr] gap-2">
              {[
                { l: "Date de naissance", v: displayProfile?.birth_date ? new Date(displayProfile.birth_date + "T12:00:00").toLocaleDateString("fr-FR") : "—" },
                { l: "Âge", v: ageFromBirth(displayProfile?.birth_date) != null ? `${ageFromBirth(displayProfile?.birth_date)} ans` : displayProfile?.age ? `${displayProfile.age} ans` : "—" },
                { l: "Taille", v: displayProfile?.height_cm ? `${displayProfile.height_cm} cm` : "—" },
                { l: "Genre", v: displayProfile?.gender === "male" ? "Homme" : displayProfile?.gender === "female" ? "Femme" : "—" },
              ].map(({ l, v }) => (
                <div key={l} className="flex min-w-0 flex-col gap-[3px] rounded-[10px] border border-agon-brd bg-agon-s2 px-3 py-2.5">
                  <span className={cn(KICKER, "text-agon-tx3")}>{l}</span>
                  <span className="whitespace-nowrap text-[15px] font-medium text-agon-tx">{v}</span>
                </div>
              ))}
            </div>

            {/* Poids : dernière pesée + 3 dernières + poids cible */}
            <div className="relative z-[1] flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-agon-succes/40 bg-agon-succes/[0.122] py-3 pl-[15px] pr-3">
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-agon-succes" />
              <div className="flex items-end justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={cn(KICKER, "text-agon-tx2")}>Poids</span>
                  <span className={cn("agon-mono whitespace-nowrap text-[32px] leading-none", currentWeight != null ? "text-agon-succes" : "text-agon-tx3")}>
                    {currentWeight != null ? currentWeight.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}
                    {currentWeight != null && <span className="text-[12px] text-agon-tx2"> kg</span>}
                  </span>
                </div>
                {targetWeight ? (
                  <div className="flex min-w-0 flex-col gap-1 text-right">
                    <span className={cn(KICKER, "text-agon-tx2")}>Poids cible</span>
                    <span className="agon-mono whitespace-nowrap text-[18px] leading-[1.1] text-agon-accent">
                      {Number(targetWeight).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}<span className="text-[11px] text-agon-tx3"> kg</span>
                    </span>
                  </div>
                ) : null}
              </div>
              {weighIns.length > 0 ? (
                <div className="flex gap-1.5">
                  {weighIns.slice(0, 3).map((w, i) => (
                    <div key={w.date} className={cn("flex min-w-0 flex-1 flex-col gap-0.5 rounded-[8px] border px-2.5 py-1.5", i === 0 ? "border-agon-succes/[0.451] bg-agon-succes/[0.161]" : "border-agon-brd bg-agon-s2")}>
                      <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx2">{shortDate(w.date)}</span>
                      <span className={cn("agon-mono whitespace-nowrap text-[13px] leading-[1.1]", i === 0 ? "text-agon-succes" : "text-agon-tx")}>
                        {w.kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}<span className="text-[11px] text-agon-tx3"> kg</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-agon-tx3">Aucune pesée : ajoute ton poids dans le bilan du jour ou via « Modifier ».</div>
              )}
            </div>
          </div>
        )}
      </div>

      {!viewOnly && (
        <Link
          to="/athlete/zones"
          className={cn(CARD, "-mt-3 mb-6 flex items-center justify-between p-4 text-[14px] font-semibold text-agon-tx no-underline")}
        >
          Mes seuils et zones FC
          <span aria-hidden className="text-agon-tx3">›</span>
        </Link>
      )}
      {!viewOnly && (
        <Link
          to="/athlete/montres"
          className={cn(CARD, "-mt-4 mb-6 flex items-center justify-between p-4 text-[14px] font-semibold text-agon-tx no-underline")}
        >
          Montres et données
          <span aria-hidden className="text-agon-tx3">›</span>
        </Link>
      )}

      {/* ── Blessures ── */}
      {athleteId && (
        <div className="mb-6">
          <SectionTitle n="02">Blessures</SectionTitle>
          <MedicalEntriesSection athleteId={athleteId} canEdit />
        </div>
      )}

      </div>
      <div className={isDesktop ? "flex min-w-0 flex-col" : "contents"}>
      {/* ── Mes coachs (double coach) ── */}
      {!viewOnly && athleteId && (
        <div id="mes-coachs" className="mb-6 scroll-mt-14">
          <SectionTitle n="03">Mes coachs</SectionTitle>
          <CoCoachPanel athleteId={athleteId} athleteName={displayProfile?.full_name ?? "toi"} mode="athlete" />
        </div>
      )}

      {/* ── Mon staff (kiné, ostéo, nutritionniste…) ── */}
      {!viewOnly && athleteId && (
        <div id="mon-staff" className="mb-6">
          <SectionTitle n="04">Mon staff</SectionTitle>
          <AthleteStaffPanel athleteId={athleteId} athleteName={displayProfile?.full_name ?? "toi"} mode="athlete" />
        </div>
      )}

      {/* ── Volume de course à pied ── */}
      <div className="mb-6">
        <SectionTitle n="05">Volume de course à pied</SectionTitle>
        <RunningVolumeCard volume={volume} isLoading={volumeLoading} />
      </div>

      {/* Données Strava : déplacées dans « Montres et données » (planche Ath2Montres). */}

      {/* ── Déconnexion ── */}
      {!viewOnly && (
        <div className="overflow-hidden rounded-[14px] border border-agon-rouge/40 bg-agon-rouge/[0.122]">
          <button
            onClick={async () => {
              if (!confirmLogout()) return;
              await logoutDevice().catch(() => {});
              window.location.href = "/login";
            }}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 border-none bg-transparent font-[inherit] text-[14px] font-medium text-agon-rouge"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M12 3V11M7 6.5A7 7 0 1 0 17 6.5" /></svg>
            Déconnexion
          </button>
        </div>
      )}
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
    <div className={cn(CARD, "p-4")}>
      <div className="mb-3.5 text-[14px] font-bold text-agon-tx">Modifier mon profil</div>
      <div className="mb-3 grid grid-cols-[1fr_1fr] gap-3">
        <div>
          <label className={labelClass}>Prénom</label>
          <input className={inputClass} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Prénom" />
        </div>
        <div>
          <label className={labelClass}>Nom</label>
          <input className={inputClass} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nom" />
        </div>
      </div>
      <div className="mb-3 grid grid-cols-[1fr_1fr] gap-3">
        <div>
          <label className={labelClass}>Date de naissance</label>
          <input className={inputClass} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Genre</label>
          <select
            className={cn(inputClass, "cursor-pointer")}
            value={gender}
            onChange={e => setGender(e.target.value as "male" | "female" | "")}
          >
            <option value="">Non renseigné</option>
            <option value="male">Homme</option>
            <option value="female">Femme</option>
          </select>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-[1fr_1fr] gap-3">
        <div>
          <label className={labelClass}>Taille (cm)</label>
          <input className={inputClass} type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" />
        </div>
        <div>
          <label className={labelClass}>Pesée du jour (kg)</label>
          <input className={inputClass} type="number" inputMode="decimal" step="0.1" value={weighIn} onChange={e => setWeighIn(e.target.value)} placeholder="75" />
        </div>
      </div>
      <div className="flex justify-end gap-2.5">
        <button onClick={onCancel} className={cn(btnBase, "border border-agon-brd bg-agon-s2 text-agon-tx3")}>Annuler</button>
        <button onClick={handleSave} disabled={saving} className={cn(btnBase, "border-none bg-agon-or-vif text-agon-ink", saving && "opacity-60")}>
          {saving ? "..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
