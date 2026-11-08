import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// Version du build : invalide le cache hors ligne persisté (src/lib/offline)
// après chaque déploiement, la forme des données pouvant avoir changé.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

export default defineConfig(() => ({
  server: {
    host: "localhost",
    port: 5173,
    hmr: {
      overlay: false,
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    // App installable + ouverture hors ligne. Le SW précache l'app seulement ;
    // les données passent par le cache React Query persisté, jamais par le SW.
    // Enregistré par `UpdatePrompt` (src/lib/pwa.ts), pas en `npm run dev`,
    // pas sous Capacitor.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // Remplace l'ancien public/manifest.webmanifest (même URL, lien déjà dans index.html).
      manifest: {
        id: "/",
        name: "Agon",
        short_name: "Agon",
        description: "Agon — Préparation physique",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // src/lib/theme.ts : C.bg
        background_color: "#0E0C0A",
        theme_color: "#0E0C0A",
        icons: [
          { src: "/brand/agon-app-icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/brand/agon-app-icon-512.png", sizes: "512x512", type: "image/png" },
          // Le symbole occupe ~50 % de l'icône : il reste dans la zone sûre du masque.
          { src: "/brand/agon-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Shell + tous les chunks lazy : une page jamais ouverte s'affiche hors ligne.
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,woff2,webmanifest}"],
        // Le worker PDF (1 Mo) ne sert qu'à afficher une fiche PDF, elle-même
        // téléchargée depuis Supabase : inutile hors ligne.
        globIgnores: ["**/pdf.worker*"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/\.well-known\//],
        cleanupOutdatedCaches: true,
        // Pas de skipWaiting / clientsClaim : la nouvelle version attend le clic
        // « Recharger » (jamais de rechargement en pleine séance).
        runtimeCaching: [
          {
            // Supabase (REST, Auth, Storage, Edge Functions) : jamais en cache SW.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co") || url.pathname.startsWith("/functions/v1/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Les décodeurs de fichiers d'activité vivent sous `supabase/functions/`
      // parce que `supabase functions deploy` ne met en paquet que ce dossier.
      // Le navigateur les lit depuis là plutôt que d'en garder une copie :
      // deux parseurs du même format divergent toujours, et c'est alors
      // l'écart entre un import manuel et une synchronisation automatique du
      // *même* fichier qui devient impossible à expliquer.
      //
      // `activityFiles/`, `coros.ts` et `mcp.ts` sont sans dépendance, donc
      // portables. `auth.ts` importe depuis esm.sh et s'appuie sur `Deno` :
      // joignable par cet alias, mais il casserait au build.
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  test: {
    environment: "jsdom",
    // Requis par @testing-library/jest-dom, qui appelle expect.extend au chargement.
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Vitest vide les fichiers CSS importés, même en `?raw`. src/lib/theme.ts lit
    // src/styles/tokens.css en texte brut : on laisse passer ces imports-là seulement.
    css: { include: [/\.css\?raw$/] },
    // Les worktrees Claude contiennent une copie du repo : sans exclusion,
    // chaque test tourne deux fois.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
}));
