import { isFlaky } from './flaky.js';
import { testKey } from './identity.js';
import type { FlakeAssessment } from '../types.js';

/**
 * Detector accuracy, measured against labelled tests.
 *
 * The product's claim is noise reduction, and a claim of that shape is only
 * worth anything with a number attached. That number requires ground truth,
 * which is what the flake canary exists to supply: a test known to be
 * non-deterministic, and a control beside it known not to be.
 *
 * Only labelled tests are scored. An unlabelled test the detector flagged is
 * neither counted as correct (which would flatter the score) nor as wrong
 * (which would punish the detector for finding a real flake nobody wrote down);
 * it is reported separately as unlabelled, so the size of the unmeasured
 * remainder is visible next to the score.
 */

/** A test whose true nature is known. */
export interface TestLabel {
  readonly suite: string;
  readonly name: string;
  /** True when the test is genuinely non-deterministic. */
  readonly flaky: boolean;
}

export interface PrecisionReport {
  /** Flagged and labelled flaky. */
  readonly truePositives: number;
  /** Flagged but labelled stable — the noise the product promises to remove. */
  readonly falsePositives: number;
  /** Labelled flaky but not flagged. */
  readonly falseNegatives: number;
  /** Labelled stable and not flagged. */
  readonly trueNegatives: number;
  /** Precision over labelled tests, or null when nothing was flagged. */
  readonly precision: number | null;
  /** Recall over labelled tests, or null when no flaky test was labelled. */
  readonly recall: number | null;
  /**
   * Precision restricted to `flaky_confirmed`.
   *
   * Confirmed verdicts rest on a contradiction at one commit, so anything
   * below 1.0 here is a defect in the detector rather than a tuning problem.
   */
  readonly confirmedPrecision: number | null;
  /** Labelled tests that never appeared in the observation window. */
  readonly unobserved: readonly TestLabel[];
  /** Tests the detector flagged that carry no label, so cannot be scored. */
  readonly unlabelledFlagged: number;
  readonly labelledCount: number;
}

/**
 * Read labels from parsed JSON: `{ "flaky": [...], "stable": [...] }`.
 *
 * Each entry is `{ "suite": "...", "name": "..." }`. Throws on anything else,
 * because a silently ignored label would quietly change the score.
 */
export function parseLabels(input: unknown): TestLabel[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('labels must be an object with "flaky" and/or "stable" arrays');
  }

  const source = input as Record<string, unknown>;
  const labels: TestLabel[] = [];

  for (const [key, flaky] of [
    ['flaky', true],
    ['stable', false],
  ] as const) {
    const entries = source[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) throw new Error(`"${key}" must be an array`);

    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(`each "${key}" entry must be an object with suite and name`);
      }
      const record = entry as Record<string, unknown>;
      const suite = typeof record.suite === 'string' ? record.suite.trim() : '';
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!suite || !name) throw new Error(`each "${key}" entry must have a non-empty suite and name`);
      labels.push({ suite, name, flaky });
    }
  }

  if (labels.length === 0) throw new Error('at least one label is required');
  return labels;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Score a set of assessments against known labels. */
export function measurePrecision(
  assessments: readonly FlakeAssessment[],
  labels: readonly TestLabel[],
): PrecisionReport {
  const byKey = new Map(assessments.map((assessment) => [testKey(assessment.suite, assessment.name), assessment]));
  const labelledKeys = new Set(labels.map((label) => testKey(label.suite, label.name)));

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let confirmedCorrect = 0;
  let confirmedTotal = 0;
  const unobserved: TestLabel[] = [];

  for (const label of labels) {
    const assessment = byKey.get(testKey(label.suite, label.name));
    if (!assessment) {
      // A label with no observations is not evidence either way; counting it
      // as a miss would blame the detector for data that never arrived.
      unobserved.push(label);
      continue;
    }

    const flagged = isFlaky(assessment);
    if (assessment.verdict === 'flaky_confirmed') {
      confirmedTotal += 1;
      if (label.flaky) confirmedCorrect += 1;
    }

    if (flagged && label.flaky) truePositives += 1;
    else if (flagged) falsePositives += 1;
    else if (label.flaky) falseNegatives += 1;
    else trueNegatives += 1;
  }

  const unlabelledFlagged = assessments.filter(
    (assessment) => isFlaky(assessment) && !labelledKeys.has(testKey(assessment.suite, assessment.name)),
  ).length;

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, truePositives + falseNegatives),
    confirmedPrecision: ratio(confirmedCorrect, confirmedTotal),
    unobserved,
    unlabelledFlagged,
    labelledCount: labels.length - unobserved.length,
  };
}
