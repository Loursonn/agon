/**
 * Blocs de la séance d'énergie en cartes (planche CoachOrdiAEditeurEnergie, « 02 — Blocs »).
 * Une carte = un pas de premier niveau de `intervals`, même format en base
 * (voir src/lib/energy/blockCards.ts). Les blocs trop riches pour la carte
 * (groupes imbriqués, départ fixe, exercices) s'ouvrent dans l'éditeur détaillé.
 */
import { useState, type ReactNode } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Copy, GripVertical, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { C, alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { zoneColor } from "@/lib/seance";
import { deleteStep, duplicateStep, makeRootGroup, reorderChildren } from "@/lib/energy/treeUtils";
import { formatTarget } from "@/lib/energy/formatTarget";
import {
  CARD_TARGET_LABEL, NEW_BLOCK_LABEL, blockCardKind, blockSummary, blockTitle, blockZone, cardTargetOf, defaultTarget,
  fmtPace, formatDuration, mainInterval, newBlock, parseClock, parseDistance, parsePace, patchMain, setRepeat, setRest,
  type CardTarget, type NewBlock,
} from "@/lib/energy/blockCards";
import type { EnergyDuration, EnergyGroup, EnergyInterval, EnergyStep, EnergyTarget, SessionKind } from "@/types/energy";
import { Segmented } from "@/features/shared/components/ordi/OrdiUi";
import IntervalBuilder from "./IntervalBuilder";

interface Props {
  root: EnergyGroup;
  onChange: (root: EnergyGroup) => void;
  athleteId?: string;
  sessionKind?: SessionKind;
}

export function EnergyBlockCards({ root, onChange, athleteId, sessionKind }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const replace = (step: EnergyStep) => onChange({ ...root, children: root.children.map((c) => (c.id === step.id ? step : c)) });
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = root.children.findIndex((c) => c.id === e.active.id);
    const to = root.children.findIndex((c) => c.id === e.over!.id);
    if (from >= 0 && to >= 0) onChange(reorderChildren(root, root.id, from, to));
  };
  const add = (kind: NewBlock) => {
    const step = newBlock(kind);
    onChange({ ...root, children: [...root.children, step] });
    setOpenId(step.id);
  };

  const detailIndex = root.children.findIndex((c) => c.id === detailId);
  const detailRoot: EnergyGroup | null = detailIndex >= 0 ? { ...makeRootGroup(), children: [root.children[detailIndex]] } : null;

  return (
    <div className="flex flex-col gap-2.5">
      {root.children.length > 1 && (
        <div className="flex items-center gap-1.5 text-[12px] text-agon-tx3">
          <GripVertical size={13} /> Glisse un bloc pour le déplacer
        </div>
      )}
      {root.children.length === 0 && (
        <div className={cn(ORDI_CARD_CLS, "border-dashed bg-transparent px-4 py-7 text-center text-[13px] text-agon-tx3")}>
          Aucun bloc. Commence par un échauffement.
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={root.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {root.children.map((step, i) => (
            <BlockCard
              key={step.id}
              step={step}
              index={i}
              open={openId === step.id}
              onToggle={() => setOpenId(openId === step.id ? null : step.id)}
              onChange={replace}
              onDuplicate={() => onChange(duplicateStep(root, step.id))}
              onDelete={() => onChange(deleteStep(root, step.id))}
              onDetail={() => setDetailId(step.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] text-agon-tx3">Ajouter</span>
        {(Object.keys(NEW_BLOCK_LABEL) as NewBlock[]).map((k) => (
          <button key={k} type="button" onClick={() => add(k)} className={CHIP_BTN}>+ {NEW_BLOCK_LABEL[k]}</button>
        ))}
      </div>

      <Dialog open={!!detailRoot} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border border-agon-brd bg-agon-s1">
          <DialogHeader>
            <DialogTitle>Bloc {detailIndex + 1} · modifier en détail</DialogTitle>
          </DialogHeader>
          {detailRoot && (
            <IntervalBuilder
              root={detailRoot}
              athleteId={athleteId}
              sessionKind={sessionKind}
              onChange={(next) => {
                const children = [...root.children];
                children.splice(detailIndex, 1, ...next.children);
                onChange({ ...root, children });
                if (next.children.length !== 1) setDetailId(next.children[0]?.id ?? null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Carte ───────────────────────────────────────────────────────────────────

function BlockCard({ step, index, open, onToggle, onChange, onDuplicate, onDelete, onDetail }: {
  step: EnergyStep; index: number; open: boolean;
  onToggle: () => void; onChange: (s: EnergyStep) => void; onDuplicate: () => void; onDelete: () => void; onDetail: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const kind = blockCardKind(step);
  const zone = blockZone(step);
  const color = zone != null ? zoneColor(Math.min(zone, 3), 3) : kind === "advanced" ? C.tx3 : C.ac;

  return (
    <div
      ref={setNodeRef}
      className={cn(ORDI_CARD_CLS, "relative overflow-hidden p-0", isDragging ? "z-[2] opacity-60" : "opacity-100")}
      // Déplacement (dnd-kit) et teinte de zone : valeurs calculées, restent en style.
      style={{
        transform: CSS.Transform.toString(transform), transition,
        borderColor: open ? alpha(color, 0.5) : undefined,
      }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-3 py-3 pl-3 pr-3.5">
        <button type="button" aria-label={`Déplacer le bloc ${index + 1}`} {...attributes} {...listeners} className={cn(ICON_BTN, "cursor-grab")}>
          <GripVertical size={15} />
        </button>
        <span className={cn(MONO_CLS, "w-3.5 text-[12px] text-agon-tx3")}>{index + 1}</span>
        <button type="button" onClick={kind === "advanced" ? onDetail : onToggle} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 bg-transparent p-0 text-left text-agon-tx">
          <span className="w-[150px] flex-none text-[14px] font-semibold">{blockTitle(step)}</span>
          <span className="min-w-0 flex-1 break-words text-[12.5px] leading-snug text-agon-tx2">
            {blockSummary(step)}
            {kind === "advanced" && <span className="text-agon-accent"> · modifier en détail</span>}
          </span>
        </button>
        {zone != null && (
          <span className={cn(MONO_CLS, "rounded-[6px] px-[7px] py-0.5 text-[11px]")} style={{ background: alpha(color, 0.16), color }}>Z{zone}</span>
        )}
        <button type="button" aria-label="Dupliquer le bloc" title="Dupliquer" onClick={onDuplicate} className={ICON_BTN}><Copy size={14} /></button>
        <button type="button" aria-label="Supprimer le bloc" title="Supprimer" onClick={onDelete} className={ICON_BTN}><Trash2 size={14} /></button>
        {kind !== "advanced" && (
          <button type="button" aria-label={open ? "Replier" : "Déplier"} onClick={onToggle} className={ICON_BTN}>
            <ChevronDown size={16} className={cn("[transition:transform_.15s]", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && kind !== "advanced" && <CardBody step={step} onChange={onChange} />}
    </div>
  );
}

function CardBody({ step, onChange }: { step: EnergyStep; onChange: (s: EnergyStep) => void }) {
  const main = mainInterval(step)!;
  const group = step.type === "group" ? step : null;
  const rest = group?.rest_between ?? null;
  const notes = group ? group.instructions ?? "" : (step as EnergyInterval).notes ?? "";

  return (
    <div className="flex flex-col gap-3 border-t border-agon-brd pb-4 pl-[46px] pr-[18px] pt-1">
      <div className="h-1.5" />
      {group && (
        <Row label="Répétitions">
          <span className="inline-flex items-center gap-2">
            <input
              type="number" min={1} max={99} value={group.repeat}
              onChange={(e) => onChange(setRepeat(step, Number(e.target.value)))}
              aria-label="Répétitions"
              className={cn(FIELD, MONO_CLS, "w-24")}
            />
            <span className="text-[12.5px] text-agon-tx3">fois</span>
          </span>
        </Row>
      )}
      <Row label="Effort">
        <DurationField value={main.duration} onChange={(d) => onChange(patchMain(step, { duration: d }))} />
      </Row>
      <Row label="Cible">
        <TargetField target={main.target} role={main.role} onChange={(t) => onChange(patchMain(step, { target: t }))} />
      </Row>
      {group && (
        <Row label="Récup entre">
          <div className="flex flex-wrap items-center gap-2">
            <DurationField
              value={rest?.duration ?? null}
              allowNone
              onChange={(d) => onChange(setRest(step, d ? { duration: d } : null))}
            />
            {rest && (
              <>
                <input
                  value={rest.notes ?? ""}
                  onChange={(e) => onChange(setRest(step, { notes: e.target.value || undefined }))}
                  placeholder="Trot léger"
                  aria-label="Consigne de récup"
                  className={cn(FIELD, "w-[150px]")}
                />
                <RestTarget target={rest.target} onChange={(t) => onChange(setRest(step, { target: t }))} />
              </>
            )}
          </div>
        </Row>
      )}
      <Row label="Note">
        <input
          value={notes}
          onChange={(e) => {
            const v = e.target.value || undefined;
            onChange(group ? { ...group, instructions: v } : { ...(step as EnergyInterval), notes: v });
          }}
          placeholder={group ? "Consigne du bloc, affichée à l’athlète" : "progressif, FC sous 152 bpm…"}
          aria-label="Note du bloc"
          className={cn(FIELD, "w-full max-w-[420px]")}
        />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <span className="text-[12.5px] text-agon-tx3">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ── Champs ──────────────────────────────────────────────────────────────────

type DurKind = "time" | "distance" | "none";

function DurationField({ value, onChange, allowNone = false }: {
  value: EnergyDuration | null; onChange: (d: EnergyDuration | null) => void; allowNone?: boolean;
}) {
  const kind: DurKind = !value ? "none" : value.kind === "distance" ? "distance" : value.kind === "time" ? "time" : "time";
  const other = value && value.kind !== "time" && value.kind !== "distance";
  const options = [
    ...(allowNone ? [{ value: "none" as DurKind, label: "Aucune" }] : []),
    { value: "time" as DurKind, label: "Durée" },
    { value: "distance" as DurKind, label: "Distance" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<DurKind>
        value={other ? ("" as DurKind) : kind}
        options={options}
        width={70}
        ariaLabel="Type d'effort"
        onChange={(k) => {
          if (k === "none") return onChange(null);
          if (k === kind && !other) return;
          onChange(k === "time" ? { kind: "time", value: 120 } : { kind: "distance", value: 400 });
        }}
      />
      {value && !other && (
        <TextCommit
          key={`${value.kind}-${value.value}`}
          initial={value.kind === "time" ? formatDuration(value).replace(/^(\d+) min$/, "$1 min 00 s") : formatDuration(value)}
          parse={(s) => (value.kind === "time" ? parseClock(s) : parseDistance(s))}
          onCommit={(n) => onChange({ kind: value.kind, value: n })}
          width={140}
          label={value.kind === "time" ? "Durée" : "Distance"}
        />
      )}
      {other && <span className="text-[12.5px] text-agon-tx2">{formatDuration(value)}</span>}
    </div>
  );
}

function TargetField({ target, role, onChange }: { target: EnergyTarget; role: EnergyInterval["role"]; onChange: (t: EnergyTarget) => void }) {
  const kind = cardTargetOf(target);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<CardTarget>
          value={(kind ?? "") as CardTarget}
          options={(Object.keys(CARD_TARGET_LABEL) as CardTarget[]).map((k) => ({ value: k, label: CARD_TARGET_LABEL[k] }))}
          width={64}
          ariaLabel="Type de cible"
          onChange={(k) => { if (k !== kind) onChange(defaultTarget(k, role)); }}
        />
        {target.kind === "pace" && <PaceRange target={target} onChange={onChange} />}
        {(target.kind === "hr_bpm" || target.kind === "power") && (
          <span className="inline-flex items-center gap-1.5">
            <NumCommit value={target.min} label="Minimum" onCommit={(n) => onChange({ ...target, min: n })} />
            <span className="text-[12px] text-agon-tx3">à</span>
            <NumCommit value={target.max} label="Maximum" onCommit={(n) => onChange({ ...target, max: n })} />
            <span className="text-[12px] text-agon-tx3">{target.kind === "power" ? "W" : "bpm"}</span>
          </span>
        )}
        {target.kind === "hr_zone" && <ZoneSelect zone={target.zone} onChange={(z) => onChange({ kind: "hr_zone", zone: z })} />}
      </div>
      {!kind && target.kind !== "none" && (
        <span className="text-[12px] text-agon-tx3">Cible actuelle : {formatTarget(target) || "—"} (choisis un type pour la remplacer)</span>
      )}
    </div>
  );
}

function PaceRange({ target, onChange }: { target: Extract<EnergyTarget, { kind: "pace" }>; onChange: (t: EnergyTarget) => void }) {
  const legacy = target as unknown as { min?: number; max?: number };
  const lo = target.min_s_per_unit ?? legacy.min ?? 0;
  const hi = target.max_s_per_unit ?? legacy.max ?? 0;
  const kmh = target.unit === "kmh";
  const show = (s: number) => (s > 0 ? (kmh ? (3600 / s).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : fmtPace(s)) : "");
  const parse = (s: string) => {
    if (!kmh) return parsePace(s);
    const v = Number(s.replace(",", "."));
    return v > 0 ? Math.round(3600 / v) : null;
  };
  const set = (min: number, max: number) => onChange({ kind: "pace", unit: target.unit, min_s_per_unit: min, max_s_per_unit: max });
  return (
    <span className="inline-flex items-center gap-1.5">
      <TextCommit key={`lo-${lo}`} initial={show(lo)} parse={parse} onCommit={(n) => set(n, hi)} width={80} label="Allure basse" />
      <span className="text-[12px] text-agon-tx3">à</span>
      <TextCommit key={`hi-${hi}`} initial={show(hi)} parse={parse} onCommit={(n) => set(lo, n)} width={80} label="Allure haute" />
      <span className="text-[12px] text-agon-tx3">{kmh ? "km/h" : "/km"}</span>
    </span>
  );
}

function RestTarget({ target, onChange }: { target: EnergyTarget; onChange: (t: EnergyTarget) => void }) {
  const value = target.kind === "hr_zone" ? String(target.zone) : target.kind === "none" ? "none" : "other";
  return (
    <select
      value={value}
      aria-label="Cible de la récup"
      onChange={(e) => {
        const v = e.target.value;
        if (v === "none") onChange({ kind: "none" });
        else if (v !== "other") onChange({ kind: "hr_zone", zone: Number(v) as 1 | 2 | 3 | 4 | 5 });
      }}
      className={cn(FIELD, "w-[130px]")}
    >
      {value === "other" && <option value="other">{formatTarget(target) || "Autre cible"}</option>}
      <option value="none">Libre</option>
      {[1, 2, 3, 4, 5].map((z) => <option key={z} value={z}>Zone {z}</option>)}
    </select>
  );
}

function ZoneSelect({ zone, onChange }: { zone: number; onChange: (z: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <select value={zone} aria-label="Zone" onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)} className={cn(FIELD, "w-[110px]")}>
      {[1, 2, 3, 4, 5].map((z) => <option key={z} value={z}>Zone {z}</option>)}
    </select>
  );
}

/** Texte validé à la sortie du champ (ou Entrée) ; une saisie illisible revient à la valeur d'avant. */
function TextCommit({ initial, parse, onCommit, width, label }: {
  initial: string; parse: (s: string) => number | null; onCommit: (n: number) => void; width: number; label: string;
}) {
  const [text, setText] = useState(initial);
  const commit = () => {
    const n = parse(text);
    if (n == null || n <= 0) setText(initial);
    else onCommit(n);
  };
  return (
    <input
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn(FIELD, MONO_CLS)}
      // Largeur passée par l'appelant (valeur numérique).
      style={{ width }}
    />
  );
}

function NumCommit({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  return (
    <TextCommit
      key={`${label}-${value}`}
      initial={Number.isFinite(value) ? String(value) : ""}
      parse={(s) => { const n = Math.round(Number(s.replace(",", "."))); return Number.isFinite(n) ? n : null; }}
      onCommit={onCommit}
      width={70}
      label={label}
    />
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

/** Carte des planches « ordi » (ORDI_CARD en classes). */
const ORDI_CARD_CLS = "rounded-[14px] border border-agon-brd bg-agon-s1";
const MONO_CLS = "font-data tabular-nums";
const FIELD = "box-border h-8 rounded-[8px] border border-agon-brd-l bg-agon-s2 px-2.5 text-[13px] text-agon-tx outline-none";
const ICON_BTN = "inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-[8px] bg-transparent p-0 text-agon-tx3";
const CHIP_BTN = "h-8 cursor-pointer rounded-[999px] border border-dashed border-agon-brd-l bg-transparent px-3 text-[12.5px] text-agon-tx2";
