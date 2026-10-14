import { C, BT, BLOC_COLORS } from "@/lib/theme";

export const MTREE = [
  { id:"Pecs",        c: C.r,        s: [] },
  { id:"Dos",         c: C.g,        s: [{id:"Dos-Trap"},{id:"Dos-GD"},{id:"Dos-Rhom"},{id:"Dos-Erec"}] },
  { id:"Epaules",     c: C.ac,       s: [{id:"Ep-Ant"},{id:"Ep-Lat"},{id:"Ep-Post"}] },
  { id:"Quads",       c: C.b,        s: [] },
  { id:"Ischios",     c: C.o,        s: [] },
  { id:"Fessiers",    c: "#FFC933",  s: [] },
  { id:"Adducteurs",  c: "#F060C0",  s: [] },
  { id:"Triceps",     c: "#FF9500",  s: [] },
  { id:"Biceps",      c: "#30B0E0",  s: [] },
  { id:"Core",        c: C.tx2,      s: [] },
  { id:"Mollets",     c: "#8060E0",  s: [{id:"Mol-G"},{id:"Mol-S"}] },
  { id:"AB",          c: "#60E080",  s: [{id:"AB-F"},{id:"AB-E"}] },
];

export const ML: Record<string, string> = {
  Pecs:"Pecs", Dos:"Dos", "Dos-Trap":"Trapeze", "Dos-GD":"Gd. dorsal",
  "Dos-Rhom":"Rhomboides","Dos-Erec":"Erecteurs",
  Epaules:"Epaules","Ep-Ant":"Ep. Ant.","Ep-Lat":"Ep. Lat.","Ep-Post":"Ep. Post.",
  Quads:"Quads", Ischios:"Ischios", Fessiers:"Fessiers", Adducteurs:"Adducteurs",
  Triceps:"Triceps", Biceps:"Biceps", Core:"Core",
  Mollets:"Mollets","Mol-G":"Gastro.","Mol-S":"Solaire",
  AB:"Avant-bras","AB-F":"Flechisseurs","AB-E":"Extenseurs",
};

export const getMC = (id: string): string => {
  for (const g of MTREE) {
    if (g.id === id) return g.c;
    if (g.s?.some((s) => s.id === id)) return g.c;
  }
  return C.ac;
};

export const mL = (id: string) => ML[id] || id;

export const ALL_MIDS = MTREE.flatMap((g) =>
  g.s.length ? [g.id, ...g.s.map((s) => s.id)] : [g.id]
);

/** Normalise `primary` qui peut être string ou array (backward compat). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const normPrimary = (p: any): string[] =>
  !p ? [] : Array.isArray(p) ? p : [p];

/** Retourne les blocs d'une séance (avec fallback pour anciens formats). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSessionBlocs = (sess: any, exList: any[]) => {
  if (sess?.blocs?.length > 0) return sess.blocs;
  const used = [...new Set((exList || []).map((e) => e.bloc).filter(Boolean))] as string[];
  if (!used.length) return [];
  return used.map((k, i) => {
    const bt = BT[k as keyof typeof BT];
    return bt
      ? { id: k, label: bt.l, color: bt.c }
      : { id: k, label: k, color: BLOC_COLORS[i % BLOC_COLORS.length] };
  });
};

// ── Body zones ──────────────────────────────────────────────────────────────

export const BZFRONT = [
  {id:"nuque",    label:"Nuque",      cx:50, cy:26,  r:5},
  {id:"ep_g",     label:"Ep. G",      cx:23, cy:36,  r:6},
  {id:"ep_d",     label:"Ep. D",      cx:77, cy:36,  r:6},
  {id:"pecs",     label:"Pecs",       cx:50, cy:49,  r:7},
  {id:"biceps_g", label:"Biceps G",   cx:16, cy:47,  r:5},
  {id:"biceps_d", label:"Biceps D",   cx:84, cy:47,  r:5},
  {id:"coude_g",  label:"Coude G",    cx:12, cy:57,  r:4},
  {id:"coude_d",  label:"Coude D",    cx:88, cy:57,  r:4},
  {id:"abdos",    label:"Abdos",      cx:50, cy:65,  r:6},
  {id:"hanche_g", label:"Hanche G",   cx:39, cy:74,  r:5},
  {id:"hanche_d", label:"Hanche D",   cx:61, cy:74,  r:5},
  {id:"cuisse_g", label:"Cuisse G",   cx:38, cy:92,  r:6},
  {id:"cuisse_d", label:"Cuisse D",   cx:62, cy:92,  r:6},
  {id:"genou_g",  label:"Genou G",    cx:37, cy:111, r:5},
  {id:"genou_d",  label:"Genou D",    cx:63, cy:111, r:5},
  {id:"mollet_g", label:"Mollet G",   cx:37, cy:127, r:7},
  {id:"mollet_d", label:"Mollet D",   cx:63, cy:127, r:7},
  {id:"cheville_g",label:"Cheville G",cx:37, cy:143, r:4},
  {id:"cheville_d",label:"Cheville D",cx:63, cy:143, r:4},
];

export const BZBACK = [
  {id:"dos_haut",    label:"Dos / Trapèzes", cx:50, cy:47,  r:8},
  {id:"lombaires",   label:"Lombaires",      cx:50, cy:65,  r:6},
  {id:"fessier_g",   label:"Fessier G",      cx:39, cy:74,  r:6},
  {id:"fessier_d",   label:"Fessier D",      cx:61, cy:74,  r:6},
  {id:"ischio_g",    label:"Ischio G",        cx:38, cy:92,  r:5},
  {id:"ischio_d",    label:"Ischio D",        cx:62, cy:92,  r:5},
  {id:"ep_post_g",   label:"Ep. Post G",      cx:23, cy:36,  r:6},
  {id:"ep_post_d",   label:"Ep. Post D",      cx:77, cy:36,  r:6},
  {id:"triceps_g",   label:"Triceps G",       cx:14, cy:47,  r:5},
  {id:"triceps_d",   label:"Triceps D",       cx:86, cy:47,  r:5},
  {id:"mollet_arr_g",label:"Mollet G",        cx:37, cy:127, r:7},
  {id:"mollet_arr_d",label:"Mollet D",        cx:63, cy:127, r:7},
];

export const ALL_BZ = [...BZFRONT, ...BZBACK];

// ── Injuries ─────────────────────────────────────────────────────────────────

export const INJ_TYPES   = ["Aigu","Chronique","Tendon","Musculaire","Articulaire"];
export const INJ_STATUS  = ["Nouvelle","En cours","Amelioration","Guerie"];

export const STATUS_COL: Record<string, string> = {
  Nouvelle:     C.r,
  "En cours":   C.o,
  Amelioration: "#7BC67E",
  Guerie:       C.g,
};

export const stC = (s: string) => STATUS_COL[s] || C.tx3;
