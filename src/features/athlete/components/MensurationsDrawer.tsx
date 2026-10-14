import { useMemo, useState, useEffect, useCallback } from 'react';
import { Ruler, Camera, Plus, ChevronLeft, Check, Pencil, Trash2, X } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { C } from '@/lib/theme';
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
    <div style={{ background: C.s1, borderRadius: 6, border: '1px solid ' + C.brd, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: chips.length ? 10 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
          {format(new Date(log.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
        </span>
        {log.weight_kg != null && (
          <span style={{ fontSize: 11, color: C.tx3 }}>· {log.weight_kg} kg</span>
        )}
        {!viewOnly && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button onClick={onEdit} title="Modifier" style={iconBtn(C.tx3)}>
              <Pencil size={13} />
            </button>
            <button onClick={() => setConfirmDel(true)} title="Supprimer" style={iconBtn(C.r)}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((c, i) => (
            <div key={i} style={{
              padding: '4px 10px', borderRadius: 7,
              background: 'rgba(34,201,147,0.08)', border: '1px solid rgba(34,201,147,0.15)',
            }}>
              <span style={{ fontSize: 11, color: C.tx3 }}>{c.label} </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.g }}>{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {photoPaths.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {photoPaths.map(([slot, path]) => (
            <div key={slot} style={{ width: 56, height: 72, borderRadius: 4, overflow: 'hidden', background: C.s2, border: '1px solid ' + C.brd, position: 'relative' }}>
              {urls[path] ? (
                <img src={urls[path]} alt={slot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={14} color={C.tx3} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDel && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 4, background: C.rS, border: '1px solid ' + C.r + '40' }}>
          <div style={{ fontSize: 12, color: C.tx2, marginBottom: 10 }}>Supprimer cette saisie ?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: '8px 0', borderRadius: 4, border: '1px solid ' + C.brdL, background: 'transparent', color: C.tx2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
            <button onClick={() => { onDelete(); setConfirmDel(false); }} style={{ flex: 1, padding: '8px 0', borderRadius: 4, border: 'none', background: C.rV, color: '#0E0C0A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Supprimer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 7, border: '1px solid ' + C.brdL,
    background: 'transparent', color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
}

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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 4,
    border: '1px solid ' + C.brdL, background: C.s1,
    color: C.tx, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Poids du jour */}
      <div style={{ background: C.s2, borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2 }}>Poids du jour</div>
          <div style={{ fontSize: 10, color: C.tx3 }}>kg</div>
        </div>
        <input
          type="number" inputMode="decimal" value={weight}
          onChange={(e) => setWeight(e.target.value)} placeholder="0"
          style={{
            width: 90, padding: '7px 10px', borderRadius: 4,
            border: '1px solid ' + C.brdL, background: C.s1,
            color: C.tx, fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            outline: 'none', textAlign: 'right', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Mensurations */}
      <div>
        <SectionLabel icon={<Ruler size={12} color={C.g} />} text="Mensurations (cm)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MEASUREMENT_FIELDS.map(f => {
            if (f.bilateral) {
              const { gKey, dKey } = f.bilateral;
              return (
                <div key={f.key} style={{ background: C.s2, borderRadius: 4, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 6 }}>{f.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, minWidth: 14 }}>G</span>
                      <input
                        type="number" inputMode="decimal" value={values[gKey] ?? ''}
                        onChange={(e) => setVal(gKey, e.target.value)} placeholder="0"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: C.tx3 }}>cm</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, minWidth: 14 }}>D</span>
                      <input
                        type="number" inputMode="decimal" value={values[dKey] ?? ''}
                        onChange={(e) => setVal(dKey, e.target.value)} placeholder="0"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: C.tx3 }}>cm</span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={f.key} style={{ background: C.s2, borderRadius: 4, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 4 }}>{f.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" inputMode="decimal" value={values[f.key] ?? ''}
                    onChange={(e) => setVal(f.key, e.target.value)} placeholder="0"
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 11, color: C.tx3 }}>cm</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photos */}
      <div>
        <SectionLabel icon={<Camera size={12} color={C.g} />} text="Photos (optionnel)" />
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {PHOTO_SLOTS.map(s => {
            const newPrev = previews[s.key];
            const existingPath = existingPhotos[s.key];
            const showExisting = !!existingPath && !removed.has(s.key) && !newPrev;
            const imgUrl = newPrev ?? (showExisting ? photoUrls[existingPath!] : undefined);
            const hasImg = !!newPrev || showExisting;
            return (
              <div key={s.key} style={{ flexShrink: 0, textAlign: 'center', position: 'relative' }}>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <div style={{
                    width: 72, height: 92, borderRadius: 4, overflow: 'hidden',
                    background: C.s2, border: '1px dashed ' + (hasImg ? C.g + '60' : C.brdL),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {imgUrl ? (
                      <img src={imgUrl} alt={s.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Plus size={18} color={C.tx3} />
                    )}
                  </div>
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => pickPhoto(s.key, e.target.files?.[0])} />
                </label>
                <div style={{ fontSize: 9, color: C.tx3, marginTop: 4, maxWidth: 72 }}>{s.label}</div>
                {hasImg && (
                  <button
                    onClick={() => clearPhoto(s.key)}
                    title="Retirer"
                    style={{
                      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                      border: 'none', background: C.rV, color: '#0E0C0A', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
                    }}
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
        style={{
          width: '100%', padding: '13px 0', borderRadius: 6, border: 'none',
          background: saving ? C.s2 : C.g, color: saving ? C.tx3 : '#fff',
          fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          fontFamily: 'inherit', minHeight: 44,
        }}
      >
        {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Enregistrer'}
      </button>
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
      <DrawerContent style={{ background: C.s1, borderTop: '1px solid ' + C.brd, padding: '0 0 40px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <DrawerHeader style={{ padding: '16px 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isForm && (
              <button onClick={() => setMode({ kind: 'list' })} style={{ background: 'none', border: 'none', color: C.tx3, cursor: 'pointer', padding: 0, display: 'flex' }}>
                <ChevronLeft size={20} />
              </button>
            )}
            <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, background: C.gS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ruler size={18} color={C.g} />
            </div>
            <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
              {mode.kind === 'new' ? 'Nouvelle saisie' : mode.kind === 'edit' ? 'Modifier la saisie' : 'Mensurations / Photos'}
            </DrawerTitle>
          </div>
        </DrawerHeader>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 0', borderRadius: 6, border: 'none', background: C.g,
                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
                  }}
                >
                  <Plus size={16} /> Nouvelle saisie
                </button>
              )}

              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 4 }}>
                Historique — {logs.length}
              </div>

              {isLoading ? (
                <div style={{ fontSize: 12, color: C.tx3, padding: '12px 0' }}>Chargement…</div>
              ) : logs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 0', color: C.tx3 }}>
                  <Check size={22} color={C.tx3} />
                  <div style={{ fontSize: 12 }}>Aucune saisie pour le moment.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
