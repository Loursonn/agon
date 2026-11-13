/** Ancre d'une section légale depuis son titre (« 3. Vos engagements » → « vos-engagements »). */
export function legalSlug(title: string): string {
  return title
    .replace(/^\d+\.\s*/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
