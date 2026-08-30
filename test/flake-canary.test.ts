import { describe, expect, it } from 'vitest';

/**
 * A deliberately non-deterministic test, used as ground truth for the detector.
 *
 * Without a labelled case there is no way to tell "found no flakes" from "found
 * nothing" — a detector that never fires looks identical to a healthy suite.
 * This test gives the flake analysis a known positive on a real repository, so
 * its precision and recall can be checked against something other than
 * synthetic fixtures.
 *
 * It is opt-in and never runs in the normal suite: a genuinely flaky test in
 * the required checks would make CI red half the time, which is precisely the
 * problem this product exists to remove. CI runs it in a separate,
 * non-blocking job whose report is ingested and then compared against the
 * verdict the detector produced.
 */

const ENABLED = process.env.CI_LEDGER_FLAKE_CANARY === 'true';

/** ~50%: the fastest way to accumulate contradictory evidence per commit. */
const FAILURE_RATE = 0.5;

describe.skipIf(!ENABLED)('flake canary', () => {
  it('fails about half the time on purpose', () => {
    expect(Math.random()).toBeGreaterThanOrEqual(FAILURE_RATE);
  });

  it('is stable, as a control', () => {
    expect(true).toBe(true);
  });
});

describe.skipIf(ENABLED)('flake canary (disabled)', () => {
  it('stays out of the normal suite unless explicitly enabled', () => {
    expect(process.env.CI_LEDGER_FLAKE_CANARY).not.toBe('true');
  });
});
