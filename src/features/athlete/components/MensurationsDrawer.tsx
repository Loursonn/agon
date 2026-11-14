import { useMemo, useState, useEffect, useCallback } from 'react';
import { Ruler, Camera, Plus, ChevronLeft, Check, Pencil, Trash2, X } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { C } from "@/lib/theme";
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  MEASUREMENT_FIELDS, PHOTO_SLOTS, ALL_MEASUREMENT_KEYS,
  type MeasurementKey, type PhotoSlot, type MeasurementLog,
} from '@/features/shared/types/measurements';
import {
  useMeasurementLogs, useCreateMeasurementLog,
  useUpdateMeasurementLog, useDeleteMeasurementLog, useMeasurementPhotoUrls,
} from '@/features/shared/hooks/useMeasurements';

// ── Draft persistence ─────────────────────────────────────────────────────────

interface DraftData {
  weight: string;
  values: Record<string, string>;
  editId?: string;
}

function draftKey(athleteId: string) { return `mensuration_draft_${athleteId}`; }

function saveDraft(athleteId: string, data: DraftData) {
  try { localStorage.setItem(draftKey(athleteId), JSON.stringify(data)); } catch { /* quota */ }
}

function loadDraft(athleteId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(athleteId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft(athleteId: string) {
  try { localStorage.removeItem(draftKey(athleteId)); } catch { /* */ }
}

interface Props {
  athleteId: string;
  viewOnly?: boolean;
  /** Ouvre directement le formulaire "Nouvelle saisie" (saisie planifiée par le coach) */
  initialNew?: boolean;
  onClose: () => void;
}

type Mode =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; log: MeasurementLog };

// ── History list ──────────────────────────────────────────────────────────────

function LogCard({
  log, urls, viewOnly, onEdit, onDelete,
}: {
  log: MeasurementLog;
  urls: Record<string, string>;
  viewOnly?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const photoPaths = Object.entries(log.photos ?? {});

  // Build display chips for measurements
  const chips: { label: string; value: string }[] = [];
  for (const f of MEASUREMENT_FIELDS) {
    if (f.bilateral) {
      const g = log[f.bilateral.gKey];
      const d = log[f.bilateral.dKey];
      const legacy = log[f.key];
      if (g != null || d != null) {
        if (g != null) chips.push({ label: `${f.label} G`, value: `${g} cm` });
        if (d != null) chips.push({ label: `${f.label} D`, value: `${d} cm` });
      } else if (legacy != null) {
        chips.push({ label: f.label, value: `${legacy} cm` });
      }
    } else if (log[f.key] != null) {
      chips.push({ label: f.label, value: `${log[f.key]} cm` });
    }
  }

  return (
    <div className="rounded-[6px] border border-agon-brd bg-agon-s1 px-4 py-3.5">
      <div className={cn('flex items-center gap-2', chips.length ? 'mb-2.5' : 'mb-0')}>
        <span className="text-[13px] font-bold text-agon-tx">
          {format(new Date(log.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
        </span>
        {log.weight_kg != null && (
          <span className="text-[11px] text-agon-tx3">· {log.weight_kg} kg</span>
        )}
        {!viewOnly && (
          <div className="ml-auto flex gap-1">
            <button onClick={onEdit} title="Modifier" className={cn(ICON_BTN, 'text-agon-tx3')}>
              <Pencil size={13} />
            </button>
            <button onClick={() => setConfirmDel(true)} title="Supprimer" className={cn(ICON_BTN, 'text-agon-erreur')}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <div key={i} className="rounded-[7px] border border-agon-succes/[0.15] bg-agon-succes/[0.08] px-2.5 py-1">
              <span className="text-[11px] text-agon-tx3">{c.label} </span>
              <span className="text-[12px] font-bold text-agon-succes">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {photoPaths.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {photoPaths.map(([slot, path]) => (
            <div key={slot} className="relative h-[72px] w-14 overflow-hidden rounded-[4px] border border-agon-brd bg-agon-s2">
              {urls[path] ? (
                <img src={urls[path]} alt={slot} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Camera size={14} color={C.tx3} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDel && (
        <div className="mt-3 rounded-[4px] border border-agon-erreur/[0.25] bg-agon-erreur-doux px-3 py-2.5">
          <div className="mb-2.5 text-[12px] text-agon-tx2">Supprimer cette saisie ?</div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 cursor-pointer rounded-[4px] border border-agon-brd-l bg-transparent py-2 font-[inherit] text-[12px] font-semibold text-agon-tx2">Annuler</button>
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="flex-1 cursor-pointer rounded-[4px] border-none bg-agon-erreur-vif py-2 font-[inherit] text-[12px] font-bold text-agon-ink">Supprimer</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ICON_BTN = 'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-agon-brd-l bg-transparent';
const INPUT = 'box-border w-full rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2 py-1.5 font-[inherit] text-[14px] font-bold text-agon-tx [outline:none]';
const FIELD_LABEL = 'text-[11px] font-bold text-agon-tx2';
const SIDE = 'min-w-[14px] text-[10px] font-bold text-agon-tx3';
const UNIT = 'text-[11px] text-agon-tx3';

// ── Entry form (création + édition) ────────────────────────────────────────────

function EntryForm({
  athleteId, editLog, photoUrls, onDone,
}: {
  athleteId: string;
  editLog?: MeasurementLog;
  photoUrls: Record<string, string>;
  onDone: () => void;
}) {
  const isEdit = !!editLog;
  const create = useCreateMeasurementLog(athleteId);
  const update = useUpdateMeasurementLog(athleteId);
  const saving = create.isPending || update.isPending;

  const existingPhotos = editLog?.photos ?? {};

  // Restore draft or init from editLog
  const [weight, setWeight] = useState(() => {
    if (editLog?.weight_kg != null) return String(editLog.weight_kg);
    const draft = loadDraft(athleteId);
    if (draft && !draft.editId) return draft.weight;
    return '';
  });
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (editLog) {
      const init: Record<string, string> = {};
      for (const k of ALL_MEASUREMENT_KEYS) {
        if (editLog[k] != null) init[k] = String(editLog[k]);
      }
      const draft = loadDraft(athleteId);
      if (draft?.editId === editLog.id) return { ...init, ...draft.values };
      return init;
    }
    const draft = loadDraft(athleteId);
    if (draft && !draft.editId) return draft.values;
    return {};
  });
  const [files, setFiles] = useState<Partial<Record<PhotoSlot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [removed, setRemoved] = useState<Set<PhotoSlot>>(new Set());

  // Auto-save draft on change
  const persistDraft = useCallback(() => {
    saveDraft(athleteId, { weight, values, editId: editLog?.id });
  }, [athleteId, weight, values, editLog?.id]);

  useEffect(() => { persistDraft(); }, [persistDraft]);

  function setVal(key: MeasurementKey, v: string) {
    setValues(prev => ({ ...prev, [key]: v }));
  }

  function pickPhoto(slot: PhotoSlot, file: File | undefined) {
    if (!file) return;
    setFiles(prev => ({ ...prev, [slot]: file }));
    setPreviews(prev => {
      if (prev[slot]) URL.revokeObjectURL(prev[slot]!);
      return { ...prev, [slot]: URL.createObjectURL(file) };
    });
    setRemoved(prev => { const n = new Set(prev); n.delete(slot); return n; });
  }

  function clearPhoto(slot: PhotoSlot) {
    setFiles(prev => { const n = { ...prev }; delete n[slot]; return n; });
    setPreviews(prev => {
      if (prev[slot]) URL.revokeObjectURL(prev[slot]!);
      const n = { ...prev }; delete n[slot]; return n;
    });
    setRemoved(prev => { const n = new Set(prev); n.add(slot); return n; });
  }

  function handleSave() {
    const measurements: Partial<Record<MeasurementKey, number>> = {};
    for (const k of ALL_MEASUREMENT_KEYS) {
      const raw = values[k]?.trim();
      if (!raw) continue;
      const n = parseFloat(raw.replace(',', '.'));
      if (!isNaN(n) && n > 0) measurements[k] = n;
    }
    const photoFiles: Partial<Record<PhotoSlot, File>> = {};
    for (const [slot, file] of Object.entries(files)) {
      if (file) photoFiles[slot as PhotoSlot] = file;
    }
    const w = parseFloat(weight.trim().replace(',', '.'));
    const weight_kg = !isNaN(w) && w > 0 ? w : undefined;

    function onSuccess() {
      clearDraft(athleteId);
      onDone();
    }

    if (isEdit) {
      update.mutate({
        id: editLog!.id,
        existingPhotos,
        weight_kg,
        measurements,
        newPhotoFiles: photoFiles,
        removedSlots: [...removed],
      }, { onSuccess });
    } else {
      if (weight_kg == null && Object.keys(measurements).length === 0 && Object.keys(photoFiles).length === 0) return;
      create.mutate({ weight_kg, measurements, photoFiles }, { onSuccess });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Poids du jour */}
      <div className="flex items-center gap-2.5 rounded-[4px] bg-agon-s2 px-3.5 py-2.5">
        <div className="flex-1">
          <div className={FIELD_LABEL}>Poids du jour</div>
          <div className="text-[10px] text-agon-tx3">kg</div>
        </div>
        <input
          type="number" inputMode="decimal" value={weight}
          onChange={(e) => setWeight(e.target.value)} placeholder="0"
          className="box-border w-[90px] rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-[7px] text-right font-[inherit] text-[15px] font-bold text-agon-tx [outline:none]"
        />
      </div>

      {/* Mensurations */}
      <div>
        <SectionLabel icon={<Ruler size={12} color={C.g} />} text="Mensurations (cm)" />
        <div className="flex flex-col gap-2">
          {MEASUREMENT_FIELDS.map(f => {
            if (f.bilateral) {
              const { gKey, dKey } = f.bilateral;
              return (
                <div key={f.key} className="rounded-[4px] bg-agon-s2 px-3 py-2">
                  <div className={cn(FIELD_LABEL, 'mb-1.5')}>{f.label}</div>
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={SIDE}>G</span>
                      <input
                        type="number" inputMode="decimal" value={values[gKey] ?? ''}
                        onChange={(e) => setVal(gKey, e.target.value)} placeholder="0"
                        className={INPUT}
                      />
                      <span className={UNIT}>cm</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={SIDE}>D</span>
                      <input
                        type="number" inputMode="decimal" value={values[dKey] ?? ''}
                        onChange={(e) => setVal(dKey, e.target.value)} placeholder="0"
                        className={INPUT}
                      />
                      <span className={UNIT}>cm</span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={f.key} className="rounded-[4px] bg-agon-s2 px-3 py-2">
                <div className={cn(FIELD_LABEL, 'mb-1')}>{f.label}</div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" inputMode="decimal" value={values[f.key] ?? ''}
                    onChange={(e) => setVal(f.key, e.target.value)} placeholder="0"
                    className={INPUT}
                  />
                  <span className={UNIT}>cm</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photos */}
      <div>
        <SectionLabel icon={<Camera size={12} color={C.g} />} text="Photos (optionnel)" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PHOTO_SLOTS.map(s => {
            const newPrev = previews[s.key];
            const existingPath = existingPhotos[s.key];
            const showExisting = !!existingPath && !removed.has(s.key) && !newPrev;
            const imgUrl = newPrev ?? (showExisting ? photoUrls[existingPath!] : undefined);
            const hasImg = !!newPrev || showExisting;
            return (
              <div key={s.key} className="relative shrink-0 text-center">
                <label className="block cursor-pointer">
                  <div className={cn(
                    'flex h-[92px] w-[72px] items-center justify-center overflow-hidden rounded-[4px] border border-dashed bg-agon-s2',
                    hasImg ? 'border-agon-succes/[0.38]' : 'border-agon-brd-l',
                  )}>
                    {imgUrl ? (
                      <img src={imgUrl} alt={s.label} className="h-full w-full object-cover" />
                    ) : (
                      <Plus size={18} color={C.tx3} />
                    )}
                  </div>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => pickPhoto(s.key, e.target.files?.[0])} />
                </label>
                <div className="mt-1 max-w-[72px] text-[9px] text-agon-tx3">{s.label}</div>
                {hasImg && (
                  <button
                    onClick={() => clearPhoto(s.key)}
                    title="Retirer"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-agon-erreur-vif font-[inherit] text-agon-ink"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleSave} disabled={saving}
        className={cn(
          'min-h-[44px] w-full rounded-[6px] border-none py-[13px] font-[inherit] text-[14px] font-bold',
          saving ? 'cursor-default bg-agon-s2 text-agon-tx3' : 'cursor-pointer bg-agon-succes text-agon-ink',
        )}
      >
        {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Enregistrer'}
      </button>
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
        {text}
      </span>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export function MensurationsDrawer({ athleteId, viewOnly, initialNew, onClose }: Props) {
  // Auto-resume draft if one exists
  const [mode, setMode] = useState<Mode>(() => {
    if (viewOnly) return { kind: 'list' };
    if (initialNew) return { kind: 'new' };
    const draft = loadDraft(athleteId);
    if (draft && (draft.weight || Object.keys(draft.values).length > 0)) {
      if (draft.editId) return { kind: 'list' }; // edit draft needs the log object, show list
      return { kind: 'new' };
    }
    return { kind: 'list' };
  });
  const { data: logs = [], isLoading } = useMeasurementLogs(athleteId);
  const del = useDeleteMeasurementLog(athleteId);

  const allPhotoPaths = useMemo(
    () => logs.flatMap(l => Object.values(l.photos ?? {})).filter(Boolean) as string[],
    [logs],
  );
  const { data: urls = {} } = useMeasurementPhotoUrls(allPhotoPaths);

  const isForm = mode.kind === 'new' || mode.kind === 'edit';

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="flex max-h-[90vh] flex-col border-t-agon-brd bg-agon-s1 p-0 pb-10">
        <DrawerHeader className="shrink-0 px-5 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            {isForm && (
              <button onClick={() => setMode({ kind: 'list' })} className="flex cursor-pointer border-none bg-transparent p-0 text-agon-tx3">
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-agon-succes-doux">
              <Ruler size={18} color={C.g} />
            </div>
            <DrawerTitle className="text-[16px] font-bold text-agon-tx">
              {mode.kind === 'new' ? 'Nouvelle saisie' : mode.kind === 'edit' ? 'Modifier la saisie' : 'Mensurations / Photos'}
            </DrawerTitle>
          </div>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 [scrollbar-width:none]">
          {isForm ? (
            <EntryForm
              athleteId={athleteId}
              editLog={mode.kind === 'edit' ? mode.log : undefined}
              photoUrls={urls}
              onDone={() => setMode({ kind: 'list' })}
            />
          ) : (
            <>
              {!viewOnly && (
                <button
                  onClick={() => setMode({ kind: 'new' })}
                  className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[6px] border-none bg-agon-succes py-3 font-[inherit] text-[14px] font-bold text-agon-ink"
                >
                  <Plus size={16} /> Nouvelle saisie
                </button>
              )}

              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.6px] text-agon-tx3">
                Historique — {logs.length}
              </div>

              {isLoading ? (
                <div className="py-3 text-[12px] text-agon-tx3">Chargement…</div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-agon-tx3">
                  <Check size={22} color={C.tx3} />
                  <div className="text-[12px]">Aucune saisie pour le moment.</div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {logs.map(l => (
                    <LogCard
                      key={l.id}
                      log={l}
                      urls={urls}
                      viewOnly={viewOnly}
                      onEdit={() => setMode({ kind: 'edit', log: l })}
                      onDelete={() => del.mutate(l)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
