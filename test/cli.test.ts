import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError, main, run } from '../src/cli.js';

/**
 * The CLI is the documented fastest path to value — no App install, no hosted
 * service — so a broken flag or an unreadable error message is a first-run
 * failure for the people most likely to try the product.
 *
 * These tests drive `run`/`main` directly rather than spawning a process: the
 * module guards its entrypoint precisely so it can be imported this way.
 */

let workdir: string;
let output: string[];
let errors: string[];
let restore: () => void;

function junitXml(cases: { name: string; failed?: boolean }[]): string {
  const body = cases
    .map(({ name, failed }) =>
      failed
        ? `<testcase classname="Suite" name="${name}" time="1.0"><failure message="boom"/></testcase>`
        : `<testcase classname="Suite" name="${name}" time="1.0"/>`,
    )
    .join('');
  return `<testsuite name="suite" tests="${cases.length}">${body}</testsuite>`;
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'ci-ledger-cli-'));
  output = [];
  errors = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalDbPath = process.env.DATABASE_PATH;

  console.log = (...args: unknown[]): void => {
    output.push(args.join(' '));
  };
  console.error = (...args: unknown[]): void => {
    errors.push(args.join(' '));
  };
  process.env.DATABASE_PATH = join(workdir, 'ledger.sqlite');

  restore = (): void => {
    console.log = originalLog;
    console.error = originalError;
    if (originalDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDbPath;
  };
});

afterEach(() => {
  restore();
  rmSync(workdir, { recursive: true, force: true });
});

function writeReport(name: string, cases: { name: string; failed?: boolean }[]): string {
  const path = join(workdir, name);
  writeFileSync(path, junitXml(cases), 'utf8');
  return path;
}

describe('ci-ledger CLI', () => {
  it('prints usage with no arguments instead of failing', () => {
    expect(main([])).toBe(0);
    expect(output.join('\n')).toContain('Usage:');
  });

  it('prints usage for --help', () => {
    expect(main(['--help'])).toBe(0);
    expect(output.join('\n')).toContain('ci-ledger ingest');
  });

  it('ingests a JUnit report and says how much it stored', () => {
    const path = writeReport('results.xml', [{ name: 'alpha' }, { name: 'beta', failed: true }]);

    expect(main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', path])).toBe(0);
    expect(output.join('\n')).toContain('recorded 2 test result(s)');
  });

  it('scans a directory recursively for reports', () => {
    mkdirSync(join(workdir, 'nested'));
    writeFileSync(join(workdir, 'nested', 'a.xml'), junitXml([{ name: 'alpha' }]), 'utf8');
    writeFileSync(join(workdir, 'nested', 'notes.txt'), 'ignored', 'utf8');

    expect(main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', join(workdir, 'nested')])).toBe(0);
    expect(output.join('\n')).toContain('recorded 1 test result(s)');
  });

  it('treats a re-ingest of the same run as a no-op', () => {
    const path = writeReport('results.xml', [{ name: 'alpha' }]);
    const args = ['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', '--run-id', 'r1', path];

    main(args);
    output.length = 0;
    expect(main(args)).toBe(0);
    expect(output.join('\n')).toContain('already recorded');
  });

  it('reports flakes it has evidence for and says so when it has none', () => {
    const path = writeReport('results.xml', [{ name: 'alpha' }]);
    main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', path]);
    output.length = 0;

    expect(main(['flaky', '--repo', 'acme/widgets'])).toBe(0);
    expect(output.join('\n')).toContain('no flaky tests detected');
  });

  it('renders a pull request report', () => {
    const path = writeReport('results.xml', [{ name: 'alpha' }]);
    main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', '--pr', '7', path]);
    output.length = 0;

    expect(main(['report', '--repo', 'acme/widgets', '--pr', '7'])).toBe(0);
    expect(output.join('\n')).toContain('PR #7');
  });

  it('renders the report as a markdown comment on request', () => {
    const path = writeReport('results.xml', [{ name: 'alpha' }]);
    main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', '--pr', '7', path]);
    output.length = 0;

    expect(main(['report', '--repo', 'acme/widgets', '--pr', '7', '--markdown'])).toBe(0);
    expect(output.join('\n')).toContain('## CI Ledger');
  });

  describe('errors are messages, not stack traces', () => {
    it('exits non-zero with one line for a missing --repo', () => {
      expect(main(['flaky'])).toBe(1);
      expect(errors.join('\n')).toContain('--repo must be a valid');
      expect(errors.join('\n')).not.toContain('at ');
    });

    it('rejects an unknown flag without crashing', () => {
      expect(main(['flaky', '--repo', 'acme/widgets', '--nonsense'])).toBe(1);
      expect(errors.join('\n')).toContain('error:');
    });

    it('exits non-zero for an unknown command', () => {
      expect(main(['teleport'])).toBe(1);
      expect(errors.join('\n')).toContain('unknown command');
    });

    it('requires a commit sha to ingest against', () => {
      expect(main(['ingest', '--repo', 'acme/widgets', 'x.xml'])).toBe(1);
      expect(errors.join('\n')).toContain('--sha is required');
    });

    it('requires at least one path to ingest', () => {
      expect(main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234'])).toBe(1);
      expect(errors.join('\n')).toContain('at least one JUnit XML path');
    });

    it('says so when a directory holds no reports', () => {
      expect(main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', workdir])).toBe(1);
      expect(errors.join('\n')).toContain('no .xml files found');
    });

    it('names the file it could not parse', () => {
      const path = join(workdir, 'broken.xml');
      writeFileSync(path, '<testsuite><testcase></testsuite>', 'utf8');

      expect(main(['ingest', '--repo', 'acme/widgets', '--sha', 'abc1234', path])).toBe(1);
      expect(errors.join('\n')).toContain('broken.xml');
    });

    it('says when it has no data for a repository', () => {
      expect(main(['flaky', '--repo', 'ghost/repo'])).toBe(1);
      expect(errors.join('\n')).toContain('no data recorded');
    });

    it('rejects a pull request number that is not positive', () => {
      expect(main(['report', '--repo', 'acme/widgets', '--pr', '0'])).toBe(1);
      expect(errors.join('\n')).toContain('--pr must be a positive integer');
    });

    it('throws a CliError from run so callers can distinguish user error', () => {
      expect(() => run(['flaky'])).toThrow(CliError);
    });
  });
});
