import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  role: "coach" | "athlete" | "coach_athlete" | "staff";
  full_name: string;
  coach_id: string | null;
  coach_code: string | null;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  birth_date: string | null;
  height_cm: number | null;
  gender: "male" | "female" | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  base_metabolism: number | null;
  is_admin: boolean;
  is_certified_coach: boolean;
  is_hyrox_athlete: boolean;
  /** Lien Calendly du coach pour le point hebdo (null = aucune réservation proposée) */
  booking_url: string | null;
  /** Métier par défaut d'un professionnel (staff). Les droits suivent le métier du lien. */
  profession?: string | null;
  /** true = masqué par son coach (liste, sélecteur, accueil). Sans effet côté athlète. */
  coach_hidden?: boolean;
  /** true = compte pré-créé par le coach, pas encore réclamé par l'athlète */
  is_pending?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Athlètes visibles (non masqués) : alimente liste, sélecteur, accueil, alertes */
  athletes: Profile[];
  /** Athlètes masqués par le coach (accessibles uniquement via la section « Masqués ») */
  hiddenAthletes: Profile[];
  setAthleteHidden: (athleteId: string, hidden: boolean) => Promise<void>;
  /** Crée un athlète avant sa première connexion ; renvoie son id */
  createPendingAthlete: (firstName: string, lastName: string) => Promise<string>;
  /** Supprime un athlète pré-créé encore non réclamé */
  removePendingAthlete: (athleteId: string) => Promise<void>;
  /** Peut programmer pour soi-même côté coach (coach pur, ou coach-athlète auto-coaché) */
  canCoachSelf: boolean;
  activeAthleteId: string | null;
  setActiveAthleteId: (id: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  registerCoach: (email: string, password: string, fullName: string, isCoachAthlete?: boolean) => Promise<void>;
  registerAthlete: (email: string, password: string, fullName: string, token: string) => Promise<void>;
  registerAthleteWithCode: (email: string, password: string, fullName: string, coachCode: string) => Promise<void>;
  /** Compte professionnel (kiné, ostéo…) — gratuit, sans athlètes à lui. */
  registerStaff: (email: string, password: string, fullName: string, profession: string) => Promise<void>;
  linkToCoach: (coachCode: string) => Promise<void>;
  unlinkFromCoach: () => Promise<void>;
  removeSelfAsAthlete: () => Promise<void>;
  becomeSelfCoach: () => Promise<void>;
  logout: () => Promise<void>;
  createInviteLink: () => Promise<string>;
  updateAthleteProfile: (athleteId: string, fields: {
    first_name: string;
    last_name: string;
    age: number | null;
    birth_date: string | null;
    height_cm: number | null;
    gender: "male" | "female" | null;
    weight_kg: number | null;
    body_fat_pct: number | null;
    base_metabolism: number | null;
    is_hyrox_athlete?: boolean;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function generateCoachCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allAthletes, setAllAthletes] = useState<Profile[]>([]);
  const athletes = useMemo(() => allAthletes.filter((a) => !a.coach_hidden), [allAthletes]);
  const hiddenAthletes = useMemo(() => allAthletes.filter((a) => a.coach_hidden), [allAthletes]);
  const [activeAthleteId, setActiveAthleteId] = useState<string | null>(null);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    let p = data as Profile | null;
    // Auto-generate coach_code for existing coaches who don't have one
    if (p && (p.role === "coach" || p.role === "coach_athlete") && !p.coach_code) {
      const code = generateCoachCode();
      await supabase.from("profiles").update({ coach_code: code }).eq("id", userId);
      p = { ...p, coach_code: code };
    }
    setProfile(p);
    if (p && (p.role === "coach" || p.role === "coach_athlete")) {
      await fetchAthletes(userId);
    }
  }

  async function fetchAthletes(coachId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("coach_id", coachId)
      .order("full_name");
    setAllAthletes((data as Profile[]) || []);
  }

  async function setAthleteHidden(athleteId: string, hidden: boolean) {
    if (!user) throw new Error("Non connecté");
    const { error } = await supabase.rpc("set_athlete_hidden", { athlete_id: athleteId, hidden });
    if (error) throw new Error(error.message);
    await fetchAthletes(user.id);
  }

  async function createPendingAthlete(firstName: string, lastName: string): Promise<string> {
    if (!user) throw new Error("Non connecté");
    const { data, error } = await supabase.functions.invoke("pending-athlete", {
      body: { action: "create", firstName, lastName },
    });
    if (error || data?.error) throw new Error(data?.error ?? "Création impossible");
    await fetchAthletes(user.id);
    return data.athleteId as string;
  }

  async function removePendingAthlete(athleteId: string) {
    if (!user) throw new Error("Non connecté");
    const { data, error } = await supabase.functions.invoke("pending-athlete", {
      body: { action: "delete", athleteId },
    });
    if (error || data?.error) throw new Error(data?.error ?? "Suppression impossible");
    await fetchAthletes(user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setAllAthletes([]); setActiveAthleteId(null); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function registerCoach(email: string, password: string, fullName: string, isCoachAthlete = false) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Erreur lors de la création du compte");

    let code = generateCoachCode();
    // Ensure uniqueness (retry on collision)
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase.from("profiles").select("id").eq("coach_code", code).maybeSingle();
      if (!existing) break;
      code = generateCoachCode();
      attempts++;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      role: isCoachAthlete ? "coach_athlete" : "coach",
      full_name: fullName,
      coach_code: code,
      // Coach-athlète : son propre coach par défaut (apparaît dans ses athlètes)
      ...(isCoachAthlete ? { coach_id: data.user.id } : {}),
    });
    if (profileError) throw new Error(profileError.message);
  }

  async function registerAthlete(email: string, password: string, fullName: string, token: string) {
    const { data: invite, error: inviteError } = await supabase
      .from("invitations")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .single();

    if (inviteError || !invite) throw new Error("Lien d'invitation invalide ou déjà utilisé");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Erreur lors de la création du compte");

    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      role: "athlete",
      full_name: fullName,
      coach_id: invite.coach_id,
    });
    if (profileError) throw new Error(profileError.message);

    await supabase.from("invitations").update({ used_at: new Date().toISOString() }).eq("token", token);
  }

  async function registerAthleteWithCode(email: string, password: string, fullName: string, coachCode: string) {
    const { data: coach } = await supabase
      .from("profiles")
      .select("id")
      .eq("coach_code", coachCode.toUpperCase().trim())
      .maybeSingle();

    if (!coach) throw new Error("Code coach invalide — vérifie auprès de ton coach");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Erreur lors de la création du compte");

    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      role: "athlete",
      full_name: fullName,
      coach_id: coach.id,
    });
    if (profileError) throw new Error(profileError.message);
  }

  async function registerStaff(email: string, password: string, fullName: string, profession: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Erreur lors de la création du compte");

    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      role: "staff",
      full_name: fullName,
      profession,
    });
    if (profileError) throw new Error(profileError.message);
    await fetchProfile(data.user.id);
  }

  async function linkToCoach(coachCode: string) {
    if (!user) throw new Error("Non connecté");
    const { data: coach } = await supabase
      .from("profiles")
      .select("id")
      .eq("coach_code", coachCode.toUpperCase().trim())
      .maybeSingle();
    if (!coach) throw new Error("Code coach invalide");
    if (coach.id === user.id) throw new Error("Tu ne peux pas entrer ton propre code coach");
    const { error } = await supabase.from("profiles").update({ coach_id: coach.id }).eq("id", user.id);
    if (error) throw new Error("Erreur lors de l'assignation");
    await fetchProfile(user.id);
  }

  async function unlinkFromCoach() {
    if (!user) throw new Error("Non connecté");
    // Quitter un coach externe → coach_athlete redevient son propre coach, athlete pur → null
    const newCoachId = profile?.role === "coach_athlete" ? user.id : null;
    const { error } = await supabase.from("profiles").update({ coach_id: newCoachId }).eq("id", user.id);
    if (error) throw new Error("Erreur lors de la déconnexion du coach");
    await fetchProfile(user.id);
  }

  async function removeSelfAsAthlete() {
    if (!user) throw new Error("Non connecté");
    // coach_athlete se retire de ses propres athlètes (coach_id = null)
    const { error } = await supabase.from("profiles").update({ coach_id: null }).eq("id", user.id);
    if (error) throw new Error("Erreur");
    await fetchProfile(user.id);
  }

  async function becomeSelfCoach() {
    if (!user) throw new Error("Non connecté");
    // coach_athlete redevient son propre athlète (coach_id = self)
    const { error } = await supabase.from("profiles").update({ coach_id: user.id }).eq("id", user.id);
    if (error) throw new Error("Erreur");
    await fetchProfile(user.id);
  }

  // Coach-athlète coaché par un autre (ou sans coach) : plus d'accès à sa propre programmation
  const canCoachSelf = !!user && !!profile && (
    profile.role === "coach" || (profile.role === "coach_athlete" && profile.coach_id === user.id)
  );

  async function logout() {
    setAllAthletes([]);
    setActiveAthleteId(null);
    await supabase.auth.signOut({ scope: "local" });
  }

  async function updateAthleteProfile(athleteId: string, fields: {
    first_name: string;
    last_name: string;
    age: number | null;
    birth_date: string | null;
    height_cm: number | null;
    gender: "male" | "female" | null;
    weight_kg: number | null;
    body_fat_pct: number | null;
    base_metabolism: number | null;
    is_hyrox_athlete?: boolean;
  }) {
    const full_name = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();
    const { error } = await supabase
      .from("profiles")
      .update({ ...fields, ...(full_name ? { full_name } : {}) })
      .eq("id", athleteId);
    if (error) throw new Error(error.message);
    // Refresh data
    if (user) {
      const isOwnProfile = athleteId === user.id;
      if (isOwnProfile) await fetchProfile(user.id);
      else if (profile?.role === "coach" || profile?.role === "coach_athlete") await fetchAthletes(user.id);
    }
  }

  async function createInviteLink(): Promise<string> {
    if (!user) throw new Error("Non connecté");
    const { data, error } = await supabase
      .from("invitations")
      .insert({ coach_id: user.id })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return `${window.location.origin}/invite/${data.token}`;
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      athletes, hiddenAthletes, setAthleteHidden, createPendingAthlete, removePendingAthlete, activeAthleteId, setActiveAthleteId,
      login, registerCoach, registerAthlete, registerAthleteWithCode, registerStaff,
      canCoachSelf, linkToCoach, unlinkFromCoach, removeSelfAsAthlete, becomeSelfCoach, logout, createInviteLink, updateAthleteProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
