import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, Trash2, Pencil, FlaskConical, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAthleteContext } from '@/features/shared/context/AthleteContext';
import { C } from '@/lib/theme';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { ListSkeleton } from '@/features/shared/components/skeletons';
import { useAthleteTestResults, useCreateTestResult, useUpdateTestResult, useDeleteTestResult } from '@/features/shared/hooks/tests/useAthleteTests';
import { usePendingCoachTests, useFillCoachTestSession } from '@/features/shared/hooks/tests/useCoachTestQueue';
import { useTestDefinitions } from '@/features/shared/hooks/tests/useTestDefinitions';
import type { TestDefinitionWithVariables, AthleteTestResult } from '@/features/shared/types/tests';
import { TEST_CATEGORY_COLOR, TEST_CATEGORY_LABEL, TEST_CATEGORY_ORDER, type TestCategory } from '@/features/shared/types/tests';

// ── Données par catégorie (évolution métrique, triée + colorée) ────────────────

interface SeriesPoint { date: string; value: number }
interface MetricSeries {
  key: string;
  category: TestCategory | null;
  title: string;       // nom du test (+ variable si plusieurs)
  unit: string;
  points: SeriesPoint[]; // asc par date
  betterHigher: boolean;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 130, h = 34, pad = 4;
  if (values.length === 0) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const x = (i: number) => values.length === 1 ? w / 2 : pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const lastX = x(values.length - 1), lastY = y(values[values.length - 1]);
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      {values.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={lastX} cy={lastY} r={2.8} fill={color} />
    </svg>
  );
}

function buildSeries(results: AthleteTestResult[]): MetricSeries[] {
  const map = new Map<string, MetricSeries>();
  for (const r of results) {
    const def = r.test_definitions;
    const varCount = def?.test_variables?.length ?? 0;
    for (const v of r.athlete_test_values ?? []) {
      const vd = v.test_variables;
      const key = `${r.test_definition_id}:${v.variable_id}`;
      let s = map.get(key);
      if (!s) {
        s = {
          key,
          category: (def?.category ?? null) as TestCategory | null,
          title: def?.name ? (varCount > 1 && vd?.label ? `${def.name} · ${vd.label}` : def.name) : (vd?.label ?? 'Test'),
          unit: vd?.unit ?? '',
          points: [],
          betterHigher: (vd?.better_when ?? 'higher') === 'higher',
        };
        map.set(key, s);
      }
      s.points.push({ date: r.performed_at, value: Number(v.value) });
    }
  }
  for (const s of map.values()) s.points.sort((a, b) => a.date.localeCompare(b.date));
  return [...map.values()];
}

function fmtNum(n: number): string { return n % 1 === 0 ? String(n) : n.toFixed(1); }

function MetricRow({ s, color }: { s: MetricSeries; color: string }) {
  const last = s.points[s.points.length - 1];
  const first = s.points[0];
  const delta = s.points.length >= 2 ? last.value - first.value : null;
  const dColor = delta == null || delta === 0 ? C.tx3 : (delta > 0) === s.betterHigher ? C.g : C.r;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.s1, border: '1px solid ' + C.brd, borderRadius: 4, padding: '10px 14px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
          {s.points.length} saisie{s.points.length > 1 ? 's' : ''} · depuis {format(new Date(first.date + 'T12:00:00'), 'd MMM yy', { locale: fr })}
        </div>
      </div>
      <Sparkline values={s.points.map(p => p.value)} color={color} />
      <div style={{ textAlign: 'right', minWidth: 70 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color }}>{fmtNum(last.value)}<span style={{ fontSize: 10, color: C.tx3, fontWeight: 500 }}> {s.unit}</span></div>
        {delta != null && (
          <div style={{ fontSize: 11, fontWeight: 700, color: dColor }}>{delta > 0 ? '+' : ''}{fmtNum(delta)}</div>
        )}
      </div>
    </div>
  );
}

function MetricsByCategory({ results }: { results: AthleteTestResult[] }) {
  const series = buildSeries(results);
  if (series.length === 0) {
    return <div style={{ fontSize: 12, color: C.tx3, fontStyle: 'italic', padding: '8px 0' }}>Aucune donnée enregistrée.</div>;
  }
  const cats: (TestCategory | 'autres')[] = [...TEST_CATEGORY_ORDER, 'autres'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {cats.map(cat => {
        const inCat = series.filter(s => (s.category ?? 'autres') === cat);
        if (inCat.length === 0) return null;
        const color = cat === 'autres' ? C.tx3 : TEST_CATEGORY_COLOR[cat];
        const label = cat === 'autres' ? 'Autres' : TEST_CATEGORY_LABEL[cat];
        return (
          <div key={cat}>
            <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 22, height: 3, borderRadius: 2, background: color }} />
              {label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
              {inCat.sort((a, b) => a.title.localeCompare(b.title)).map(s => (
                <MetricRow key={s.key} s={s} color={color} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Composant : carte résultat ────────────────────────────────────────────────

function ResultCard({
  result, onEdit, onDelete, deleting,
}: {
  result: AthleteTestResult;
  onEdit: (r: AthleteTestResult) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const def = result.test_definitions;
  const values = result.athlete_test_values ?? [];

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: '1px solid ' + C.brd, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <FlaskConical size={14} color={C.ac} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
              {def?.name ?? 'Test inconnu'}
            </span>
            <span style={{ fontSize: 11, color: C.tx3 }}>
              · {format(new Date(result.performed_at), 'd MMM yyyy', { locale: fr })}
            </span>
          </div>

          {/* Valeurs */}
          {values.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {values.map(v => {
                const varDef = v.test_variables;
                const num = Number(v.value);
                return (
                  <div key={v.id} style={{
                    padding: '4px 10px', borderRadius: 7,
                    background: 'rgba(255,201,51,0.08)', border: '1px solid rgba(255,201,51,0.15)',
                  }}>
                    <span style={{ fontSize: 11, color: C.tx3 }}>
                      {varDef?.label ?? '—'}{' '}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.ac }}>
                      {num % 1 === 0 ? num : num.toFixed(1)}{' '}{varDef?.unit ?? ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {result.notes && (
            <p style={{ fontSize: 11, color: C.tx3, marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
              "{result.notes}"
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
          {!confirmDelete && (
            <button onClick={() => onEdit(result)} style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.brdL,
              background: 'transparent', color: C.tx3, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Pencil size={13} />
            </button>
          )}
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { onDelete(result.id); setConfirmDelete(false); }}
                disabled={deleting}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: 'none', fontFamily: 'inherit',
                  background: 'rgba(239,75,75,0.15)', color: '#FF5A33',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Supprimer
              </button>
              <button onClick={() => setConfirmDelete(false)} style={{
                padding: '5px 8px', borderRadius: 6, border: '1px solid ' + C.brdL,
                background: 'transparent', color: C.tx3, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.brdL,
              background: 'transparent', color: C.tx3, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 150ms ease-out',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#FF5A33')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.tx3)}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Formulaire ajout résultat ─────────────────────────────────────────────────

function AddResultForm({
  tests, athleteId, editResult, onSuccess, onCancel,
}: {
  tests: TestDefinitionWithVariables[];
  athleteId: string;
  editResult?: AthleteTestResult;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const createMut = useCreateTestResult(athleteId);
  const updateMut = useUpdateTestResult(athleteId);
  const isEdit = !!editResult;
  const saving = createMut.isPending || updateMut.isPending;

  const [selectedTestId, setSelectedTestId] = useState(editResult?.test_definition_id ?? '');
  const [date, setDate] = useState(editResult?.performed_at ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(editResult?.notes ?? '');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of editResult?.athlete_test_values ?? []) init[v.variable_id] = String(v.value);
    return init;
  });

  const selectedTest = tests.find(t => t.id === selectedTestId);

  function handleTestSelect(id: string) {
    setSelectedTestId(id);
    setValues({});
  }

  function handleSubmit() {
    if (!selectedTest) return;
    const numericValues: Record<string, number> = {};
    for (const [variableId, raw] of Object.entries(values)) {
      const n = parseFloat(raw.replace(',', '.'));
      if (!isNaN(n)) numericValues[variableId] = n;
    }
    if (isEdit) {
      updateMut.mutate(
        { resultId: editResult.id, test_definition_id: selectedTestId, performed_at: date, notes, values: numericValues },
        { onSuccess },
      );
    } else {
      createMut.mutate(
        { test_definition_id: selectedTestId, performed_at: date, notes, values: numericValues },
        { onSuccess },
      );
    }
  }

  const isValid = !!selectedTest && selectedTest.test_variables.some(v => {
    const raw = values[v.id];
    return raw && !isNaN(parseFloat(raw.replace(',', '.')));
  });

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: '1px solid ' + C.ac + '40',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{
          width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.brdL,
          background: 'transparent', color: C.tx3, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{isEdit ? 'Modifier le résultat' : 'Nouveau résultat'}</span>
      </div>

      {/* Sélection du test */}
      <div>
        <label style={labelStyle}>Test *</label>
        <select
          value={selectedTestId}
          onChange={e => handleTestSelect(e.target.value)}
          disabled={isEdit}
          style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1, cursor: isEdit ? 'default' : 'pointer' }}
        >
          <option value="">Sélectionner un test…</option>
          {tests.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div>
        <label style={labelStyle}>Date *</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Variables du test sélectionné */}
      {selectedTest && (
        <div>
          <label style={labelStyle}>Mesures</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedTest.test_variables.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 90, fontSize: 12, fontWeight: 600, color: C.tx }}>
                  {v.label}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[v.id] ?? ''}
                  onChange={e => setValues(prev => ({ ...prev, [v.id]: e.target.value }))}
                  placeholder="—"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div style={{ minWidth: 48, fontSize: 12, color: C.tx3, flexShrink: 0 }}>
                  {v.unit}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div>
        <label style={labelStyle}>Note (optionnel)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Conditions, ressenti, observations…"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={cancelBtnStyle}>Annuler</button>
        <button
          onClick={handleSubmit}
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
          {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Valider les résultats'}
        </button>
      </div>
    </div>
  );
}

// ── Tests à remplir par le coach (athlète a validé) ───────────────────────────

function CoachToFill({ athleteId }: { athleteId: string }) {
  const { data: pending = [] } = usePendingCoachTests(athleteId);
  const fill = useFillCoachTestSession(athleteId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  if (pending.length === 0) return null;

  function submit(sessionId: string, variables: { id: string; key: string; value_type: string }[]) {
    const out: Record<string, number> = {};
    for (const v of variables) {
      const n = parseFloat((vals[v.id] ?? '').replace(',', '.'));
      if (!isNaN(n)) out[v.key] = n;
    }
    if (Object.keys(out).length === 0) return;
    fill.mutate({ sessionId, variables: out }, { onSuccess: () => { setOpenId(null); setVals({}); } });
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.o, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          À remplir — {pending.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pending.map(p => {
          const open = openId === p.sessionId;
          return (
            <div key={p.sessionId} style={{ background: C.s1, borderRadius: 6, border: '1px solid ' + C.o + '40', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                    Réalisé par l’athlète le {format(new Date(p.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
                  </div>
                  {p.comment && (
                    <div style={{ fontSize: 11, color: C.tx2, fontStyle: 'italic', marginTop: 4 }}>« {p.comment} »</div>
                  )}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.o, background: C.o + '1A', border: '1px solid ' + C.o + '40', borderRadius: 5, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>À remplir</span>
                <button onClick={() => { setOpenId(open ? null : p.sessionId); setVals({}); }} style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: C.oV, color: '#0E0C0A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {open ? 'Fermer' : 'Remplir'}
                </button>
              </div>

              {open && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.variables.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ minWidth: 100, fontSize: 12, fontWeight: 600, color: C.tx }}>{v.label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={v.value_type === 'scale5' ? 0 : undefined}
                        max={v.value_type === 'scale5' ? 5 : undefined}
                        step={v.value_type === 'scale5' ? 0.5 : undefined}
                        value={vals[v.id] ?? ''}
                        onChange={e => setVals(s => ({ ...s, [v.id]: e.target.value }))}
                        placeholder={v.value_type === 'scale5' ? '0–5' : '—'}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 4, border: '1px solid ' + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <span style={{ minWidth: 40, fontSize: 12, color: C.tx3 }}>{v.unit}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => submit(p.sessionId, p.variables)}
                    disabled={fill.isPending}
                    style={{ alignSelf: 'flex-end', marginTop: 4, padding: '8px 18px', borderRadius: 4, border: 'none', background: C.oV, color: '#0E0C0A', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {fill.isPending ? 'Enregistrement…' : 'Valider la note'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function TestPage({ embedded = false }: { embedded?: boolean }) {
  const { profile } = useAuth();
  const { athleteId } = useAthleteContext();
  const coachId = profile?.id ?? '';

  const { data: results = [], isLoading: loadingResults } = useAthleteTestResults(athleteId);
  const { data: allTests = [] } = useTestDefinitions(coachId);
  const deleteMut = useDeleteTestResult(athleteId);

  const [addingResult, setAddingResult] = useState(false);
  const [editResult, setEditResult] = useState<AthleteTestResult | null>(null);

  return (
    <div style={embedded ? { display: 'flex', flexDirection: 'column' } : { padding: '20px 24px 60px' }}>

      {/* Tests à remplir (athlète a validé un test mode coach) */}
      <CoachToFill athleteId={athleteId} />

      {/* Données par catégorie (évolution métrique) */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>
          Données par catégorie
        </div>
        {loadingResults ? <ListSkeleton rows={3} /> : <MetricsByCategory results={results} />}
      </section>

      {/* Historique des résultats */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={15} color={C.tx3} />
            <span style={{
              fontSize: 10, fontWeight: 700, color: C.tx3,
              textTransform: 'uppercase', letterSpacing: '0.6px',
            }}>
              Résultats — {results.length}
            </span>
          </div>
          {!addingResult && !editResult && (
            <button
              onClick={() => setAddingResult(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 4, border: 'none',
                background: C.acV, color: '#0E0C0A', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'opacity 150ms ease-out',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
            >
              <Plus size={13} /> Ajouter un résultat
            </button>
          )}
        </div>

        {/* Formulaire inline (ajout / édition) */}
        {addingResult && (
          <div style={{ marginBottom: 16 }}>
            <AddResultForm
              tests={allTests}
              athleteId={athleteId}
              onSuccess={() => setAddingResult(false)}
              onCancel={() => setAddingResult(false)}
            />
          </div>
        )}
        {editResult && (
          <div style={{ marginBottom: 16 }}>
            <AddResultForm
              tests={allTests}
              athleteId={athleteId}
              editResult={editResult}
              onSuccess={() => setEditResult(null)}
              onCancel={() => setEditResult(null)}
            />
          </div>
        )}

        {loadingResults ? (
          <ListSkeleton rows={3} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Aucun résultat de test"
            description="Ajoute le premier résultat pour cet athlète."
            cta={{ label: 'Ajouter un résultat', onClick: () => setAddingResult(true) }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map(r => (
              editResult?.id === r.id ? null : (
                <ResultCard
                  key={r.id} result={r}
                  onEdit={(res) => { setEditResult(res); setAddingResult(false); }}
                  onDelete={id => deleteMut.mutate(id)}
                  deleting={deleteMut.isPending}
                />
              )
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E8E6EA', fontSize: 12, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600,
  color: '#7D7468', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'transparent', color: '#7D7468',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
};
