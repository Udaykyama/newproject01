import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnitXml } from '../src/ingest/junit.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('parseJUnitXml', () => {
  const results = parseJUnitXml(readFileSync(join(FIXTURES, 'junit-basic.xml'), 'utf8'));

  it('reads every test case across all suites', () => {
    expect(results).toHaveLength(5);
  });

  it('classifies passed, failed, error and skipped cases', () => {
    const byName = Object.fromEntries(results.map((result) => [result.name, result.status]));

    expect(byName['applies a discount code']).toBe('passed');
    expect(byName['charges the card']).toBe('failed');
    expect(byName['emails a receipt']).toBe('error');
    expect(byName['supports gift cards & vouchers']).toBe('skipped');
  });

  it('converts JUnit seconds to integer milliseconds', () => {
    const discount = results.find((result) => result.name === 'applies a discount code');
    expect(discount?.durationMs).toBe(512);
  });

  it('prefers classname over the suite element so sharded suites stay comparable', () => {
    // Suites are named shard-1/... and shard-2/..., which change per run;
    // classname does not.
    expect(results.every((result) => !result.suite.startsWith('shard-'))).toBe(true);
    expect(new Set(results.map((result) => result.suite))).toEqual(new Set(['CheckoutSpec', 'PricingSpec']));
  });

  it('captures both the failure message and the body text', () => {
    const failed = results.find((result) => result.name === 'charges the card');
    expect(failed?.failureMessage).toContain('expected 200, received 502');
    expect(failed?.failureMessage).toContain('checkout.spec.ts:44:9');
  });

  it('captures message-only errors that have no body', () => {
    const errored = results.find((result) => result.name === 'emails a receipt');
    expect(errored?.failureMessage).toBe('Timeout of 2000ms exceeded');
  });

  it('decodes XML entities in test names', () => {
    expect(results.map((result) => result.name)).toContain('supports gift cards & vouchers');
  });

  it('handles a bare single testsuite with a single testcase', () => {
    const parsed = parseJUnitXml(
      '<testsuite name="solo" tests="1"><testcase classname="Solo" name="works" time="0.1"/></testsuite>',
    );

    expect(parsed).toEqual([
      { suite: 'Solo', name: 'works', status: 'passed', durationMs: 100, failureMessage: null },
    ]);
  });

  it('falls back to the suite name when classname is absent', () => {
    const parsed = parseJUnitXml('<testsuite name="MySuite"><testcase name="a"/></testsuite>');
    expect(parsed[0]?.suite).toBe('MySuite');
  });

  it('returns an empty array for a report with no test cases', () => {
    expect(parseJUnitXml('<testsuites/>')).toEqual([]);
  });

  it('treats a missing time attribute as zero rather than NaN', () => {
    const parsed = parseJUnitXml('<testsuite name="s"><testcase classname="C" name="n"/></testsuite>');
    expect(parsed[0]?.durationMs).toBe(0);
  });

  it('throws on malformed XML instead of silently dropping results', () => {
    expect(() => parseJUnitXml('<testsuite><testcase></testsuite>')).toThrow();
  });
});
