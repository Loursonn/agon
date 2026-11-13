import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * `no-undef` ne voit pas les composants JSX (`<TimePick />`) : sans TypeScript,
 * un composant supprimé mais encore utilisé passait le lint et cassait l'écran
 * (PR #139 → #141). Règle locale, sans dépendance : tout `<Majuscule …>` doit
 * être déclaré ou importé dans le fichier.
 */
const agon = {
  rules: {
    "jsx-no-undef": {
      meta: { type: "problem", messages: { undef: "« {{name}} » n'est ni déclaré ni importé." } },
      create(context) {
        return {
          JSXOpeningElement(node) {
            let id = node.name;
            while (id.type === "JSXMemberExpression") id = id.object;
            if (id.type !== "JSXIdentifier" || !/^[A-Z]/.test(id.name)) return;
            for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
              if (scope.set.has(id.name)) return;
            }
            context.report({ node: id, messageId: "undef", data: { name: id.name } });
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ["dist", ".claude"] },
  {
    // Fichiers .jsx hérités : pas de typecheck, donc au moins les noms inconnus.
    files: ["src/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { agon },
    rules: {
      "no-undef": "error",
      "agon/jsx-no-undef": "error",
    },
  },
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
    // Primitives shadcn (variantes exportées à côté du composant) et fournisseur
    // de contexte + son hook : motif voulu, l'actualisation à chaud recharge la page.
    files: ["src/components/ui/button.tsx", "src/components/ui/toggle.tsx", "src/components/ui/sidebar.tsx", "src/hooks/useAuth.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Couche données (docs/COUCHE_API.md) : seul src/api/ parle à Supabase.
    // Migration terminée le 2026-11-08 : tout import direct est une erreur.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/**", "src/integrations/**", "src/**/__tests__/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/integrations/supabase/client",
          message: "Passe par src/api/<entité>.ts (docs/COUCHE_API.md).",
        }],
      }],
    },
  },
);
