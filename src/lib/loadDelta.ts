/** Écart de charge avec la dernière fois : « +5 kg », « = », null si incomparable. */
export function loadDelta(kg: string, prev: string | undefined, unit: string): string | null {
  const a = Number(String(kg).replace(",", "."));
  const m = prev?.match(/^\s*([\d.,]+)/);
  const b = m ? Number(m[1].replace(",", ".")) : NaN;
  if (!kg || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.round((a - b) * 100) / 100;
  if (d === 0) return "=";
  const u = unit === "kg" ? " kg" : unit === "%" ? " %" : "";
  return `${d > 0 ? "+" : "−"}${String(Math.abs(d)).replace(".", ",")}${u}`;
}
