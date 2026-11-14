/**
 * SchemaEditor — full SVG drawing editor for field schemas.
 * Opens as a near-fullscreen Dialog. Matches maquette exactly.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FieldType, FieldSchema, SchemaElement } from "@/types/energy";
import { FIELD_BACKGROUNDS, FIELD_DISTANCE_LABELS, SCHEMA_COLORS, renderSchemaElementsSVG } from "@/lib/energy/renderSchema";
import { C, H } from "@/lib/theme";
import { cn } from "@/lib/utils";

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

/** Boutons secondaires de l'éditeur (anciens gris neutres → charte). */
const GHOST_BTN = "cursor-pointer rounded border border-agon-brd-l bg-transparent px-3 py-2 text-[12px] font-semibold";
const ACTION_BTN = "cursor-pointer rounded border border-agon-brd-l bg-transparent px-3.5 py-2.5 text-[13px] font-semibold text-agon-tx3";

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
  const [color, setColorState] = useState(H.rougeDoux);
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
      setColorState(H.rougeDoux);
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
        color: C.tx,
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
      const filter = selected ? `drop-shadow(0 0 4px ${C.tx})` : undefined;

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
              <text x={el.x ?? 0} y={el.y ?? 0} fill={C.tx} fontSize={13} fontWeight={700}>
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
        className="max-w-[95vw] w-full sm:max-w-[560px] p-0 border-0 bg-transparent rounded-[6px] sm:rounded-[6px]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Éditeur de schéma</DialogTitle>
        <div className="max-h-[90vh] overflow-y-auto rounded-[6px] border border-agon-brd-l bg-agon-bg p-4">
          {/* ── Toolbar ── */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <select
              value={field}
              onChange={(e) => setField(e.target.value as FieldType)}
              className="rounded border border-agon-brd-l bg-agon-bg px-2.5 py-2 text-[12px] text-agon-tx outline-none"
            >
              {FIELD_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {TOOLS.map(t => (
              <button
                key={t.value}
                onClick={() => setTool(t.value)}
                className={cn(
                  "cursor-pointer rounded border px-3 py-2 text-[12px] font-semibold",
                  tool === t.value
                    ? "border-agon-alerte bg-agon-alerte/10 text-agon-alerte"
                    : "border-agon-brd-l bg-agon-bg text-agon-tx3",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Color palette ── */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-agon-tx3">Allure :</span>
            {SCHEMA_COLORS.map(({ color: c, label }) => (
              <div
                key={c}
                title={label}
                onClick={() => setColor(c)}
                className={cn("h-[26px] w-[26px] cursor-pointer rounded-[99px] border-2", color === c ? "border-agon-tx" : "border-transparent")}
                // Couleur d'allure : donnée du schéma.
                style={{ background: c }}
              />
            ))}
          </div>

          {/* ── Distance toggle ── */}
          {field !== "vide" && (
            <label className="mb-2.5 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showDist}
                onChange={(e) => setShowDist(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-agon-alerte"
              />
              <span className="text-[12px] font-semibold text-agon-tx3">Afficher les distances</span>
            </label>
          )}

          {/* ── SVG Canvas ── */}
          <div className="relative overflow-hidden rounded-[6px] border border-agon-brd-l">
            {/* Text bubble */}
            {bubble && (
              <div
                className="absolute z-10 flex gap-1.5 rounded border border-agon-alerte bg-agon-bg p-1.5"
                // Position du clic (valeur calculée).
                style={{ left: bubble.x, top: bubble.y }}
              >
                <input
                  ref={bubbleInputRef}
                  value={bubble.value}
                  onChange={(e) => setBubble(prev => prev ? { ...prev, value: e.target.value } : null)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmText(); }}
                  placeholder="40m @ sprint"
                  className="w-[150px] rounded-[7px] border border-agon-brd-l bg-agon-s2 px-2 py-1.5 text-[13px] text-agon-tx outline-none"
                />
                <button
                  onClick={confirmText}
                  className="cursor-pointer rounded-[7px] bg-agon-alerte px-2.5 font-bold text-agon-ink"
                >
                  ✓
                </button>
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 500 320"
              className={cn("block w-full touch-none", tool === "select" ? "cursor-default" : "cursor-crosshair")}
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
              <g className={tool === "select" ? "[pointer-events:visiblePainted]" : "pointer-events-none"}>
                {renderElements()}
              </g>
              {/* Drawing in progress */}
              {renderDrawing()}
            </svg>
          </div>

          {/* ── Hint ── */}
          <p className="mt-1.5 text-[11px] text-agon-tx3">
            Droite/Flèche : chaque clic ajoute un angle · double-clic ou ✓ pour terminer.
          </p>

          {/* ── Finish drawing button ── */}
          {isDrawing && (
            <button
              onClick={finishPoly}
              className="mt-1.5 cursor-pointer rounded border border-agon-succes bg-transparent px-3 py-2 text-[12px] font-semibold text-agon-succes"
            >
              ✓ Terminer le tracé
            </button>
          )}

          {/* ── Selection bar ── */}
          {selIdx !== null && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={deleteSel}
                className="cursor-pointer rounded border border-agon-erreur bg-transparent px-3 py-2 text-[12px] font-semibold text-agon-erreur"
              >
                Supprimer
              </button>
              <button
                onClick={recolorSel}
                className={cn(GHOST_BTN, "text-agon-tx3")}
              >
                Couleur active
              </button>
              {selEl?.type === "text" && (
                <button
                  onClick={editSelText}
                  className={cn(GHOST_BTN, "text-agon-tx3")}
                >
                  Modifier texte
                </button>
              )}
            </div>
          )}

          {/* ── Legend ── */}
          <div className="mt-2 flex flex-wrap gap-3.5">
            {SCHEMA_COLORS.map(({ color: c, label }) => (
              <span key={c} className="flex items-center gap-[5px] text-[11px] text-agon-tx3">
                <span className="inline-block h-[3px] w-3.5 rounded-[2px]" style={{ background: c }} />
                {label}
              </span>
            ))}
          </div>

          {/* ── Actions ── */}
          <div className="mt-3 grid grid-cols-[auto_auto_1fr] gap-2">
            <button
              onClick={undo}
              className={ACTION_BTN}
            >
              ↶ Annuler
            </button>
            <button
              onClick={clearAll}
              className={ACTION_BTN}
            >
              Effacer
            </button>
            <button
              onClick={handleSave}
              className="cursor-pointer rounded bg-agon-alerte p-2.5 text-[14px] font-bold text-agon-ink"
            >
              Enregistrer le schéma
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
