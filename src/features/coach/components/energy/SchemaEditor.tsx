/**
 * SchemaEditor — full SVG drawing editor for field schemas.
 * Opens as a near-fullscreen Dialog. Matches maquette exactly.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FieldType, FieldSchema, SchemaElement } from "@/types/energy";
import { FIELD_BACKGROUNDS, FIELD_DISTANCE_LABELS, SCHEMA_COLORS, renderSchemaElementsSVG } from "@/lib/energy/renderSchema";

// ── Types ────────────────────────────────────────────────────────────────────

type ToolType = "line" | "arrow" | "cone" | "label" | "select";
interface Point { x: number; y: number }

// ── Constants ────────────────────────────────────────────────────────────────

const FIELD_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "rugby", label: "Terrain rugby" },
  { value: "foot", label: "Terrain foot" },
  { value: "basket", label: "Terrain basket" },
  { value: "piste", label: "Piste athlé" },
  { value: "vide", label: "Fond vide (grille)" },
];

const TOOLS: { value: ToolType; label: string }[] = [
  { value: "line", label: "╱ Droite" },
  { value: "arrow", label: "→ Flèche" },
  { value: "cone", label: "▲ Plot" },
  { value: "label", label: "T Texte" },
  { value: "select", label: "⬚ Sélection" },
];

const S = {
  bg: "#0E0C0A", card: "#0E0C0A", card2: "#26252A",
  border: "#2E2D33", txt: "#F2F1F5", muted: "#8B8A92", accent: "#F5A623",
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function svgPoint(svg: SVGSVGElement, e: React.PointerEvent): Point {
  const r = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * 500,
    y: ((e.clientY - r.top) / r.height) * 320,
  };
}

function arrowHead(a: Point, b: Point, size = 14, spread = 0.4): string {
  const ang = Math.atan2(a.y - b.y, a.x - b.x);
  const p1x = a.x - size * Math.cos(ang - spread);
  const p1y = a.y - size * Math.sin(ang - spread);
  const p2x = a.x - size * Math.cos(ang + spread);
  const p2y = a.y - size * Math.sin(ang + spread);
  return `${a.x},${a.y} ${p1x},${p1y} ${p2x},${p2y}`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: FieldSchema | null;
  onSave: (schema: FieldSchema) => void;
}

export default function SchemaEditor({ open, onOpenChange, value, onSave }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // State
  const [field, setField] = useState<FieldType>(value?.field ?? "rugby");
  const [tool, setToolState] = useState<ToolType>("line");
  const [color, setColorState] = useState("#E5484D");
  const [elements, setElements] = useState<SchemaElement[]>(value?.elements ?? []);

  const [showDist, setShowDist] = useState(value?.showDistances ?? false);

  // Drawing state
  const [drawingPts, setDrawingPts] = useState<Point[]>([]);
  const [previewPt, setPreviewPt] = useState<Point | null>(null);
  const lastTapRef = useRef(0);

  // Selection state
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const dragOffRef = useRef<Point | null>(null);

  // Text bubble state
  const [bubble, setBubble] = useState<{
    x: number; y: number; svgX: number; svgY: number;
    value: string; editIdx?: number;
  } | null>(null);
  const bubbleInputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setField(value?.field ?? "rugby");
      setElements(value?.elements ?? []);
      setShowDist(value?.showDistances ?? false);
      setToolState("line");
      setColorState("#E5484D");
      setDrawingPts([]);
      setPreviewPt(null);
      setSelIdx(null);
      setBubble(null);
    }
  }, [open, value]);

  // Focus bubble input
  useEffect(() => {
    if (bubble && bubbleInputRef.current) bubbleInputRef.current.focus();
  }, [bubble]);

  // ── Finish polyline/arrow ─────────────────────────────────────────────────

  const finishPoly = useCallback(() => {
    if (drawingPts.length < 2) {
      setDrawingPts([]);
      setPreviewPt(null);
      return;
    }
    const newEl: SchemaElement = {
      type: tool === "arrow" ? "arrow" : "polyline",
      points: [...drawingPts],
      color,
    };
    setElements(prev => [...prev, newEl]);
    setDrawingPts([]);
    setPreviewPt(null);
  }, [drawingPts, tool, color]);

  // ── Tool/color change mid-draw finishes poly ──────────────────────────────

  const setTool = useCallback((t: ToolType) => {
    if (drawingPts.length > 0) finishPoly();
    setToolState(t);
    if (t !== "select") setSelIdx(null);
  }, [drawingPts, finishPoly]);

  const setColor = useCallback((c: string) => {
    if (drawingPts.length > 0) finishPoly();
    setColorState(c);
  }, [drawingPts, finishPoly]);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const p = svgPoint(svgRef.current, e);

    if (tool === "select") {
      // Find element under click (reverse order = top first)
      const target = e.target as SVGElement;
      const gEl = target.closest("g[data-eidx]") as SVGGElement | null;
      if (gEl) {
        const idx = parseInt(gEl.dataset.eidx!, 10);
        setSelIdx(idx);
        dragOffRef.current = p;
        svgRef.current.setPointerCapture(e.pointerId);
      } else {
        setSelIdx(null);
      }
      return;
    }

    if (tool === "cone") {
      setElements(prev => [...prev, { type: "cone", x: p.x, y: p.y, color }]);
      return;
    }

    if (tool === "label") {
      const r = svgRef.current.getBoundingClientRect();
      setBubble({
        x: Math.min(e.clientX - r.left, r.width - 200),
        y: Math.min(e.clientY - r.top, r.height - 50),
        svgX: p.x,
        svgY: p.y,
        value: "",
      });
      return;
    }

    // line / arrow — multi-point drawing
    const now = Date.now();
    if (drawingPts.length > 0 && now - lastTapRef.current < 300) {
      // Double click → finish
      finishPoly();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    if (drawingPts.length === 0) {
      setDrawingPts([p]);
      setPreviewPt(p);
    } else {
      setDrawingPts(prev => [...prev, p]);
      setPreviewPt(p);
    }
  }, [tool, color, drawingPts, finishPoly]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const p = svgPoint(svgRef.current, e);

    // Preview line
    if (drawingPts.length > 0) {
      setPreviewPt(p);
    }

    // Drag selected element
    if (tool === "select" && selIdx !== null && dragOffRef.current) {
      const dx = p.x - dragOffRef.current.x;
      const dy = p.y - dragOffRef.current.y;
      dragOffRef.current = p;
      setElements(prev => prev.map((el, i) => {
        if (i !== selIdx) return el;
        return { ...el, tx: (el.tx ?? 0) + dx, ty: (el.ty ?? 0) + dy };
      }));
    }
  }, [drawingPts, tool, selIdx]);

  const handlePointerUp = useCallback(() => {
    dragOffRef.current = null;
  }, []);

  // ── Text bubble ───────────────────────────────────────────────────────────

  const confirmText = useCallback(() => {
    if (!bubble) return;
    const v = bubble.value.trim();
    setBubble(null);
    if (!v) return;

    if (bubble.editIdx !== undefined) {
      // Edit existing text
      setElements(prev => prev.map((el, i) =>
        i === bubble.editIdx ? { ...el, text: v } : el
      ));
    } else {
      setElements(prev => [...prev, {
        type: "text" as const,
        x: bubble.svgX,
        y: bubble.svgY,
        color: "#fff",
        text: v,
      }]);
    }
  }, [bubble]);

  // ── Selection actions ─────────────────────────────────────────────────────

  const deleteSel = useCallback(() => {
    if (selIdx === null) return;
    setElements(prev => prev.filter((_, i) => i !== selIdx));
    setSelIdx(null);
  }, [selIdx]);

  const recolorSel = useCallback(() => {
    if (selIdx === null) return;
    setElements(prev => prev.map((el, i) =>
      i === selIdx ? { ...el, color } : el
    ));
  }, [selIdx, color]);

  const editSelText = useCallback(() => {
    if (selIdx === null) return;
    const el = elements[selIdx];
    if (el.type !== "text") return;
    setBubble({
      x: 12, y: 12,
      svgX: el.x ?? 0, svgY: el.y ?? 0,
      value: el.text ?? "",
      editIdx: selIdx,
    });
  }, [selIdx, elements]);

  // ── Undo / Clear ──────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    setElements(prev => prev.slice(0, -1));
    setSelIdx(null);
  }, []);

  const clearAll = useCallback(() => {
    setElements([]);
    setSelIdx(null);
    setDrawingPts([]);
    setPreviewPt(null);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (drawingPts.length > 0) finishPoly();
    onSave({ field, elements, showDistances: showDist });
    onOpenChange(false);
  }, [field, elements, showDist, drawingPts, finishPoly, onSave, onOpenChange]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const isDrawing = drawingPts.length > 0;
  const selEl = selIdx !== null ? elements[selIdx] : null;

  // Build SVG for existing elements with data-eidx for selection
  function renderElements() {
    return elements.map((el, i) => {
      const tx = el.tx ?? 0;
      const ty = el.ty ?? 0;
      const transform = tx || ty ? `translate(${tx},${ty})` : undefined;
      const selected = i === selIdx;
      const filter = selected ? "drop-shadow(0 0 4px #fff)" : undefined;

      switch (el.type) {
        case "polyline":
          return (
            <g key={i} data-eidx={i} transform={transform} style={{ filter }}>
              <polyline
                points={(el.points ?? []).map(p => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke={el.color} strokeWidth={4}
                strokeLinecap="round" strokeLinejoin="round"
              />
            </g>
          );
        case "arrow": {
          const pts = el.points ?? [];
          const ptsStr = pts.map(p => `${p.x},${p.y}`).join(" ");
          const head = pts.length >= 2
            ? arrowHead(pts[pts.length - 1], pts[pts.length - 2])
            : null;
          return (
            <g key={i} data-eidx={i} transform={transform} style={{ filter }}>
              <polyline
                points={ptsStr} fill="none" stroke={el.color} strokeWidth={4}
                strokeLinecap="round" strokeLinejoin="round"
              />
              {head && <polygon points={head} fill={el.color} />}
            </g>
          );
        }
        case "cone": {
          const cx = el.x ?? 0;
          const cy = el.y ?? 0;
          return (
            <g key={i} data-eidx={i} transform={transform} style={{ filter }}>
              <polygon
                points={`${cx},${cy - 10} ${cx - 8},${cy + 6} ${cx + 8},${cy + 6}`}
                fill={el.color}
              />
            </g>
          );
        }
        case "text":
          return (
            <g key={i} data-eidx={i} transform={transform} style={{ filter }}>
              <text x={el.x ?? 0} y={el.y ?? 0} fill="#fff" fontSize={13} fontWeight={700}>
                {el.text}
              </text>
            </g>
          );
        default:
          return null;
      }
    });
  }

  // Drawing-in-progress polyline + preview
  function renderDrawing() {
    if (drawingPts.length === 0) return null;
    const ptsStr = drawingPts.map(p => `${p.x},${p.y}`).join(" ");
    const last = drawingPts[drawingPts.length - 1];
    return (
      <>
        <polyline
          points={ptsStr} fill="none" stroke={color} strokeWidth={4}
          strokeLinecap="round" strokeLinejoin="round"
        />
        {previewPt && (
          <line
            x1={last.x} y1={last.y} x2={previewPt.x} y2={previewPt.y}
            stroke={color} strokeWidth={4} strokeDasharray="4 5" opacity={0.5}
          />
        )}
      </>
    );
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-full sm:max-w-[560px] p-0 border-0 bg-transparent"
        style={{ borderRadius: 6 }}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Éditeur de schéma</DialogTitle>
        <div style={{
          background: S.bg, borderRadius: 6, padding: "16px",
          border: `1px solid ${S.border}`, maxHeight: "90vh", overflowY: "auto",
        }}>
          {/* ── Toolbar ── */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <select
              value={field}
              onChange={(e) => setField(e.target.value as FieldType)}
              style={{
                background: S.card, border: `1px solid ${S.border}`, color: S.txt,
                fontSize: 12, padding: "8px 10px", borderRadius: 4, outline: "none",
              }}
            >
              {FIELD_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {TOOLS.map(t => (
              <button
                key={t.value}
                onClick={() => setTool(t.value)}
                style={{
                  background: tool === t.value ? "rgba(245,166,35,0.1)" : S.card,
                  border: `1px solid ${tool === t.value ? S.accent : S.border}`,
                  color: tool === t.value ? S.accent : S.muted,
                  fontSize: 12, fontWeight: 600, padding: "8px 12px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Color palette ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>Allure :</span>
            {SCHEMA_COLORS.map(({ color: c, label }) => (
              <div
                key={c}
                title={label}
                onClick={() => setColor(c)}
                style={{
                  width: 26, height: 26, borderRadius: 99, background: c,
                  border: color === c ? "2px solid #fff" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          {/* ── Distance toggle ── */}
          {field !== "vide" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showDist}
                onChange={(e) => setShowDist(e.target.checked)}
                style={{ accentColor: S.accent, width: 16, height: 16, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: S.muted, fontWeight: 600 }}>Afficher les distances</span>
            </label>
          )}

          {/* ── SVG Canvas ── */}
          <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", border: `1px solid ${S.border}` }}>
            {/* Text bubble */}
            {bubble && (
              <div style={{
                position: "absolute", left: bubble.x, top: bubble.y,
                display: "flex", gap: 6,
                background: S.card, border: `1px solid ${S.accent}`,
                borderRadius: 4, padding: 6, zIndex: 10,
              }}>
                <input
                  ref={bubbleInputRef}
                  value={bubble.value}
                  onChange={(e) => setBubble(prev => prev ? { ...prev, value: e.target.value } : null)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmText(); }}
                  placeholder="40m @ sprint"
                  style={{
                    width: 150, background: S.card2, border: `1px solid ${S.border}`,
                    borderRadius: 7, color: S.txt, padding: "6px 8px", fontSize: 13,
                    outline: "none", fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={confirmText}
                  style={{
                    background: S.accent, border: "none", borderRadius: 7,
                    color: "#1a1204", fontWeight: 700, padding: "0 10px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ✓
                </button>
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 500 320"
              style={{
                width: "100%", display: "block", touchAction: "none",
                cursor: tool === "select" ? "default" : "crosshair",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Background */}
              <g dangerouslySetInnerHTML={{ __html: FIELD_BACKGROUNDS[field] }} />
              {/* Distance labels */}
              {showDist && FIELD_DISTANCE_LABELS[field] && (
                <g dangerouslySetInnerHTML={{ __html: FIELD_DISTANCE_LABELS[field] }} />
              )}
              {/* Elements */}
              <g style={{ pointerEvents: tool === "select" ? "visiblePainted" : "none" }}>
                {renderElements()}
              </g>
              {/* Drawing in progress */}
              {renderDrawing()}
            </svg>
          </div>

          {/* ── Hint ── */}
          <p style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>
            Droite/Flèche : chaque clic ajoute un angle · double-clic ou ✓ pour terminer.
          </p>

          {/* ── Finish drawing button ── */}
          {isDrawing && (
            <button
              onClick={finishPoly}
              style={{
                marginTop: 6, background: "none",
                border: `1px solid #66F03C`, color: "#66F03C",
                fontSize: 12, fontWeight: 600, padding: "8px 12px",
                borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ✓ Terminer le tracé
            </button>
          )}

          {/* ── Selection bar ── */}
          {selIdx !== null && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={deleteSel}
                style={{
                  background: "none", border: `1px solid #E5484D`, color: "#E5484D",
                  fontSize: 12, fontWeight: 600, padding: "8px 12px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Supprimer
              </button>
              <button
                onClick={recolorSel}
                style={{
                  background: "none", border: `1px solid ${S.border}`, color: S.muted,
                  fontSize: 12, fontWeight: 600, padding: "8px 12px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Couleur active
              </button>
              {selEl?.type === "text" && (
                <button
                  onClick={editSelText}
                  style={{
                    background: "none", border: `1px solid ${S.border}`, color: S.muted,
                    fontSize: 12, fontWeight: 600, padding: "8px 12px",
                    borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Modifier texte
                </button>
              )}
            </div>
          )}

          {/* ── Legend ── */}
          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            {SCHEMA_COLORS.map(({ color: c, label }) => (
              <span key={c} style={{ fontSize: 11, color: S.muted, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: c, display: "inline-block" }} />
                {label}
              </span>
            ))}
          </div>

          {/* ── Actions ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "auto auto 1fr",
            gap: 8, marginTop: 12,
          }}>
            <button
              onClick={undo}
              style={{
                background: "none", border: `1px solid ${S.border}`, color: S.muted,
                borderRadius: 4, padding: "10px 14px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ↶ Annuler
            </button>
            <button
              onClick={clearAll}
              style={{
                background: "none", border: `1px solid ${S.border}`, color: S.muted,
                borderRadius: 4, padding: "10px 14px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Effacer
            </button>
            <button
              onClick={handleSave}
              style={{
                background: S.accent, color: "#1a1204", border: "none",
                borderRadius: 4, padding: "10px", fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Enregistrer le schéma
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
