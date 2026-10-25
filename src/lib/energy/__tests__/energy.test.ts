import { describe, it, expect } from 'vitest';
import {
  expandIntervals,
  computeTotals,
  computeZoneDistribution,
  intensityToColor,
  estimateIntervalDuration,
  type FlatInterval,
} from '../index';
import { targetToIntensityPct } from '../index';
import type {
  EnergyGroup,
  EnergyInterval,
  EnergyTarget,
} from '@/types/energy';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeInterval(id: string, opts: {
  role?: EnergyInterval['role'];
  kind?: 'time' | 'distance' | 'calories' | 'lap_button';
  value?: number;
  target?: EnergyTarget;
}): EnergyInterval {
  return {
    type: 'interval',
    id,
    role: opts.role ?? 'work',
    duration: { kind: opts.kind ?? 'time', value: opts.value ?? 60 },
    target: opts.target ?? { kind: 'none' },
  };
}

function makeGroup(id: string, repeat: number, children: EnergyGroup['children'], rest?: EnergyInterval): EnergyGroup {
  return {
    type: 'group',
    id,
    role: 'open',
    repeat,
    children,
    ...(rest ? { rest_between: rest } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// expandIntervals
// ─────────────────────────────────────────────────────────────────────────────

describe('expandIntervals', () => {
  it('flat group: repeat=3, 1 child → 3 flat intervals', () => {
    const work = makeInterval('w1', { role: 'work', value: 60 });
    const group = makeGroup('g1', 3, [work]);
    const flat = expandIntervals(group);
    expect(flat).toHaveLength(3);
    flat.forEach(f => expect(f.interval.id).toBe('w1'));
    flat.forEach(f => expect(f.depth).toBe(0));
  });

  it('nested 2×5 (Garmin classique) → 10 work intervals', () => {
    const work   = makeInterval('work', { role: 'work',     kind: 'distance', value: 400 });
    const recov  = makeInterval('rec',  { role: 'recovery', kind: 'time',     value: 90  });

    // Groupe intérieur : 5 × [work + recov]
    const inner = makeGroup('inner', 5, [work, recov]);

    // Groupe extérieur : 2 × inner
    const outer = makeGroup('outer', 2, [inner]);

    const flat = expandIntervals(outer);

    // 2 * (5 * 2) = 20 intervalles total
    expect(flat).toHaveLength(20);

    // 2 * 5 = 10 intervalles 'work'
    const works = flat.filter(f => f.interval.id === 'work');
    expect(works).toHaveLength(10);

    // les enfants directs de inner ont depth=1
    works.forEach(f => expect(f.depth).toBe(1));
  });

  it('rest_between est inséré entre les répétitions, pas après la dernière', () => {
    const work = makeInterval('w', { value: 60 });
    const rest = makeInterval('rest', { role: 'rest', value: 30 });
    const group = makeGroup('g', 4, [work], rest);  // 4 reps → 3 rests

    const flat = expandIntervals(group);
    // 4 work + 3 rest = 7
    expect(flat).toHaveLength(7);
    expect(flat.filter(f => f.interval.id === 'rest')).toHaveLength(3);

    // rest_between a indexInParent = -1
    flat.filter(f => f.interval.id === 'rest').forEach(f => {
      expect(f.indexInParent).toBe(-1);
    });
  });

  it('repeat=1, aucun rest_between → séquence identique aux children', () => {
    const a = makeInterval('a', { value: 10 });
    const b = makeInterval('b', { value: 20 });
    const group = makeGroup('g', 1, [a, b]);
    const flat = expandIntervals(group);
    expect(flat.map(f => f.interval.id)).toEqual(['a', 'b']);
    expect(flat[0].indexInParent).toBe(0);
    expect(flat[1].indexInParent).toBe(1);
  });

  it('groupe imbriqué préserve depth', () => {
    const leaf = makeInterval('leaf', { value: 60 });
    const inner = makeGroup('inner', 2, [leaf]);
    const outer = makeGroup('outer', 3, [inner]);
    const flat = expandIntervals(outer);
    // 3 * 2 = 6 leaves, toutes à depth=1
    expect(flat).toHaveLength(6);
    flat.forEach(f => expect(f.depth).toBe(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estimateIntervalDuration
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateIntervalDuration', () => {
  it('time: retourne la valeur directement', () => {
    const iv = makeInterval('x', { kind: 'time', value: 300 });
    expect(estimateIntervalDuration(iv)).toBe(300);
  });

  it('distance sans target pace: utilise 4 m/s', () => {
    // 400 m / 4 m/s = 100 s
    const iv = makeInterval('x', { kind: 'distance', value: 400 });
    expect(estimateIntervalDuration(iv)).toBe(100);
  });

  it('distance avec target pace min/km: utilise l\'allure', () => {
    // 1000 m @ 4 min/km = 4*60 = 240 s
    const iv = makeInterval('x', {
      kind: 'distance', value: 1000,
      // Stocké en secondes par km : 4 min/km = 240 s/km
      target: { kind: 'pace', min_s_per_unit: 240, max_s_per_unit: 240, unit: 'min_per_km' },
    });
    expect(estimateIntervalDuration(iv)).toBe(240);
  });

  it('distance avec target pace kmh: convertit km/h → m/s', () => {
    // 1000 m @ 12 km/h = 1000/(12/3.6) = 1000/3.333 ≈ 300 s
    const iv = makeInterval('x', {
      kind: 'distance', value: 1000,
      // 12 km/h = 300 s/km (toujours stocké en s/km, l'unité ne change que l'affichage)
      target: { kind: 'pace', min_s_per_unit: 300, max_s_per_unit: 300, unit: 'kmh' },
    });
    expect(estimateIntervalDuration(iv)).toBe(300);
  });

  it('calories: 6 s/kcal', () => {
    const iv = makeInterval('x', { kind: 'calories', value: 50 });
    expect(estimateIntervalDuration(iv)).toBe(300);
  });

  it('lap_button: retourne 0', () => {
    const iv = makeInterval('x', { kind: 'lap_button' });
    expect(estimateIntervalDuration(iv)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeTotals
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTotals', () => {
  it('séance type : 10 min échauff + 5×400m@4m/s + 5×90s récup + 10 min retour', () => {
    const warmup   = makeInterval('wu', { role: 'warmup',   kind: 'time',     value: 600 });
    const work     = makeInterval('w',  { role: 'work',     kind: 'distance', value: 400 }); // 100 s each
    const recovery = makeInterval('rc', { role: 'recovery', kind: 'time',     value: 90  });
    const cooldown = makeInterval('cd', { role: 'cooldown', kind: 'time',     value: 600 });

    const flat: FlatInterval[] = [
      { interval: warmup,   depth: 0, indexInParent: 0 },
      ...Array.from({ length: 5 }, () => ({ interval: work,     depth: 1, indexInParent: 0 })),
      ...Array.from({ length: 5 }, () => ({ interval: recovery, depth: 1, indexInParent: 1 })),
      { interval: cooldown, depth: 0, indexInParent: 2 },
    ];

    const totals = computeTotals(flat);

    // durationS = 600 + 5*100 + 5*90 + 600 = 600+500+450+600 = 2150
    expect(totals.durationS).toBe(2150);
    // distanceM = 5 * 400 = 2000
    expect(totals.distanceM).toBe(2000);
    // workCount = 5
    expect(totals.workCount).toBe(5);
  });

  it('liste vide → zéros', () => {
    const totals = computeTotals([]);
    expect(totals).toEqual({ durationS: 0, distanceM: 0, workCount: 0 });
  });

  it('lap_button ne contribue pas à durationS', () => {
    const lap = makeInterval('l', { kind: 'lap_button', role: 'work' });
    const flat: FlatInterval[] = [{ interval: lap, depth: 0, indexInParent: 0 }];
    const totals = computeTotals(flat);
    expect(totals.durationS).toBe(0);
    expect(totals.workCount).toBe(1);  // compte quand même comme work
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// targetToIntensityPct
// ─────────────────────────────────────────────────────────────────────────────

describe('targetToIntensityPct', () => {
  it('none → null', () => expect(targetToIntensityPct({ kind: 'none' })).toBeNull());
  it('text → null', () => expect(targetToIntensityPct({ kind: 'text', value: 'facile' })).toBeNull());
  // Sans référence cardiaque, la FC est estimée sur la plage générique 100–200 bpm.
  // moyenne 150 bpm → 20 + ((150-100)/100) * 80 = 60 %
  it('hr_bpm sans référence → estimation sur la plage 100–200 bpm', () =>
    expect(targetToIntensityPct({ kind: 'hr_bpm', min: 140, max: 160 })).toBe(60));
  // Sans VMA de référence, l'allure est estimée sur la plage 2:30–8:00 /km.
  // 5:00/km = 300 s/km → 30 + ((480-300)/(480-150)) * 70 ≈ 68 %
  it('pace sans VMA → estimation sur la plage typique', () =>
    expect(targetToIntensityPct({ kind: 'pace', min_s_per_unit: 300, max_s_per_unit: 300, unit: 'min_per_km' })).toBe(68));
  it('power → null', () => expect(targetToIntensityPct({ kind: 'power', min: 200, max: 250 })).toBeNull());
  it('cadence → null', () => expect(targetToIntensityPct({ kind: 'cadence', min: 170, max: 180, unit: 'spm' })).toBeNull());
  it('x_per_y → null', () => expect(targetToIntensityPct({ kind: 'x_per_y', x_kind: 'cal', y_kind: 'distance', x_value: 1, y_value: 100 })).toBeNull());

  it('hr_zone Z1=20, Z2=40, Z3=60, Z4=80, Z5=100', () => {
    expect(targetToIntensityPct({ kind: 'hr_zone', zone: 1 })).toBe(20);
    expect(targetToIntensityPct({ kind: 'hr_zone', zone: 2 })).toBe(40);
    expect(targetToIntensityPct({ kind: 'hr_zone', zone: 3 })).toBe(60);
    expect(targetToIntensityPct({ kind: 'hr_zone', zone: 4 })).toBe(80);
    expect(targetToIntensityPct({ kind: 'hr_zone', zone: 5 })).toBe(100);
  });

  it('hr_pct: moyenne(min,max)', () => {
    expect(targetToIntensityPct({ kind: 'hr_pct', min: 60, max: 70 })).toBe(65);
    expect(targetToIntensityPct({ kind: 'hr_pct', min: 80, max: 90 })).toBe(85);
  });

  it('pace_test_pct: moyenne(min,max)', () => {
    expect(targetToIntensityPct({ kind: 'pace_test_pct', test_metric: 'vma', min: 70, max: 80 })).toBe(75);
  });

  it('power_test_pct: moyenne(min,max)', () => {
    expect(targetToIntensityPct({ kind: 'power_test_pct', test_metric: 'ftp', min: 85, max: 95 })).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// intensityToColor
// ─────────────────────────────────────────────────────────────────────────────

describe('intensityToColor', () => {
  it('0% → vert hsl(140, 75%, 50%)', () => {
    expect(intensityToColor(0)).toBe('hsl(140, 75%, 50%)');
  });

  it('100% → rouge hsl(0, 80%, 45%)', () => {
    expect(intensityToColor(100)).toBe('hsl(0, 80%, 45%)');
  });

  it('50% → milieu hsl(70, 78%, 48%)', () => {
    expect(intensityToColor(50)).toBe('hsl(70, 78%, 48%)');
  });

  it('clamp < 0 → même que 0%', () => {
    expect(intensityToColor(-10)).toBe(intensityToColor(0));
  });

  it('clamp > 100 → même que 100%', () => {
    expect(intensityToColor(150)).toBe(intensityToColor(100));
  });

  it('hue décroît strictement avec l\'intensité', () => {
    const colors = [0, 25, 50, 75, 100].map(intensityToColor);
    const hues = colors.map(c => parseInt(c.match(/hsl\((\d+)/)![1]));
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]).toBeLessThan(hues[i - 1]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeZoneDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe('computeZoneDistribution', () => {
  it('liste vide → tout à zéro', () => {
    const dist = computeZoneDistribution([]);
    expect(dist).toEqual({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, uncategorized: 0 });
  });

  it('zones hr_zone mappées correctement', () => {
    // Z1(20%) → seuil ≤30 → z1
    // Z3(60%) → seuil ≤70 → z3
    // Z5(100%) → >85 → z5
    const intervals: FlatInterval[] = [
      { interval: makeInterval('a', { kind: 'time', value: 300, role: 'work', target: { kind: 'hr_zone', zone: 1 } }), depth: 0, indexInParent: 0 },
      { interval: makeInterval('b', { kind: 'time', value: 600, role: 'work', target: { kind: 'hr_zone', zone: 3 } }), depth: 0, indexInParent: 1 },
      { interval: makeInterval('c', { kind: 'time', value: 120, role: 'work', target: { kind: 'hr_zone', zone: 5 } }), depth: 0, indexInParent: 2 },
    ];
    const dist = computeZoneDistribution(intervals);
    expect(dist.z1).toBe(300);
    expect(dist.z3).toBe(600);
    expect(dist.z5).toBe(120);
    expect(dist.z2).toBe(0);
    expect(dist.z4).toBe(0);
    expect(dist.uncategorized).toBe(0);
  });

  it('cible none → uncategorized', () => {
    const iv: FlatInterval = {
      interval: makeInterval('a', { kind: 'time', value: 200, target: { kind: 'none' } }),
      depth: 0, indexInParent: 0,
    };
    const dist = computeZoneDistribution([iv]);
    expect(dist.uncategorized).toBe(200);
  });

  it('pace_test_pct 70-80% → moyenne 75% → seuil ≤85 → z4', () => {
    const iv: FlatInterval = {
      interval: makeInterval('a', {
        kind: 'time', value: 180,
        target: { kind: 'pace_test_pct', test_metric: 'vma', min: 70, max: 80 },
      }),
      depth: 0, indexInParent: 0,
    };
    const dist = computeZoneDistribution([iv]);
    expect(dist.z4).toBe(180);
  });

  it('hr_pct 88-92% → moyenne 90% → >85 → z5', () => {
    const iv: FlatInterval = {
      interval: makeInterval('a', {
        kind: 'time', value: 240,
        target: { kind: 'hr_pct', min: 88, max: 92 },
      }),
      depth: 0, indexInParent: 0,
    };
    const dist = computeZoneDistribution([iv]);
    expect(dist.z5).toBe(240);
  });

  it('somme totale = somme des durées estimées', () => {
    const flat: FlatInterval[] = [
      { interval: makeInterval('a', { kind: 'time', value: 300, target: { kind: 'hr_zone', zone: 2 } }), depth: 0, indexInParent: 0 },
      { interval: makeInterval('b', { kind: 'time', value: 400, target: { kind: 'none' } }), depth: 0, indexInParent: 1 },
      { interval: makeInterval('c', { kind: 'time', value: 100, target: { kind: 'hr_zone', zone: 5 } }), depth: 0, indexInParent: 2 },
    ];
    const dist = computeZoneDistribution(flat);
    const total = dist.z1 + dist.z2 + dist.z3 + dist.z4 + dist.z5 + dist.uncategorized;
    expect(total).toBe(800);
  });
});
