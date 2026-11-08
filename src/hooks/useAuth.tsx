import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSession, isAuthNetworkError, onAuthChange, signIn, type User } from "@/api/auth";
import {
  createInvitation, createPendingAthlete as apiCreatePendingAthlete, ensureCoachCode, getCoachRoster,
  linkToCoachByCode, normalizeCoachCode, registerAthleteWithCode as apiRegisterAthleteWithCode,
  registerAthleteWithInvitation, registerCoach as apiRegisterCoach, registerStaff as apiRegisterStaff,
  removePendingAthlete as apiRemovePendingAthlete, serverReason, setAthleteHidden as apiSetAthleteHidden, setOwnCoach,
} from "@/api/account";
import { getProfile, updateAthleteProfile as apiUpdateAthleteProfile, type AthleteProfileFields, type Profile } from "@/api/profile";
import { clearOfflineProfile, readOfflineProfile, readStoredAuthUser, saveOfflineProfile } from "@/lib/offline/offlineCache";
import { confirmLogout, logoutDevice } from "@/lib/offline/logoutDevice";

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Hors ligne avec un jeton expiré, supabase-js ne rend pas la session alors
 * qu'elle est toujours enregistrée sur l'appareil : on reprend son
 * utilisateur pour ouvrir l'app (le jeton sera rafraîchi au retour du réseau).
 */
function storedUser(): User | null {
  return readStoredAuthUser(safeStorage(), import.meta.env.VITE_SUPABASE_URL) as unknown as User | null;
}

export type { Profile };

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Athlètes visibles (non masqués) : alimente liste, sélecteur, accueil, alertes */
  athletes: Profile[];
  /** Athlètes masqués par le coach (accessibles uniquement via la section « Masqués ») */
  hiddenAthletes: Profile[];
  setAthleteHidden: (athleteId: string, hidden: boolean) => Promise<void>;
  /** Recharge la liste des athlètes (après ajout/retrait d'un co-coach…) */
  refreshAthletes: () => Promise<void>;
  /** Crée un athlète avant sa première connexion ; renvoie son id */
  createPendingAthlete: (firstName: string, lastName: string) => Promise<string>;
  /** Supprime un athlète pré-créé encore non réclamé */
  removePendingAthlete: (athleteId: string) => Promise<void>;
  /** Peut programmer pour soi-même côté coach (coach pur, coach-athlète auto-coaché ou co-coach de lui-même) */
  canCoachSelf: boolean;
  /** Coach-athlète suivi par un autre coach et co-coach de lui-même (double coach) */
  selfCoCoached: boolean;
  activeAthleteId: string | null;
  setActiveAthleteId: (id: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  registerCoach: (email: string, password: string, fullName: string, birthDate: string, isCoachAthlete?: boolean) => Promise<void>;
  registerAthlete: (email: string, password: string, fullName: string, birthDate: string, token: string) => Promise<void>;
  registerAthleteWithCode: (email: string, password: string, fullName: string, birthDate: string, coachCode: string) => Promise<void>;
  /** Compte professionnel (kiné, ostéo…) — gratuit, sans athlètes à lui. */
  registerStaff: (email: string, password: string, fullName: string, birthDate: string, profession: string) => Promise<void>;
  linkToCoach: (coachCode: string) => Promise<void>;
  unlinkFromCoach: () => Promise<void>;
  removeSelfAsAthlete: () => Promise<void>;
  becomeSelfCoach: () => Promise<void>;
  /** Déconnecte cet appareil puis recharge sur `redirectTo` (défaut /login). */
  logout: (redirectTo?: string) => Promise<void>;
  createInviteLink: () => Promise<string>;
  updateAthleteProfile: (athleteId: string, fields: AthleteProfileFields) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allAthletes, setAllAthletes] = useState<Profile[]>([]);
  const athletes = useMemo(() => allAthletes.filter((a) => !a.coach_hidden), [allAthletes]);
  const hiddenAthletes = useMemo(() => allAthletes.filter((a) => a.coach_hidden), [allAthletes]);
  const [activeAthleteId, setActiveAthleteId] = useState<string | null>(null);

  /**
   * Charge la fiche (et le roster d'un coach). Une lecture qui échoue garde la
   * fiche déjà affichée (avant : fiche remise à null, l'app se croyait sans
   * profil le temps d'un rafraîchissement de jeton raté).
   */
  async function fetchProfile(userId: string) {
    let p: Profile | null;
    try {
      p = await getProfile(userId);
    } catch (e) {
      console.error("[useAuth] profil", e);
      // Sans réseau : dernière fiche connue, si rien n'est encore affiché.
      const cached = readOfflineProfile<Profile>(safeStorage(), userId);
      if (cached) setProfile((cur) => cur ?? cached);
      return;
    }
    // Anciens comptes coach sans code : on en tire un.
    if (p) p = await ensureCoachCode(p);
    setProfile(p);
    if (p) saveOfflineProfile(safeStorage(), userId, p);
    if (p && (p.role === "coach" || p.role === "coach_athlete")) {
      await fetchAthletes(userId);
    }
  }

  /** Roster du coach ; une lecture qui échoue garde la liste affichée. */
  async function fetchAthletes(coachId: string) {
    try {
      setAllAthletes(await getCoachRoster(coachId));
    } catch (e) {
      console.error("[useAuth] athlètes", e);
    }
  }

  async function setAthleteHidden(athleteId: string, hidden: boolean) {
    if (!user) throw new Error("Non connecté");
    await apiSetAthleteHidden(athleteId, hidden);
    await fetchAthletes(user.id);
  }

  async function refreshAthletes() {
    if (user) await fetchAthletes(user.id);
  }

  async function createPendingAthlete(firstName: string, lastName: string): Promise<string> {
    if (!user) throw new Error("Non connecté");
    const athleteId = await apiCreatePendingAthlete(firstName, lastName);
    await fetchAthletes(user.id);
    return athleteId;
  }

  async function removePendingAthlete(athleteId: string) {
    if (!user) throw new Error("Non connecté");
    await apiRemovePendingAthlete(athleteId);
    await fetchAthletes(user.id);
  }

  useEffect(() => {
    // Réseau en panne (hors ligne, ou réseau capté mais inutilisable) : une
    // session vide ne veut pas dire « déconnecté ». Remis à false dès qu'une
    // vraie session revient du serveur.
    let networkDown = isOffline();

    // Hors ligne : on ouvre tout de suite avec l'utilisateur enregistré, sans
    // attendre `getSession`, qui réessaie de rafraîchir le jeton ~25 s.
    const early = networkDown ? storedUser() : null;
    if (early) {
      setUser(early);
      fetchProfile(early.id).finally(() => setLoading(false));
    }

    getSession()
      .catch((e) => {
        console.error("[useAuth] session", e);
        if (isAuthNetworkError(e)) networkDown = true;
        return null;
      })
      .then((session) => {
        if (session?.user) {
          networkDown = false;
          setUser(session.user);
          if (session.user.id !== early?.id) fetchProfile(session.user.id).finally(() => setLoading(false));
          else setLoading(false);
          return;
        }
        if (early) return; // déjà ouvert hors ligne
        const u = networkDown || isOffline() ? storedUser() : null;
        setUser(u);
        if (u) fetchProfile(u.id).finally(() => setLoading(false));
        else setLoading(false);
      });

    return onAuthChange((event, session) => {
      // Jeton expiré sans réseau : session vide SANS déconnexion. On garde
      // l'utilisateur affiché ; un refus réel du serveur (en ligne) passe.
      if (!session?.user && event !== "SIGNED_OUT" && (networkDown || isOffline()) && storedUser()) return;
      if (session?.user) networkDown = false;
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null); setAllAthletes([]); setActiveAthleteId(null);
        clearOfflineProfile(safeStorage());
      }
    });
  }, []);

  async function login(email: string, password: string) {
    await signIn(email, password);
  }

  async function registerCoach(email: string, password: string, fullName: string, birthDate: string, isCoachAthlete = false) {
    await apiRegisterCoach(email, password, fullName, birthDate, isCoachAthlete);
  }

  async function registerAthlete(email: string, password: string, fullName: string, birthDate: string, token: string) {
    await registerAthleteWithInvitation(email, password, fullName, birthDate, token);
  }

  async function registerAthleteWithCode(email: string, password: string, fullName: string, birthDate: string, coachCode: string) {
    await apiRegisterAthleteWithCode(email, password, fullName, birthDate, coachCode);
  }

  async function registerStaff(email: string, password: string, fullName: string, birthDate: string, profession: string) {
    const id = await apiRegisterStaff(email, password, fullName, birthDate, profession);
    await fetchProfile(id);
  }

  async function linkToCoach(coachCode: string) {
    if (!user) throw new Error("Non connecté");
    const code = normalizeCoachCode(coachCode);
    if (profile?.coach_code && profile.coach_code === code) {
      throw new Error("Tu ne peux pas entrer ton propre code coach");
    }
    try {
      await linkToCoachByCode(code);
    } catch (e) {
      const reason = serverReason(e);
      if (/invalide/i.test(reason)) throw new Error("Code coach invalide");
      if (/propre code/i.test(reason)) throw new Error("Tu ne peux pas entrer ton propre code coach");
      throw new Error("Erreur lors de l'assignation");
    }
    await fetchProfile(user.id);
  }

  async function unlinkFromCoach() {
    if (!user) throw new Error("Non connecté");
    // Quitter un coach externe → coach_athlete redevient son propre coach, athlete pur → null
    const newCoachId = profile?.role === "coach_athlete" ? user.id : null;
    await setOwnCoach(user.id, newCoachId).catch(() => { throw new Error("Erreur lors de la déconnexion du coach"); });
    await fetchProfile(user.id);
  }

  async function removeSelfAsAthlete() {
    if (!user) throw new Error("Non connecté");
    // coach_athlete se retire de ses propres athlètes (coach_id = null)
    await setOwnCoach(user.id, null).catch(() => { throw new Error("Erreur"); });
    await fetchProfile(user.id);
  }

  async function becomeSelfCoach() {
    if (!user) throw new Error("Non connecté");
    // coach_athlete redevient son propre athlète (coach_id = self)
    await setOwnCoach(user.id, user.id).catch(() => { throw new Error("Erreur"); });
    await fetchProfile(user.id);
  }

  // Coach-athlète co-coach de lui-même (double coach avec son coach externe)
  const selfCoCoached = !!user && allAthletes.some((a) => a.id === user.id && a.co_coached_by_me);

  // Coach-athlète coaché par un autre (ou sans coach) : plus d'accès à sa propre
  // programmation, sauf s'il s'est déclaré co-coach de lui-même
  const canCoachSelf = !!user && !!profile && (
    profile.role === "coach" ||
    (profile.role === "coach_athlete" && (profile.coach_id === user.id || selfCoCoached))
  );

  async function logout(redirectTo = "/login") {
    // Saisies hors ligne pas encore envoyées : on demande avant de les perdre.
    if (!confirmLogout()) return;
    setAllAthletes([]);
    setActiveAthleteId(null);
    await logoutDevice().catch((e) => console.error("[useAuth] déconnexion", e));
    // Rechargement complet : plus rien de l'ancien compte en mémoire (cache,
    // requêtes en vol), même si la déconnexion s'est faite sans réseau.
    window.location.href = redirectTo;
  }

  async function updateAthleteProfile(athleteId: string, fields: AthleteProfileFields) {
    await apiUpdateAthleteProfile(athleteId, fields);
    // Refresh data
    if (user) {
      const isOwnProfile = athleteId === user.id;
      if (isOwnProfile) await fetchProfile(user.id);
      else if (profile?.role === "coach" || profile?.role === "coach_athlete") await fetchAthletes(user.id);
    }
  }

  async function createInviteLink(): Promise<string> {
    if (!user) throw new Error("Non connecté");
    const token = await createInvitation(user.id);
    return `${window.location.origin}/invite/${token}`;
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      athletes, hiddenAthletes, setAthleteHidden, refreshAthletes, createPendingAthlete, removePendingAthlete, activeAthleteId, setActiveAthleteId,
      login, registerCoach, registerAthlete, registerAthleteWithCode, registerStaff,
      canCoachSelf, selfCoCoached, linkToCoach, unlinkFromCoach, removeSelfAsAthlete, becomeSelfCoach, logout, createInviteLink, updateAthleteProfile,
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
