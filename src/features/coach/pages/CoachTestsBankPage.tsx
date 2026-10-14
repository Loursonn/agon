import { useState } from 'react';
import { FlaskConical, Plus, Pencil, Trash2, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { C } from '@/lib/theme';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { ListSkeleton } from '@/features/shared/components/skeletons';
import {
  useTestDefinitions,
  useCreateTestDefinition,
  useUpdateTestDefinition,
  useDeleteTestDefinition,
} from '@/features/shared/hooks/tests/useTestDefinitions';
import type {
  TestDefinitionWithVariables,
  CreateVariableInput,
  ValueType,
  BetterWhen,
  TestCategory,
  TestFillMode,
} from '@/features/shared/types/tests';
import { TEST_CATEGORY_LABEL, TEST_CATEGORY_COLOR, TEST_CATEGORY_ORDER, ARTICULATIONS, PHYSIO_METRICS } from '@/features/shared/types/tests';
import type { ExtrapOp } from '@/features/shared/types/tests';

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const VALUE_TYPE_OPTIONS: { value: ValueType; label: string }[] = [
  { value: 'number',   label: 'Nombre' },
  { value: 'pace',     label: 'Allure' },
  { value: 'duration', label: 'Durée' },
  { value: 'scale5',   label: 'Échelle /5' },
];

const BETTER_WHEN_OPTIONS: { value: BetterWhen; label: string }[] = [
  { value: 'higher', label: 'Plus haut = meilleur' },
  { value: 'lower',  label: 'Plus bas = meilleur' },
];

const EMPTY_VAR: CreateVariableInput = {
  key: '', label: '', unit: '', value_type: 'number', better_when: 'higher',
  extrap_metric: null, extrap_op: null, extrap_factor: null,
};

// ── Formulaire de création / édition ─────────────────────────────────────────

interface TestForm {
  name: string;
  category: TestCategory | null;
  articulation: string;
  media_url: string;
  fill_mode: TestFillMode;
  description: string;
  protocol: string;
  variables: CreateVariableInput[];
}

const EMPTY_FORM: TestForm = {
  name: '', category: null, articulation: '', media_url: '', fill_mode: 'self', description: '', protocol: '', variables: [{ ...EMPTY_VAR }],
};

function VariableRow({
  variable, index, total, onChange, onRemove,
}: {
  variable: CreateVariableInput;
  index: number;
  total: number;
  onChange: (i: number, v: CreateVariableInput) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr auto',
        gap: 8, alignItems: 'start',
      }}>
        {/* Label */}
        <input
          value={variable.label}
          onChange={e => {
            const label = e.target.value;
            onChange(index, { ...variable, label, key: slugify(label) });
          }}
          placeholder="Ex: VMA"
          style={inputStyle}
        />
        {/* Unit */}
        <input
          value={variable.unit}
          onChange={e => onChange(index, { ...variable, unit: e.target.value })}
          placeholder="km/h"
          style={inputStyle}
        />
        {/* value_type */}
        <select
          value={variable.value_type}
          onChange={e => onChange(index, { ...variable, value_type: e.target.value as ValueType })}
          style={selectStyle}
        >
          {VALUE_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* better_when */}
        <select
          value={variable.better_when}
          onChange={e => onChange(index, { ...variable, better_when: e.target.value as BetterWhen })}
          style={selectStyle}
        >
          {BETTER_WHEN_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* Supprimer */}
        <button
          onClick={() => onRemove(index)}
          disabled={total <= 1}
          style={{
            width: 30, height: 30, borderRadius: 6, border: 'none',
            background: total <= 1 ? 'transparent' : 'rgba(239,75,75,0.12)',
            color: total <= 1 ? C.tx3 : '#FF5A33',
            cursor: total <= 1 ? 'default' : 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Extrapolation → valeur physiologique */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
        <span style={{ fontSize: 10, color: C.tx3 }}>→ extrapolation</span>
        <select
          value={variable.extrap_metric ?? ''}
          onChange={e => {
            const m = e.target.value || null;
            onChange(index, { ...variable, extrap_metric: m, extrap_op: m ? (variable.extrap_op ?? 'div') : null, extrap_factor: m ? (variable.extrap_factor ?? 100) : null });
          }}
          style={{ ...selectStyle, width: 'auto', flex: '0 0 auto' }}
        >
          <option value="">Aucune</option>
          {PHYSIO_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        {variable.extrap_metric && (
          <>
            <select
              value={variable.extrap_op ?? 'div'}
              onChange={e => onChange(index, { ...variable, extrap_op: e.target.value as ExtrapOp })}
              style={{ ...selectStyle, width: 56, flex: '0 0 auto' }}
            >
              <option value="div">÷</option>
              <option value="mul">×</option>
            </select>
            <input
              type="number"
              value={variable.extrap_factor ?? ''}
              onChange={e => onChange(index, { ...variable, extrap_factor: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="100"
              style={{ ...inputStyle, width: 80, flex: '0 0 auto' }}
            />
            <span style={{ fontSize: 10, color: C.tx3 }}>
              = {PHYSIO_METRICS.find(m => m.key === variable.extrap_metric)?.unit}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Carte test ────────────────────────────────────────────────────────────────

function TestCard({
  test, isOwned, onEdit, onDelete,
}: {
  test: TestDefinitionWithVariables;
  isOwned: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: '1px solid ' + C.brd,
      overflow: 'hidden', transition: 'border-color 150ms ease-out',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{
          width: 36, height: 36, borderRadius: 4, flexShrink: 0,
          background: test.kind === 'preset' ? 'rgba(255,201,51,0.12)' : 'rgba(245,166,35,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FlaskConical size={16} color={test.kind === 'preset' ? C.ac : '#F5A623'} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 2 }}>
            {test.name}
          </div>
          <div style={{ fontSize: 11, color: C.tx3 }}>
            {test.test_variables.length} variable{test.test_variables.length > 1 ? 's' : ''}
            {' · '}
            {test.test_variables.map(v => v.label).join(', ')}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {test.category && (() => {
            const cc = TEST_CATEGORY_COLOR[test.category as TestCategory] ?? C.tx3;
            return (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: cc + '1A', color: cc, border: '1px solid ' + cc + '40',
                textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap',
              }}>
                {TEST_CATEGORY_LABEL[test.category as TestCategory] ?? test.category}
              </span>
            );
          })()}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: C.s2, color: test.fill_mode === 'coach' ? C.o : C.tx3,
            border: '1px solid ' + C.brdL, whiteSpace: 'nowrap',
          }} title={test.fill_mode === 'coach' ? 'Rempli par le coach (vidéo à envoyer)' : 'Rempli par l’athlète'}>
            {test.fill_mode === 'coach' ? 'Coach' : 'Athlète'}
          </span>
          {test.kind === 'preset' && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: 'rgba(255,201,51,0.12)', color: C.ac, textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}>
              Preset
            </span>
          )}
          {isOwned && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit(); }} style={iconBtnStyle}>
                <Pencil size={13} />
              </button>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={onDelete} style={{
                    ...iconBtnStyle, background: 'rgba(239,75,75,0.15)', color: '#FF5A33',
                    padding: '4px 10px', fontSize: 11, width: 'auto', borderRadius: 6,
                  }}>
                    Confirmer
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={iconBtnStyle}>✕</button>
                </div>
              ) : (
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} style={iconBtnStyle}>
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
          {expanded ? <ChevronUp size={15} color={C.tx3} /> : <ChevronDown size={15} color={C.tx3} />}
        </div>
      </div>

      {/* Détail (expandé) */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px', borderTop: '1px solid ' + C.brd,
        }}>
          {test.description && (
            <p style={{ fontSize: 12, color: C.tx2, lineHeight: 1.6, marginTop: 12, marginBottom: 12 }}>
              {test.description}
            </p>
          )}
          {test.protocol?.text && (
            <div style={{
              background: C.s2, borderRadius: 4, padding: '10px 14px',
              border: '1px solid ' + C.brdL, marginBottom: 12,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                Protocole
              </div>
              <p style={{ fontSize: 12, color: C.tx2, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {test.protocol.text}
              </p>
            </div>
          )}

          {/* Variables */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: test.description || test.protocol?.text ? 0 : 12 }}>
            {test.test_variables.map(v => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 4,
                background: C.s2, border: '1px solid ' + C.brdL,
              }}>
                {v.better_when === 'higher'
                  ? <TrendingUp size={12} color={C.g} />
                  : <TrendingDown size={12} color='#FF5A33' />
                }
                <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{v.label}</span>
                <span style={{ fontSize: 11, color: C.tx3 }}>{v.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formulaire création / édition (inline) ────────────────────────────────────

function TestFormPanel({
  initial, onSave, onCancel, saving,
}: {
  initial: TestForm;
  onSave: (f: TestForm) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TestForm>(initial);

  const updateVar = (i: number, v: CreateVariableInput) =>
    setForm(f => ({ ...f, variables: f.variables.map((x, j) => j === i ? v : x) }));

  const addVar = () =>
    setForm(f => ({ ...f, variables: [...f.variables, { ...EMPTY_VAR }] }));

  const removeVar = (i: number) =>
    setForm(f => ({ ...f, variables: f.variables.filter((_, j) => j !== i) }));

  const isValid = form.name.trim() && form.variables.every(v => v.label.trim() && v.unit.trim());

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: '1px solid ' + C.ac + '40',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
        {initial.name ? 'Modifier le test' : 'Nouveau test'}
      </div>

      {/* Nom */}
      <div>
        <label style={labelStyle}>Nom *</label>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Ex: Test Vameval 2024"
          style={{ ...inputStyle, fontSize: 13 }}
          autoFocus
        />
      </div>

      {/* Catégorie + mode de remplissage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Catégorie</label>
          <select
            value={form.category ?? ''}
            onChange={e => setForm(f => ({ ...f, category: (e.target.value || null) as TestCategory | null }))}
            style={selectStyle}
          >
            <option value="">Aucune</option>
            {TEST_CATEGORY_ORDER.map(c => (
              <option key={c} value={c}>{TEST_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Remplissage</label>
          <select
            value={form.fill_mode}
            onChange={e => setForm(f => ({ ...f, fill_mode: e.target.value as TestFillMode }))}
            style={selectStyle}
          >
            <option value="self">Par l’athlète</option>
            <option value="coach">Par le coach (vidéo)</option>
          </select>
        </div>
      </div>

      {/* Articulation (uniquement bilan articulaire) */}
      {form.category === 'bilan_articulaire' && (
        <div>
          <label style={labelStyle}>Articulation</label>
          <input
            value={form.articulation}
            onChange={e => setForm(f => ({ ...f, articulation: e.target.value }))}
            placeholder="Épaule, Hanche, Genou, Cheville…"
            list="articulations-list"
            style={inputStyle}
          />
          <datalist id="articulations-list">
            {ARTICULATIONS.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
      )}

      {/* Média explicatif (photo / vidéo) */}
      <div>
        <label style={labelStyle}>Média explicatif (lien photo / vidéo)</label>
        <input
          value={form.media_url}
          onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
          placeholder="https://…"
          style={inputStyle}
        />
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Objectif du test, population cible…"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* Protocole */}
      <div>
        <label style={labelStyle}>Protocole</label>
        <textarea
          value={form.protocol}
          onChange={e => setForm(f => ({ ...f, protocol: e.target.value }))}
          placeholder="Étapes, consignes, matériel requis…"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* Variables */}
      <div>
        <label style={labelStyle}>Variables mesurées *</label>
        <div style={{
          fontSize: 10, color: C.tx3, marginBottom: 8,
          display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr auto', gap: 8,
        }}>
          <span>Label</span><span>Unité</span><span>Type</span><span>Sens</span><span />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {form.variables.map((v, i) => (
            <VariableRow
              key={i} variable={v} index={i} total={form.variables.length}
              onChange={updateVar} onRemove={removeVar}
            />
          ))}
        </div>
        <button
          onClick={addVar}
          style={{
            marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 4,
            border: '1px dashed ' + C.brdL, background: 'transparent',
            color: C.tx3, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'color 150ms ease-out',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.tx)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.tx3)}
        >
          + Ajouter une variable
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={cancelBtnStyle}>
          Annuler
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!isValid || saving}
          style={{
            padding: '9px 22px', borderRadius: 4, border: 'none', fontFamily: 'inherit',
            background: isValid && !saving ? C.ac : C.s2,
            color: isValid && !saving ? '#fff' : C.tx3,
            fontSize: 13, fontWeight: 700,
            cursor: isValid && !saving ? 'pointer' : 'default',
            transition: 'background 150ms ease-out',
          }}
        >
          {saving ? 'Enregistrement…' : initial.name ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function CoachTestsBankPage() {
  const { profile } = useAuth();
  const coachId = profile?.id ?? '';

  const { data: tests = [], isLoading } = useTestDefinitions(coachId);
  const createMut   = useCreateTestDefinition(coachId);
  const updateMut   = useUpdateTestDefinition(coachId);
  const deleteMut   = useDeleteTestDefinition(coachId);

  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editTarget, setEditTarget] = useState<TestDefinitionWithVariables | null>(null);

  const presets = tests.filter(t => t.kind === 'preset');
  const custom  = tests.filter(t => t.kind === 'custom');

  function handleCreate(form: TestForm) {
    createMut.mutate(
      {
        name: form.name, category: form.category, articulation: form.articulation || null,
        media_url: form.media_url || null, fill_mode: form.fill_mode,
        description: form.description, protocol: form.protocol, variables: form.variables,
      },
      { onSuccess: () => setMode('idle') },
    );
  }

  function handleUpdate(form: TestForm) {
    if (!editTarget) return;
    updateMut.mutate(
      {
        id: editTarget.id, name: form.name, category: form.category, articulation: form.articulation || null,
        media_url: form.media_url || null, fill_mode: form.fill_mode,
        description: form.description, protocol: form.protocol, variables: form.variables,
      },
      { onSuccess: () => { setMode('idle'); setEditTarget(null); } },
    );
  }

  function formFromTest(t: TestDefinitionWithVariables): TestForm {
    return {
      name:         t.name,
      category:     t.category,
      articulation: t.articulation ?? '',
      media_url:    t.media_url ?? '',
      fill_mode:    t.fill_mode ?? 'self',
      description: t.description ?? '',
      protocol:    t.protocol?.text ?? '',
      variables:   t.test_variables.map(v => ({
        key: v.key, label: v.label, unit: v.unit,
        value_type: v.value_type, better_when: v.better_when,
        extrap_metric: v.extrap_metric ?? null, extrap_op: v.extrap_op ?? null, extrap_factor: v.extrap_factor ?? null,
      })),
    };
  }

  function startEdit(test: TestDefinitionWithVariables) {
    setEditTarget(test);
    setMode('edit');
  }

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>Banque de tests</div>
          <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>
            {presets.length} preset{presets.length > 1 ? 's' : ''} · {custom.length} test{custom.length > 1 ? 's' : ''} personnalisé{custom.length > 1 ? 's' : ''}
          </div>
        </div>
        {mode === 'idle' && (
          <button
            onClick={() => setMode('create')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 4, border: 'none',
              background: C.acV, color: '#0E0C0A', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'opacity 150ms ease-out',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          >
            <Plus size={14} /> Créer un test
          </button>
        )}
      </div>

      {/* Formulaire création / édition (en haut) */}
      {mode === 'create' && (
        <div style={{ marginBottom: 28 }}>
          <TestFormPanel
            initial={EMPTY_FORM}
            onSave={handleCreate}
            onCancel={() => setMode('idle')}
            saving={createMut.isPending}
          />
        </div>
      )}
      {mode === 'edit' && editTarget && (
        <div style={{ marginBottom: 28 }}>
          <TestFormPanel
            initial={formFromTest(editTarget)}
            onSave={handleUpdate}
            onCancel={() => { setMode('idle'); setEditTarget(null); }}
            saving={updateMut.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          {/* Presets groupés par catégorie */}
          <section style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {TEST_CATEGORY_ORDER.map(cat => {
              const inCat = presets.filter(t => t.category === cat);
              if (inCat.length === 0) return null;
              const cc = TEST_CATEGORY_COLOR[cat];
              return (
                <div key={cat}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: cc, textTransform: 'uppercase',
                    letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ width: 22, height: 3, borderRadius: 2, background: cc }} />
                    {TEST_CATEGORY_LABEL[cat]} — {inCat.length}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {inCat.map(t => (
                      mode === 'edit' && editTarget?.id === t.id ? null : (
                        <TestCard
                          key={t.id} test={t} isOwned
                          onEdit={() => startEdit(t)}
                          onDelete={() => deleteMut.mutate(t.id)}
                        />
                      )
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Presets sans catégorie (legacy) */}
            {presets.filter(t => !t.category).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  Autres — {presets.filter(t => !t.category).length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {presets.filter(t => !t.category).map(t => (
                    mode === 'edit' && editTarget?.id === t.id ? null : (
                      <TestCard
                        key={t.id} test={t} isOwned
                        onEdit={() => startEdit(t)}
                        onDelete={() => deleteMut.mutate(t.id)}
                      />
                    )
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Tests custom */}
          <section>
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: 'uppercase',
              letterSpacing: '0.6px', marginBottom: 12,
            }}>
              Mes tests — {custom.length}
            </div>

            {custom.length === 0 && mode !== 'create' ? (
              <EmptyState
                icon={FlaskConical}
                title="Aucun test personnalisé"
                description="Crée un test avec tes propres variables mesurables."
                cta={{ label: 'Créer un test', onClick: () => setMode('create') }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {custom.map(t => (
                  mode === 'edit' && editTarget?.id === t.id ? null : (
                    <TestCard
                      key={t.id} test={t}
                      isOwned={t.created_by === coachId}
                      onEdit={() => startEdit(t)}
                      onDelete={() => deleteMut.mutate(t.id)}
                    />
                  )
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ── Styles partagés ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E8E6EA', fontSize: 12, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600,
  color: '#7D7468', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
};

const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
  background: 'transparent', color: '#7D7468', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'color 150ms ease-out',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'transparent', color: '#7D7468',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
};
