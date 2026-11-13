import { describe, it, expect, afterEach, vi } from "vitest";
import { setDbForTests } from "@/api/client";
import {
  AuthFailure, PASSWORD_MIN_LENGTH, getAccessToken, isPasswordLongEnough, getSession, onAuthChange, sendPasswordReset, signIn, signOut, signUp, updatePassword,
} from "@/api/auth";

type Err = { message: string; code?: string; status?: number } | null;

/** Faux `supabase.auth` : enregistre les appels, renvoie ce qu'on lui dit. */
function fakeAuth(o: { session?: unknown; user?: unknown; error?: Err } = {}) {
  const calls: Array<[string, unknown]> = [];
  const unsubscribe = vi.fn();
  let listener: ((e: string, s: unknown) => void) | null = null;
  const res = <T>(data: T) => Promise.resolve({ data, error: o.error ?? null });
  const auth = {
    getSession: () => (calls.push(["getSession", null]), res({ session: o.error ? null : o.session ?? null })),
    onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    },
    signInWithPassword: (a: unknown) => (calls.push(["signIn", a]), res({ session: o.session ?? null, user: o.user ?? null })),
    signUp: (a: unknown) => (calls.push(["signUp", a]), res({ session: null, user: o.user ?? null })),
    signOut: (a: unknown) => (calls.push(["signOut", a]), Promise.resolve({ error: o.error ?? null })),
    resetPasswordForEmail: (email: string, a: unknown) => (calls.push(["reset", { email, ...(a as object) }]), res({})),
    updateUser: (a: unknown) => (calls.push(["updateUser", a]), res({ user: o.user ?? null })),
  };
  return { db: { auth }, calls, unsubscribe, emit: (e: string, s: unknown) => listener?.(e, s) };
}

afterEach(() => setDbForTests(null));

describe("api/auth", () => {
  it("getSession / getAccessToken lisent la session ; null si déconnecté", async () => {
    setDbForTests(fakeAuth({ session: { access_token: "jwt", user: { id: "u" } } }).db);
    expect((await getSession())?.access_token).toBe("jwt");
    expect(await getAccessToken()).toBe("jwt");
    setDbForTests(fakeAuth().db);
    expect(await getSession()).toBeNull();
    expect(await getAccessToken()).toBeNull();
  });

  it("une erreur lève une AuthFailure qui garde le message brut de Supabase (les écrans le reconnaissent)", async () => {
    setDbForTests(fakeAuth({ error: { message: "Invalid login credentials", status: 400 } }).db);
    const e = await signIn("a@b.c", "x").catch((x) => x);
    expect(e).toBeInstanceOf(AuthFailure);
    expect(e.message).toBe("Invalid login credentials");
    expect(e.status).toBe(400);
    await expect(getSession()).rejects.toThrow("Invalid login credentials");
    await expect(updatePassword("nouveau-mdp")).rejects.toThrow("Invalid login credentials");
    await expect(signOut()).rejects.toBeInstanceOf(AuthFailure);
  });

  it("déconnexion locale ratée (hors ligne) : la session enregistrée est quand même oubliée", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abcdefgh.supabase.co");
    localStorage.setItem("sb-abcdefgh-auth-token", JSON.stringify({ user: { id: "u" } }));
    localStorage.setItem("sb-autre-auth-token", "x");
    setDbForTests(fakeAuth({ error: { message: "Failed to fetch", status: 0 } }).db);
    await expect(signOut("local")).rejects.toBeInstanceOf(AuthFailure);
    expect(localStorage.getItem("sb-abcdefgh-auth-token")).toBeNull();
    expect(localStorage.getItem("sb-autre-auth-token")).toBe("x");
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("signUp renvoie l'utilisateur, et lève s'il n'y en a pas", async () => {
    setDbForTests(fakeAuth({ user: { id: "u1" } }).db);
    expect((await signUp("a@b.c", "secret-8")).id).toBe("u1");
    setDbForTests(fakeAuth().db);
    await expect(signUp("a@b.c", "secret-8")).rejects.toThrow("Erreur lors de la création du compte");
  });

  it("transmet les paramètres tels quels (portée de déconnexion, lien de réinitialisation)", async () => {
    const f = fakeAuth();
    setDbForTests(f.db);
    await signOut();
    await signOut("global");
    await sendPasswordReset("a@b.c", "https://app/reset-password");
    await updatePassword("nouveau-mdp");
    expect(f.calls).toEqual([
      ["signOut", { scope: "local" }],
      ["signOut", { scope: "global" }],
      ["reset", { email: "a@b.c", redirectTo: "https://app/reset-password" }],
      ["updateUser", { password: "nouveau-mdp" }],
    ]);
  });

  it("mot de passe : 8 caractères minimum à l'inscription et au changement, pas à la connexion (AIPD A3)", async () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(isPasswordLongEnough("1234567")).toBe(false);
    expect(isPasswordLongEnough("12345678")).toBe(true);
    const f = fakeAuth({ user: { id: "u1" } });
    setDbForTests(f.db);
    const e = await signUp("a@b.c", "1234567").catch((x) => x);
    expect(e).toBeInstanceOf(AuthFailure);
    expect(e.message).toBe("Le mot de passe doit contenir au moins 8 caractères.");
    await expect(updatePassword("secret")).rejects.toThrow("au moins 8 caractères");
    // Refusé avant tout appel à Supabase.
    expect(f.calls).toEqual([]);
    // Connexion : un ancien mot de passe de 6 caractères reste accepté.
    await signIn("a@b.c", "abcdef");
    expect(f.calls).toEqual([["signIn", { email: "a@b.c", password: "abcdef" }]]);
  });

  it("onAuthChange relaie les évènements et renvoie le désabonnement", () => {
    const f = fakeAuth();
    setDbForTests(f.db);
    const seen: string[] = [];
    const off = onAuthChange((e) => seen.push(e));
    f.emit("SIGNED_IN", {});
    off();
    expect(seen).toEqual(["SIGNED_IN"]);
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
});
