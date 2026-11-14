// Mensurations + photos d'évolution corporelle

export type MeasurementKey =
  | 'bras' | 'bras_g' | 'bras_d'
  | 'epaules' | 'poitrine' | 'taille' | 'hanche'
  | 'cuisse' | 'cuisse_g' | 'cuisse_d'
  | 'mollet' | 'mollet_g' | 'mollet_d'
  | BiometryKey;

/** Biométrie : stature, envergure et mesures demandées par l'app MyJump. */
export type BiometryKey =
  | 'height_cm' | 'wingspan_cm' | 'leg_length_cm' | 'jump_start_height_cm';

export type PhotoSlot =
  | 'face' | 'cote' | 'dos' | 'jambes_face' | 'jambes_dos';

export interface MeasurementField {
  key: MeasurementKey;
  label: string;
  /** If set, this is a bilateral measurement with left/right keys */
  bilateral?: { gKey: MeasurementKey; dKey: MeasurementKey };
  /** Comment prendre la mesure (affiché sous le champ). */
  hint?: string;
}

export const MEASUREMENT_FIELDS: MeasurementField[] = [
  { key: 'bras',     label: 'Bras',     bilateral: { gKey: 'bras_g',   dKey: 'bras_d'   } },
  { key: 'epaules',  label: 'Épaules'  },
  { key: 'poitrine', label: 'Poitrine' },
  { key: 'taille',   label: 'Tour de taille' },
  { key: 'hanche',   label: 'Hanche'   },
  { key: 'cuisse',   label: 'Cuisse',   bilateral: { gKey: 'cuisse_g', dKey: 'cuisse_d' } },
  { key: 'mollet',   label: 'Mollet',   bilateral: { gKey: 'mollet_g', dKey: 'mollet_d' } },
];

/** Biométrie (cm) : stature, envergure, et les deux longueurs que MyJump demande pour calculer force, vitesse et puissance. */
export const BIOMETRY_FIELDS: MeasurementField[] = [
  { key: 'height_cm',   label: 'Taille (debout)', hint: 'Pieds nus, dos au mur.' },
  { key: 'wingspan_cm', label: 'Envergure',       hint: 'Bras tendus à l’horizontale, bout des doigts à bout des doigts.' },
];

export const MYJUMP_FIELDS: MeasurementField[] = [
  { key: 'leg_length_cm',        label: 'Longueur du membre inférieur', hint: 'Allongé, du grand trochanter (haut de la hanche) à la pointe du pied, cheville tendue.' },
  { key: 'jump_start_height_cm', label: 'Hauteur de départ',            hint: 'Accroupi genoux à 90°, du grand trochanter au sol.' },
];

/** Tous les champs, dans l'ordre d'affichage (tours, biométrie, MyJump). */
export const ALL_MEASUREMENT_FIELDS: MeasurementField[] = [...MEASUREMENT_FIELDS, ...BIOMETRY_FIELDS, ...MYJUMP_FIELDS];

/** All column keys that map to DB columns (for iteration) */
export const ALL_MEASUREMENT_KEYS: MeasurementKey[] = [
  'bras', 'bras_g', 'bras_d',
  'epaules', 'poitrine', 'taille', 'hanche',
  'cuisse', 'cuisse_g', 'cuisse_d',
  'mollet', 'mollet_g', 'mollet_d',
  'height_cm', 'wingspan_cm', 'leg_length_cm', 'jump_start_height_cm',
];

export const PHOTO_SLOTS: { key: PhotoSlot; label: string }[] = [
  { key: 'face',        label: 'Face'           },
  { key: 'cote',        label: 'Côté'           },
  { key: 'dos',         label: 'Dos'            },
  { key: 'jambes_face', label: 'Jambes (face)'  },
  { key: 'jambes_dos',  label: 'Jambes (dos)'   },
];

export const MEASUREMENT_BUCKET = 'test-media';

export type MeasurementPhotos = Partial<Record<PhotoSlot, string>>; // slot -> storage path

export interface MeasurementLog {
  id: string;
  athlete_id: string;
  date: string;            // YYYY-MM-DD
  weight_kg: number | null;
  bras: number | null;
  bras_g: number | null;
  bras_d: number | null;
  epaules: number | null;
  poitrine: number | null;
  taille: number | null;
  hanche: number | null;
  cuisse: number | null;
  cuisse_g: number | null;
  cuisse_d: number | null;
  mollet: number | null;
  mollet_g: number | null;
  mollet_d: number | null;
  height_cm: number | null;
  wingspan_cm: number | null;
  leg_length_cm: number | null;
  jump_start_height_cm: number | null;
  photos: MeasurementPhotos;
  created_at: string;
}

// Saisie d'une nouvelle log (avant upload photos)
export interface NewMeasurementInput {
  weight_kg?: number;
  measurements: Partial<Record<MeasurementKey, number>>;
  photoFiles: Partial<Record<PhotoSlot, File>>;
}

// Modification d'une log existante
export interface UpdateMeasurementInput {
  id: string;
  existingPhotos: MeasurementPhotos;
  weight_kg?: number;
  measurements: Partial<Record<MeasurementKey, number>>;
  newPhotoFiles: Partial<Record<PhotoSlot, File>>;
  removedSlots: PhotoSlot[];
}
