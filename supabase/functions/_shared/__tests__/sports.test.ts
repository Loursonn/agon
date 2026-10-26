/**
 * Le vocabulaire des sports.
 *
 * L'enjeu tient en un test : le même entraînement importé en FIT, en TCX et en
 * GPX doit donner le *même* slug. Sinon une statistique « par sport » compte
 * deux sports là où il y en a un, et l'athlète ne peut pas savoir lequel est le
 * bon.
 */
import { describe, expect, it } from "vitest";
import { sportFromFitCode, sportFromLabel } from "../activityFiles/sports";

describe("accord entre les formats", () => {
  it("donne le même slug pour une course, quel que soit le format", () => {
    expect(sportFromFitCode(1)).toBe("running");
    // TCX : attribut `Sport="Running"`. GPX de Strava : `<type>running</type>`.
    expect(sportFromLabel("Running")).toBe("running");
    expect(sportFromLabel("running")).toBe("running");
    expect(sportFromLabel("Trail Running")).toBe("running");
  });

  it("donne le même slug pour du vélo, quel que soit le vocabulaire", () => {
    expect(sportFromFitCode(2)).toBe("cycling");
    expect(sportFromLabel("Biking")).toBe("cycling");
    expect(sportFromLabel("Ride")).toBe("cycling");
    expect(sportFromLabel("VirtualRide")).toBe("cycling");
    expect(sportFromLabel("mountain_bike_ride")).toBe("cycling");
  });
});

describe("sportFromFitCode", () => {
  it("rend null sans code", () => {
    expect(sportFromFitCode(null)).toBeNull();
    expect(sportFromFitCode(undefined)).toBeNull();
  });

  it("conserve un code inconnu plutôt que de l'effacer", () => {
    // `sport_200` se corrige en ajoutant une ligne au tableau ; `null` ne dit
    // pas qu'il manquait quelque chose.
    expect(sportFromFitCode(200)).toBe("sport_200");
  });
});

describe("sportFromLabel", () => {
  it("rend null quand le fichier dit lui-même ne pas savoir", () => {
    // `Other` est la seule valeur TCX pour « autre » : répéter l'ignorance
    // vaut mieux que d'inventer un sport.
    expect(sportFromLabel("Other")).toBeNull();
    expect(sportFromLabel("")).toBeNull();
    expect(sportFromLabel(null)).toBeNull();
  });

  it("traite une étiquette numérique comme un code", () => {
    // Strava écrit parfois son identifiant interne dans `<type>`.
    expect(sportFromLabel("9")).toBe("sport_9");
  });

  it("conserve une étiquette inconnue, normalisée en slug", () => {
    expect(sportFromLabel("Padel")).toBe("padel");
    expect(sportFromLabel("Stand Up Paddling")).toBe("stand_up_paddleboarding");
    expect(sportFromLabel("Beach Volley")).toBe("beach_volley");
  });

  it("est insensible à la casse et aux séparateurs", () => {
    expect(sportFromLabel("WEIGHT_TRAINING")).toBe("training");
    expect(sportFromLabel("weight training")).toBe("training");
    expect(sportFromLabel("WeightTraining")).toBe("training");
  });
});
