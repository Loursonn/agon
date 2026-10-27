/**
 * Le décodeur FIT, vérifié contre des fichiers construits ici.
 *
 * Les octets sont fabriqués dans le test plutôt que posés en binaire figé, et
 * c'est le point : un fixture opaque prouve seulement que le décodeur n'a pas
 * changé. Un encodeur écrit à partir de la spécification prouve qu'il lit le
 * format — et si l'un des deux se trompe, le test échoue au lieu de valider
 * une erreur partagée.
 */
import { describe, expect, it } from "vitest";
import { looksLikeFit, parseFit } from "../activityFiles/fit";

const FIT_EPOCH_MS = 631_065_600_000;
const fitSeconds = (iso: string) => (Date.parse(iso) - FIT_EPOCH_MS) / 1000;

/** Types de base, avec le bit d'endianness tel qu'il apparaît dans un vrai FIT. */
const T = { enum: 0x00, uint8: 0x02, uint16: 0x84, uint32: 0x86, string: 0x07 } as const;

interface Field {
  num: number;
  type: number;
  value: number;
}

const SIZES: Record<number, number> = { 0x00: 1, 0x02: 1, 0x84: 2, 0x86: 4, 0x07: 1 };

/** Assemble un FIT minimal mais conforme. */
class FitBuilder {
  private body: number[] = [];

  /** Définition + données pour un message global, sur le type local 0. */
  message(globalNum: number, fields: Field[]): this {
    this.body.push(0x40); // en-tête de définition, type local 0
    this.body.push(0x00); // réservé
    this.body.push(0x00); // architecture : petit-boutiste
    this.body.push(globalNum & 0xff, (globalNum >> 8) & 0xff);
    this.body.push(fields.length);
    for (const f of fields) {
      this.body.push(f.num, SIZES[f.type], f.type);
    }

    this.body.push(0x00); // en-tête de données, type local 0
    for (const f of fields) {
      const size = SIZES[f.type];
      for (let i = 0; i < size; i++) {
        this.body.push((f.value >>> (8 * i)) & 0xff);
      }
    }
    return this;
  }

  /** Octets bruts, pour fabriquer un fichier volontairement incohérent. */
  rawBytes(...bytes: number[]): this {
    this.body.push(...bytes);
    return this;
  }

  build(signature = ".FIT", dataSizeOverride?: number): Uint8Array {
    const dataSize = dataSizeOverride ?? this.body.length;
    const out = new Uint8Array(12 + this.body.length);
    out[0] = 12; // taille d'en-tête
    out[1] = 0x20; // version du protocole
    out[2] = 0x00;
    out[3] = 0x08; // version du profil
    new DataView(out.buffer).setUint32(4, dataSize, true);
    for (let i = 0; i < 4; i++) out[8 + i] = signature.charCodeAt(i);
    out.set(this.body, 12);
    return out;
  }
}

const START = "2026-10-03T09:00:00.000Z";

/** Sortie course nominale : 12,03 km en 2 h 12 min 38 s, fuseau CEST. */
function coursePied(overrides: Partial<Record<string, number>> = {}) {
  const ts = fitSeconds(START);
  return new FitBuilder()
    .message(0, [
      { num: 1, type: T.uint16, value: 294 }, // fabricant : Garmin
      { num: 2, type: T.uint16, value: 3121 },
    ])
    .message(18, [
      { num: 253, type: T.uint32, value: ts },
      { num: 2, type: T.uint32, value: ts },
      { num: 5, type: T.enum, value: overrides.sport ?? 1 },
      { num: 7, type: T.uint32, value: 8_000_000 }, // elapsed : 8 000 s
      { num: 8, type: T.uint32, value: 7_958_000 }, // timer : 7 958 s
      { num: 9, type: T.uint32, value: 1_203_000 }, // 12 030 m, en centimètres
      { num: 11, type: T.uint16, value: 890 },
      { num: 16, type: T.uint8, value: overrides.avgHr ?? 148 },
      { num: 17, type: T.uint8, value: overrides.maxHr ?? 176 },
      { num: 22, type: T.uint16, value: 210 },
      { num: 23, type: T.uint16, value: 198 },
    ])
    .message(34, [
      { num: 253, type: T.uint32, value: ts },
      { num: 5, type: T.uint32, value: ts + 7200 }, // heure locale : UTC+2
    ])
    .build();
}

describe("looksLikeFit", () => {
  it("reconnaît la signature", () => {
    expect(looksLikeFit(coursePied())).toBe(true);
  });

  it("refuse un XML ou un fichier trop court", () => {
    expect(looksLikeFit(new TextEncoder().encode("<?xml version=\"1.0\"?><gpx/>"))).toBe(false);
    expect(looksLikeFit(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("parseFit — sortie nominale", () => {
  it("lit les agrégats de la session", async () => {
    const { activities, rejected } = await parseFit(coursePied(), "course.fit");
    expect(rejected).toEqual([]);
    expect(activities).toHaveLength(1);

    const a = activities[0];
    expect(a.startedAt).toBe(START);
    expect(a.sport).toBe("running");
    expect(a.distanceM).toBe(12030);
    expect(a.calories).toBe(890);
    expect(a.avgHr).toBe(148);
    expect(a.maxHr).toBe(176);
    expect(a.elevationGainM).toBe(210);
  });

  it("retient le temps en mouvement, pas le temps écoulé", async () => {
    // 7 958 s au chronomètre contre 8 000 s écoulées : sur un fractionné les
    // pauses faussent l'allure, et c'est le temps en mouvement qui a un sens.
    const { activities } = await parseFit(coursePied());
    expect(activities[0].durationS).toBe(7958);
    expect(activities[0].details?.elapsedS).toBe(8000);
  });

  it("calcule l'allure à partir de la distance et du temps", async () => {
    const { activities } = await parseFit(coursePied());
    // 7 958 s / 12,03 km = 661,51 s/km
    expect(activities[0].avgPaceSPerKm).toBeCloseTo(661.51, 2);
  });

  it("conserve le contenu lu dans raw", async () => {
    const { activities } = await parseFit(coursePied(), "course.fit");
    expect(activities[0].raw).toMatchObject({
      format: "fit",
      fileName: "course.fit",
      manufacturer: 294,
      utcOffsetS: 7200,
    });
  });

  it("donne un external_id stable pour un contenu identique", async () => {
    // Réimporter le même fichier doit être sans effet : l'athlète qui glisse
    // son dossier entier deux fois s'y attend.
    const a = await parseFit(coursePied());
    const b = await parseFit(coursePied(), "autre-nom.fit");
    expect(a.activities[0].externalId).toBe(b.activities[0].externalId);
    expect(a.activities[0].externalId).toMatch(/^fit:[0-9a-f]{32}$/);
  });

  it("donne un external_id différent pour un contenu différent", async () => {
    const a = await parseFit(coursePied());
    const b = await parseFit(coursePied({ avgHr: 149 }));
    expect(a.activities[0].externalId).not.toBe(b.activities[0].externalId);
  });
});

describe("parseFit — jour local", () => {
  it("rattache une activité au jour vécu par l'athlète", async () => {
    // 23 h 30 UTC avec un décalage de +2 h : l'activité a eu lieu le lendemain
    // à 1 h 30 pour l'athlète, et c'est ce jour-là qu'elle s'aligne sur son
    // planning.
    const ts = fitSeconds("2026-10-05T23:30:00.000Z");
    const bytes = new FitBuilder()
      .message(18, [
        { num: 2, type: T.uint32, value: ts },
        { num: 5, type: T.enum, value: 1 },
        { num: 8, type: T.uint32, value: 1_800_000 },
      ])
      .message(34, [
        { num: 253, type: T.uint32, value: ts },
        { num: 5, type: T.uint32, value: ts + 7200 },
      ])
      .build();

    const { activities } = await parseFit(bytes);
    expect(activities[0].startedAt).toBe("2026-10-05T23:30:00.000Z");
    expect(activities[0].localDate).toBe("2026-10-06");
  });

  it("retombe sur l'UTC quand le fichier ne dit pas l'heure locale", async () => {
    const ts = fitSeconds("2026-10-05T23:30:00.000Z");
    const bytes = new FitBuilder()
      .message(18, [
        { num: 2, type: T.uint32, value: ts },
        { num: 8, type: T.uint32, value: 1_800_000 },
      ])
      .build();
    const { activities } = await parseFit(bytes);
    expect(activities[0].localDate).toBe("2026-10-05");
  });
});

describe("parseFit — multisport", () => {
  it("rend une activité par session plutôt qu'une moyenne des deux", async () => {
    const ts = fitSeconds(START);
    const bytes = new FitBuilder()
      .message(18, [
        { num: 2, type: T.uint32, value: ts },
        { num: 5, type: T.enum, value: 2 }, // vélo
        { num: 8, type: T.uint32, value: 3_600_000 },
        { num: 9, type: T.uint32, value: 3_000_000 },
      ])
      .message(18, [
        { num: 2, type: T.uint32, value: ts + 3700 },
        { num: 5, type: T.enum, value: 1 }, // course
        { num: 8, type: T.uint32, value: 1_200_000 },
        { num: 9, type: T.uint32, value: 500_000 },
      ])
      .build();

    const { activities } = await parseFit(bytes);
    expect(activities.map((a) => a.sport)).toEqual(["cycling", "running"]);
    // Fusionner 1 h de vélo et 20 min de course donnerait une allure moyenne
    // qui ne décrit aucune des deux.
    expect(activities[0].avgPaceSPerKm).not.toBe(activities[1].avgPaceSPerKm);
    // Les deux partagent l'empreinte du fichier, distinguées par leur rang.
    expect(activities[0].externalId).toMatch(/#1$/);
    expect(activities[1].externalId).toMatch(/#2$/);
  });
});

describe("parseFit — ce qui est écarté", () => {
  it("saute les messages dont nous ne faisons rien", async () => {
    const ts = fitSeconds(START);
    const bytes = new FitBuilder()
      // `record` (20) : des milliers par activité, ignorés par leur taille
      // déclarée. C'est ce qui rend le décodeur insensible aux messages
      // inconnus et aux extensions propriétaires.
      .message(20, [
        { num: 253, type: T.uint32, value: ts },
        { num: 3, type: T.uint8, value: 142 },
      ])
      .message(18, [
        { num: 2, type: T.uint32, value: ts },
        { num: 5, type: T.enum, value: 1 },
        { num: 8, type: T.uint32, value: 1_800_000 },
      ])
      .message(20, [{ num: 3, type: T.uint8, value: 150 }])
      .build();

    const { activities, rejected } = await parseFit(bytes);
    expect(rejected).toEqual([]);
    expect(activities).toHaveLength(1);
    expect(activities[0].durationS).toBe(1800);
  });

  it("écarte un fichier sans session, sans le présenter comme une erreur de lecture", async () => {
    // Réglages d'appareil, plans d'entraînement, mesures de balance : un
    // athlète qui dépose sa carte mémoire entière en apportera.
    const bytes = new FitBuilder()
      .message(0, [{ num: 1, type: T.uint16, value: 294 }])
      .build();

    const { activities, rejected } = await parseFit(bytes, "settings.fit");
    expect(activities).toEqual([]);
    expect(rejected[0].name).toBe("settings.fit");
    expect(rejected[0].reason).toMatch(/aucune session/);
  });

  it("refuse un fichier sans signature .FIT", async () => {
    const bytes = new FitBuilder()
      .message(18, [{ num: 2, type: T.uint32, value: 1 }])
      .build("XXXX");
    const { activities, rejected } = await parseFit(bytes, "faux.fit");
    expect(activities).toEqual([]);
    expect(rejected[0].reason).toMatch(/signature/);
  });

  it("ne lit pas au-delà du tampon quand data_size est corrompu", async () => {
    // Téléchargement interrompu : la taille annoncée dépasse le fichier.
    const bytes = coursePied();
    new DataView(bytes.buffer).setUint32(4, 9_000_000, true);
    const { activities } = await parseFit(bytes);
    expect(activities).toHaveLength(1);
  });

  it("s'arrête plutôt que d'inventer sur un message sans définition", async () => {
    // Un import partiel silencieux est plus nuisible qu'un refus : toute
    // lecture suivant une incohérence serait du hasard.
    const bytes = new FitBuilder().rawBytes(0x05, 0x00, 0x00).build();
    const { activities, rejected } = await parseFit(bytes, "casse.fit");
    expect(activities).toEqual([]);
    expect(rejected[0].reason).toMatch(/sans définition/);
  });

  it("ne lève pas sur un fichier vide ou minuscule", async () => {
    for (const bad of [new Uint8Array(0), new Uint8Array(5), new Uint8Array(13)]) {
      const r = await parseFit(bad, "vide.fit");
      expect(r.activities).toEqual([]);
      expect(r.rejected).toHaveLength(1);
    }
  });

  it("écarte une fréquence cardiaque impossible au lieu de la transmettre", async () => {
    // La contrainte en base refuse hors 20–250 : écarter ici évite de faire
    // échouer l'insertion de tout un lot pour une mesure parasite.
    const { activities } = await parseFit(coursePied({ avgHr: 15, maxHr: 251 }));
    expect(activities[0].avgHr).toBeNull();
    expect(activities[0].maxHr).toBeNull();
  });

  it("nomme un sport inconnu au lieu de le perdre", async () => {
    // « sport_200 » se corrige en ajoutant une ligne à la table ; `null` ne
    // dirait pas qu'il y avait quelque chose à reconnaître.
    const { activities } = await parseFit(coursePied({ sport: 200 }));
    expect(activities[0].sport).toBe("sport_200");
  });

  it("rend une allure nulle quand la distance ne permet pas d'en calculer une", async () => {
    const ts = fitSeconds(START);
    const bytes = new FitBuilder()
      .message(18, [
        { num: 2, type: T.uint32, value: ts },
        { num: 5, type: T.enum, value: 10 }, // renforcement
        { num: 8, type: T.uint32, value: 2_700_000 },
      ])
      .build();
    const { activities } = await parseFit(bytes);
    expect(activities[0].sport).toBe("training");
    expect(activities[0].distanceM).toBeNull();
    // Une allure sans distance est une information inventée.
    expect(activities[0].avgPaceSPerKm).toBeNull();
  });
});
