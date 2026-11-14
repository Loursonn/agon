/**
 * MeasurementComparison
 *
 * Vue coach : comparaison chronologique des mensurations & photos d'un athlète.
 * - Onglet Mensurations : filtre par item (bras, taille…) → évolution + poids à la même date + delta vs log précédent.
 * - Onglet Photos : filtre par item photo (face, côté…) → comparaison côte à côte chronologique.
 */
import { useMemo, useState } from 'react';
import { Ruler, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  ALL_MEASUREMENT_FIELDS as MEASUREMENT_FIELDS, PHOTO_SLOTS,
  type MeasurementKey, type PhotoSlot, type MeasurementLog,
} from '@/features/shared/types/measurements';
import { useMeasurementLogs, useMeasurementPhotoUrls } from '@/features/shared/hooks/useMeasurements';
import { BiometrySummary } from '@/features/shared/components/BiometrySummary';

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);
}

function fmtDelta(d: number, unit: string): { text: string; tone: string } {
  const sign = d > 0 ? '+' : '';
  const tone = d > 0 ? 'text-agon-succes' : d < 0 ? 'text-agon-erreur' : 'text-agon-tx3';
  return { text: `${sign}${Math.round(d * 10) / 10} ${unit}`, tone };
}

/** Pastille de filtre (item de mensuration ou de photo). */
function filterChip(active: boolean, has: boolean) {
  return cn(
    'rounded px-3 py-1.5 text-[12px] font-bold border',
    has ? 'cursor-pointer' : 'cursor-default opacity-40',
    active ? 'border-agon-succes bg-agon-succes-doux text-agon-succes'
      : cn('border-agon-brd-l bg-transparent', has ? 'text-agon-tx2' : 'text-agon-tx3'),
  );
}

const FILTERS = 'mb-3.5 flex flex-wrap gap-1.5';
const EMPTY_ITEM = 'py-2 text-[12px] italic text-agon-tx3';
const CARD = 'rounded-[6px] border border-agon-brd bg-agon-s1';

// ── Onglet Mensurations ───────────────────────────────────────────────────────

function MeasurementsTab({ logs }: { logs: MeasurementLog[] }) {
  // Premier item ayant au moins une valeur, sinon 'bras'
  function hasFieldData(l: MeasurementLog, f: typeof MEASUREMENT_FIELDS[number]): boolean {
    if (f.bilateral) return l[f.bilateral.gKey] != null || l[f.bilateral.dKey] != null || l[f.key] != null;
    return l[f.key] != null;
  }

  const firstFilled = MEASUREMENT_FIELDS.find(f => logs.some(l => hasFieldData(l, f)))?.key ?? 'bras';
  const [sel, setSel] = useState<MeasurementKey>(firstFilled);

  const selField = MEASUREMENT_FIELDS.find(f => f.key === sel);

  // Logs ascendants ayant une valeur pour l'item sélectionné
  const rows = useMemo(() => {
    const filtered = logs
      .filter(l => {
        if (selField?.bilateral) {
          return l[selField.bilateral.gKey] != null || l[selField.bilateral.dKey] != null || l[sel] != null;
        }
        return l[sel] != null;
      })
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    return filtered.map((l, i) => {
      const prev = i > 0 ? filtered[i - 1] : null;
      // For bilateral, show avg of G+D, or legacy single value
      let val: number;
      let label = '';
      if (selField?.bilateral) {
        const g = l[selField.bilateral.gKey] as number | null;
        const d = l[selField.bilateral.dKey] as number | null;
        if (g != null && d != null) { val = (g + d) / 2; label = `G:${g} D:${d}`; }
        else if (g != null) { val = g; label = `G:${g}`; }
        else if (d != null) { val = d; label = `D:${d}`; }
        else { val = l[sel] as number; }
      } else {
        val = l[sel] as number;
      }
      const prevVal = prev ? (() => {
        if (selField?.bilateral) {
          const pg = prev[selField.bilateral.gKey] as number | null;
          const pd = prev[selField.bilateral.dKey] as number | null;
          if (pg != null && pd != null) return (pg + pd) / 2;
          if (pg != null) return pg;
          if (pd != null) return pd;
          return prev[sel] as number | null;
        }
        return prev[sel] as number | null;
      })() : null;
      const deltaVal = prevVal != null ? val - prevVal : null;
      const deltaDays = prev ? daysBetween(prev.date, l.date) : null;
      const deltaWeight = prev && l.weight_kg != null && prev.weight_kg != null
        ? l.weight_kg - prev.weight_kg : null;
      return { log: l, val, label, deltaVal, deltaDays, deltaWeight };
    }).reverse();
  }, [logs, sel, selField]);

  return (
    <div>
      {/* Filtre item */}
      <div className={FILTERS}>
        {MEASUREMENT_FIELDS.map(f => {
          const has = logs.some(l => hasFieldData(l, f));
          return (
            <button key={f.key} onClick={() => setSel(f.key)} disabled={!has} className={filterChip(f.key === sel, has)}>
              {f.label}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className={EMPTY_ITEM}>Aucune saisie pour cet item.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ log, val, label, deltaVal, deltaDays, deltaWeight }) => {
            const dv = deltaVal != null ? fmtDelta(deltaVal, 'cm') : null;
            const dw = deltaWeight != null ? fmtDelta(deltaWeight, 'kg') : null;
            return (
              <div key={log.id} className="flex items-center gap-3 rounded border border-agon-brd bg-agon-s1 px-3.5 py-2.5">
                <div className="min-w-[70px]">
                  <div className="text-[11px] text-agon-tx3">
                    {format(new Date(log.date + 'T12:00:00'), 'd MMM yy', { locale: fr })}
                  </div>
                </div>
                <div className="min-w-[76px]">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[20px] font-extrabold text-agon-tx">{Math.round(val * 10) / 10}</span>
                    <span className="text-[11px] text-agon-tx3">cm</span>
                  </div>
                  {label && <div className="text-[9px] text-agon-tx3">{label}</div>}
                </div>
                <div className="flex min-w-[64px] items-baseline gap-1">
                  <span className="text-[13px] font-bold text-agon-tx2">
                    {log.weight_kg != null ? log.weight_kg : '—'}
                  </span>
                  <span className="text-[10px] text-agon-tx3">kg</span>
                </div>
                <div className="ml-auto text-right">
                  {dv && deltaDays != null ? (
                    <>
                      <div className={cn('text-[13px] font-bold', dv.tone)}>
                        {dv.text} <span className="text-[11px] font-medium text-agon-tx3">en {deltaDays}j</span>
                      </div>
                      {dw && (
                        <div className="text-[10px] text-agon-tx3">
                          poids <span className={cn('font-bold', dw.tone)}>{dw.text}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] italic text-agon-tx3">1ʳᵉ saisie</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Onglet Photos ─────────────────────────────────────────────────────────────

function PhotosTab({ logs }: { logs: MeasurementLog[] }) {
  const firstFilled = PHOTO_SLOTS.find(s => logs.some(l => l.photos?.[s.key]))?.key ?? 'face';
  const [sel, setSel] = useState<PhotoSlot>(firstFilled);

  const items = useMemo(() => {
    return logs
      .filter(l => l.photos?.[sel])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(l => ({ date: l.date, weight: l.weight_kg, path: l.photos![sel] as string }));
  }, [logs, sel]);

  const paths = items.map(i => i.path);
  const { data: urls = {} } = useMeasurementPhotoUrls(paths);

  return (
    <div>
      <div className={FILTERS}>
        {PHOTO_SLOTS.map(s => {
          const has = logs.some(l => l.photos?.[s.key]);
          return (
            <button key={s.key} onClick={() => setSel(s.key)} disabled={!has} className={filterChip(s.key === sel, has)}>
              {s.label}
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className={EMPTY_ITEM}>Aucune photo pour cet item.</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1.5">
          {items.map(it => (
            <div key={it.path} className="w-[150px] shrink-0">
              <div className="h-[200px] w-[150px] overflow-hidden rounded border border-agon-brd bg-agon-s2">
                {urls[it.path] ? (
                  <img src={urls[it.path]} alt={it.date} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Camera size={18} className="text-agon-tx3" />
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[11px] font-semibold text-agon-tx2">
                {format(new Date(it.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
              </div>
              {it.weight != null && (
                <div className="text-[10px] text-agon-tx3">{it.weight} kg</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function MeasurementComparison({ athleteId }: { athleteId: string }) {
  const { data: logs = [], isLoading } = useMeasurementLogs(athleteId);
  const [tab, setTab] = useState<'mensu' | 'photos'>('mensu');

  return (
    <div className="mb-7">
      <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.06em] text-agon-succes">
        <div className="h-0.5 w-6 rounded-[1px] bg-agon-succes" />
        Mensurations &amp; photos
      </div>

      {isLoading ? (
        <div className={cn('h-20', CARD)} />
      ) : logs.length === 0 ? (
        <div className={cn(CARD, 'p-5 text-center text-[12px] text-agon-tx3')}>
          L'athlète n'a pas encore saisi de mensurations.
        </div>
      ) : (
        <div className={cn(CARD, 'p-4')}>
          <div className="mb-4"><BiometrySummary logs={logs} /></div>
          {/* Onglets */}
          <div className="mb-4 flex gap-1.5">
            {([['mensu', 'Mensurations', Ruler], ['photos', 'Photos', Camera]] as const).map(([k, label, Icon]) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded border px-3.5 py-[7px] text-[12px] font-bold',
                    active ? 'border-agon-succes/[0.376] bg-agon-succes-doux text-agon-succes' : 'border-agon-brd-l bg-transparent text-agon-tx3',
                  )}
                >
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>

          {tab === 'mensu' ? <MeasurementsTab logs={logs} /> : <PhotosTab logs={logs} />}
        </div>
      )}
    </div>
  );
}
