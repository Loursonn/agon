import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { colorTokenNames, parseTokens, scale } from "./src/styles/parseTokens";

// Toutes les valeurs viennent de src/styles/tokens.css (docs/DESIGN_TOKENS.md) :
// ce fichier ne fait que relier des noms de classes à des variables CSS.
const TOKENS = parseTokens(readFileSync(fileURLToPath(new URL("./src/styles/tokens.css", import.meta.url)), "utf8"));

/**
 * Couleur Tailwind lue dans une variable CSS. Sans modificateur (`bg-primary`) :
 * `var(--x)` tel quel. Avec (`bg-primary/90`) : `color-mix`, qui donne la même
 * couleur que l'ancien `hsl(var(--x) / 0.9)` et accepte aussi les valeurs hex.
 */
const cssColor =
  (variable: string) =>
  ({ opacityValue }: { opacityValue?: string | number }) =>
    // Les dégradés (`from-*`, `to-*`) passent un nombre (0) : d'où le String().
    opacityValue === undefined || String(opacityValue).startsWith("var(")
      ? `var(${variable})`
      : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

const fromScale = (prefix: string) =>
  Object.fromEntries(scale(TOKENS, prefix).map((k) => [`agon-${k}`, `var(--agon-${prefix}-${k})`]));

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // bg-agon-s1, text-agon-tx2, border-agon-brd, bg-agon-cat-3…
        agon: Object.fromEntries(colorTokenNames(TOKENS).map((k) => [k, cssColor(`--agon-${k}`)])),
        border: cssColor("--border"),
        input: cssColor("--input"),
        ring: cssColor("--ring"),
        background: cssColor("--background"),
        foreground: cssColor("--foreground"),
        primary: {
          DEFAULT: cssColor("--primary"),
          foreground: cssColor("--primary-foreground"),
        },
        secondary: {
          DEFAULT: cssColor("--secondary"),
          foreground: cssColor("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: cssColor("--destructive"),
          foreground: cssColor("--destructive-foreground"),
        },
        muted: {
          DEFAULT: cssColor("--muted"),
          foreground: cssColor("--muted-foreground"),
        },
        accent: {
          DEFAULT: cssColor("--accent"),
          foreground: cssColor("--accent-foreground"),
        },
        popover: {
          DEFAULT: cssColor("--popover"),
          foreground: cssColor("--popover-foreground"),
        },
        card: {
          DEFAULT: cssColor("--card"),
          foreground: cssColor("--card-foreground"),
        },
        sidebar: {
          DEFAULT: cssColor("--sidebar-background"),
          foreground: cssColor("--sidebar-foreground"),
          primary: cssColor("--sidebar-primary"),
          "primary-foreground": cssColor("--sidebar-primary-foreground"),
          accent: cssColor("--sidebar-accent"),
          "accent-foreground": cssColor("--sidebar-accent-foreground"),
          border: cssColor("--sidebar-border"),
          ring: cssColor("--sidebar-ring"),
        },
      },
      borderRadius: {
        lg: "var(--radius)", // = --agon-radius-lg
        md: "var(--agon-radius)",
        sm: "var(--agon-radius-sm)",
      },
      fontFamily: {
        display: "var(--agon-font-display)",
        ui: "var(--agon-font-ui)",
        data: "var(--agon-font-data)",
      },
      // text-agon-xs (11 px) … text-agon-3xl
      fontSize: fromScale("text"),
      // p-agon-md, gap-agon-sm, mt-agon-xl…
      spacing: fromScale("space"),
      backgroundImage: {
        "agon-or-poli": "var(--agon-or-poli)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
