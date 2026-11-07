#!/usr/bin/env node
// Garde-fou TypeScript : le projet a encore des erreurs de type héritées.
// On ne bloque pas sur leur existence, mais leur nombre ne doit jamais monter.
// Quand tu en corriges, baisse la valeur de .tsc-baseline (le script te le dit).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseline = Number(readFileSync(new URL("../.tsc-baseline", import.meta.url), "utf8").trim());

let output = "";
try {
  output = execSync("npx tsc --noEmit -p tsconfig.app.json", { encoding: "utf8", stdio: "pipe" });
} catch (err) {
  output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}

const errors = output.split("\n").filter((line) => line.includes("error TS"));
const count = errors.length;

if (count > baseline) {
  console.error(errors.join("\n"));
  console.error(`\n✗ ${count} erreurs TypeScript (référence : ${baseline}). Tu en as ajouté ${count - baseline}.`);
  console.error("  Corrige les nouvelles erreurs ci-dessus avant de pousser.");
  process.exit(1);
}

if (count < baseline) {
  console.log(`✓ ${count} erreurs TypeScript (référence : ${baseline}). Bravo : mets ${count} dans .tsc-baseline.`);
} else {
  console.log(`✓ ${count} erreurs TypeScript, stable par rapport à la référence.`);
}
