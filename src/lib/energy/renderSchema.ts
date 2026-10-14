/**
 * renderSchema — pure functions for field backgrounds + schema element rendering.
 * Shared between SchemaEditor (coach) and SchemaViewer (athlete/coach).
 */
import type { FieldType, SchemaElement } from "@/types/energy";

// ── Field backgrounds (SVG markup) ──────────────────────────────────────────

export const FIELD_BACKGROUNDS: Record<FieldType, string> = {
  rugby: `<rect width="500" height="320" fill="#0d3320"/>
    <rect x="30" y="20" width="440" height="280" fill="none" stroke="#ffffff55" stroke-width="2"/>
    ${[80, 140, 250, 360, 420].map(x => `<line x1="${x}" y1="20" x2="${x}" y2="300" stroke="#ffffff33" stroke-width="1.5" ${x !== 250 ? 'stroke-dasharray="6 6"' : ''}/>`).join("")}
    <line x1="250" y1="20" x2="250" y2="300" stroke="#ffffff66" stroke-width="2"/>
    <text x="34" y="315" fill="#ffffff44" font-size="9">EN-BUT</text><text x="430" y="315" fill="#ffffff44" font-size="9">EN-BUT</text>`,

  foot: `<rect width="500" height="320" fill="#14401f"/>
    <rect x="30" y="20" width="440" height="280" fill="none" stroke="#ffffff55" stroke-width="2"/>
    <line x1="250" y1="20" x2="250" y2="300" stroke="#ffffff55" stroke-width="2"/>
    <circle cx="250" cy="160" r="45" fill="none" stroke="#ffffff55" stroke-width="2"/>
    <rect x="30" y="95" width="70" height="130" fill="none" stroke="#ffffff55" stroke-width="2"/>
    <rect x="400" y="95" width="70" height="130" fill="none" stroke="#ffffff55" stroke-width="2"/>`,

  basket: `<rect width="500" height="320" fill="#3d2a1a"/>
    <rect x="30" y="20" width="440" height="280" fill="none" stroke="#ffffff66" stroke-width="2"/>
    <line x1="250" y1="20" x2="250" y2="300" stroke="#ffffff66" stroke-width="2"/>
    <circle cx="250" cy="160" r="40" fill="none" stroke="#ffffff66" stroke-width="2"/>
    <path d="M 30 60 A 120 120 0 0 1 30 260" fill="none" stroke="#ffffff66" stroke-width="2" transform="translate(60,0) scale(-1,1) translate(-60,0)" />
    <path d="M 470 60 A 120 120 0 0 0 470 260" fill="none" stroke="#ffffff66" stroke-width="2" transform="translate(440,0) scale(-1,1) translate(-440,0)"/>`,

  piste: `<rect width="500" height="320" fill="#7a2e24"/>
    ${[0, 1, 2, 3].map(i => `<rect x="${40 + i * 14}" y="${40 + i * 14}" width="${420 - i * 28}" height="${240 - i * 28}" rx="${110 - i * 14}" fill="none" stroke="#ffffffaa" stroke-width="1.5"/>`).join("")}
    <line x1="250" y1="280" x2="250" y2="320" stroke="#ffffffaa" stroke-width="2"/>`,

  vide: `<rect width="500" height="320" fill="#1E1A16"/>
    ${Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * 50}" y1="0" x2="${(i + 1) * 50}" y2="320" stroke="#ffffff11"/>`).join("")}
    ${Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${(i + 1) * 53}" x2="500" y2="${(i + 1) * 53}" stroke="#ffffff11"/>`).join("")}`,
};

// ── Field distance annotations (real-world measurements) ────────────────────

export const FIELD_DISTANCE_LABELS: Record<FieldType, string> = {
  rugby: [
    // Field is 500×320, playing area x=30..470 (440px), y=20..300 (280px)
    // Real: total ~120m (100m + 2×10m en-but). 440px / 120m = 3.67px/m
    // Lines at x: 30(en-but), 80(ligne d'essai 0m), 140(22m), 250(milieu 50m), 360(22m), 420(ligne d'essai 100m), 470(en-but)
    // en-but=50px=~13.6m (approx for visual)
    // 440px for 100m playing field. 80=0m, 420=100m → 3.4px/m
    // Lines: 0m(80), 5m(97), 10m(114), 15m(131), 22m(155), 40m(216), 50m(250), 40m(284), 22m(345), 15m(369), 10m(386), 5m(403), 0m(420)
    // 5m lines
    `<text x="97" y="14" fill="#ffffff44" font-size="7" text-anchor="middle">5m</text>`,
    `<line x1="97" y1="20" x2="97" y2="300" stroke="#ffffff18" stroke-width="0.8" stroke-dasharray="3 5"/>`,
    `<text x="403" y="14" fill="#ffffff44" font-size="7" text-anchor="middle">5m</text>`,
    `<line x1="403" y1="20" x2="403" y2="300" stroke="#ffffff18" stroke-width="0.8" stroke-dasharray="3 5"/>`,
    // 10m lines (already in background as dashed)
    `<text x="114" y="14" fill="#ffffff44" font-size="7" text-anchor="middle">10m</text>`,
    `<text x="386" y="14" fill="#ffffff44" font-size="7" text-anchor="middle">10m</text>`,
    // Main lines
    `<text x="80" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">0m</text>`,
    `<text x="155" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">22m</text>`,
    `<text x="216" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">40m</text>`,
    `<line x1="216" y1="20" x2="216" y2="300" stroke="#ffffff22" stroke-width="1" stroke-dasharray="4 6"/>`,
    `<text x="250" y="14" fill="#ffffff66" font-size="8" text-anchor="middle">50m</text>`,
    `<text x="284" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">40m</text>`,
    `<line x1="284" y1="20" x2="284" y2="300" stroke="#ffffff22" stroke-width="1" stroke-dasharray="4 6"/>`,
    `<text x="345" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">22m</text>`,
    `<text x="420" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">0m</text>`,
    // Dimensions
    `<text x="250" y="310" fill="#ffffff44" font-size="7" text-anchor="middle">Largeur : 70m · Longueur : 100m (+2×en-but)</text>`,
    // Tick marks
    ...[80, 97, 114, 155, 216, 250, 284, 345, 386, 403, 420].flatMap(x => [
      `<line x1="${x}" y1="296" x2="${x}" y2="300" stroke="#ffffff44" stroke-width="0.8"/>`,
    ]),
  ].join(""),

  foot: [
    // Field 500×320, playing area x=30..470 (440px), y=20..300 (280px)
    // Real: 105m × 68m. 440px/105m ≈ 4.19px/m, 280px/68m ≈ 4.12px/m
    // Penalty area: 16.5m from goal = ~69px. Surface: x=30..99 and x=401..470
    // Goal area: 5.5m = ~23px
    // Centre circle: 9.15m = ~38px (shown as 45px)
    // Halfway line at x=250
    `<text x="250" y="14" fill="#ffffff44" font-size="8" text-anchor="middle">Milieu</text>`,
    `<text x="65" y="88" fill="#ffffff44" font-size="7" text-anchor="middle">16.5m</text>`,
    `<text x="435" y="88" fill="#ffffff44" font-size="7" text-anchor="middle">16.5m</text>`,
    // Penalty spot 11m from goal = ~46px
    `<circle cx="76" cy="160" r="2" fill="#ffffff44"/>`,
    `<text x="76" y="175" fill="#ffffff44" font-size="7" text-anchor="middle">11m</text>`,
    `<circle cx="424" cy="160" r="2" fill="#ffffff44"/>`,
    `<text x="424" y="175" fill="#ffffff44" font-size="7" text-anchor="middle">11m</text>`,
    // Dimensions
    `<text x="250" y="310" fill="#ffffff44" font-size="7" text-anchor="middle">105m × 68m</text>`,
    // Centre circle radius
    `<text x="250" y="120" fill="#ffffff44" font-size="7" text-anchor="middle">R 9.15m</text>`,
  ].join(""),

  basket: [
    // Field 500×320, playing area x=30..470 (440px), y=20..300 (280px)
    // Real: 28m × 15m. 440px/28m ≈ 15.7px/m, 280px/15m ≈ 18.7px/m
    // 3-point line arc at 6.75m from basket = ~106px
    // Free-throw line at 5.80m from baseline = ~91px
    // Paint (raquette): 4.9m wide × 5.80m deep
    `<text x="250" y="14" fill="#ffffff55" font-size="8" text-anchor="middle">Milieu</text>`,
    `<text x="91" y="156" fill="#ffffff44" font-size="7" text-anchor="middle">LF 5.80m</text>`,
    `<text x="409" y="156" fill="#ffffff44" font-size="7" text-anchor="middle">LF 5.80m</text>`,
    `<text x="80" y="55" fill="#ffffff44" font-size="7" text-anchor="middle">3pts 6.75m</text>`,
    `<text x="420" y="55" fill="#ffffff44" font-size="7" text-anchor="middle">3pts 6.75m</text>`,
    // Dimensions
    `<text x="250" y="310" fill="#ffffff44" font-size="7" text-anchor="middle">28m × 15m</text>`,
    // Centre circle
    `<text x="250" y="120" fill="#ffffff44" font-size="7" text-anchor="middle">R 1.80m</text>`,
  ].join(""),

  piste: [
    // Oval track 400m standard (lane 1)
    // Straights: ~84.39m each. Curves: ~115.61m each (2 × ~57.80m semicircles, r=36.50m lane 1)
    // Total: 2×84.39 + 2×115.61 = 400m
    // SVG layout: rect 420×240 with rx=110. Straights top/bottom, curves left/right.
    // Bottom straight = finish side
    `<text x="250" y="318" fill="#ffffffaa" font-size="8" text-anchor="middle">Ligne d'arrivée</text>`,
    `<line x1="250" y1="280" x2="250" y2="295" stroke="#ffffffaa" stroke-width="1.5"/>`,
    // 200m mark (opposite straight, top)
    `<text x="250" y="30" fill="#ffffff66" font-size="8" text-anchor="middle">200m</text>`,
    `<line x1="250" y1="38" x2="250" y2="48" stroke="#ffffff55" stroke-width="1.5"/>`,
    // Straights = 84.39m each
    `<text x="250" y="298" fill="#ffffff44" font-size="7" text-anchor="middle">Ligne droite ~84m</text>`,
    `<text x="250" y="48" fill="#ffffff44" font-size="7" text-anchor="middle">Ligne droite ~84m</text>`,
    // Curves
    `<text x="30" y="168" fill="#ffffff44" font-size="7" text-anchor="middle" transform="rotate(-90,30,168)">Virage ~116m</text>`,
    `<text x="470" y="168" fill="#ffffff44" font-size="7" text-anchor="middle" transform="rotate(90,470,168)">Virage ~116m</text>`,
    // 100m mark (entry of far curve from start)
    `<text x="100" y="280" fill="#ffffff44" font-size="7" text-anchor="middle">100m</text>`,
    `<line x1="100" y1="265" x2="100" y2="275" stroke="#ffffff44" stroke-width="1"/>`,
    // 300m mark (exit of near curve)
    `<text x="400" y="280" fill="#ffffff44" font-size="7" text-anchor="middle">300m</text>`,
    `<line x1="400" y1="265" x2="400" y2="275" stroke="#ffffff44" stroke-width="1"/>`,
    // Overall
    `<text x="250" y="310" fill="#ffffff44" font-size="7" text-anchor="middle">Piste 400m · 8 couloirs · R int. 36.50m</text>`,
  ].join(""),

  vide: "",
};

// ── Color legend ─────────────────────────────────────────────────────────────

export const SCHEMA_COLORS = [
  { color: "#E5484D", label: "Sprint" },
  { color: "#F5A623", label: "Tempo" },
  { color: "#4FA3FF", label: "Footing" },
  { color: "#66F03C", label: "Récup" },
] as const;

// ── Arrowhead computation ───────────────────────────────────────────────────

function arrowHead(
  ax: number, ay: number,
  bx: number, by: number,
  size = 14, spread = 0.4,
): string {
  const ang = Math.atan2(ay - by, ax - bx);
  const p1x = ax - size * Math.cos(ang - spread);
  const p1y = ay - size * Math.sin(ang - spread);
  const p2x = ax - size * Math.cos(ang + spread);
  const p2y = ay - size * Math.sin(ang + spread);
  return `${ax},${ay} ${p1x},${p1y} ${p2x},${p2y}`;
}

// ── Render elements to SVG nodes ─────────────────────────────────────────────

export function renderSchemaElementsSVG(elements: SchemaElement[]): string {
  return elements.map((el, i) => {
    const tx = el.tx ?? 0;
    const ty = el.ty ?? 0;
    const transform = tx || ty ? ` transform="translate(${tx},${ty})"` : "";

    switch (el.type) {
      case "polyline": {
        const pts = (el.points ?? []).map(p => `${p.x},${p.y}`).join(" ");
        return `<g${transform}><polyline points="${pts}" fill="none" stroke="${el.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
      case "arrow": {
        const pts = el.points ?? [];
        const ptsStr = pts.map(p => `${p.x},${p.y}`).join(" ");
        let head = "";
        if (pts.length >= 2) {
          const a = pts[pts.length - 1];
          const b = pts[pts.length - 2];
          head = `<polygon points="${arrowHead(a.x, a.y, b.x, b.y)}" fill="${el.color}"/>`;
        }
        return `<g${transform}><polyline points="${ptsStr}" fill="none" stroke="${el.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${head}</g>`;
      }
      case "cone": {
        const cx = el.x ?? 0;
        const cy = el.y ?? 0;
        return `<g${transform}><polygon points="${cx},${cy - 10} ${cx - 8},${cy + 6} ${cx + 8},${cy + 6}" fill="${el.color}"/></g>`;
      }
      case "text": {
        return `<g${transform}><text x="${el.x ?? 0}" y="${el.y ?? 0}" fill="#fff" font-size="13" font-weight="700">${el.text ?? ""}</text></g>`;
      }
      default:
        return "";
    }
  }).join("");
}
