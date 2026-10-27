import { describe, expect, it } from "vitest";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHr,
  formatPace,
  provenanceOf,
  sourceLabel,
  sportLabel,
} from "@/lib/activityDisplay";

/**
 * Ce que l'athlète lit sous ses chiffres.
 *
 * Les cas tenus ici sont ceux qui mentent sans prévenir : un zéro affiché à la
 * place d'une mesure absente, une distance qui tombe à « NaN km » parce que
 * PostgREST a rendu du texte, une date qui recule d'un jour vue de Montréal.
 * Aucun ne lève d'erreur — ils donnent juste un nombre faux, et un nombre faux
 * dans une liste de sorties fait douter de toute la liste.
 */

describe("sportLabel", () => {
  it("traduit un sport connu", () => {
    expect(sportLabel("trail_running")).toBe("Trail");
    expect(sportLabel("open_water_swimming")).toBe("Nage en eau libre");
  });

  it("garde le code d'un sport que la montre connaissait mais pas nous", () => {
    // « Autre » effacerait l'information ; « sport_12 » ne se lit pas.
    expect(sportLabel("sport_12")).toBe("Sport 12");
  });

  it("dérive un libellé lisible d'un slug inconnu", () => {
    expect(sportLabel("via_ferrata")).toBe("Via ferrata");
  });

  it("rend un libellé neutre quand le sport est absent", () => {
    expect(sportLabel(null)).toBe("Activité");
    expect(sportLabel(undefined)).toBe("Activité");
    expect(sportLabel("")).toBe("Activité");
  });
});

describe("formatDistance", () => {
  it("passe en mètres sous le kilomètre", () => {
    expect(formatDistance(850)).toBe("850 m");
  });

  it("donne le dixième de kilomètre, virgule française", () => {
    expect(formatDistance(12400)).toBe("12,4 km");
  });

  it("arrondit à l'unité au-delà de 100 km", () => {
    // Sur un ultra, le dixième n'est pas fiable — autant ne pas le promettre.
    expect(formatDistance(104300)).toBe("104 km");
  });

  it("rend un tiret, jamais zéro, pour une mesure absente", () => {
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(undefined)).toBe("—");
    expect(formatDistance(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("reste en minutes pour une séance courte", () => {
    expect(formatDuration(2880)).toBe("48 min");
  });

  it("garde deux chiffres aux minutes", () => {
    // « 1 h 5 » se confond avec « 1 h 50 » en balayant une liste.
    expect(formatDuration(3900)).toBe("1 h 05");
  });

  it("compose heures et minutes", () => {
    expect(formatDuration(9000)).toBe("2 h 30");
  });

  it("refuse zéro et l'absence", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatPace", () => {
  it("rend une allure au kilomètre", () => {
    expect(formatPace(312)).toBe("5:12 /km");
  });

  it("refuse une allure nulle, qui ne mesure rien", () => {
    expect(formatPace(0)).toBe("—");
    expect(formatPace(null)).toBe("—");
  });
});

describe("formatElevation", () => {
  it("signe le dénivelé pour qu'il ne passe pas pour une altitude", () => {
    expect(formatElevation(1203.6)).toBe("+1204 m");
  });

  it("affiche un D+ nul, qui est une vraie mesure sur du plat", () => {
    expect(formatElevation(0)).toBe("+0 m");
  });

  it("distingue l'absence du plat", () => {
    expect(formatElevation(null)).toBe("—");
  });
});

describe("formatHr", () => {
  it("met la max entre parenthèses", () => {
    expect(formatHr(142, 171)).toBe("142 (max 171)");
  });

  it("affiche la moyenne seule quand la max manque", () => {
    expect(formatHr(142, null)).toBe("142");
  });

  it("affiche la max seule quand la moyenne manque", () => {
    expect(formatHr(null, 171)).toBe("max 171");
  });

  it("rend un tiret quand rien n'a été mesuré", () => {
    expect(formatHr(null, null)).toBe("—");
  });
});

describe("formatActivityDate", () => {
  it("ne recule pas d'un jour selon le fuseau", () => {
    /*
      Interprétée à minuit UTC puis affichée en heure locale, une date seule
      recule d'un jour pour tout le fuseau occidental. Le test vérifie le jour
      du mois, seul symptôme visible du bogue.
    */
    expect(formatActivityDate("2026-03-14")).toContain("14");
  });

  it("rend la chaîne telle quelle si elle n'est pas une date", () => {
    expect(formatActivityDate("pas-une-date")).toBe("pas-une-date");
  });
});

describe("provenanceOf", () => {
  it("remonte les mentions des décodeurs sans les réécrire", () => {
    const lignes = provenanceOf({
      distanceSource: "calculée depuis les positions",
      localDateSource: "UTC, le fichier ne donne pas de fuseau",
    });
    expect(lignes).toEqual([
      { label: "Distance", text: "calculée depuis les positions" },
      { label: "Jour", text: "UTC, le fichier ne donne pas de fuseau" },
    ]);
  });

  it("joint les sauts de GPS écartés, même question posée", () => {
    const lignes = provenanceOf({ skippedLegs: 3 });
    expect(lignes).toEqual([
      { label: "Trace", text: "3 sauts de GPS écartés du calcul de distance" },
    ]);
  });

  it("accorde au singulier un saut unique", () => {
    expect(provenanceOf({ skippedLegs: 1 })[0].text).toBe(
      "1 saut de GPS écarté du calcul de distance",
    );
  });

  it("ignore un compteur de sauts à zéro", () => {
    expect(provenanceOf({ skippedLegs: 0 })).toEqual([]);
  });

  it("ne rend rien pour un FIT, dont les valeurs sont lues et non calculées", () => {
    expect(provenanceOf({ elapsedS: 3600, sessionIndex: 0 })).toEqual([]);
  });

  it("tient les details absents ou mal formés", () => {
    expect(provenanceOf(null)).toEqual([]);
    expect(provenanceOf(undefined)).toEqual([]);
    expect(provenanceOf("texte")).toEqual([]);
  });

  it("écarte une mention vide, qui n'expliquerait rien", () => {
    expect(provenanceOf({ distanceSource: "   " })).toEqual([]);
  });
});

describe("sourceLabel", () => {
  it("nomme les sources connues", () => {
    expect(sourceLabel("garmin")).toBe("Garmin");
    expect(sourceLabel("file_import")).toBe("Fichier importé");
  });

  it("affiche une source inconnue plutôt que de la masquer", () => {
    expect(sourceLabel("polar")).toBe("polar");
  });
});
