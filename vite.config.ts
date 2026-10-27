import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "localhost",
    port: 5173,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
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
    // Les worktrees Claude contiennent une copie du repo : sans exclusion,
    // chaque test tourne deux fois.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
}));
