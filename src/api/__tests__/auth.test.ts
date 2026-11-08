import { describe, it, expect, afterEach, vi } from "vitest";
import { setDbForTests } from "@/api/client";
import {
  AuthFailure, getAccessToken, getSession, onAuthChange, sendPasswordReset, signIn, signOut, signUp, updatePassword,
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
    await expect(updatePassword("nouveau")).rejects.toThrow("Invalid login credentials");
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
    expect((await signUp("a@b.c", "secret")).id).toBe("u1");
    setDbForTests(fakeAuth().db);
    await expect(signUp("a@b.c", "secret")).rejects.toThrow("Erreur lors de la création du compte");
  });

  it("transmet les paramètres tels quels (portée de déconnexion, lien de réinitialisation)", async () => {
    const f = fakeAuth();
    setDbForTests(f.db);
    await signOut();
    await signOut("global");
    await sendPasswordReset("a@b.c", "https://app/reset-password");
    await updatePassword("nouveau");
    expect(f.calls).toEqual([
      ["signOut", { scope: "local" }],
      ["signOut", { scope: "global" }],
      ["reset", { email: "a@b.c", redirectTo: "https://app/reset-password" }],
      ["updateUser", { password: "nouveau" }],
    ]);
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
