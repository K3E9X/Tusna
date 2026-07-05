// Temporal analysis — infer a person's likely timezone from WHEN they are active.
// A classic OSINT technique: people are silent while they sleep. Bin activity
// timestamps by hour-of-day (UTC), then find the UTC offset that best pushes the
// quiet window onto local night (~02:00–06:00). Deterministic, no LLM, no guessing
// beyond the statistics — and honest about confidence when the sample is thin.

export interface TimezoneInference {
  /** best UTC offset in hours, e.g. +1 */
  offset: number;
  /** "UTC+1" */
  label: string;
  /** how many timestamps fed the inference */
  samples: number;
  /** 0-1 — strength of the day/night contrast, scaled by sample size */
  confidence: number;
  /** 24-bin histogram in the inferred LOCAL time (index = local hour) */
  localHistogram: number[];
}

/** Deep-night anchor: the quietest local hour is assumed to sit near 04:00 local. */
const NIGHT_ANCHOR = 4;

/** Bin ISO timestamps into a 24-slot UTC hour histogram. Invalid dates are skipped. */
export function hourHistogramUTC(timestamps: string[]): number[] {
  const bins = new Array(24).fill(0);
  for (const ts of timestamps) {
    const d = new Date(ts);
    const h = d.getUTCHours();
    if (!Number.isNaN(h)) bins[h]++;
  }
  return bins;
}

function rotate(bins: number[], offset: number): number[] {
  // local hour = (utc hour + offset) mod 24
  const out = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    const local = (((h + offset) % 24) + 24) % 24;
    out[local] += bins[h];
  }
  return out;
}

/** Circular 3-bin smoothing to absorb single-hour gaps (lunch, a quiet afternoon). */
function smooth(bins: number[]): number[] {
  return bins.map((_, i) => bins[(i + 23) % 24] + bins[i] + bins[(i + 1) % 24]);
}

/**
 * Center (UTC hour) of the longest contiguous run of minimum activity on the 24h
 * circle — i.e. the middle of the quiet night. Stable even when the trough is a wide
 * flat band (which naive argmin gets wrong by picking an arbitrary edge).
 */
function troughCenterUTC(sm: number[]): number {
  const min = Math.min(...sm);
  let bestStart = 0, bestLen = 0;
  // scan twice around the circle to catch runs that wrap past hour 23→0
  let runStart = -1, runLen = 0;
  for (let i = 0; i < 48; i++) {
    if (sm[i % 24] === min) {
      if (runStart < 0) runStart = i;
      runLen++;
      if (runLen > bestLen && runLen <= 24) { bestLen = runLen; bestStart = runStart; }
    } else {
      runStart = -1; runLen = 0;
    }
  }
  return ((bestStart + (bestLen - 1) / 2) % 24 + 24) % 24;
}

/**
 * Infer the most likely UTC offset from activity timestamps. Returns null when the
 * sample is too thin to say anything honest (< 6 timestamps).
 */
export function inferTimezone(timestamps: string[]): TimezoneInference | null {
  const clean = timestamps.filter(Boolean);
  if (clean.length < 6) return null;
  const utc = hourHistogramUTC(clean);
  const total = utc.reduce((a, b) => a + b, 0);
  if (total < 6) return null;

  // put the quiet-night center at ~04:00 local: offset = anchor - troughUTC
  const troughUTC = troughCenterUTC(smooth(utc));
  let offset = Math.round(NIGHT_ANCHOR - troughUTC);
  // normalize into the real-world range (-11 … +14)
  offset = ((offset + 12) % 24 + 24) % 24 - 12;

  const local = rotate(utc, offset);
  // confidence: clear day/night contrast, scaled down when samples are few
  const nightAvg = [1, 2, 3, 4, 5].reduce((s, h) => s + local[h], 0) / 5;
  const dayPeak = Math.max(...local);
  const contrast = dayPeak > 0 ? (dayPeak - nightAvg) / dayPeak : 0; // 0..1
  const sampleWeight = Math.min(1, clean.length / 40); // full trust ~40+ events
  const confidence = Math.max(0, Math.min(1, contrast * sampleWeight));

  return {
    offset,
    label: "UTC" + (offset >= 0 ? "+" : "") + offset,
    samples: clean.length,
    confidence: Math.round(confidence * 100) / 100,
    localHistogram: local,
  };
}
