import { describe, expect, it } from "vitest";
import {
  activityRow,
  isSameOuting,
  splitNewActivities,
  SAME_OUTING_MS,
  type KnownStart,
} from "@/lib/activityImport";
import type { ParsedActivity } from "@shared/activityFiles/index.ts";

/**
 * Ce qui est vérifié ici, c'est la frontière entre « déjà là » et « nouveau ».
 * Les deux erreurs possibles n'ont pas le même coût : un doublon affiché se
 * voit et s'efface, une sortie avalée à tort disparaît du suivi sans message et
 * personne ne va la chercher. Les cas limites sont donc écrits dans ce sens.
 */

const act = (over: Partial<ParsedActivity> = {}): ParsedActivity => ({
  externalId: "fit:" + Math.random().toString(16).slice(2),
  startedAt: "2026-03-14T08:00:00.000Z",
  localDate: "2026-03-14",
  sport: "running",
  durationS: 3600,
  distanceM: 12000,
  elevationGainM: 120,
  avgHr: 148,
  maxHr: 176,
  avgPaceSPerKm: 300,
  calories: null,
  details: null,
  raw: null,
  ...over,
});

const start = (iso: string, sport: string | null = "running"): KnownStart => ({
  ms: Date.parse(iso),
  sport,
});

describe("isSameOuting", () => {
  it("reconnaît le même départ à la seconde près", () => {
    expect(isSameOuting(act(), [start("2026-03-14T08:00:00.000Z")])).toBe(true);
  });

  it("tolère le décalage d'un export GPX, qui commence au premier point GPS", () => {
    // 90 s de retard : le temps d'obtenir une position en forêt.
    expect(isSameOuting(act({ startedAt: "2026-03-14T08:01:30.000Z" }), [
      start("2026-03-14T08:00:00.000Z"),
    ])).toBe(true);
  });

  it("refuse de rapprocher deux sorties séparées de plus que la fenêtre", () => {
    const apres = new Date(Date.parse("2026-03-14T08:00:00.000Z") + SAME_OUTING_MS + 1000);
    expect(isSameOuting(act({ startedAt: apres.toISOString() }), [
      start("2026-03-14T08:00:00.000Z"),
    ])).toBe(false);
  });

  it("ne confond pas les disciplines enchaînées d'un triathlon", () => {
    /*
      Natation terminée, vélo démarré une minute plus tard. Sans le contrôle du
      sport, la partie vélo serait avalée comme doublon de la natation — et
      c'est toute une discipline qui manquerait au suivi.
    */
    expect(isSameOuting(act({ sport: "cycling", startedAt: "2026-03-14T08:01:00.000Z" }), [
      start("2026-03-14T08:00:00.000Z", "swimming"),
    ])).toBe(false);
  });

  it("rapproche quand un seul des deux sports est connu", () => {
    // Un GPX sans `<type>` décrit quand même la sortie que le FIT a nommée.
    expect(isSameOuting(act({ sport: null }), [start("2026-03-14T08:00:30.000Z", "running")]))
      .toBe(true);
  });

  it("ne rapproche rien sur une date illisible", () => {
    expect(isSameOuting(act({ startedAt: "pas une date" }), [start("2026-03-14T08:00:00.000Z")]))
      .toBe(false);
  });

  it("ignore un départ connu illisible plutôt que de tout rapprocher", () => {
    // `Date.parse` d'une valeur abîmée rend NaN, et toute comparaison avec NaN
    // est fausse : sans le contrôle explicite, `Math.abs(NaN) > seuil` est faux
    // aussi, donc la ligne serait traitée comme un doublon.
    expect(isSameOuting(act(), [{ ms: Number.NaN, sport: "running" }])).toBe(false);
  });

  it("n'a rien à rapprocher sur un historique vide", () => {
    expect(isSameOuting(act(), [])).toBe(false);
  });
});

describe("splitNewActivities", () => {
  it("laisse passer ce qui est inconnu", () => {
    const a = act({ externalId: "fit:a" });
    const b = act({ externalId: "fit:b", startedAt: "2026-03-15T08:00:00.000Z" });

    const split = splitNewActivities([a, b], new Set(), []);

    expect(split.toInsert).toEqual([a, b]);
    expect(split.duplicates).toBe(0);
    expect(split.alreadyKnown).toBe(0);
  });

  it("compte à part le fichier déjà importé et la sortie déjà connue", () => {
    const deja = act({ externalId: "fit:deja" });
    const memeSortie = act({ externalId: "gpx:autre", startedAt: "2026-03-14T08:00:45.000Z" });
    const neuf = act({ externalId: "fit:neuf", startedAt: "2026-03-20T07:00:00.000Z" });

    const split = splitNewActivities(
      [deja, memeSortie, neuf],
      new Set(["fit:deja"]),
      [start("2026-03-14T08:00:00.000Z")],
    );

    expect(split.duplicates).toBe(1);
    expect(split.alreadyKnown).toBe(1);
    expect(split.toInsert).toEqual([neuf]);
  });

  it("l'empreinte prime sur le rapprochement temporel", () => {
    // Même fichier redéposé : il est compté comme doublon, pas comme « déjà
    // connue par ailleurs ». Les deux lignes du compte rendu n'appellent pas la
    // même conclusion pour l'athlète.
    const a = act({ externalId: "fit:a" });

    const split = splitNewActivities([a], new Set(["fit:a"]), [start("2026-03-14T08:00:00.000Z")]);

    expect(split.duplicates).toBe(1);
    expect(split.alreadyKnown).toBe(0);
  });

  it("repère le FIT et le GPX de la même sortie déposés ensemble", () => {
    /*
      Le cas que la base ne peut pas voir : deux fichiers aux octets différents,
      donc deux empreintes différentes, et aucun des deux n'est encore en base.
      C'est l'un par rapport à l'autre qu'ils font doublon.
    */
    const fit = act({ externalId: "fit:course" });
    const gpx = act({ externalId: "gpx:course", startedAt: "2026-03-14T08:00:20.000Z" });

    const split = splitNewActivities([fit, gpx], new Set(), []);

    expect(split.toInsert).toEqual([fit]);
    expect(split.alreadyKnown).toBe(1);
  });

  it("garde deux sorties du même jour à des heures différentes", () => {
    // Double séance : course le matin, vélo le soir. Les avaler ferait
    // disparaître la moitié du volume de la journée.
    const matin = act({ externalId: "fit:matin", startedAt: "2026-03-14T06:30:00.000Z" });
    const soir = act({
      externalId: "fit:soir",
      startedAt: "2026-03-14T17:30:00.000Z",
      sport: "cycling",
    });

    const split = splitNewActivities([matin, soir], new Set(), []);

    expect(split.toInsert).toHaveLength(2);
    expect(split.alreadyKnown).toBe(0);
  });

  it("enrichit les jeux de comparaison fournis", () => {
    // L'appelant les réutilise pour les lots suivants : un hook qui insère par
    // tranches doit voir les tranches précédentes.
    const ids = new Set<string>();
    const starts: KnownStart[] = [];

    splitNewActivities([act({ externalId: "fit:a" })], ids, starts);

    expect(ids.has("fit:a")).toBe(true);
    expect(starts).toHaveLength(1);
  });
});

describe("activityRow", () => {
  it("transpose les champs vers les colonnes de provider_activities", () => {
    const row = activityRow("athlete-1", act({ externalId: "fit:a" }));

    expect(row).toMatchObject({
      athlete_id: "athlete-1",
      source: "file_import",
      external_id: "fit:a",
      local_date: "2026-03-14",
      sport: "running",
      duration_s: 3600,
      distance_m: 12000,
      elevation_gain_m: 120,
      avg_hr: 148,
      max_hr: 176,
      avg_pace_s_per_km: 300,
    });
  });

  it("n'envoie pas ai_allowed", () => {
    /*
      La colonne est posée par un déclencheur depuis `data_source_policies`.
      L'envoyer depuis le client serait au mieux ignoré, et au pire donnerait
      l'illusion que la décision se prend ici.
    */
    expect("ai_allowed" in activityRow("athlete-1", act())).toBe(false);
  });

  it("transmet les valeurs absentes telles quelles", () => {
    // `null` et non `0` : une allure absente affichée à 0 min/km à côté de
    // vraies mesures aurait le même poids visuel qu'elles.
    const row = activityRow("athlete-1", act({ avgPaceSPerKm: null, calories: null, avgHr: null }));

    expect(row.avg_pace_s_per_km).toBeNull();
    expect(row.calories).toBeNull();
    expect(row.avg_hr).toBeNull();
  });
});
