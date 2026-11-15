/**
 * Sert un build (dossier dist) en HTTP/2 + gzip, comme Vercel, pour
 * scripts/perf/mesure-chargement.mjs. En HTTP/1.1 (vite preview), Chrome
 * n'ouvre que 6 connexions : la centaine de petits fichiers JS de l'app
 * ferait la queue et la mesure serait faussée.
 *
 *   node scripts/perf/serveur-h2.mjs dist 4181
 *   → affiche l'empreinte à passer à la mesure : --spki <empreinte>
 *
 * Certificat auto-signé créé une fois dans le dossier temporaire (openssl).
 */
import http2 from "node:http2";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execSync } from "node:child_process";

const root = path.resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || 4181);
const dir = path.join(os.tmpdir(), "agon-perf-cert");
fs.mkdirSync(dir, { recursive: true });
const key = path.join(dir, "key.pem"), cert = path.join(dir, "cert.pem");
if (!fs.existsSync(cert)) {
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${key}" -out "${cert}" -days 30 -subj "/CN=localhost"`, { stdio: "ignore" });
}
const spki = execSync(`openssl x509 -in "${cert}" -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`).toString().trim();

const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const gz = new Map();
http2.createSecureServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert), allowHTTP1: true }, (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "https://x").pathname);
  let f = path.join(root, p);
  // Application à page unique : toute URL inconnue renvoie index.html.
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
  const headers = {
    "content-type": types[path.extname(f)] || "application/octet-stream",
    "cache-control": p.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  };
  if (/gzip/.test(req.headers["accept-encoding"] || "") && /text|javascript|json|svg|manifest/.test(headers["content-type"])) {
    if (!gz.has(f)) gz.set(f, zlib.gzipSync(fs.readFileSync(f)));
    res.writeHead(200, { ...headers, "content-encoding": "gzip" });
    res.end(gz.get(f));
  } else {
    res.writeHead(200, headers);
    res.end(fs.readFileSync(f));
  }
}).listen(port, "127.0.0.1", () => console.log(`https://localhost:${port} (${root})\n--spki ${spki}`));
