import { describe, expect, it } from 'vitest';
import { measurePrecision, parseLabels } from '../src/analysis/precision.js';
import type { FlakeAssessment, FlakeVerdict } from '../src/types.js';

/**
 * The precision report is the evidence behind the product's central claim, so
 * it has to be pessimistic in exactly the right places: unlabelled findings are
 * never scored, and a label with no observations is never counted as a miss.
 */

function assessment(suite: string, name: string, verdict: FlakeVerdict): FlakeAssessment {
  return {
    suite,
    name,
    verdict,
    score: verdict === 'flaky_confirmed' ? 1 : 0.2,
    totalRuns: 10,
    failures: 5,
    contradictoryCommits: verdict === 'flaky_confirmed' ? 1 : 0,
    flipRate: 0.5,
    failureRateLowerBound: 0.2,
    totalDurationMs: 1000,
    lastSeenAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('parseLabels', () => {
  it('reads flaky and stable entries', () => {
    const labels = parseLabels({
      flaky: [{ suite: 'flake canary', name: 'fails about half the time on purpose' }],
      stable: [{ suite: 'flake canary', name: 'is stable, as a control' }],
    });

    expect(labels).toHaveLength(2);
    expect(labels[0]?.flaky).toBe(true);
    expect(labels[1]?.flaky).toBe(false);
  });

  it('rejects a malformed entry rather than silently dropping it', () => {
    expect(() => parseLabels({ flaky: [{ suite: 'only a suite' }] })).toThrow(/non-empty suite and name/);
    expect(() => parseLabels({ flaky: 'canary' })).toThrow(/must be an array/);
    expect(() => parseLabels([])).toThrow(/must be an object/);
    expect(() => parseLabels({})).toThrow(/at least one label/);
  });
});

describe('measurePrecision', () => {
  const labels = parseLabels({
    flaky: [{ suite: 'canary', name: 'wobbly' }],
    stable: [{ suite: 'canary', name: 'control' }],
  });

  it('scores a detector that got both labelled tests right', () => {
    const report = measurePrecision(
      [assessment('canary', 'wobbly', 'flaky_confirmed'), assessment('canary', 'control', 'stable')],
      labels,
    );

    expect(report.truePositives).toBe(1);
    expect(report.trueNegatives).toBe(1);
    expect(report.precision).toBe(1);
    expect(report.recall).toBe(1);
    expect(report.confirmedPrecision).toBe(1);
  });

  it('counts a flagged control as a false positive', () => {
    const report = measurePrecision(
      [assessment('canary', 'wobbly', 'flaky_confirmed'), assessment('canary', 'control', 'flaky_suspected')],
      labels,
    );

    expect(report.falsePositives).toBe(1);
    expect(report.precision).toBe(0.5);
    // The confirmed verdict rests on a contradiction, so it is scored apart
    // from the statistical guess that produced the false positive.
    expect(report.confirmedPrecision).toBe(1);
  });

  it('counts a missed flake as a false negative', () => {
    const report = measurePrecision(
      [assessment('canary', 'wobbly', 'stable'), assessment('canary', 'control', 'stable')],
      labels,
    );

    expect(report.falseNegatives).toBe(1);
    expect(report.recall).toBe(0);
    expect(report.precision).toBeNull();
    expect(report.confirmedPrecision).toBeNull();
  });

  it('never scores a flagged test that carries no label', () => {
    const report = measurePrecision(
      [
        assessment('canary', 'wobbly', 'flaky_confirmed'),
        assessment('canary', 'control', 'stable'),
        assessment('other', 'unknown', 'flaky_suspected'),
      ],
      labels,
    );

    expect(report.unlabelledFlagged).toBe(1);
    expect(report.precision).toBe(1);
    expect(report.labelledCount).toBe(2);
  });

  it('reports a label with no observations instead of counting it as a miss', () => {
    const report = measurePrecision([assessment('canary', 'control', 'stable')], labels);

    expect(report.unobserved.map((label) => label.name)).toEqual(['wobbly']);
    expect(report.falseNegatives).toBe(0);
    expect(report.labelledCount).toBe(1);
  });
});
