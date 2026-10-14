import { useState } from "react";
import { Rnd } from "react-rnd";
import { Plus, Eye } from "lucide-react";
import { format, differenceInDays, parseISO, eachMonthOfInterval, getMonth } from "date-fns";
import { C } from "@/lib/theme";
import type { useCalculatePosition } from "./hooks/useCalculatePosition";

const LABEL_W   = 88;
const ROW_H     = 52;
const ITEM_H    = 36;
const ITEM_Y    = (ROW_H - ITEM_H) / 2;
const MIN_W_PX  = 32;

export type TLLevel = "macrocycle" | "mesocycle" | "cycle" | "microcycle";

const LEVEL_COLOR: Record<TLLevel, string> = {
  macrocycle: C.ac,
  mesocycle:  C.coach,
  cycle:      C.o,
  microcycle: C.tx3,
};

const LEVEL_BG: Record<TLLevel, string> = {
  macrocycle: C.acS,
  mesocycle:  C.coachS,
  cycle:      C.oS,
  microcycle: "rgba(231,211,168,0.08)",
};

const LEVEL_LABEL: Record<TLLevel, string> = {
  macrocycle: "Macro",
  mesocycle:  "Méso",
  cycle:      "Cycle",
  microcycle: "Micro",
};

// ── Resize grip handle (2 vertical lines, rendered inside the block) ──────────

function GripHandle({ color }: { color: string }) {
  return (
    <div
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 3, cursor: "ew-resize",
      }}
    >
      <div style={{ width: 2, height: 13, borderRadius: 1, background: color, opacity: 0.55 }} />
      <div style={{ width: 2, height: 13, borderRadius: 1, background: color, opacity: 0.55 }} />
    </div>
  );
}

// ── Single item ───────────────────────────────────────────────────────────────

interface TLItemProps {
  id:         string;
  label:      string;
  isDeload?:  boolean;
  x:          number;
  width:      number;
  color:      string;
  bg:         string;
  onOpen:     () => void;
  onAdd?:     () => void;
  onZoom?:    () => void;
  onDragStop: (newX: number) => void;
  onResizeStop: (newX: number, newWidth: number) => void;
  /** Lock the start date: no drag (move), no left-resize. Only the end can be resized. */
  lockStart?: boolean;
}

/** Handle zone width (px) — must match paddingLeft/paddingRight on content div */
const HANDLE_W = 14;

function TLItem({ id, label, isDeload, x, width, color, bg, onOpen, onAdd, onZoom, onDragStop, onResizeStop, lockStart }: TLItemProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <Rnd
      key={id}
      position={{ x, y: ITEM_Y }}
      // -1px gap so adjacent items don't visually bleed into each other
      size={{ width: Math.max(width - 1, MIN_W_PX), height: ITEM_H }}
      dragAxis="x"
      disableDragging={lockStart}
      minWidth={MIN_W_PX}
      enableResizing={{
        left: !lockStart, right: true,
        top: false, bottom: false,
        topLeft: false, topRight: false, bottomLeft: false, bottomRight: false,
      }}
      // Handles positioned INSIDE the block (left: 0 / right: 0, not at boundary)
      resizeHandleStyles={{
        left:  { position: "absolute", left: 0,  top: 0, width: HANDLE_W, height: "100%", zIndex: 5 },
        right: { position: "absolute", right: 0, top: 0, width: HANDLE_W, height: "100%", zIndex: 5 },
      }}
      resizeHandleComponent={{
        left:  <GripHandle color={color} />,
        right: <GripHandle color={color} />,
      }}
      onDragStart={() => setDragging(true)}
      onDragStop={(_e, d) => { setDragging(false); onDragStop(d.x); }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        onResizeStop(pos.x, ref.offsetWidth);
      }}
      style={{ zIndex: dragging ? 10 : 2 }}
      enableUserSelectHack={false}
    >
      <div
        onClick={(e) => { if (!dragging) { e.stopPropagation(); onOpen(); } }}
        style={{
          width: "100%", height: "100%",
          background: bg,
          border: `1px solid ${color}50`,
          borderTop: `3px solid ${color}`,
          borderRadius: 0, // rectangular
          display: "flex", alignItems: "center",
          // Padding matches handle zone so text never hides behind grips
          paddingLeft: HANDLE_W + 4, paddingRight: HANDLE_W + 4,
          cursor: lockStart ? "pointer" : (dragging ? "grabbing" : "grab"),
          userSelect: "none",
          overflow: "hidden",
          opacity: dragging ? 0.78 : 1,
          boxShadow: dragging ? `0 4px 16px ${color}40` : "none",
          transition: "opacity 100ms, box-shadow 100ms",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        {/* Deload hatching */}
        {isDeload && (
          <div
            style={{
              position: "absolute", inset: 0,
              background: `repeating-linear-gradient(45deg, transparent, transparent 5px, ${C.b}18 5px, ${C.b}18 10px)`,
              pointerEvents: "none",
            }}
          />
        )}
        <span
          style={{
            fontSize: 10, fontWeight: 700, color: "#fff",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, lineHeight: 1.2,
          }}
        >
          {isDeload && <span style={{ color: C.b, marginRight: 3 }}>⟳</span>}
          {label}
        </span>
        {onZoom && (
          <button
            onClick={(e) => { e.stopPropagation(); onZoom(); }}
            title="Zoomer sur ce macrocycle"
            style={{
              width: 18, height: 18, borderRadius: 3, flexShrink: 0,
              border: `1px solid ${color}60`, background: "transparent",
              color, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginLeft: 4,
            }}
          >
            <Eye size={10} />
          </button>
        )}
        {onAdd && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            style={{
              width: 18, height: 18, borderRadius: 3, flexShrink: 0,
              border: `1px solid ${color}60`, background: "transparent",
              color, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginLeft: 4,
            }}
          >
            <Plus size={10} />
          </button>
        )}
      </div>
    </Rnd>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

export interface TLRowItem {
  id:         string;
  label:      string;
  startDate:  string;
  endDate:    string;
  isDeload?:  boolean;
  parentStart?: string;
  parentEnd?:   string;
}

type CalcPos = ReturnType<typeof useCalculatePosition>;

interface TimelineRowProps {
  level:    TLLevel;
  items:    TLRowItem[];
  calc:     CalcPos;
  rangeStart: string;
  rangeEnd:   string;
  athleteId:  string;
  onOpen:   (id: string) => void;
  onAdd?:   (id: string) => void;
  onZoom?:  (id: string) => void;
  onNewRow?: () => void;
  onDrag?:  (id: string, newStart: string, newEnd: string, parentStart?: string, parentEnd?: string) => void;
  onResize?: (id: string, newStart: string, newEnd: string, parentStart?: string, parentEnd?: string) => void;
  /** Render items as static chips — no drag, no resize */
  readOnly?: boolean;
  /** Increment to force all TLItems to remount (resets Rnd internal position) */
  rowResetKey?: number;
  /** Lock start date for all items: no drag, no left-resize (only end resize) */
  lockStart?: boolean;
}

export function TimelineRow({
  level, items, calc, rangeStart, rangeEnd, athleteId, onOpen, onAdd, onZoom, onNewRow, onDrag, onResize, readOnly, rowResetKey, lockStart,
}: TimelineRowProps) {
  const color = LEVEL_COLOR[level];
  const bg    = LEVEL_BG[level];
  const trackW = (calc as unknown as { totalDays: number; pixPerDay: number }).pixPerDay *
                 (calc as unknown as { totalDays: number }).totalDays;

  return (
    <div style={{ display: "flex", borderBottom: "1px solid " + C.brd + "50" }}>
      {/* Label */}
      <div
        style={{
          width: LABEL_W, flexShrink: 0, height: ROW_H,
          display: "flex", alignItems: "center", paddingLeft: 8, paddingRight: 4,
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 9, fontWeight: 700, color,
            textTransform: "uppercase", letterSpacing: "0.5px", flex: 1,
          }}
        >
          {LEVEL_LABEL[level]}
        </span>
        {onNewRow && (
          <button
            onClick={onNewRow}
            title={`Nouveau ${LEVEL_LABEL[level].toLowerCase()}`}
            style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              border: `1px solid ${color}50`, background: "transparent",
              color, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Plus size={9} />
          </button>
        )}
      </div>

      {/* Track */}
      <div
        style={{
          flex: 1, height: ROW_H, position: "relative",
          background: level === "macrocycle" ? C.ac + "04" : "transparent",
        }}
      >
        {/* Month grid lines */}
        {eachMonthOfInterval({ start: parseISO(rangeStart), end: parseISO(rangeEnd) }).map((m) => {
          const x = calc.dateToX(format(m, "yyyy-MM-dd"));
          const isJan = getMonth(m) === 0;
          return (
            <div
              key={m.toISOString()}
              style={{
                position: "absolute",
                left: x,
                top: 0, bottom: 0, width: isJan ? 2 : 1,
                background: isJan ? C.brd : C.brd,
                opacity: isJan ? 0.9 : 0.4,
                pointerEvents: "none",
              }}
            />
          );
        })}

        {items.map((item) => {
          // N'affiche pas un élément entièrement hors de la fenêtre visible
          // (ex. cycle passé qui sinon laisse un résidu collé au bord gauche).
          if (item.endDate < rangeStart || item.startDate > rangeEnd) return null;

          const { x, width } = calc.position(item.startDate, item.endDate);

          // ── Static chip (microcycles) ────────────────────────────────────
          if (readOnly) {
            const CHIP_H = 20;
            const CHIP_Y = (ROW_H - CHIP_H) / 2;
            return (
              <div
                key={item.id}
                onClick={() => onOpen(item.id)}
                title={item.label}
                style={{
                  position: "absolute",
                  left: x + 1, top: CHIP_Y,
                  width: Math.max(width - 2, 6),
                  height: CHIP_H,
                  background: bg,
                  border: `1px solid ${color}50`,
                  borderTop: `2px solid ${color}`,
                  borderRadius: 0,
                  display: "flex", alignItems: "center",
                  paddingLeft: 5, overflow: "hidden",
                  cursor: "pointer", zIndex: 2,
                  userSelect: "none",
                }}
              >
                {item.isDeload && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 4, background: `repeating-linear-gradient(45deg,transparent,transparent 4px,${C.b}18 4px,${C.b}18 8px)`, pointerEvents: "none" }} />
                )}
                <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                  {item.isDeload ? "⟳ " : ""}{item.label}
                </span>
              </div>
            );
          }

          // ── Interactive item (Rnd) ───────────────────────────────────────
          const dur = differenceInDays(parseISO(item.endDate), parseISO(item.startDate));
          return (
            <TLItem
              key={`${item.id}-${rowResetKey ?? 0}-${item.startDate}`}
              id={item.id}
              label={item.label}
              isDeload={item.isDeload}
              x={x}
              width={width}
              color={color}
              bg={bg}
              onOpen={() => onOpen(item.id)}
              onAdd={onAdd ? () => onAdd(item.id) : undefined}
              onZoom={onZoom ? () => onZoom(item.id) : undefined}
              lockStart={lockStart}
              onDragStop={(newX) => {
                let fx = newX;
                if (item.parentStart && item.parentEnd) {
                  const { x: px, width: pw } = calc.position(item.parentStart, item.parentEnd);
                  fx = Math.max(px, Math.min(newX, px + pw - width));
                } else {
                  fx = Math.max(0, Math.min(newX, trackW - width));
                }
                const newStart = calc.xToDateStr(fx);
                const newEnd   = format(
                  new Date(parseISO(newStart).getTime() + dur * 86400000),
                  "yyyy-MM-dd",
                );
                onDrag?.(item.id, newStart, newEnd, item.parentStart, item.parentEnd);
              }}
              onResizeStop={(newX, newW) => {
                let fx = newX, fw = newW;
                if (item.parentStart && item.parentEnd) {
                  const clamped = calc.clampToParent(newX, newW, item.parentStart, item.parentEnd);
                  fx = clamped.x; fw = clamped.width;
                } else {
                  fx = Math.max(0, newX);
                  fw = Math.min(newW, trackW - fx);
                }
                const newStart = calc.xToDateStr(fx);
                const newEnd   = calc.xToDateStr(fx + fw);
                onResize?.(item.id, newStart, newEnd, item.parentStart, item.parentEnd);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
