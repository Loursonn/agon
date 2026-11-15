/**
 * Mesure du temps de chargement (premier écran utile) d'un build servi en
 * local et branché sur la base de TEST agon-test. Comptes démo uniquement.
 *
 *   npx vite build --mode staging
 *   node scripts/perf/serveur-h2.mjs dist 4181        (affiche --spki …)
 *   node scripts/perf/mesure-chargement.mjs --spki <empreinte> [--runs 3] [--detail] [--only athlete|coach|fiche]
 *
 * Connexion : lien magique généré par la clé service de .env.staging puis
 * vérifié ici ; la session est posée dans le localStorage avant le chargement
 * (aucun mot de passe). Navigateur : Chrome installé (channel "chrome").
 *
 * Scénarios (médiane de --runs passages) :
 *  - « froid » : rien en cache (ni HTTP, ni service worker, ni IndexedDB),
 *    seule la session est présente — première ouverture sur l'appareil.
 *  - « chaud » : 2ᵉ ouverture du même navigateur (fichiers en cache HTTP,
 *    cache React Query persisté) — cas courant d'un athlète qui rouvre l'app.
 * Service worker bloqué : ses requêtes échapperaient au ralenti réseau.
 * Réseau « Fast 3G » DevTools (562,5 ms de latence, 1,44 Mb/s descendant),
 * CPU ralenti ×4 pour le téléphone.
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const APP = argVal("--app", "https://localhost:4181");
const RUNS = Number(argVal("--runs", "3"));
const ONLY = argVal("--only", "");

const env = Object.fromEntries(
  fs.readFileSync(".env.staging", "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const URL_ = env.VITE_SUPABASE_URL;
if (!/djobcxoohnphozaiyqaa/.test(URL_)) { console.error("✗ .env.staging ne vise pas agon-test"); process.exit(1); }
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const STORAGE_KEY = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;

async function sessionFor(email) {
  const gen = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (gen.error) throw gen.error;
  const anon = createClient(URL_, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.verifyOtp({ token_hash: gen.data.properties.hashed_token, type: "magiclink" });
  if (error) throw error;
  return data.session;
}

const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024 / 8) * 0.9, uploadThroughput: (750 * 1024 / 8) * 0.9 };

/** Un passage : renvoie le temps jusqu'au marqueur et ce qui a été chargé avant. */
async function run(ctx, { path, ready, throttle, cpu }) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (throttle) await cdp.send("Network.emulateNetworkConditions", throttle);
  if (cpu) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const reqs = new Map();
  let jsBytes = 0, jsCount = 0, t0 = 0;
  cdp.on("Network.requestWillBeSent", (e) => { reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, start: e.timestamp }); });
  cdp.on("Network.loadingFinished", (e) => {
    const r = reqs.get(e.requestId); if (!r) return;
    r.end = e.timestamp; r.bytes = e.encodedDataLength;
  });
  const navStart = Date.now();
  await page.goto(APP + path, { waitUntil: "commit" });
  const first = [...reqs.values()][0]; t0 = first?.start ?? 0;
  await page.waitForFunction(ready, null, { timeout: 120_000, polling: 100 });
  const ms = Date.now() - navStart;
  const tReady = t0 + ms / 1000;
  const before = [...reqs.values()].filter((r) => r.start <= tReady);
  for (const r of before) if (r.type === "Script" && r.end) { jsBytes += r.bytes; jsCount++; }
  const sb = before.filter((r) => r.url.includes(".supabase.co"));
  const fullKey = (r) => r.method + " " + r.url.replace(URL_, "");
  const keyOf = (r) => fullKey(r).slice(0, 160);
  // Doublons : même méthode et même URL complète (préflights CORS OPTIONS exclus).
  const seen = new Map(); for (const r of sb) if (r.method !== "OPTIONS") seen.set(fullKey(r), (seen.get(fullKey(r)) || 0) + 1);
  const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([u, n]) => [u.slice(0, 110), n]);
  const sbGets = sb.filter((r) => r.method !== "OPTIONS");
  const detail = sb.map((r) => `${((r.start - t0) * 1000).toFixed(0).padStart(6)} → ${r.end ? ((r.end - t0) * 1000).toFixed(0).padStart(6) : "     …"}  ${keyOf(r)}`);
  const chunks = before.filter((r) => r.type === "Script").map((r) => `${((r.start - t0) * 1000).toFixed(0).padStart(6)} → ${r.end ? ((r.end - t0) * 1000).toFixed(0).padStart(6) : "     …"}  ${r.url.replace(APP, "")} ${((r.bytes || 0) / 1024).toFixed(0)} kB`);
  await page.close();
  return { ms, jsKB: jsBytes / 1024, jsCount, sbCount: sbGets.length, dups, detail, chunks };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function scenario(browser, name, { email, viewport, mobile, path, ready, cpu }) {
  const session = await sessionFor(email);
  const out = { name, froid: [], chaud: [] };
  for (let i = 0; i < RUNS; i++) {
    // froid : contexte neuf, rien en cache.
    // Service worker bloqué dans les deux scénarios : ses requêtes échappent au
    // ralenti réseau de Chrome (CDP), ce qui fausserait la mesure. Le cache
    // HTTP (fichiers immuables) joue son rôle pour le scénario « chaud ».
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1, serviceWorkers: "block" });
    await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* */ } }, [STORAGE_KEY, JSON.stringify(session)]);
    out.froid.push(await run(ctx, { path, ready, throttle: FAST_3G, cpu }));
    await ctx.close();
    // chaud : 1ʳᵉ ouverture sans ralenti (remplit le cache HTTP et le cache
    // React Query persisté), puis mesure.
    const ctx2 = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1, serviceWorkers: "block" });
    await ctx2.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* */ } }, [STORAGE_KEY, JSON.stringify(session)]);
    const p = await ctx2.newPage();
    await p.goto(APP + path); await p.waitForFunction(ready, null, { timeout: 120_000 });
    await p.waitForTimeout(4000); // écriture du cache persisté (IndexedDB)
    await p.close();
    out.chaud.push(await run(ctx2, { path, ready, throttle: FAST_3G, cpu }));
    await ctx2.close();
  }
  for (const k of ["froid", "chaud"]) {
    const rs = out[k];
    const m = median(rs.map((r) => r.ms));
    const r = rs.find((x) => x.ms === m);
    console.log(`\n### ${name} — ${k} : ${m} ms (passages : ${rs.map((x) => x.ms).join(", ")})`);
    console.log(`JS avant l'écran : ${r.jsCount} fichiers, ${r.jsKB.toFixed(0)} kB transférés · requêtes Supabase (hors préflights) : ${r.sbCount}${r.dups.length ? ` · doublons : ${r.dups.map(([u, n]) => `${n}× ${u}`).join(" | ")}` : ""}`);
    if (args.includes("--detail")) { console.log("JS :\n" + r.chunks.join("\n")); console.log("Supabase :\n" + r.detail.join("\n")); }
  }
  return out;
}

// Marqueurs « premier écran utile » (données affichées, pas seulement le squelette).
const READY = {
  // Aujourd'hui : carte wellness et semaine remplies (données arrivées).
  athlete: () => { const t = document.body.innerText; return /wellness du jour/i.test(t) && /\d+ \/ \d+ faites/i.test(t) && !document.querySelector('[style*="spin"]'); },
  // Liste : la ligne de Léa est affichée.
  coach: () => { const t = document.body.innerText; return /mes athlètes/i.test(t) && /Léa Démo/i.test(t) && !document.querySelector('[style*="spin"]'); },
  // Fiche : planning de la semaine affiché (le squelette attend l'état athlète).
  fiche: () => { const t = document.body.innerText; return /Léa Démo/i.test(t) && /semaine \d+/i.test(t) && /\bLUN\b/i.test(t) && !document.querySelector('[style*="spin"]'); },
};

// Serveur local HTTP/2 à certificat auto-signé (scripts/perf/serveur-h2.mjs) :
// son empreinte est déclarée à Chrome, sinon il ne met rien en cache.
const SPKI = argVal("--spki", "");
const browser = await chromium.launch({ channel: "chrome", headless: true, args: SPKI ? [`--ignore-certificate-errors-spki-list=${SPKI}`] : [] });
try {
  const lea = (await sessionFor("lea.demo@agon-demo.fr")).user;
  if (!ONLY || ONLY === "athlete")
    await scenario(browser, "Athlète · ouverture de l'app → Aujourd'hui (390 px, Fast 3G, CPU ×4)", { email: "lea.demo@agon-demo.fr", viewport: { width: 390, height: 844 }, mobile: true, path: "/", ready: READY.athlete, cpu: 4 });
  if (!ONLY || ONLY === "coach")
    await scenario(browser, "Coach · liste athlètes (1440 px, Fast 3G)", { email: "demo.coach@agon-demo.fr", viewport: { width: 1440, height: 900 }, mobile: false, path: "/coach/athletes", ready: READY.coach });
  if (!ONLY || ONLY === "fiche")
    await scenario(browser, "Coach · fiche Léa / planning (1440 px, Fast 3G)", { email: "demo.coach@agon-demo.fr", viewport: { width: 1440, height: 900 }, mobile: false, path: `/coach/athletes/${lea.id}/planning`, ready: READY.fiche });
} finally {
  await browser.close();
}
