/**
 * Détail d'activité : FIT complet (record, lap, set, event, timestamps
 * compressés), JSON Garmin, TCX, GPX → même forme normalisée.
 *
 * Fichiers fictifs fabriqués ici (aucune donnée d'athlète réel).
 */
import { describe, expect, it } from "vitest";
import { normalizeActivity } from "../activityFiles/normalize";
import { parseFit } from "../activityFiles/fit";

const FIT_EPOCH_MS = 631_065_600_000;
const START_ISO = "2026-11-03T17:30:00.000Z";
const T0 = (Date.parse(START_ISO) - FIT_EPOCH_MS) / 1000;

type Ty = "enum" | "uint8" | "uint16" | "sint32" | "uint32" | "string16" | "uint8x3";
const TYPE: Record<Ty, { base: number; size: number }> = {
  enum: { base: 0x00, size: 1 },
  uint8: { base: 0x02, size: 1 },
  uint16: { base: 0x84, size: 2 },
  sint32: { base: 0x85, size: 4 },
  uint32: { base: 0x86, size: 4 },
  string16: { base: 0x07, size: 16 },
  uint8x3: { base: 0x02, size: 3 },
};

interface F {
  num: number;
  ty: Ty;
}

/** Encodeur FIT minimal : définitions par type local, données normales ou compressées. */
class Fit {
  body: number[] = [];
  private defs = new Map<number, F[]>();

  define(local: number, global: number, fields: F[]): this {
    this.body.push(0x40 | local, 0, 0, global & 0xff, global >> 8, fields.length);
    for (const f of fields) this.body.push(f.num, TYPE[f.ty].size, TYPE[f.ty].base);
    this.defs.set(local, fields);
    return this;
  }

  private values(local: number, values: Array<number | string | number[]>) {
    const fields = this.defs.get(local)!;
    fields.forEach((f, i) => {
      const v = values[i];
      const { size } = TYPE[f.ty];
      if (typeof v === "string") {
        for (let k = 0; k < size; k++) this.body.push(k < v.length ? v.charCodeAt(k) : 0);
      } else if (Array.isArray(v)) {
        for (let k = 0; k < size; k++) this.body.push(v[k] & 0xff);
      } else {
        const n = v >>> 0;
        for (let k = 0; k < size; k++) this.body.push((n >>> (8 * k)) & 0xff);
      }
    });
  }

  data(local: number, values: Array<number | string | number[]>): this {
    this.body.push(local);
    this.values(local, values);
    return this;
  }

  /** En-tête compressé : type local 0-3, 5 bits bas de l'horodatage. */
  compressed(local: number, ts: number, values: Array<number | string | number[]>): this {
    this.body.push(0x80 | (local << 5) | (ts & 0x1f));
    this.values(local, values);
    return this;
  }

  build(): Uint8Array {
    const out = new Uint8Array(12 + this.body.length);
    out[0] = 12;
    out[1] = 0x20;
    out[3] = 0x08;
    new DataView(out.buffer).setUint32(4, this.body.length, true);
    out.set([46, 70, 73, 84], 8);
    out.set(this.body, 12);
    return out;
  }
}

const RECORD_FULL: F[] = [
  { num: 253, ty: "uint32" },
  { num: 3, ty: "uint8" }, // FC
  { num: 73, ty: "uint32" }, // enhanced_speed (mm/s)
  { num: 5, ty: "uint32" }, // distance (cm)
  { num: 78, ty: "uint32" }, // enhanced_altitude (×5 + 500)
  { num: 4, ty: "uint8" }, // cadence (un pied)
  { num: 53, ty: "uint8" }, // fractional_cadence (/128)
  { num: 0, ty: "sint32" },
  { num: 1, ty: "sint32" },
];
// Même message, sans horodatage : pour les en-têtes compressés.
const RECORD_COMPRESSED: F[] = RECORD_FULL.slice(1);

const semi = (deg: number) => Math.round(deg * (2 ** 31 / 180));
const alt = (m: number) => Math.round((m + 500) * 5);

/** Course fictive : 10 s de record, une pause de 5 s, 2 tours (bouton Lap), 1 série. */
function course(): Uint8Array {
  const f = new Fit()
    .define(0, 0, [{ num: 1, ty: "uint16" }, { num: 2, ty: "uint16" }])
    .data(0, [1, 3121])
    .define(1, 20, RECORD_FULL)
    .define(2, 20, RECORD_COMPRESSED)
    .define(3, 21, [{ num: 253, ty: "uint32" }, { num: 0, ty: "enum" }, { num: 1, ty: "enum" }])
    .data(3, [T0, 0, 0]); // start
  for (let i = 0; i <= 5; i++) {
    const ts = T0 + i;
    const vals = [140 + i, 3000 + i * 100, i * 300, alt(50 + i * 0.2), 82, 64, semi(44.8), semi(-0.5)];
    if (i % 2 === 0) f.data(1, [ts, ...vals]);
    else f.compressed(2, ts, vals);
  }
  // Pause de T0+5 à T0+10.
  f.data(3, [T0 + 5, 0, 1]).data(3, [T0 + 10, 0, 0]);
  for (let i = 10; i <= 14; i++) {
    f.data(1, [T0 + i, 160, 3500, 1500 + (i - 10) * 350, alt(51), 85, 0, semi(44.8), semi(-0.5)]);
  }
  f.define(4, 19, [
    { num: 253, ty: "uint32" },
    { num: 2, ty: "uint32" },
    { num: 7, ty: "uint32" },
    { num: 8, ty: "uint32" },
    { num: 9, ty: "uint32" },
    { num: 21, ty: "uint16" },
    { num: 22, ty: "uint16" },
    { num: 24, ty: "enum" },
    { num: 17, ty: "uint8" },
    { num: 111, ty: "uint32" },
  ])
    .data(4, [T0 + 5, T0, 5000, 5000, 1500 * 100, 3, 1, 0, 82, 3500])
    .data(4, [T0 + 14, T0 + 5, 9000, 4000, 1400 * 100, 0, 0, 7, 85, 3500]);
  f.define(5, 225, [
    { num: 254, ty: "uint32" },
    { num: 6, ty: "uint32" },
    { num: 0, ty: "uint32" },
    { num: 3, ty: "uint16" },
    { num: 4, ty: "uint16" },
    { num: 5, ty: "uint8" },
    { num: 7, ty: "uint16" },
  ])
    .data(5, [T0 + 14, T0 + 12, 2000, 10, 20 * 16, 1, 9]);
  f.define(6, 18, [{ num: 253, ty: "uint32" }, { num: 2, ty: "uint32" }, { num: 5, ty: "enum" }, { num: 8, ty: "uint32" }])
    .data(6, [T0 + 14, T0, 1, 9000]);
  f.define(7, 34, [{ num: 253, ty: "uint32" }, { num: 5, ty: "uint32" }]).data(7, [T0 + 14, T0 + 14 + 3600]);
  return f.build();
}

describe("normalizeActivity — FIT complet", () => {
  const a = normalizeActivity({ kind: "fit", bytes: course() });

  it("place la série sur l'axe du temps, horodatages compressés compris", () => {
    expect(a.startedAtMs).toBe(Date.parse(START_ISO));
    expect(a.stream.t).toEqual([0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14]);
    expect(a.stream.hr!.slice(0, 6)).toEqual([140, 141, 142, 143, 144, 145]);
    expect(a.stream.speed![1]).toBe(3.1);
    expect(a.stream.dist![2]).toBe(6);
    expect(a.stream.alt![5]).toBe(51);
    expect(a.stream.lat![0]).toBeCloseTo(44.8, 5);
    expect(a.utcOffsetS).toBe(3600);
    expect(a.sport).toBe("running");
  });

  it("cadence : un pied ×2 = pas/min, fraction comprise", () => {
    // 82 + 64/128 = 82,5 rpm d'un pied → 165 pas/min
    expect(a.stream.cadence![0]).toBe(165);
    expect(a.stream.cadence![6]).toBe(170);
    expect(a.laps[0].watch!.avgCadence).toBe(164);
  });

  it("chronomètre : la pause est retirée", () => {
    expect(a.stream.timer![5]).toBe(5);
    expect(a.stream.timer![6]).toBe(5); // t = 10 s, 5 s de pause
    expect(a.stream.timer![10]).toBe(9);
  });

  it("lit les tours de la montre et leur déclencheur", () => {
    expect(a.laps).toHaveLength(2);
    expect(a.laps[0]).toMatchObject({ startS: 0, endS: 5, trigger: "manual" });
    expect(a.laps[1]).toMatchObject({ startS: 5, endS: 14, trigger: "session_end" });
    expect(a.laps[0].watch).toMatchObject({ distanceM: 1500, ascentM: 3, descentM: 1, timerS: 5 });
    expect(a.laps[1].watch!.maxSpeed).toBe(3.5);
  });

  it("lit les séries de musculation", () => {
    expect(a.sets).toEqual([
      { startS: 12, durationS: 2, reps: 10, weightKg: 20, setType: "active", category: [9], categorySubtype: [] },
    ]);
  });

  it("garde l'appareil, et parseFit lit toujours le résumé", async () => {
    expect(a.device).toMatchObject({ manufacturer: 1, product: 3121 });
    const { activities } = await parseFit(course());
    expect(activities[0].durationS).toBe(9);
  });

  it("valeur absente = null, jamais 0", () => {
    // fractional_cadence 0 est une vraie valeur ; FC 0xFF serait null.
    const f = new Fit()
      .define(1, 20, [{ num: 253, ty: "uint32" }, { num: 3, ty: "uint8" }])
      .data(1, [T0, 0xff])
      .data(1, [T0 + 1, 150])
      .define(6, 18, [{ num: 2, ty: "uint32" }, { num: 5, ty: "enum" }])
      .data(6, [T0, 2]);
    const b = normalizeActivity({ kind: "fit", bytes: f.build() });
    expect(b.stream.hr).toEqual([null, 150]);
    expect(b.stream.power).toBeNull();
    expect(b.sport).toBe("cycling");
  });
});

describe("normalizeActivity — JSON Garmin", () => {
  const t = Date.parse(START_ISO) / 1000;
  const samples = [0, 1, 2, 3].map((i) => ({
    startTimeInSeconds: t + i,
    heartRate: 150 + i,
    speedMetersPerSecond: 3 + i / 10,
    totalDistanceInMeters: i * 3,
    elevationInMeters: 10,
    stepsPerMinute: 80,
    timerDurationInSeconds: i,
  }));
  const a = normalizeActivity({
    kind: "garmin_json",
    samples,
    laps: [{ startTimeInSeconds: t }, { startTimeInSeconds: t + 2 }],
    summary: { startTimeInSeconds: t, startTimeOffsetInSeconds: 3600, activityType: "RUNNING" },
  });

  it("même forme que le FIT, cadence en pas/min", () => {
    expect(a.stream.t).toEqual([0, 1, 2, 3]);
    expect(a.stream.hr).toEqual([150, 151, 152, 153]);
    expect(a.stream.cadence).toEqual([160, 160, 160, 160]);
    expect(a.stream.lat).toBeNull();
    expect(a.sport).toBe("running");
  });

  it("tours JSON = limites seules", () => {
    expect(a.laps.map((l) => [l.startS, l.endS, l.watch])).toEqual([[0, 2, null], [2, 3, null]]);
  });

  it("vélo : la cadence reste en rpm", () => {
    const b = normalizeActivity({
      kind: "garmin_json",
      samples: [{ startTimeInSeconds: t, bikeCadenceInRPM: 90 }],
      summary: { startTimeInSeconds: t, activityType: "CYCLING" },
    });
    expect(b.stream.cadence).toEqual([90]);
  });
});

const enc = (s: string) => new TextEncoder().encode(s);

describe("normalizeActivity — TCX / GPX", () => {
  it("TCX : points, tours, cadence ×2", () => {
    const xml = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running">
      <Lap StartTime="2026-11-03T17:30:00Z"><TotalTimeSeconds>2</TotalTimeSeconds><DistanceMeters>6</DistanceMeters>
      <TriggerMethod>Manual</TriggerMethod><Track>
      <Trackpoint><Time>2026-11-03T17:30:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm><Extensions><TPX><RunCadence>80</RunCadence></TPX></Extensions></Trackpoint>
      <Trackpoint><Time>2026-11-03T17:30:02Z</Time><DistanceMeters>6</DistanceMeters><HeartRateBpm><Value>142</Value></HeartRateBpm></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const a = normalizeActivity({ kind: "tcx", bytes: enc(xml) });
    expect(a.stream.t).toEqual([0, 2]);
    expect(a.stream.hr).toEqual([140, 142]);
    expect(a.stream.cadence).toEqual([160, null]);
    expect(a.laps[0]).toMatchObject({ startS: 0, endS: 2, trigger: "manual" });
    expect(a.stream.timer).toBeNull();
  });

  it("GPX : distance reconstruite depuis le GPS, (0,0) ignoré", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><type>running</type><trkseg>
      <trkpt lat="44.8" lon="-0.5"><time>2026-11-03T17:30:00Z</time></trkpt>
      <trkpt lat="0" lon="0"><time>2026-11-03T17:30:05Z</time></trkpt>
      <trkpt lat="44.8009" lon="-0.5"><time>2026-11-03T17:30:30Z</time></trkpt>
      </trkseg></trk></gpx>`;
    const a = normalizeActivity({ kind: "gpx", bytes: enc(xml) });
    expect(a.stream.t).toEqual([0, 5, 30]);
    expect(a.stream.lat![1]).toBeNull();
    expect(a.stream.dist![2]).toBeCloseTo(100, 0);
    expect(a.laps).toEqual([]);
  });
});
