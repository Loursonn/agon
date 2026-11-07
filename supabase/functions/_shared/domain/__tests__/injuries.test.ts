import { describe, it, expect } from "vitest";
import { exportableInjuries, toExportedInjury, INJURY_EXPORT_COLUMNS } from "../injuries";

const row = (o: Record<string, unknown>) => ({
  kind: "blessure", status: "en_cours", zone: "Genou gauche", date: "2026-10-10", return_date: null,
  injury_type: "chronique_surmenage", pain_level: 4, training_impact: "adapte",
  title: "tendinite après l'IRM", diagnosis: "tendinopathie rotulienne", treatment: "anti-inflammatoires",
  notes: "j'ai peur que ça revienne", ...o,
});

describe("toExportedInjury", () => {
  it("n'exporte que la liste blanche, jamais le texte libre", () => {
    const out = toExportedInjury(row({}));
    expect(out).toEqual({
      zone: "Genou gauche", type: "chronique_surmenage", statut: "en_cours",
      douleur: 4, impact: "adapte", debut: "2026-10-10", retour: null,
    });
    const json = JSON.stringify(out);
    for (const secret of ["IRM", "tendinopathie", "anti-inflammatoires", "peur"]) expect(json).not.toContain(secret);
  });

  it("la requête ne lit aucune colonne de texte libre", () => {
    for (const col of ["title", "diagnosis", "treatment", "notes"]) expect(INJURY_EXPORT_COLUMNS).not.toContain(col);
  });

  it("écarte les opérations et pathologies, et les valeurs inconnues", () => {
    expect(toExportedInjury(row({ kind: "pathologie" }))).toBeNull();
    expect(toExportedInjury(row({ status: "bof" }))).toBeNull();
    expect(toExportedInjury(row({ pain_level: 14, injury_type: "x", training_impact: "y", date: "10/10/2026" })))
      .toMatchObject({ douleur: null, type: null, impact: null, debut: null });
  });

  it("borne la zone saisie à la main", () => {
    expect(toExportedInjury(row({ zone: "Épaule\n`droite` " + "x".repeat(80) }))?.zone).toHaveLength(40);
  });
});

describe("exportableInjuries", () => {
  const from = "2026-10-01", to = "2026-10-28";

  it("garde les blessures en cours et celles guéries pendant la période, en cours d'abord", () => {
    const rows = [
      row({ zone: "Ancienne", status: "gueri", date: "2026-01-01", return_date: "2026-02-01" }),
      row({ zone: "Guérie en octobre", status: "gueri", date: "2026-09-01", return_date: "2026-10-05" }),
      row({ zone: "Future", date: "2026-11-15" }),
      row({ zone: "Guérie sans date de retour", status: "gueri", date: "2025-05-01", return_date: null }),
      row({ zone: "En cours", date: "2026-09-20" }),
      row({ zone: "Opération", kind: "operation" }),
    ];
    expect(exportableInjuries(rows, from, to).map((i) => i.zone)).toEqual(["En cours", "Guérie en octobre"]);
  });
});
