// Lance chaque script supabase/tests/*.sql contre une base LOCALE (CI : `supabase start`),
// lit ses lignes de résultat et sort en erreur si un cas échoue.
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//     node supabase/tests/ci/run.mjs [fichier.sql …]
//
// Refuse toute URL qui n'est pas locale : ces scripts ne doivent jamais viser la prod par ce chemin.
//
// Formats reconnus (les scripts ont été écrits pour être lus à l'œil) :
//   - colonne `ok` booléenne (t_res) : chaque ligne doit valoir true ;
//   - colonne `ok` texte (pgTAP) : « not ok … » échoue ; `finish()` « Looks like you failed » échoue ;
//   - colonnes `k`, `v` : la valeur attendue est entre parenthèses à la fin du libellé
//     (« … (0) », « … (true) », « … (>0) ») ; « refusé (OK) » / « ACCEPTÉ (KO) » se lisent tels quels ;
//   - fiches_rls : le bloc lève « RESULTS ok=N ko=M » ; il faut ko=0.
//   - aucune ligne : RAISE NOTICE « … N / N » en fin de bloc DO (une exception = un échec).
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1", "postgres", "db"].includes(host)) {
  console.error(`Refus : ${host} n'est pas une base locale.`);
  process.exit(2);
}

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const skip = new Set((process.env.SQL_TESTS_SKIP ?? "").split(",").filter(Boolean));
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort().map(f => path.join(dir, f));

// Échecs connus et documentés : supabase/tests/ci/known_failures.txt
// (« fichier.sql|début du libellé du cas|raison », « * » = fichier entier, dernier recours).
const knownPath = path.join(path.dirname(new URL(import.meta.url).pathname), "known_failures.txt");
const known = fs.existsSync(knownPath)
  ? fs.readFileSync(knownPath, "utf8").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
      .map(l => { const [file, prefix, ...why] = l.split("|"); return { file: file.trim(), prefix: prefix.trim(), why: why.join("|").trim() }; })
  : [];

// Une valeur attendue (texte entre parenthèses du libellé) comparée à une valeur lue.
function matchExpected(exp, val) {
  exp = exp.replace(/\battendue?s?\b/g, "").trim();
  if (exp === val) return true;
  // concat_ws / || d'un booléen donne « t » / « f » : même valeur que « true » / « false ».
  const tf = x => x.split(" / ").map(p => p === "t" ? "true" : p === "f" ? "false" : p).join(" / ");
  if (tf(exp) === tf(val)) return true;
  // « (true, ou n/a) » : plusieurs réponses admises
  if (/\bou\b/.test(exp)) {
    return exp.split(/,?\s+ou\s+/).some(alt => alt.trim() && matchExpected(alt.trim(), val));
  }
  if (exp === "∅") return val === "" || val === "∅" || val === "{}" || val === "[]" || val === "0";
  const gt = /^>\s*(-?\d+(?:\.\d+)?)$/.exec(exp);
  if (gt) return Number(val) > Number(gt[1]);
  const ge = /^>=\s*(-?\d+(?:\.\d+)?)$/.exec(exp);
  if (ge) return Number(val) >= Number(ge[1]);
  // « date compacte 20990102 », « nutrition: none, 0 », « 0 autre lien », « profil perso, déjà permis
  // avant » : l'attendu est l'un des mots du commentaire (sauf liste « a / b », jugée en entier).
  if (!exp.includes("/") && exp.split(/[\s,:]+/).filter(Boolean).includes(val)) return true;
  // « chemin médical athlète (write) » → true : parenthèse descriptive, pas une attente.
  if (val === "true" && !/\d|\btrue\b|\bfalse\b|∅|\//.test(exp)) return true;
  return false;
}

// Valeur attendue dans le libellé « … (attendu) » comparée à v.
function judgeKV(k, v) {
  const val = v == null ? "" : String(v).trim();
  // « refusé (OK) 42501 » : le script a déjà jugé, l'SQLSTATE peut suivre.
  if (/\(OK\)/.test(val)) return true;
  if (/\(KO\)/.test(val)) return false;
  const groups = [...String(k).matchAll(/\(([^()]*)\)/g)].map(g => g[1]);
  const m = /\(([^()]*)\)\s*$/.exec(String(k));
  // Libellé sans attente : ligne d'information (« B2 domaines app_data visibles → nutrition,… »),
  // échoue seulement si elle vaut faux ou rien.
  if (!m) return v != null && !["false", "f", ""].includes(val.toLowerCase());
  if (matchExpected(m[1], val)) return true;
  // « … de X (∅) / de Y (wellness) » → valeur « ∅ / wellness » : une attente par morceau.
  const parts = val.split(" / ");
  if (groups.length > 1 && parts.length === groups.length) {
    return groups.every((g, i) => matchExpected(g, parts[i].trim()));
  }
  return false;
}

function judgeResult(res, fails) {
  const names = (res.fields ?? []).map(f => f.name);
  let n = 0;
  if (names.includes("ok")) {
    for (const row of res.rows) {
      n++;
      const ok = row.ok;
      const pass = typeof ok === "string" ? !/^not ok/.test(ok) : ok === true;
      if (!pass) fails.push({ label: String(row.name ?? row.description ?? ok ?? ""), text: JSON.stringify(row) });
    }
  } else if (names.includes("k") && names.includes("v")) {
    for (const row of res.rows) {
      n++;
      if (!judgeKV(row.k, row.v)) fails.push({ label: String(row.k), text: `${row.k} → ${row.v}` });
    }
  } else if (names.includes("finish")) {
    for (const row of res.rows) if (/failed|Looks like/.test(String(row.finish))) fails.push({ label: "", text: String(row.finish) });
  }
  return n;
}

let total = 0;
let failedFiles = 0;
let knownCases = 0;
let skippedKnown = 0;
for (const file of files) {
  const name = path.basename(file);
  if (skip.has(name)) { console.log(`- ${name} : ignoré (SQL_TESTS_SKIP)`); continue; }
  const knownHere = known.filter(x => x.file === name);
  const wholeFile = knownHere.find(x => x.prefix === "*");
  if (wholeFile) { skippedKnown++; console.log(`- ${name} : ignoré (connu) — ${wholeFile.why}`); continue; }
  const sql = fs.readFileSync(file, "utf8");
  let client = new pg.Client({ connectionString: url });
  // Connexion coupée par le serveur (plantage d'un processus) : on note l'échec et on continue.
  let lost = null;
  client.on("error", e => { lost = e; });
  // Après un plantage, Postgres redémarre (recovery) : on attend jusqu'à 60 s.
  let connErr = null;
  for (let i = 0; i < 60; i++) {
    try { await client.connect(); connErr = null; break; } catch (e) {
      connErr = e;
      if (!/recovery mode|not accepting|ECONNREFUSED|starting up/.test(e.message)) break;
      await new Promise(r => setTimeout(r, 1000));
      client = new pg.Client({ connectionString: url });
      client.on("error", e2 => { lost = e2; });
    }
  }
  if (connErr) { const e = connErr;
    failedFiles++;
    console.log(`✗ ${name} : connexion impossible (${e.message})`);
    continue;
  }
  const notices = [];
  client.on("notice", m => notices.push(m.message));
  const fails = [];
  let cases = 0;
  try {
    // Toujours dans une transaction annulée, même pour les scripts écrits pour être enveloppés à la main.
    const out = await client.query(`BEGIN;\n${sql}\n;ROLLBACK;`);
    for (const res of Array.isArray(out) ? out : [out]) cases += judgeResult(res, fails);
    // Scripts sans ligne de résultat : un bloc DO lève une exception au premier cas en échec
    // et finit par RAISE NOTICE '… : N / N'. Pas d'erreur + « N / N » = N cas verts.
    if (cases === 0) {
      const tally = notices.map(n => /(\d+)\s*\/\s*(\d+)\s*$/.exec(n)).find(Boolean);
      if (tally && tally[1] === tally[2] && Number(tally[1]) > 0) cases = Number(tally[1]);
      else fails.push({ label: "", text: "aucune ligne de résultat lue" });
    }
  } catch (e) {
    const m = /RESULTS ok=(\d+) ko=(\d+) \| (.*)/s.exec(e.message);
    if (m) {
      cases = Number(m[1]) + Number(m[2]);
      if (m[2] !== "0") fails.push({ label: "", text: m[3] });
    } else {
      fails.push({ label: "", text: `erreur SQL : ${e.message}${e.where ? ` (${e.where.split("\n")[0]})` : ""}` });
    }
  } finally {
    if (lost) fails.push({ label: "", text: `connexion perdue : ${lost.message}` });
    try { await client.query("ROLLBACK"); } catch { /* rien d'ouvert */ }
    try { await client.end(); } catch { /* déjà fermée */ }
  }
  total += cases;
  const isKnown = f => knownHere.find(x => x.prefix && f.label.startsWith(x.prefix));
  const real = fails.filter(f => !isKnown(f));
  const expected = fails.filter(f => isKnown(f));
  knownCases += expected.length;
  if (real.length) {
    failedFiles++;
    console.log(`✗ ${name} : ${real.length} échec(s) sur ${cases}`);
    for (const f of real) console.log(`    ${f.text.slice(0, 300)}`);
  } else {
    console.log(`✓ ${name} : ${cases - expected.length} cas${expected.length ? `, ${expected.length} ignoré(s) (connu)` : ""}`);
  }
  for (const f of expected) console.log(`    ignoré (connu) : ${f.label} — ${isKnown(f).why}`);
}
console.log(`\n${files.length - failedFiles - skippedKnown}/${files.length} fichiers verts, ${total - knownCases} cas verts,`
  + ` ${knownCases} cas et ${skippedKnown} fichier(s) ignorés (connus).`);
process.exit(failedFiles ? 1 : 0);
