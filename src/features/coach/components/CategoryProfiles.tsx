/**
 * CategoryProfiles — profil sportif synthétique par catégorie (vue coach).
 * Items notés /5 (ajustables), niveau qualitatif dérivé. Distinct des résultats de tests bruts.
 */
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { C } from '@/lib/theme';
import {
  TEST_CATEGORY_ORDER, TEST_CATEGORY_LABEL, TEST_CATEGORY_COLOR, PHYSIO_METRICS,
  type TestCategory,
} from '@/features/shared/types/tests';
import {
  useProfileItems, useCreateProfileItem, useUpdateProfileItem, useDeleteProfileItem,
  type ProfileItem,
} from '@/features/shared/hooks/useProfileItems';
import { useArticularProfile, type ArticularAction } from '@/features/shared/hooks/useArticularProfile';
import { useCategoryTestSeries } from '@/features/shared/hooks/useCategoryTestSeries';
import { Film } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function ratingLabel(r: number | null): string {
  if (r == null) return 'Non noté';
  if (r >= 5) return 'Excellent';
  if (r >= 4) return 'Très bon';
  if (r >= 3) return 'Bon';
  if (r >= 2) return 'Moyen';
  return 'Faible';
}

function RatingDots({ value, color, onPick }: { value: number | null; color: string; onPick?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const on = value != null && n <= value;
        return (
          <button
            key={n}
            onClick={onPick ? () => onPick(n) : undefined}
            disabled={!onPick}
            style={{
              width: 14, height: 14, borderRadius: '50%', padding: 0,
              border: '1px solid ' + (on ? color : C.brdL),
              background: on ? color : 'transparent',
              cursor: onPick ? 'pointer' : 'default',
            }}
          />
        );
      })}
    </div>
  );
}

interface FormState { category: TestCategory; label: string; rating: number | null; note: string }

function ItemForm({
  color, initial, saving, onSave, onCancel,
}: {
  color: string;
  initial: FormState;
  saving: boolean;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const valid = f.label.trim().length > 0;
  return (
    <div style={{ background: C.s2, borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid ' + color + '40' }}>
      <input
        value={f.label}
        onChange={e => setF(s => ({ ...s, label: e.target.value }))}
        placeholder="Item (ex: RE hanche, Force max…)"
        autoFocus
        style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid ' + C.brdL, background: C.s1, color: C.tx, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.tx3, minWidth: 50 }}>Note /5</span>
        <RatingDots value={f.rating} color={color} onPick={n => setF(s => ({ ...s, rating: s.rating === n ? null : n }))} />
        <span style={{ fontSize: 11, fontWeight: 700, color: f.rating != null ? color : C.tx3, marginLeft: 4 }}>{ratingLabel(f.rating)}</span>
      </div>
      <input
        value={f.note}
        onChange={e => setF(s => ({ ...s, note: e.target.value }))}
        placeholder="Note / commentaire (optionnel)"
        style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid ' + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid ' + C.brdL, background: 'transparent', color: C.tx3, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
        <button onClick={() => valid && onSave(f)} disabled={!valid || saving} style={{ padding: '6px 14px', borderRadius: 4, border: 'none', background: valid ? color : C.s1, color: valid ? '#fff' : C.tx3, fontSize: 12, fontWeight: 700, cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Check size={13} /> {saving ? '…' : 'OK'}
        </button>
      </div>
    </div>
  );
}

function ItemRow({ item, color, onEdit, onDelete }: { item: ProfileItem; color: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ background: C.s1, border: '1px solid ' + C.brd, borderRadius: 4, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{item.label}</div>
        {item.note && <div style={{ fontSize: 11, color: C.tx3, fontStyle: 'italic', marginTop: 2 }}>{item.note}</div>}
      </div>
      <RatingDots value={item.rating} color={color} />
      <span style={{ fontSize: 11, fontWeight: 700, color: item.rating != null ? color : C.tx3, minWidth: 64, textAlign: 'right' }}>
        {ratingLabel(item.rating)}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onEdit} style={iconBtn(C.tx3)}><Pencil size={12} /></button>
        <button onClick={onDelete} style={iconBtn(C.r)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.brdL, background: 'transparent', color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
}

// ── Couleur /5 (nuance rouge → vert) ──────────────────────────────────────────
function scoreColor(n: number | null): string {
  if (n == null) return C.tx3;
  if (n <= 1) return '#FF5A33';
  if (n <= 2) return '#FF9500';
  if (n <= 3) return '#FF9500';
  if (n <= 4) return '#84CC16';
  return '#66F03C';
}

// ── Vue Bilan articulaire (dérivée des tests, groupée par articulation) ────────
function fmtScore(n: number | null): string {
  return n != null ? `${n % 1 === 0 ? n : n.toFixed(1)}/5` : '—';
}

// Pop-up évolution (graphique très simple : barres chronologiques)
function EvolutionModal({ item, onClose }: { item: ArticularAction; onClose: () => void }) {
  const asc = [...item.history].reverse(); // chronologique
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: C.s1, border: '1px solid ' + C.brd, borderRadius: 6, padding: 20, width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{item.action}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid ' + C.brdL, background: 'transparent', color: C.tx3, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
        </div>

        {asc.length === 0 ? (
          <div style={{ fontSize: 12, color: C.tx3, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>Aucune saisie pour le moment.</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150, padding: '0 4px' }}>
            {asc.map((h, i) => {
              const hc = scoreColor(h.score);
              const pct = ((h.score ?? 0) / 5) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: hc }}>{fmtScore(h.score)}</span>
                  <div style={{ width: '100%', maxWidth: 32, height: `${Math.max(pct, 4)}%`, background: hc, borderRadius: '5px 5px 0 0' }} />
                  <span style={{ fontSize: 9, color: C.tx3, textAlign: 'center', lineHeight: 1.2 }}>
                    {format(new Date(h.date + 'T12:00:00'), 'd MMM', { locale: fr })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vue Endurance (VMA extrapolée du Demi-Cooper : distance / 100) ─────────────
function MiniBars({ points, color, fmt }: { points: { date: string; value: number }[]; color: string; fmt: (n: number) => string }) {
  const max = Math.max(...points.map(p => p.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, marginTop: 12 }}>
      {points.map((p, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color }}>{fmt(p.value)}</span>
          <div style={{ width: '100%', maxWidth: 30, height: `${Math.max((p.value / max) * 100, 4)}%`, background: color, borderRadius: '4px 4px 0 0' }} />
          <span style={{ fontSize: 9, color: C.tx3 }}>{format(new Date(p.date + 'T12:00:00'), 'd MMM', { locale: fr })}</span>
        </div>
      ))}
    </div>
  );
}

function applyExtrap(value: number, op: 'div' | 'mul' | null, factor: number | null): number {
  if (!op || !factor) return value;
  const r = op === 'div' ? value / factor : value * factor;
  return Math.round(r * 10) / 10;
}

function CategoryDerivedProfile({ athleteId, category }: { athleteId: string; category: 'endurance' | 'force' | 'explosivite' | 'vitesse' }) {
  const color = TEST_CATEGORY_COLOR[category];
  const { data: series = [], isLoading } = useCategoryTestSeries(athleteId, category);

  if (isLoading) return <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>;
  if (series.length === 0) return <div style={{ fontSize: 12, color: C.tx3, fontStyle: 'italic' }}>Aucune donnée pour cette catégorie.</div>;

  const extrap = series.filter(s => s.extrapMetric);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Valeurs physiologiques extrapolées */}
      {extrap.map(s => {
        const metric = PHYSIO_METRICS.find(m => m.key === s.extrapMetric);
        const pts = s.points.map(p => ({ date: p.date, value: applyExtrap(p.value, s.extrapOp, s.extrapFactor) }));
        const last = pts[pts.length - 1];
        const lastRaw = s.points[s.points.length - 1];
        const opSym = s.extrapOp === 'mul' ? '×' : '÷';
        return (
          <div key={'x' + s.testId + s.varId} style={{ background: C.s1, border: '1px solid ' + color + '40', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {metric?.label ?? s.extrapMetric} extrapolé{metric?.label?.endsWith('A') ? 'e' : ''}
            </div>
            <div style={{ fontSize: 10, color: C.tx3, marginBottom: 8 }}>
              {s.testName} — {s.varLabel} {opSym} {s.extrapFactor}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: C.tx, lineHeight: 1 }}>{last.value}</span>
              <span style={{ fontSize: 13, color: C.tx3 }}>{metric?.unit}</span>
              <span style={{ fontSize: 11, color: C.tx3, marginLeft: 'auto' }}>
                {lastRaw.value} {s.unit} · {format(new Date(last.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
              </span>
            </div>
            {pts.length > 1 && <MiniBars points={pts} color={color} fmt={n => `${n}`} />}
          </div>
        );
      })}

      {/* Valeurs brutes des tests */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {series.map(s => {
          const last = s.points[s.points.length - 1];
          return (
            <div key={s.testId + s.varId} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.s1, border: '1px solid ' + C.brd, borderRadius: 4, padding: '8px 12px' }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.tx }}>{s.testName}{s.varLabel && s.varLabel !== s.testName ? ` · ${s.varLabel}` : ''}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color }}>{last.value % 1 === 0 ? last.value : last.value.toFixed(1)}<span style={{ fontSize: 10, color: C.tx3, fontWeight: 500 }}> {s.unit}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArticularProfile({ athleteId }: { athleteId: string }) {
  const { data: groups = [], isLoading } = useArticularProfile(athleteId);
  const [selected, setSelected] = useState<ArticularAction | null>(null);

  if (isLoading) return <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>;
  if (groups.length === 0) {
    return <div style={{ fontSize: 12, color: C.tx3, fontStyle: 'italic' }}>Aucun test articulaire dans la banque.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map(g => (
        <div key={g.articulation}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.tx, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {g.articulation}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {g.items.map(it => {
              const sc = scoreColor(it.score);
              return (
                <button
                  key={it.testId}
                  onClick={() => setSelected(it)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.s1, border: '1px solid ' + C.brd, borderRadius: 4, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.action}</span>
                  {it.mediaUrl && (
                    <a href={it.mediaUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.tx3, display: 'flex', flexShrink: 0 }} title="Média explicatif">
                      <Film size={12} />
                    </a>
                  )}
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: sc, background: sc + '1A', border: '1px solid ' + sc + '40', borderRadius: 6, padding: '2px 8px', minWidth: 38, textAlign: 'center' }}>
                    {fmtScore(it.score)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected && <EvolutionModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default function CategoryProfiles({ athleteId }: { athleteId: string }) {
  const { data: items = [], isLoading } = useProfileItems(athleteId);
  const createM = useCreateProfileItem(athleteId);
  const updateM = useUpdateProfileItem(athleteId);
  const deleteM = useDeleteProfileItem(athleteId);

  const [selectedCat, setSelectedCat] = useState<TestCategory>('bilan_articulaire');
  // active form : { mode:'add', category } ou { mode:'edit', item }
  const [active, setActive] = useState<{ mode: 'add'; category: TestCategory } | { mode: 'edit'; item: ProfileItem } | null>(null);

  function save(f: FormState) {
    if (active?.mode === 'edit') {
      updateM.mutate({ id: active.item.id, category: f.category, label: f.label, rating: f.rating, note: f.note }, { onSuccess: () => setActive(null) });
    } else {
      createM.mutate({ category: f.category, label: f.label, rating: f.rating, note: f.note }, { onSuccess: () => setActive(null) });
    }
  }

  const cc = TEST_CATEGORY_COLOR[selectedCat];
  const catItems = items.filter(i => i.category === selectedCat);
  const addingHere = active?.mode === 'add' && active.category === selectedCat;

  return (
    <section style={{ border: '1px solid ' + C.brd, borderRadius: 6, overflow: 'hidden' }}>
      {/* Header : titre + boutons filtres (1 catégorie à la fois) */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid ' + C.brd, background: cc + '14', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.tx, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 'auto' }}>
          Profil par catégorie
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEST_CATEGORY_ORDER.map(cat => {
            const c = TEST_CATEGORY_COLOR[cat];
            const on = cat === selectedCat;
            return (
              <button
                key={cat}
                onClick={() => { setSelectedCat(cat); setActive(null); }}
                style={{
                  padding: '5px 11px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  border: '1px solid ' + (on ? c : C.brdL),
                  background: on ? c : 'transparent',
                  color: on ? '#fff' : C.tx3,
                }}
              >
                {TEST_CATEGORY_LABEL[cat]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {selectedCat === 'bilan_articulaire' ? (
          <ArticularProfile athleteId={athleteId} />
        ) : selectedCat === 'endurance' ? (
          <CategoryDerivedProfile athleteId={athleteId} category="endurance" />
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: cc, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 3, borderRadius: 2, background: cc }} />
                {TEST_CATEGORY_LABEL[selectedCat]}
              </div>
              {!active && (
                <button onClick={() => setActive({ mode: 'add', category: selectedCat })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid ' + cc + '50', background: cc + '12', color: cc, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={12} /> Item
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isLoading ? (
                <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
              ) : (
                <>
                  {catItems.map(item =>
                    active?.mode === 'edit' && active.item.id === item.id ? (
                      <ItemForm
                        key={item.id} color={cc}
                        initial={{ category: selectedCat, label: item.label, rating: item.rating, note: item.note ?? '' }}
                        saving={updateM.isPending}
                        onSave={save}
                        onCancel={() => setActive(null)}
                      />
                    ) : (
                      <ItemRow key={item.id} item={item} color={cc}
                        onEdit={() => setActive({ mode: 'edit', item })}
                        onDelete={() => deleteM.mutate(item.id)}
                      />
                    )
                  )}
                  {addingHere && (
                    <ItemForm
                      color={cc}
                      initial={{ category: selectedCat, label: '', rating: null, note: '' }}
                      saving={createM.isPending}
                      onSave={save}
                      onCancel={() => setActive(null)}
                    />
                  )}
                  {catItems.length === 0 && !addingHere && (
                    <div style={{ fontSize: 11, color: C.tx3, fontStyle: 'italic', padding: '2px 0' }}>Aucun item.</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
