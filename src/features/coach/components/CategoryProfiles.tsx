/**
 * CategoryProfiles — profil sportif synthétique par catégorie (vue coach).
 * Items notés /5 (ajustables), niveau qualitatif dérivé. Distinct des résultats de tests bruts.
 */
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TEST_CATEGORY_ORDER, TEST_CATEGORY_LABEL, PHYSIO_METRICS,
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

/** Classes d'une couleur (catégorie de test ou palier de note), écrites en entier pour Tailwind. */
interface Tone {
  text: string;
  fill: string;   // fond plein
  edge: string;   // bordure pleine
  soft: string;   // bordure 25 %
}

/** Couleur de chaque catégorie (même correspondance que TEST_CATEGORY_COLOR). */
const CAT: Record<TestCategory, Tone & { head: string; add: string }> = {
  bilan_articulaire: { text: 'text-agon-info', fill: 'bg-agon-info', edge: 'border-agon-info', soft: 'border-agon-info/25', head: 'bg-agon-info/[0.078]', add: 'border-agon-info/[0.314] bg-agon-info/[0.071] text-agon-info' },
  endurance:         { text: 'text-agon-succes', fill: 'bg-agon-succes', edge: 'border-agon-succes', soft: 'border-agon-succes/25', head: 'bg-agon-succes/[0.078]', add: 'border-agon-succes/[0.314] bg-agon-succes/[0.071] text-agon-succes' },
  force:             { text: 'text-agon-erreur', fill: 'bg-agon-erreur', edge: 'border-agon-erreur', soft: 'border-agon-erreur/25', head: 'bg-agon-erreur/[0.078]', add: 'border-agon-erreur/[0.314] bg-agon-erreur/[0.071] text-agon-erreur' },
  explosivite:       { text: 'text-agon-alerte', fill: 'bg-agon-alerte', edge: 'border-agon-alerte', soft: 'border-agon-alerte/25', head: 'bg-agon-alerte/[0.078]', add: 'border-agon-alerte/[0.314] bg-agon-alerte/[0.071] text-agon-alerte' },
  vitesse:           { text: 'text-agon-accent', fill: 'bg-agon-accent', edge: 'border-agon-accent', soft: 'border-agon-accent/25', head: 'bg-agon-accent/[0.078]', add: 'border-agon-accent/[0.314] bg-agon-accent/[0.071] text-agon-accent' },
};

function ratingLabel(r: number | null): string {
  if (r == null) return 'Non noté';
  if (r >= 5) return 'Excellent';
  if (r >= 4) return 'Très bon';
  if (r >= 3) return 'Bon';
  if (r >= 2) return 'Moyen';
  return 'Faible';
}

/** Couleur d'une note /5 (rouge → vert). */
const SCORE_NONE: Tone & { chip: string } = { text: 'text-agon-tx3', fill: 'bg-agon-tx3', edge: 'border-agon-tx3', soft: 'border-agon-tx3/25', chip: 'bg-agon-tx3/[0.102]' };
const SCORE_TONES: (Tone & { chip: string })[] = [
  { text: 'text-agon-erreur', fill: 'bg-agon-erreur', edge: 'border-agon-erreur', soft: 'border-agon-erreur/25', chip: 'bg-agon-erreur/[0.102]' },
  { text: 'text-agon-alerte', fill: 'bg-agon-alerte', edge: 'border-agon-alerte', soft: 'border-agon-alerte/25', chip: 'bg-agon-alerte/[0.102]' },
  { text: 'text-agon-zone5-2', fill: 'bg-agon-zone5-2', edge: 'border-agon-zone5-2', soft: 'border-agon-zone5-2/25', chip: 'bg-agon-zone5-2/[0.102]' },
  { text: 'text-agon-succes', fill: 'bg-agon-succes', edge: 'border-agon-succes', soft: 'border-agon-succes/25', chip: 'bg-agon-succes/[0.102]' },
];
function scoreTone(n: number | null) {
  if (n == null) return SCORE_NONE;
  if (n <= 1) return SCORE_TONES[0];
  if (n <= 3) return SCORE_TONES[1];
  if (n <= 4) return SCORE_TONES[2];
  return SCORE_TONES[3];
}

const MUTED = 'text-[12px] text-agon-tx3';
const MUTED_I = 'text-[12px] italic text-agon-tx3';
const INPUT = 'w-full rounded border border-agon-brd-l bg-agon-s1 px-2.5 py-[7px] text-agon-tx outline-none';
const ICON_BTN = 'flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-agon-brd-l bg-transparent';

function RatingDots({ value, tone, onPick }: { value: number | null; tone: Tone; onPick?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const on = value != null && n <= value;
        return (
          <button
            key={n}
            onClick={onPick ? () => onPick(n) : undefined}
            disabled={!onPick}
            className={cn(
              'h-3.5 w-3.5 rounded-full border p-0',
              on ? cn(tone.edge, tone.fill) : 'border-agon-brd-l bg-transparent',
              onPick ? 'cursor-pointer' : 'cursor-default',
            )}
          />
        );
      })}
    </div>
  );
}

interface FormState { category: TestCategory; label: string; rating: number | null; note: string }

function ItemForm({
  tone, initial, saving, onSave, onCancel,
}: {
  tone: Tone;
  initial: FormState;
  saving: boolean;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const valid = f.label.trim().length > 0;
  return (
    <div className={cn('flex flex-col gap-2.5 rounded border bg-agon-s2 p-3', tone.soft)}>
      <input
        value={f.label}
        onChange={e => setF(s => ({ ...s, label: e.target.value }))}
        placeholder="Item (ex: RE hanche, Force max…)"
        autoFocus
        className={cn(INPUT, 'text-[13px]')}
      />
      <div className="flex items-center gap-2.5">
        <span className="min-w-[50px] text-[11px] text-agon-tx3">Note /5</span>
        <RatingDots value={f.rating} tone={tone} onPick={n => setF(s => ({ ...s, rating: s.rating === n ? null : n }))} />
        <span className={cn('ml-1 text-[11px] font-bold', f.rating != null ? tone.text : 'text-agon-tx3')}>{ratingLabel(f.rating)}</span>
      </div>
      <input
        value={f.note}
        onChange={e => setF(s => ({ ...s, note: e.target.value }))}
        placeholder="Note / commentaire (optionnel)"
        className={cn(INPUT, 'text-[12px]')}
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="cursor-pointer rounded border border-agon-brd-l bg-transparent px-3 py-1.5 text-[12px] text-agon-tx3">Annuler</button>
        <button
          onClick={() => valid && onSave(f)}
          disabled={!valid || saving}
          className={cn(
            'flex items-center gap-[5px] rounded border-none px-3.5 py-1.5 text-[12px] font-bold',
            valid ? cn(tone.fill, 'cursor-pointer text-agon-tx') : 'cursor-default bg-agon-s1 text-agon-tx3',
          )}
        >
          <Check size={13} /> {saving ? '…' : 'OK'}
        </button>
      </div>
    </div>
  );
}

function ItemRow({ item, tone, onEdit, onDelete }: { item: ProfileItem; tone: Tone; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded border border-agon-brd bg-agon-s1 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-agon-tx">{item.label}</div>
        {item.note && <div className="mt-0.5 text-[11px] italic text-agon-tx3">{item.note}</div>}
      </div>
      <RatingDots value={item.rating} tone={tone} />
      <span className={cn('min-w-[64px] text-right text-[11px] font-bold', item.rating != null ? tone.text : 'text-agon-tx3')}>
        {ratingLabel(item.rating)}
      </span>
      <div className="flex gap-1">
        <button onClick={onEdit} className={cn(ICON_BTN, 'text-agon-tx3')}><Pencil size={12} /></button>
        <button onClick={onDelete} className={cn(ICON_BTN, 'text-agon-erreur')}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ── Vue Bilan articulaire (dérivée des tests, groupée par articulation) ────────
function fmtScore(n: number | null): string {
  return n != null ? `${n % 1 === 0 ? n : n.toFixed(1)}/5` : '—';
}

// Pop-up évolution (graphique très simple : barres chronologiques)
function EvolutionModal({ item, onClose }: { item: ArticularAction; onClose: () => void }) {
  const asc = [...item.history].reverse(); // chronologique
  return (
    <div onClick={onClose} className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-6">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[440px] rounded-[6px] border border-agon-brd bg-agon-s1 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[15px] font-extrabold text-agon-tx">{item.action}</div>
          <button onClick={onClose} className="h-7 w-7 cursor-pointer rounded border border-agon-brd-l bg-transparent text-[16px] text-agon-tx3">×</button>
        </div>

        {asc.length === 0 ? (
          <div className={cn(MUTED_I, 'py-5 text-center')}>Aucune saisie pour le moment.</div>
        ) : (
          <div className="flex h-[150px] items-end gap-2.5 px-1">
            {asc.map((h, i) => {
              const hc = scoreTone(h.score);
              const pct = ((h.score ?? 0) / 5) * 100;
              return (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-[5px]">
                  <span className={cn('text-[11px] font-extrabold', hc.text)}>{fmtScore(h.score)}</span>
                  <div className={cn('w-full max-w-[32px] rounded-t-[5px]', hc.fill)} style={{ height: `${Math.max(pct, 4)}%` }} />
                  <span className="text-center text-[9px] leading-[1.2] text-agon-tx3">
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
function MiniBars({ points, tone, fmt }: { points: { date: string; value: number }[]; tone: Tone; fmt: (n: number) => string }) {
  const max = Math.max(...points.map(p => p.value), 1);
  return (
    <div className="mt-3 flex h-[90px] items-end gap-2">
      {points.map((p, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className={cn('text-[10px] font-extrabold', tone.text)}>{fmt(p.value)}</span>
          <div className={cn('w-full max-w-[30px] rounded-t', tone.fill)} style={{ height: `${Math.max((p.value / max) * 100, 4)}%` }} />
          <span className="text-[9px] text-agon-tx3">{format(new Date(p.date + 'T12:00:00'), 'd MMM', { locale: fr })}</span>
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
  const tone = CAT[category];
  const { data: series = [], isLoading } = useCategoryTestSeries(athleteId, category);

  if (isLoading) return <div className={MUTED}>Chargement…</div>;
  if (series.length === 0) return <div className={MUTED_I}>Aucune donnée pour cette catégorie.</div>;

  const extrap = series.filter(s => s.extrapMetric);

  return (
    <div className="flex flex-col gap-4">
      {/* Valeurs physiologiques extrapolées */}
      {extrap.map(s => {
        const metric = PHYSIO_METRICS.find(m => m.key === s.extrapMetric);
        const pts = s.points.map(p => ({ date: p.date, value: applyExtrap(p.value, s.extrapOp, s.extrapFactor) }));
        const last = pts[pts.length - 1];
        const lastRaw = s.points[s.points.length - 1];
        const opSym = s.extrapOp === 'mul' ? '×' : '÷';
        return (
          <div key={'x' + s.testId + s.varId} className={cn('rounded-[6px] border bg-agon-s1 px-4 py-3.5', tone.soft)}>
            <div className={cn('text-[11px] font-bold uppercase tracking-[0.04em]', tone.text)}>
              {metric?.label ?? s.extrapMetric} extrapolé{metric?.label?.endsWith('A') ? 'e' : ''}
            </div>
            <div className="mb-2 text-[10px] text-agon-tx3">
              {s.testName} — {s.varLabel} {opSym} {s.extrapFactor}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold leading-none text-agon-tx">{last.value}</span>
              <span className="text-[13px] text-agon-tx3">{metric?.unit}</span>
              <span className="ml-auto text-[11px] text-agon-tx3">
                {lastRaw.value} {s.unit} · {format(new Date(last.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
              </span>
            </div>
            {pts.length > 1 && <MiniBars points={pts} tone={tone} fmt={n => `${n}`} />}
          </div>
        );
      })}

      {/* Valeurs brutes des tests */}
      <div className="flex flex-col gap-2">
        {series.map(s => {
          const last = s.points[s.points.length - 1];
          return (
            <div key={s.testId + s.varId} className="flex items-center gap-2.5 rounded border border-agon-brd bg-agon-s1 px-3 py-2">
              <span className="flex-1 text-[12px] font-semibold text-agon-tx">{s.testName}{s.varLabel && s.varLabel !== s.testName ? ` · ${s.varLabel}` : ''}</span>
              <span className={cn('text-[14px] font-extrabold', tone.text)}>{last.value % 1 === 0 ? last.value : last.value.toFixed(1)}<span className="text-[10px] font-medium text-agon-tx3"> {s.unit}</span></span>
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

  if (isLoading) return <div className={MUTED}>Chargement…</div>;
  if (groups.length === 0) {
    return <div className={MUTED_I}>Aucun test articulaire dans la banque.</div>;
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {groups.map(g => (
        <div key={g.articulation}>
          <div className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.04em] text-agon-tx">
            {g.articulation}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {g.items.map(it => {
              const sc = scoreTone(it.score);
              return (
                <button
                  key={it.testId}
                  onClick={() => setSelected(it)}
                  className="flex cursor-pointer items-center gap-2 rounded border border-agon-brd bg-agon-s1 px-2.5 py-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-agon-tx">{it.action}</span>
                  {it.mediaUrl && (
                    <a href={it.mediaUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex shrink-0 text-agon-tx3" title="Média explicatif">
                      <Film size={12} />
                    </a>
                  )}
                  <span className={cn('min-w-[38px] shrink-0 rounded-[6px] border px-2 py-0.5 text-center text-[12px] font-extrabold', sc.text, sc.chip, sc.soft)}>
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

  const cc = CAT[selectedCat];
  const catItems = items.filter(i => i.category === selectedCat);
  const addingHere = active?.mode === 'add' && active.category === selectedCat;

  return (
    <section className="overflow-hidden rounded-[6px] border border-agon-brd">
      {/* Header : titre + boutons filtres (1 catégorie à la fois) */}
      <div className={cn('flex flex-wrap items-center gap-3 border-b border-agon-brd px-[18px] py-3', cc.head)}>
        <span className="mr-auto text-[13px] font-extrabold uppercase tracking-[0.06em] text-agon-tx">
          Profil par catégorie
        </span>
        <div className="flex flex-wrap gap-1.5">
          {TEST_CATEGORY_ORDER.map(cat => {
            const on = cat === selectedCat;
            return (
              <button
                key={cat}
                onClick={() => { setSelectedCat(cat); setActive(null); }}
                className={cn(
                  'cursor-pointer rounded border px-[11px] py-[5px] text-[11px] font-bold',
                  on ? cn(CAT[cat].edge, CAT[cat].fill, 'text-agon-tx') : 'border-agon-brd-l bg-transparent text-agon-tx3',
                )}
              >
                {TEST_CATEGORY_LABEL[cat]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-[18px]">
        {selectedCat === 'bilan_articulaire' ? (
          <ArticularProfile athleteId={athleteId} />
        ) : selectedCat === 'endurance' ? (
          <CategoryDerivedProfile athleteId={athleteId} category="endurance" />
        ) : (
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <div className={cn('flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.5px]', cc.text)}>
                <div className={cn('h-[3px] w-[22px] rounded-[2px]', cc.fill)} />
                {TEST_CATEGORY_LABEL[selectedCat]}
              </div>
              {!active && (
                <button onClick={() => setActive({ mode: 'add', category: selectedCat })} className={cn('flex cursor-pointer items-center gap-[5px] rounded-[7px] border px-2.5 py-1 text-[11px] font-bold', cc.add)}>
                  <Plus size={12} /> Item
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {isLoading ? (
                <div className={MUTED}>Chargement…</div>
              ) : (
                <>
                  {catItems.map(item =>
                    active?.mode === 'edit' && active.item.id === item.id ? (
                      <ItemForm
                        key={item.id} tone={cc}
                        initial={{ category: selectedCat, label: item.label, rating: item.rating, note: item.note ?? '' }}
                        saving={updateM.isPending}
                        onSave={save}
                        onCancel={() => setActive(null)}
                      />
                    ) : (
                      <ItemRow key={item.id} item={item} tone={cc}
                        onEdit={() => setActive({ mode: 'edit', item })}
                        onDelete={() => deleteM.mutate(item.id)}
                      />
                    )
                  )}
                  {addingHere && (
                    <ItemForm
                      tone={cc}
                      initial={{ category: selectedCat, label: '', rating: null, note: '' }}
                      saving={createM.isPending}
                      onSave={save}
                      onCancel={() => setActive(null)}
                    />
                  )}
                  {catItems.length === 0 && !addingHere && (
                    <div className="py-0.5 text-[11px] italic text-agon-tx3">Aucun item.</div>
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
