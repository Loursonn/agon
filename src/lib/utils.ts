import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { TOKENS } from "@/lib/theme";
import { scale } from "@/styles/parseTokens";

// tailwind-merge ne connaît pas les échelles de src/styles/tokens.css : sans cela il
// prendrait `text-agon-xs` pour une couleur et le supprimerait devant `text-agon-tx`.
const agon = (prefix: string) => scale(TOKENS, prefix).map((k) => `agon-${k}`);
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: { "font-size": [{ text: agon("text") }] },
    theme: { spacing: agon("space") },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
