/**
 * MeasurementComparison
 *
 * Vue coach : comparaison chronologique des mensurations & photos d'un athlète.
 * - Onglet Mensurations : filtre par item (bras, taille…) → évolution + poids à la même date + delta vs log précédent.
 * - Onglet Photos : filtre par item photo (face, côté…) → comparaison côte à côte chronologique.
 */
import { useMemo, useState } from 'react';
import { Ruler, Camera } from 'lucide-react';
import { C } from '@/lib/theme';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  MEASUREMENT_FIELDS, PHOTO_SLOTS,
  type MeasurementKey, type PhotoSlot, type MeasurementLog,
} from '@/features/shared/types/measurements';
import { useMeasurementLogs, useMeasurementPhotoUrls } from '@/features/shared/hooks/useMeasurements';

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);
}

function fmtDelta(d: number, unit: string): { text: string; color: string } {
  const sign = d > 0 ? '+' : '';
  const color = d > 0 ? C.g : d < 0 ? C.r : C.tx3;
  return { text: `${sign}${Math.round(d * 10) / 10} ${unit}`, color };
}

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {MEASUREMENT_FIELDS.map(f => {
          const active = f.key === sel;
          const has = logs.some(l => hasFieldData(l, f));
          return (
            <button
              key={f.key}
              onClick={() => setSel(f.key)}
              disabled={!has}
              style={{
                padding: '6px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                fontFamily: 'inherit', cursor: has ? 'pointer' : 'default',
                border: '1px solid ' + (active ? C.g : C.brdL),
                background: active ? C.gS : 'transparent',
                color: active ? C.g : has ? C.tx2 : C.tx3,
                opacity: has ? 1 : 0.4,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: C.tx3, fontStyle: 'italic', padding: '8px 0' }}>
          Aucune saisie pour cet item.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(({ log, val, label, deltaVal, deltaDays, deltaWeight }) => {
            const dv = deltaVal != null ? fmtDelta(deltaVal, 'cm') : null;
            const dw = deltaWeight != null ? fmtDelta(deltaWeight, 'kg') : null;
            return (
              <div key={log.id} style={{
                background: C.s1, border: '1px solid ' + C.brd, borderRadius: 4,
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ minWidth: 70 }}>
                  <div style={{ fontSize: 11, color: C.tx3 }}>
                    {format(new Date(log.date + 'T12:00:00'), 'd MMM yy', { locale: fr })}
                  </div>
                </div>
                <div style={{ minWidth: 76 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>{Math.round(val * 10) / 10}</span>
                    <span style={{ fontSize: 11, color: C.tx3 }}>cm</span>
                  </div>
                  {label && <div style={{ fontSize: 9, color: C.tx3 }}>{label}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 64 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.tx2 }}>
                    {log.weight_kg != null ? log.weight_kg : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: C.tx3 }}>kg</span>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  {dv && deltaDays != null ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dv.color }}>
                        {dv.text} <span style={{ fontSize: 11, color: C.tx3, fontWeight: 500 }}>en {deltaDays}j</span>
                      </div>
                      {dw && (
                        <div style={{ fontSize: 10, color: C.tx3 }}>
                          poids <span style={{ color: dw.color, fontWeight: 700 }}>{dw.text}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: C.tx3, fontStyle: 'italic' }}>1ʳᵉ saisie</div>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {PHOTO_SLOTS.map(s => {
          const active = s.key === sel;
          const has = logs.some(l => l.photos?.[s.key]);
          return (
            <button
              key={s.key}
              onClick={() => setSel(s.key)}
              disabled={!has}
              style={{
                padding: '6px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                fontFamily: 'inherit', cursor: has ? 'pointer' : 'default',
                border: '1px solid ' + (active ? C.g : C.brdL),
                background: active ? C.gS : 'transparent',
                color: active ? C.g : has ? C.tx2 : C.tx3,
                opacity: has ? 1 : 0.4,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: C.tx3, fontStyle: 'italic', padding: '8px 0' }}>
          Aucune photo pour cet item.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
          {items.map(it => (
            <div key={it.path} style={{ flexShrink: 0, width: 150 }}>
              <div style={{ width: 150, height: 200, borderRadius: 4, overflow: 'hidden', background: C.s2, border: '1px solid ' + C.brd }}>
                {urls[it.path] ? (
                  <img src={urls[it.path]} alt={it.date} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={18} color={C.tx3} />
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.tx2, fontWeight: 600, marginTop: 6 }}>
                {format(new Date(it.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}
              </div>
              {it.weight != null && (
                <div style={{ fontSize: 10, color: C.tx3 }}>{it.weight} kg</div>
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
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 24, height: 2, background: C.g, borderRadius: 1 }} />
        Mensurations &amp; photos
      </div>

      {isLoading ? (
        <div style={{ height: 80, background: C.s1, borderRadius: 6, border: '1px solid ' + C.brd }} />
      ) : logs.length === 0 ? (
        <div style={{ background: C.s1, border: '1px solid ' + C.brd, borderRadius: 6, padding: '20px', textAlign: 'center', color: C.tx3, fontSize: 12 }}>
          L'athlète n'a pas encore saisi de mensurations.
        </div>
      ) : (
        <div style={{ background: C.s1, border: '1px solid ' + C.brd, borderRadius: 6, padding: '16px' }}>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {([['mensu', 'Mensurations', Ruler], ['photos', 'Photos', Camera]] as const).map(([k, label, Icon]) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer',
                    border: '1px solid ' + (active ? C.g + '60' : C.brdL),
                    background: active ? C.gS : 'transparent',
                    color: active ? C.g : C.tx3,
                  }}
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
