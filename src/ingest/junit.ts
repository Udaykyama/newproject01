import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { TestResult, TestStatus } from '../types.js';

/**
 * JUnit XML is the closest thing CI has to a universal test-report format:
 * Jest, Vitest, pytest, Go, JUnit, RSpec, PHPUnit and Maven all emit it. We
 * parse it rather than integrating per-framework so a new language costs zero
 * engineering.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Keep every value as a string: durations and names are normalised
  // explicitly below, and coercion would mangle test names like "1.0".
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // Suites and cases are single objects when there is exactly one of them;
  // forcing arrays removes an entire class of branching downstream.
  isArray: (tagName) => tagName === 'testsuites' || tagName === 'testsuite' || tagName === 'testcase',
  processEntities: true,
});

type XmlNode = Record<string, unknown>;

function asArray(value: unknown): XmlNode[] {
  if (Array.isArray(value)) return value.filter((item): item is XmlNode => typeof item === 'object' && item !== null);
  if (typeof value === 'object' && value !== null) return [value as XmlNode];
  return [];
}

function attr(node: XmlNode, key: string): string | undefined {
  const value = node[`@${key}`];
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/** JUnit reports seconds as a float; we store integer milliseconds. */
function secondsToMs(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * 1000);
}

/**
 * Extract a human-readable failure message.
 *
 * Writers put the summary in `@message`, the stack trace in the text body, and
 * some emit only one of the two.
 */
function failureText(node: unknown): string | null {
  const candidates = asArray(node);
  const parts: string[] = [];

  for (const candidate of candidates) {
    const message = attr(candidate, 'message');
    if (message) parts.push(message);

    const body = candidate['#text'];
    if (typeof body === 'string' && body.trim() !== '') parts.push(body.trim());
  }

  if (parts.length === 0) return null;
  // Cap the stored text: stack traces can be megabytes and we only ever render
  // a preview of them.
  return parts.join('\n').slice(0, 4000);
}

function classify(testcase: XmlNode): { status: TestStatus; failureMessage: string | null } {
  if ('error' in testcase) {
    return { status: 'error', failureMessage: failureText(testcase.error) };
  }
  if ('failure' in testcase) {
    return { status: 'failed', failureMessage: failureText(testcase.failure) };
  }
  if ('skipped' in testcase) {
    return { status: 'skipped', failureMessage: null };
  }
  return { status: 'passed', failureMessage: null };
}

/**
 * Build the identity used to track a test across runs.
 *
 * `classname` is preferred over the suite element because parametrised runners
 * (pytest-xdist, Jest shards) rename suites per shard while keeping classname
 * stable — without this, sharded suites would look like brand-new tests every
 * run and flakiness could never accumulate.
 */
function identify(testcase: XmlNode, suiteName: string): { suite: string; name: string } {
  const className = attr(testcase, 'classname');
  const name = attr(testcase, 'name') ?? '<unnamed>';
  return { suite: className ?? suiteName, name };
}

function collectSuites(node: XmlNode, out: XmlNode[]): void {
  for (const suite of asArray(node.testsuite)) {
    out.push(suite);
    // Nested <testsuite> elements are legal and used by Maven and Go.
    collectSuites(suite, out);
  }
}

/**
 * Parse a JUnit XML document into normalised test results.
 *
 * Returns an empty array for documents with no test cases rather than throwing:
 * a build that produced no tests is a valid, if uninteresting, observation.
 *
 * Malformed XML *does* throw. The parser is lenient by default and would
 * happily return partial results for a truncated file — a common outcome when
 * a CI job is killed mid-write — and partial results would quietly turn
 * never-ran tests into apparent failures.
 */
export function parseJUnitXml(xml: string): TestResult[] {
  // `allowBooleanAttributes` keeps the validator from rejecting real-world
  // reports that carry bare attribute flags.
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    throw new Error(`malformed JUnit XML at line ${line}, column ${col}: ${msg}`);
  }

  const parsed = parser.parse(xml) as XmlNode;

  const suites: XmlNode[] = [];
  for (const root of asArray(parsed.testsuites)) {
    collectSuites(root, suites);
  }
  collectSuites(parsed, suites);

  const results: TestResult[] = [];
  for (const suite of suites) {
    const suiteName = attr(suite, 'name') ?? '<unknown suite>';
    for (const testcase of asArray(suite.testcase)) {
      const { suite: suiteId, name } = identify(testcase, suiteName);
      const { status, failureMessage } = classify(testcase);
      results.push({
        suite: suiteId,
        name,
        status,
        durationMs: secondsToMs(attr(testcase, 'time')),
        failureMessage,
      });
    }
  }

  return results;
}
