import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".claude"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Couche données (docs/COUCHE_API.md) : seul src/api/ parle à Supabase.
    // Avertissement tant que la migration est en cours ; une entité migrée
    // ajoute ses fichiers à la liste en « error » ci-dessous.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/**", "src/integrations/**", "src/**/__tests__/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        paths: [{
          name: "@/integrations/supabase/client",
          message: "Passe par src/api/<entité>.ts (docs/COUCHE_API.md).",
        }],
      }],
    },
  },
);
