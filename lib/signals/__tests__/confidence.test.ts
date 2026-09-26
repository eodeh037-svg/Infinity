import { describe, it, expect } from 'vitest';

import { overallConfidence } from '../multiTimeframe';

describe('overallConfidence (Part 3 regression tests)', () => {
  it('is capped-free: a single-direction aggregate at max per-TF confidence reports ~95, not the old 50 cap', () => {
    expect(overallConfidence(0.95, 0)).toBe(95);
  });

  it('returns 0 for zero directional conviction (all HOLD)', () => {
    expect(overallConfidence(0, 0)).toBe(0);
  });

  it('reports the dominant direction weighted confidence for mixed signals', () => {
    expect(overallConfidence(0.4, 0.7)).toBe(70);
  });

  it('clamps into [0, 100] for out-of-range inputs', () => {
    expect(overallConfidence(1.2, 0)).toBe(100);
    expect(overallConfidence(-0.1, 0.3)).toBe(30);
  });

  it('rounds deterministically and never returns fractional values', () => {
    expect(overallConfidence(0.23456, 0.1)).toBe(23);
    expect(overallConfidence(0.0, 0.4999)).toBe(50);
  });

  it('produces values above 50 only when directional conviction is dominant', () => {
    expect(overallConfidence(0.55, 0.0)).toBe(55);
    expect(overallConfidence(0.45, 0.45)).toBe(45);
    expect(overallConfidence(0.49, 0.51)).toBe(51);
  });
});
