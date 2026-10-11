// Deterministic train/val/test splitting for promotion evidence.
// Based on skillopt_sleep/mine.py assign_splits (see: https://github.com/microsoft/SkillOpt)
// Implements TASK-97: deterministic hash partition of evidence-entry ids into train/val/test.
// holdoutLeaked detects train/val or train/test intersection (fail-closed guard).
// CALLER must filter origin=="real" before calling assignSplits (see realEntryIds helper).

import { createHash } from 'crypto';

export interface Splits {
  train: string[];
  val: string[];
  test: string[];
  holdoutLeaked: boolean;
}

/**
 * Assign each entryId to a split deterministically via hash bucketing.
 * @param entryIds - Unique identifiers for evidence entries.
 * @param opts - Optional ratios (default: { train: 0.7, val: 0.15, test: 0.15 }).
 * @returns Splits object with arrays and holdoutLeaked flag.
 */
export function assignSplits(
  entryIds: string[],
  opts?: { ratios?: { train?: number; val?: number; test?: number } }
): Splits {
  const ratios = {
    train: 0.7,
    val: 0.15,
    test: 0.15,
    ...opts?.ratios,
  };
  // Validate ratios sum to 1 (within floating point tolerance)
  const sum = ratios.train + ratios.val + ratios.test;
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(`Ratios must sum to 1.0, got ${sum}`);
  }

  const trainLimit = ratios.train * 100;
  const valLimit = trainLimit + ratios.val * 100;

  const result: Splits = {
    train: [],
    val: [],
    test: [],
    holdoutLeaked: false,
  };

  for (const id of entryIds) {
    // Compute deterministic bucket: sha256(id) -> first 12 hex -> int -> mod 100
    const hash = createHash('sha256').update(id).digest('hex');
    const bucket = parseInt(hash.slice(0, 12), 16) % 100;

    if (bucket < trainLimit) {
      result.train.push(id);
    } else if (bucket < valLimit) {
      result.val.push(id);
    } else {
      result.test.push(id);
    }
  }

  // Compute holdoutLeaked flag (should be false by construction, but check as guard)
  result.holdoutLeaked = holdoutLeaked(result);
  return result;
}

/**
 * Returns true if any val or test id appears in train (leakage).
 * @param splits - The splits to check.
 * @returns true if leakage detected.
 */
export function holdoutLeaked(splits: Splits): boolean {
  const trainSet = new Set(splits.train);
  for (const id of splits.val) {
    if (trainSet.has(id)) return true;
  }
  for (const id of splits.test) {
    if (trainSet.has(id)) return true;
  }
  return false;
}

/**
 * Throws if holdoutLeaked(splits) is true.
 * @param splits - The splits to validate.
 */
export function assertHoldoutClean(splits: Splits): void {
  if (holdoutLeaked(splits)) {
    throw new Error('Holdout leakage detected: val/test intersect with train');
  }
}

/**
 * Helper to filter entry IDs by origin=="real" (caller must filter before assignSplits).
 * @param records - Array of records with id and optional origin.
 * @returns Array of ids where origin is exactly "real".
 */
export function realEntryIds(records: { id: string; origin?: string }[]): string[] {
  return records
    .filter((r) => r.origin === 'real')
    .map((r) => r.id);
}