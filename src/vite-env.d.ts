/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Identifiant du build (commit Vercel ou horodatage local) : vite.config.ts. */
declare const __APP_BUILD_ID__: string;
/** Millisecondes epoch du build, identique à `builtAt` de /version.json. */
declare const __APP_BUILD_TIME__: number;
