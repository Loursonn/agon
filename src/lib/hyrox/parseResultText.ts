/**
 * Parse HYROX results text (copy-pasted from results.hyrox.com or ROXFIT).
 *
 * Expected format (tab or multi-space separated):
 *   Split              Time       Place
 *   Running 1          00:03:04   –
 *   1000m SkiErg       00:03:54   52
 *   Running 2          00:04:31   –
 *   ...
 *   Roxzone Time       00:04:24   –
 *   Run Total          00:34:39   41
 *   Best Run Lap       00:04:01   67
 */

import { parseMmSs } from '@/lib/time';

export interface ParsedHyroxResult {
  run_1_s: number | null;
  run_2_s: number | null;
  run_3_s: number | null;
  run_4_s: number | null;
  run_5_s: number | null;
  run_6_s: number | null;
  run_7_s: number | null;
  run_8_s: number | null;
  ski_s: number | null;
  sled_push_s: number | null;
  sled_pull_s: number | null;
  bbj_s: number | null;
  row_s: number | null;
  farmers_s: number | null;
  lunges_s: number | null;
  wall_balls_s: number | null;
  roxzone_total_s: number | null;
  total_s: number | null;
}

// Map from known labels in the pasted text to our segment keys
const LABEL_MAP: [RegExp, keyof ParsedHyroxResult][] = [
  [/^running\s*1$/i,                'run_1_s'],
  [/^running\s*2$/i,                'run_2_s'],
  [/^running\s*3$/i,                'run_3_s'],
  [/^running\s*4$/i,                'run_4_s'],
  [/^running\s*5$/i,                'run_5_s'],
  [/^running\s*6$/i,                'run_6_s'],
  [/^running\s*7$/i,                'run_7_s'],
  [/^running\s*8$/i,                'run_8_s'],
  [/ski\s*erg/i,                    'ski_s'],
  [/sled\s*push/i,                  'sled_push_s'],
  [/sled\s*pull/i,                  'sled_pull_s'],
  [/burpee\s*broad\s*jump/i,       'bbj_s'],
  [/row/i,                          'row_s'],
  [/farmer/i,                       'farmers_s'],
  [/lunge/i,                        'lunges_s'],
  [/wall\s*ball/i,                  'wall_balls_s'],
  [/roxzone/i,                      'roxzone_total_s'],
];

/**
 * Parse pasted HYROX results text.
 * Returns parsed segments + computed total. Returns null if nothing useful found.
 */
export function parseResultText(raw: string): ParsedHyroxResult | null {
  const result: ParsedHyroxResult = {
    run_1_s: null, run_2_s: null, run_3_s: null, run_4_s: null,
    run_5_s: null, run_6_s: null, run_7_s: null, run_8_s: null,
    ski_s: null, sled_push_s: null, sled_pull_s: null, bbj_s: null,
    row_s: null, farmers_s: null, lunges_s: null, wall_balls_s: null,
    roxzone_total_s: null, total_s: null,
  };

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let found = 0;

  for (const line of lines) {
    // Split on tabs or 2+ spaces
    const parts = line.split(/\t|  +/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const label = parts[0];
    const timeStr = parts[1];

    // Skip header line
    if (/^split$/i.test(label)) continue;

    // Try to parse the time value
    const seconds = parseMmSs(timeStr.replace(/^00:/, ''));
    // Also try full hh:mm:ss
    const secondsFull = seconds ?? parseMmSs(timeStr);
    if (secondsFull == null) continue;

    // Match label to our segment keys
    let matched = false;
    for (const [pattern, key] of LABEL_MAP) {
      if (pattern.test(label)) {
        result[key] = secondsFull;
        found++;
        matched = true;
        break;
      }
    }

    // Check for "Run Total" — useful for validation but we compute total ourselves
    if (!matched && /run\s*total/i.test(label)) {
      // Use as validation reference, not stored directly
    }
  }

  if (found === 0) return null;

  // Compute total from segments
  const runs = [result.run_1_s, result.run_2_s, result.run_3_s, result.run_4_s,
                result.run_5_s, result.run_6_s, result.run_7_s, result.run_8_s];
  const stations = [result.ski_s, result.sled_push_s, result.sled_pull_s, result.bbj_s,
                    result.row_s, result.farmers_s, result.lunges_s, result.wall_balls_s];

  const runSum = runs.every(v => v != null) ? runs.reduce((a, b) => a! + b!, 0) : null;
  const stationSum = stations.every(v => v != null) ? stations.reduce((a, b) => a! + b!, 0) : null;
  const rox = result.roxzone_total_s;

  if (runSum != null && stationSum != null) {
    result.total_s = runSum + stationSum + (rox ?? 0);
  }

  return result;
}
