import { useState } from "react";
import { Rnd } from "react-rnd";
import { Plus, Eye } from "lucide-react";
import { format, differenceInDays, parseISO, eachMonthOfInterval, getMonth } from "date-fns";
import { cn } from "@/lib/utils";
import type { useCalculatePosition } from "./hooks/useCalculatePosition";
import { LEVEL_STYLE } from "./utils/timelineLevels";

const ROW_H = 52;
const ITEM_H = 36;
const ITEM_Y = (ROW_H - ITEM_H) / 2;
const MIN_W_PX = 32;

export type TLLevel = "macrocycle" | "mesocycle" | "cycle" | "microcycle";

const LEVEL_LABEL: Record<TLLevel, string> = {
  macrocycle: "Macro",
  mesocycle: "Méso",
  cycle: "Cycle",
  microcycle: "Micro",
};

const DELOAD_HATCH =
  "bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,var(--agon-info-doux)_5px,var(--agon-info-doux)_10px)]";

// ── Poignée de redimensionnement (deux traits, dans le bloc) ──────────────────

function GripHandle({ level }: { level: TLLevel }) {
  return (
    <div className="flex h-full w-full cursor-ew-resize items-center justify-center gap-[3px]">
      <div className={cn("h-[13px] w-0.5 rounded-[1px] opacity-[.55]", LEVEL_STYLE[level].solid)} />
      <div className={cn("h-[13px] w-0.5 rounded-[1px] opacity-[.55]", LEVEL_STYLE[level].solid)} />
    </div>
  );
}

// ── Un bloc ───────────────────────────────────────────────────────────────────

interface TLItemProps {
  id: string;
  level: TLLevel;
  label: string;
  isDeload?: boolean;
  x: number;
  width: number;
  onOpen: () => void;
  onAdd?: () => void;
  onZoom?: () => void;
  onDragStop: (newX: number) => void;
  onResizeStop: (newX: number, newWidth: number) => void;
  /** Verrouille le début : pas de déplacement, pas de redimensionnement à gauche. */
  lockStart?: boolean;
}

/** Largeur de la zone des poignées (px) : doit correspondre au padding du contenu. */
const HANDLE_W = 14;

const MINI_BTN = "ml-agon-xs flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border bg-transparent";

function TLItem({ id, level, label, isDeload, x, width, onOpen, onAdd, onZoom, onDragStop, onResizeStop, lockStart }: TLItemProps) {
  const [dragging, setDragging] = useState(false);
  const style = LEVEL_STYLE[level];

  return (
    <Rnd
      key={id}
      position={{ x, y: ITEM_Y }}
      // -1 px d'écart : deux blocs voisins ne se touchent pas visuellement
      size={{ width: Math.max(width - 1, MIN_W_PX), height: ITEM_H }}
      dragAxis="x"
      disableDragging={lockStart}
      minWidth={MIN_W_PX}
      enableResizing={{
        left: !lockStart, right: true,
        top: false, bottom: false,
        topLeft: false, topRight: false, bottomLeft: false, bottomRight: false,
      }}
      // Poignées DANS le bloc (left: 0 / right: 0, pas à la frontière)
      resizeHandleStyles={{
        left: { position: "absolute", left: 0, top: 0, width: HANDLE_W, height: "100%", zIndex: 5 },
        right: { position: "absolute", right: 0, top: 0, width: HANDLE_W, height: "100%", zIndex: 5 },
      }}
      resizeHandleComponent={{
        left: <GripHandle level={level} />,
        right: <GripHandle level={level} />,
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
        // Le bloc glisse sur l'axe X : on laisse le défilement vertical de la page au doigt.
        className={cn(
          "relative box-border flex h-full w-full select-none items-center overflow-hidden border border-t-[3px] px-[18px] transition-[opacity,box-shadow] duration-100 touch-pan-y",
          style.block, style.top,
          lockStart ? "cursor-pointer" : dragging ? "cursor-grabbing opacity-80 shadow-lg" : "cursor-grab",
        )}
      >
        {isDeload && <div className={cn("pointer-events-none absolute inset-0", DELOAD_HATCH)} />}
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-agon-xs font-bold leading-tight text-agon-tx">
          {isDeload && <span className="mr-agon-2xs text-agon-info">⟳</span>}
          {label}
        </span>
        {onZoom && (
          <button
            type="button"
            title="Zoomer sur ce macrocycle"
            aria-label="Zoomer sur ce macrocycle"
            onClick={(e) => { e.stopPropagation(); onZoom(); }}
            className={cn(MINI_BTN, style.border, style.text)}
          >
            <Eye size={10} />
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            aria-label="Ajouter"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className={cn(MINI_BTN, style.border, style.text)}
          >
            <Plus size={10} />
          </button>
        )}
      </div>
    </Rnd>
  );
}

// ── Ligne ─────────────────────────────────────────────────────────────────────

export interface TLRowItem {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isDeload?: boolean;
  parentStart?: string;
  parentEnd?: string;
}

type CalcPos = ReturnType<typeof useCalculatePosition>;

interface TimelineRowProps {
  level: TLLevel;
  items: TLRowItem[];
  calc: CalcPos;
  rangeStart: string;
  rangeEnd: string;
  /** Largeur de la colonne de libellés (px). */
  labelWidth: number;
  onOpen: (id: string) => void;
  onAdd?: (id: string) => void;
  onZoom?: (id: string) => void;
  onNewRow?: () => void;
  onDrag?: (id: string, newStart: string, newEnd: string, parentStart?: string, parentEnd?: string) => void;
  onResize?: (id: string, newStart: string, newEnd: string, parentStart?: string, parentEnd?: string) => void;
  /** Blocs statiques (pastilles) : ni déplacement ni redimensionnement. */
  readOnly?: boolean;
  /** Incrémenter pour remonter tous les blocs (remet Rnd à sa position). */
  rowResetKey?: number;
  /** Verrouille le début de tous les blocs : seule la fin se redimensionne. */
  lockStart?: boolean;
}

export function TimelineRow({
  level, items, calc, rangeStart, rangeEnd, labelWidth, onOpen, onAdd, onZoom, onNewRow, onDrag, onResize, readOnly, rowResetKey, lockStart,
}: TimelineRowProps) {
  const style = LEVEL_STYLE[level];
  const trackW = (calc as unknown as { totalDays: number; pixPerDay: number }).pixPerDay *
                 (calc as unknown as { totalDays: number }).totalDays;

  return (
    <div className="flex border-b border-agon-brd/50">
      <div className="flex shrink-0 items-center gap-agon-xs pl-agon-sm pr-agon-xs" style={{ width: labelWidth, height: ROW_H }}>
        <span className={cn("flex-1 truncate text-agon-xs font-bold uppercase tracking-wide", style.text)}>
          {LEVEL_LABEL[level]}
        </span>
        {onNewRow && (
          <button
            type="button"
            onClick={onNewRow}
            title={`Nouveau ${LEVEL_LABEL[level].toLowerCase()}`}
            aria-label={`Nouveau ${LEVEL_LABEL[level].toLowerCase()}`}
            className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border bg-transparent", style.border, style.text)}
          >
            <Plus size={10} />
          </button>
        )}
      </div>

      <div className={cn("relative min-w-0 flex-1", level === "macrocycle" && "bg-agon-accent/[0.03]")} style={{ height: ROW_H }}>
        {/* Lignes de mois */}
        {eachMonthOfInterval({ start: parseISO(rangeStart), end: parseISO(rangeEnd) }).map((m) => {
          const isJan = getMonth(m) === 0;
          return (
            <div
              key={m.toISOString()}
              className={cn("pointer-events-none absolute inset-y-0 bg-agon-brd", isJan ? "w-0.5 opacity-90" : "w-px opacity-40")}
              style={{ left: calc.dateToX(format(m, "yyyy-MM-dd")) }}
            />
          );
        })}

        {items.map((item) => {
          // N'affiche pas un élément entièrement hors de la fenêtre visible
          // (ex. cycle passé qui sinon laisse un résidu collé au bord gauche).
          if (item.endDate < rangeStart || item.startDate > rangeEnd) return null;

          const { x, width } = calc.position(item.startDate, item.endDate);

          // ── Pastille statique (microcycles) ─────────────────────────────
          if (readOnly) {
            const CHIP_H = 20;
            return (
              <div
                key={item.id}
                onClick={() => onOpen(item.id)}
                title={item.label}
                className={cn(
                  "absolute z-[2] flex cursor-pointer select-none items-center overflow-hidden border border-t-2 pl-agon-xs",
                  style.block, style.top,
                )}
                style={{ left: x + 1, top: (ROW_H - CHIP_H) / 2, width: Math.max(width - 2, 6), height: CHIP_H }}
              >
                {item.isDeload && <div className={cn("pointer-events-none absolute inset-0", DELOAD_HATCH)} />}
                <span className="whitespace-nowrap text-agon-xs font-bold leading-none text-agon-tx">
                  {item.isDeload ? "⟳ " : ""}{item.label}
                </span>
              </div>
            );
          }

          // ── Bloc interactif (Rnd) ───────────────────────────────────────
          const dur = differenceInDays(parseISO(item.endDate), parseISO(item.startDate));
          return (
            <TLItem
              key={`${item.id}-${rowResetKey ?? 0}-${item.startDate}`}
              id={item.id}
              level={level}
              label={item.label}
              isDeload={item.isDeload}
              x={x}
              width={width}
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
                const newEnd = format(new Date(parseISO(newStart).getTime() + dur * 86400000), "yyyy-MM-dd");
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
                const newEnd = calc.xToDateStr(fx + fw);
                onResize?.(item.id, newStart, newEnd, item.parentStart, item.parentEnd);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
