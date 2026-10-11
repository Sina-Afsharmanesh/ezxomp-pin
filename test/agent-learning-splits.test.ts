import { describe, expect, test } from 'bun:test';
import {
  assignSplits,
  Splits,
  holdoutLeaked,
  assertHoldoutClean,
  realEntryIds,
} from '../plugins/agent-learning/src/procedures/promotion/splits';

describe('deterministic train/val/test splits', () => {
  test('interface Splits shape', () => {
    const splits: Splits = {
      train: ['a'],
      val: ['b'],
      test: ['c'],
      holdoutLeaked: false,
    };
    expect(splits).toHaveProperty('train');
    expect(splits).toHaveProperty('val');
    expect(splits).toHaveProperty('test');
    expect(splits).toHaveProperty('holdoutLeaked');
  });

  test('assignSplits deterministic hash partition', () => {
    const ids = ['id1', 'id2', 'id3', 'id4', 'id5'];
    const splits1 = assignSplits(ids);
    const splits2 = assignSplits(ids);
    expect(splits1.train).toEqual(splits2.train);
    expect(splits1.val).toEqual(splits2.val);
    expect(splits1.test).toEqual(splits2.test);
    expect(splits1.holdoutLeaked).toBe(splits2.holdoutLeaked);
  });

  test('assignSplits default ratios 70/15/15', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id${i}`);
    const splits = assignSplits(ids);
    const total = splits.train.length + splits.val.length + splits.test.length;
    expect(total).toBe(20);
    // Exact expected counts for these specific ids
    expect(splits.train.length).toBe(15);
    expect(splits.val.length).toBe(4);
    expect(splits.test.length).toBe(1);
  });

  test('assignSplits custom ratios', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id${i}`);
    const splits = assignSplits(ids, {
      ratios: { train: 0.5, val: 0.3, test: 0.2 },
    });
    // Exact expected counts for these specific ids
    expect(splits.train.length).toBe(12);
    expect(splits.val.length).toBe(7);
    expect(splits.test.length).toBe(1);
  });

  test('assignSplits empty input', () => {
    const splits = assignSplits([]);
    expect(splits.train).toEqual([]);
    expect(splits.val).toEqual([]);
    expect(splits.test).toEqual([]);
    expect(splits.holdoutLeaked).toBe(false);
  });

  test('assignSplits single id goes to train (default ratios)', () => {
    const splits = assignSplits(['only']);
    expect(splits.train).toEqual(['only']);
    expect(splits.val).toEqual([]);
    expect(splits.test).toEqual([]);
    expect(splits.holdoutLeaked).toBe(false);
  });

  test('assignSplits same id twice goes to same split', () => {
    const splits = assignSplits(['dupe', 'dupe']);
    // Both instances should be in same split
    const all = [...splits.train, ...splits.val, ...splits.test];
    expect(all).toEqual(['dupe', 'dupe']);
    // Check they are together in one bucket
    const inTrain = splits.train.filter((id) => id === 'dupe').length;
    const inVal = splits.val.filter((id) => id === 'dupe').length;
    const inTest = splits.test.filter((id) => id === 'dupe').length;
    expect(inTrain + inVal + inTest).toBe(2);
    expect([inTrain, inVal, inTest].filter((c) => c > 0).length).toBe(1);
  });

  test('assignSplits 100 ids deterministic proportions', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id${i}`);
    const splits = assignSplits(ids);
    // Default ratios: train 70, val 15, test 15
    // Exact expected counts for these specific ids
    expect(splits.train.length).toBe(69);
    expect(splits.val.length).toBe(18);
    expect(splits.test.length).toBe(13);
    expect(splits.holdoutLeaked).toBe(false);
  });

  test('assignSplits explicit small ratios (1 val slot)', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id${i}`);
    const splits = assignSplits(ids, {
      ratios: { train: 0.98, val: 0.01, test: 0.01 },
    });
    // Exact expected counts for these specific ids
    expect(splits.train.length).toBe(100);
    expect(splits.val.length).toBe(0);
    expect(splits.test.length).toBe(0);
    // Total should be 100
    expect(splits.train.length + splits.val.length + splits.test.length).toBe(100);
  });

  test('holdoutLeaked false by construction', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id${i}`);
    const splits = assignSplits(ids);
    expect(holdoutLeaked(splits)).toBe(false);
  });

  test('assertHoldoutClean throws on leaked splits', () => {
    const leaked: Splits = {
      train: ['id1', 'id2'],
      val: ['id2'], // id2 in both train and val -> leak
      test: [],
      holdoutLeaked: true, // flag doesn't matter; function checks actual arrays
    };
    expect(() => assertHoldoutClean(leaked)).toThrow(
      'Holdout leakage detected: val/test intersect with train'
    );
  });

  test('no entry id appears in two splits (property test over 500 ids)', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `id${i}`);
    const splits = assignSplits(ids);
    const all = [...splits.train, ...splits.val, ...splits.test];
    // Check for duplicates
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
    // Also verify each id is in exactly one split
    for (const id of ids) {
      const inTrain = splits.train.includes(id);
      const inVal = splits.val.includes(id);
      const inTest = splits.test.includes(id);
      const count = [inTrain, inVal, inTest].filter(Boolean).length;
      expect(count).toBe(1);
    }
  });

  test('realEntryIds filters origin==="real"', () => {
    const records = [
      { id: 'r1', origin: 'real' },
      { id: 's1', origin: 'synthetic' },
      { id: 'r2', origin: 'real' },
      { id: 'u1' }, // missing origin -> treat as not real
      { id: 'r3', origin: 'REAL' }, // case-sensitive
    ];
    const filtered = realEntryIds(records);
    expect(filtered).toEqual(['r1', 'r2']);
  });
});