import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { db } from "./client";

/**
 * Authentification Supabase (`supabase.auth.*`), encapsulée.
 *
 * Le client reste le même ; ce module ne fait que le cacher derrière des
 * fonctions qui LÈVENT en cas d'erreur. Les messages renvoyés par Supabase
 * sont gardés tels quels (`AuthFailure.message`) : les écrans les affichent ou
 * les reconnaissent (« session », « different from the old »…), un préfixe
 * les casserait.
 *
 * Inscription (profil, code coach, rattachement) : `src/api/account.ts`.
 */

export type { AuthChangeEvent, Session, User };

/** Échec d'un appel d'authentification ; `message` = message brut de Supabase. */
export class AuthFailure extends Error {
  readonly code?: string;
  readonly status?: number;
  /** Échec réseau (serveur injoignable), pas un refus : la session reste valable. */
  readonly network: boolean;
  constructor(err: { message: string; code?: string; status?: number; name?: string }) {
    super(err.message);
    this.name = "AuthFailure";
    this.code = err.code;
    this.status = err.status;
    this.network = err.name === "AuthRetryableFetchError" || err.status === 0;
  }
}

/** true si l'erreur vient du réseau (hors ligne, réseau capté mais inutilisable). */
export function isAuthNetworkError(e: unknown): boolean {
  return e instanceof AuthFailure && e.network;
}

type AuthRes<T> = { data: T; error: { message: string; code?: string; status?: number; name?: string } | null };

function ok<T>(res: AuthRes<T>): T {
  if (res.error) throw new AuthFailure(res.error);
  return res.data;
}

/** Session en cours (lue dans le stockage local, rafraîchie si besoin) ; null si déconnecté. */
export async function getSession(): Promise<Session | null> {
  return ok(await db().auth.getSession()).session;
}

/** Jeton d'accès de la session en cours ; null si déconnecté. */
export async function getAccessToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null;
}

/** Suit les changements de session ; renvoie la fonction de désabonnement. */
export function onAuthChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  const { data } = db().auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<Session | null> {
  return ok(await db().auth.signInWithPassword({ email, password })).session;
}

/** Crée le compte d'authentification ; lève si Supabase ne renvoie pas d'utilisateur. */
export async function signUp(email: string, password: string): Promise<User> {
  const { user } = ok(await db().auth.signUp({ email, password }));
  if (!user) throw new AuthFailure({ message: "Erreur lors de la création du compte" });
  return user;
}

/**
 * Déconnexion. `local` (défaut de l'app) : seulement cet appareil ; `global` :
 * toutes les sessions (défaut de Supabase, utilisé après réinitialisation du
 * mot de passe).
 */
export async function signOut(scope: "local" | "global" = "local"): Promise<void> {
  const { error } = await db().auth.signOut({ scope });
  if (!error) return;
  // Hors ligne, supabase-js n'arrive pas à prévenir le serveur et GARDE la
  // session : l'appareil resterait connecté. En local, on l'oublie quand même.
  if (scope === "local") forgetStoredSession();
  throw new AuthFailure(error);
}

/** Retire la session enregistrée sur cet appareil (clé `sb-<projet>-auth-token`). */
export function forgetStoredSession(): void {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0];
    localStorage.removeItem(`sb-${ref}-auth-token`);
  } catch {
    /* pas de stockage : rien à oublier */
  }
}

/** Envoie le lien « mot de passe oublié » ; `redirectTo` = page de réinitialisation. */
export async function sendPasswordReset(email: string, redirectTo: string): Promise<void> {
  ok(await db().auth.resetPasswordForEmail(email, { redirectTo }));
}

/** Nouveau mot de passe pour l'utilisateur connecté (session de récupération comprise). */
export async function updatePassword(password: string): Promise<void> {
  ok(await db().auth.updateUser({ password }));
}
