/** Palette de couleurs globale de l'app (mode sombre fixe) — Agon "Tranchant B" */
export const C = {
  // ── Fond & surfaces ──────────────────────────────────────────────────────────
  bg:  "#0E0C0A",    // obsidienne profond
  s1:  "#1E1A16",    // basalte (cards, drawers)
  s2:  "#27221D",    // basalte 2 (inputs, skeletons)

  // ── Bordures ─────────────────────────────────────────────────────────────────
  brd:  "rgba(231,211,168,0.10)",
  brdL: "rgba(231,211,168,0.18)",

  // ── Texte ────────────────────────────────────────────────────────────────────
  tx:  "#FFFFFF",    // blanc pur
  tx2: "#B9AE9C",   // secondaire / sable muted
  tx3: "#7D7468",   // muted / placeholder

  // ── Accents principaux ───────────────────────────────────────────────────────
  ac:   "#FFC933",               // PRIMARY — or vif
  acS:  "rgba(255,201,51,0.12)",

  // ── Sémantique ───────────────────────────────────────────────────────────────
  g:  "#66F03C",  gS: "rgba(102,240,60,0.1)",    // success / vert vif
  gV: "#66F03C",  gP: "#3D6B24",                  // vert vif / profond
  o:  "#FF9500",  oS: "rgba(255,149,0,0.1)",      // alerte / ocre vif
  oV: "#FF9500",  oP: "#94560F",                   // ocre vif / profond
  y:  "#E6CB86",  yS: "rgba(230,203,134,0.1)",    // or clair (alias)
  r:  "#FF5A33",  rS: "rgba(255,90,51,0.1)",      // danger / terracotta vif
  rV: "#FF5A33",  rP: "#8E3220",                   // terracotta vif / profond
  b:  "#33B5FF",  bS: "rgba(51,181,255,0.1)",     // info / ardoise vif
  bV: "#33B5FF",  bP: "#25506B",                   // ardoise vif / profond

  // ── Accent — niveaux de contraste ───────────────────────────────────────────
  acV: "#FFC933",  acP: "#8A6A2C",                 // or vif / profond

  // ── Couleurs étendues — niveaux de contraste ────────────────────────────────
  pat:  "#1FF0B0",                                  // patine clair
  patV: "#1FF0B0",  patP: "#1F5E47",               // patine vif / profond
  ame:  "#F060C0",                                  // améthyste clair
  ameV: "#F060C0",  ameP: "#5E2A48",               // améthyste vif / profond

  // ── Coach / secondaire ───────────────────────────────────────────────────────
  coach:  "#FFC933",             // SECONDARY — or vif (coach = or)
  coachS: "rgba(255,201,51,0.12)",
} as const;

// ── Raccourcis sémantiques (même valeur, alias lisibles) ──────────────────────
export const PRIMARY   = C.ac;       // #FFC933 or vif
export const SECONDARY = C.coach;    // #FFC933 or vif
export const TERTIARY  = C.o;        // #FF9500 ocre
export const NEUTRAL   = C.tx3;      // #7D7468 pierre
export const SUCCESS   = C.g;        // #66F03C vert vif

export const BT = {
  PERF:   { c: "#FF5A33", l: "Mvt principal" },   // terracotta vif
  ESTH:   { c: "#FFC933", l: "Hypertrophie"  },   // or vif
  BESOIN: { c: "#33B5FF", l: "Besoin indiv."  },   // ardoise vif
  ASSOC:  { c: "#1FF0B0", l: "Muscles assoc." },   // patine vif
  CORE:   { c: "#8E8780", l: "Core"           },   // pierre
} as const;

export const BLOC_COLORS = [
  "#FFC933","#FF5A33","#66F03C","#33B5FF","#A67C52",
  "#1FF0B0","#F060C0","#FF9500","#E7D3A8","#8E8780",
];

export const HABIT_COLORS = [
  "#FFC933","#66F03C","#33B5FF","#FF5A33","#FF9500","#1FF0B0","#F060C0","#E7D3A8",
];

export const HABIT_ICONS = [
  "musculation","course","wellness","hydratation","clipboard","sommeil",
  "nutrition","objectif","intensite","flamme","coeur","tempo",
  "crayon","endurance","habitude","cerveau","performance","progression",
  "repos","lune","refresh","stress","drapeau","balance",
] as const;
