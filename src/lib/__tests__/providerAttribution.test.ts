/**
 * Attribution « Garmin [modèle] » : exigée par les conditions Garmin partout où
 * une donnée Garmin est affichée ou exportée.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { provenanceFallback, providerAttribution } from "@/lib/activityDisplay";
import { withAttribution } from "@/lib/dataExport";

describe("providerAttribution", () => {
  it("nomme la marque et le modèle", () => {
    expect(providerAttribution("garmin", "Forerunner 265")).toBe("Garmin Forerunner 265");
    expect(providerAttribution("coros", "PACE 3")).toBe("COROS PACE 3");
  });

  it("ne répète pas la marque quand le modèle la contient déjà", () => {
    expect(providerAttribution("garmin", "Garmin fēnix 8")).toBe("Garmin fēnix 8");
  });

  it("écrit la marque seule quand l'appareil est inconnu, sans en inventer un", () => {
    expect(providerAttribution("garmin", null)).toBe("Garmin");
    expect(providerAttribution("garmin", "  ")).toBe("Garmin");
  });

  it("garde le libellé des sources qui ne sont pas des appareils", () => {
    expect(providerAttribution("file_import", "Forerunner 265")).toBe("Fichier importé");
    expect(providerAttribution("manual")).toBe("Saisie manuelle");
  });
});

describe("provenanceFallback", () => {
  it("dit d'où viennent les chiffres d'une activité Garmin", () => {
    expect(provenanceFallback("garmin", "Edge 840")).toBe(
      "Chiffres transmis par Garmin Connect (Garmin Edge 840), sans recalcul.",
    );
  });

  it("garde la phrase du fichier pour un import", () => {
    expect(provenanceFallback("file_import")).toContain("fichier");
  });
});

describe("export RGPD", () => {
  it("ajoute l'attribution aux activités et journées de montre", () => {
    const [a] = withAttribution("provider_activities", [{ source: "garmin", device_name: "Forerunner 965", id: "1" }]) as Array<Record<string, unknown>>;
    expect(a.attribution).toBe("Garmin Forerunner 965");
    expect(a.id).toBe("1");
    const [d] = withAttribution("provider_dailies", [{ source: "garmin", day: "2026-11-07" }]) as Array<Record<string, unknown>>;
    expect(d.attribution).toBe("Garmin");
  });

  it("ne touche pas les autres tables", () => {
    const rows = [{ source: "garmin" }];
    expect(withAttribution("workout_logs", rows)).toBe(rows);
  });
});
