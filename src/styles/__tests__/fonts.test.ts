import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import fontsCss from "@/styles/fonts.css?raw";
import indexCss from "@/index.css?raw";

/*
 * AIPD A8 : les polices sont servies par le site, jamais par Google Fonts (l'adresse IP de
 * chaque visiteur partait chez Google à chaque chargement).
 */
const root = path.resolve(__dirname, "../../..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

describe("polices servies localement (AIPD A8)", () => {
  it("aucun appel à Google Fonts dans l'app, la page d'accueil ni le service worker", () => {
    for (const src of [indexCss, fontsCss, read("index.html"), read("vite.config.ts")]) {
      expect(src).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it("index.css charge src/styles/fonts.css", () => {
    expect(indexCss).toContain('@import "./styles/fonts.css";');
  });

  it("mêmes familles qu'avant, Archivo avec ses axes graisse et largeur", () => {
    const families = new Set([...fontsCss.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]));
    expect([...families].sort()).toEqual(["Archivo", "Geist", "Geist Mono"]);
    expect(fontsCss).toMatch(/font-family: 'Archivo';[^}]*font-stretch: 62% 125%/);
    for (const block of fontsCss.split("@font-face").slice(1)) {
      expect(block).toMatch(/font-weight: 100 900/);
      expect(block).toMatch(/font-style: normal/);
    }
  });

  it("chaque fichier de police référencé existe (paquets @fontsource-variable installés)", () => {
    const urls = [...fontsCss.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toMatch(/^@fontsource-variable\/[a-z-]+\/files\/[a-z0-9-]+\.woff2$/);
      expect(fs.existsSync(path.join(root, "node_modules", u)), u).toBe(true);
    }
  });
});
