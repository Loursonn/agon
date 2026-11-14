import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Apps App Store / Play Store : l'app web (build Vite dans `dist/`) empaquetée
 * telle quelle. Voir docs/MOBILE_CAPACITOR.md.
 *
 * `appId` est définitif une fois publié (choisi par Hugo le 2026-11-12).
 */
const config: CapacitorConfig = {
  appId: "com.agontraining.app",
  appName: "Agon",
  webDir: "dist",
  // src/lib/theme.ts : C.bg (évite un flash blanc au lancement).
  backgroundColor: "#0E0C0A",
  server: {
    // Origine de l'app sur Android : https://localhost (défaut, rappelé ici
    // parce qu'en changer efface localStorage et IndexedDB, donc la session
    // et les saisies hors ligne en attente).
    androidScheme: "https",
  },
};

export default config;
