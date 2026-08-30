import { describe, expect, it } from 'vitest';
import { COMMENT_MARKER, renderPullRequestComment } from '../src/github/comment.js';
import type { PullRequestReport } from '../src/analysis/report.js';
import type { FlakeAssessment } from '../src/types.js';

function flake(overrides: Partial<FlakeAssessment> = {}): FlakeAssessment {
  return {
    suite: 'CheckoutSpec',
    name: 'charges the card',
    verdict: 'flaky_confirmed',
    score: 0.9,
    totalRuns: 20,
    failures: 6,
    contradictoryCommits: 3,
    flipRate: 0.4,
    failureRateLowerBound: 0.15,
    totalDurationMs: 20_000,
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function report(overrides: Partial<PullRequestReport> = {}): PullRequestReport {
  return {
    repo: { owner: 'acme', name: 'widgets' },
    pullRequestNumber: 42,
    baseBranch: 'main',
    cost: {
      runCount: 3,
      billableMinutes: 30,
      usd: 0.24,
      retryCount: 1,
      retryUsd: 0.08,
      byWorkflow: [{ workflowName: 'ci', runCount: 3, billableMinutes: 30, usd: 0.24 }],
    },
    baseline: { currentUsd: 0.24, baselineUsd: 0.18, deltaUsd: 0.06, deltaPct: 33.3 },
    flakes: [],
    waste: { usd: 0.08, billableMinutes: 10, runCount: 1 },
    quarantined: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('renderPullRequestComment', () => {
  it('embeds the marker so the next run updates rather than duplicates', () => {
    expect(renderPullRequestComment(report())).toContain(COMMENT_MARKER);
  });

  it('leads with the cost of the pull request', () => {
    const body = renderPullRequestComment(report());

    expect(body).toContain('$0.24');
    expect(body).toContain('3 runs');
    expect(body).toContain('30 min');
  });

  it('shows the delta against the base branch', () => {
    const body = renderPullRequestComment(report());

    expect(body).toContain('`main` baseline');
    expect(body).toContain('+$0.06');
    expect(body).toContain('+33.3%');
  });

  it('says so plainly when there is no baseline yet', () => {
    const body = renderPullRequestComment(
      report({ baseline: { currentUsd: 0.24, baselineUsd: 0, deltaUsd: 0.24, deltaPct: null } }),
    );

    expect(body).toContain('not enough history yet');
  });

  it('celebrates a clean run instead of showing an empty table', () => {
    const body = renderPullRequestComment(report({ flakes: [], waste: { usd: 0, billableMinutes: 0, runCount: 0 } }));

    expect(body).toContain('None detected');
    expect(body).not.toContain('| Test |');
  });

  it('lists flaky tests with their supporting evidence', () => {
    const body = renderPullRequestComment(report({ flakes: [flake()] }));

    expect(body).toContain('CheckoutSpec › charges the card');
    expect(body).toContain('confirmed');
    expect(body).toContain('passed and failed on the same commit (3×)');
  });

  it('explains a suspected flake statistically rather than as proof', () => {
    const body = renderPullRequestComment(
      report({
        flakes: [flake({ verdict: 'flaky_suspected', contradictoryCommits: 0, flipRate: 0.5 })],
      }),
    );

    expect(body).toContain('suspected');
    expect(body).toContain('flips 50% of runs');
  });

  it('states the wasted spend caused by flakes', () => {
    const body = renderPullRequestComment(report({ flakes: [flake()] }));
    expect(body).toContain('**$0.08 wasted**');
  });

  it('omits the waste callout when nothing was wasted', () => {
    const body = renderPullRequestComment(
      report({ flakes: [flake()], waste: { usd: 0, billableMinutes: 0, runCount: 0 } }),
    );

    expect(body).not.toContain('wasted');
  });

  it('renders sub-cent amounts at higher precision instead of $0.00', () => {
    const body = renderPullRequestComment(
      report({
        cost: { runCount: 1, billableMinutes: 1, usd: 0.008, retryCount: 0, retryUsd: 0, byWorkflow: [] },
        baseline: { currentUsd: 0.008, baselineUsd: 0, deltaUsd: 0.008, deltaPct: null },
      }),
    );

    expect(body).toContain('$0.0080');
  });

  it('escapes pipes in test names so the table survives', () => {
    const body = renderPullRequestComment(
      report({ flakes: [flake({ name: 'handles a | b input' })] }),
    );

    expect(body).toContain('handles a \\| b input');
  });

  it('truncates the list and says how many were hidden', () => {
    const many = Array.from({ length: 14 }, (_, index) => flake({ name: `test-${index}` }));
    const body = renderPullRequestComment(report({ flakes: many }));

    expect(body).toContain('and 4 more');
    expect(body).not.toContain('test-11');
  });

  it('shows quarantined tests when there are any', () => {
    const body = renderPullRequestComment(
      report({
        quarantined: [
          { suite: 'CheckoutSpec', name: 'emails a receipt', reason: null, createdAt: '2026-01-01' },
        ],
      }),
    );

    expect(body).toContain('Quarantined');
    expect(body).toContain('emails a receipt');
  });

  it('drops the quarantine section entirely when empty', () => {
    expect(renderPullRequestComment(report())).not.toContain('Quarantined');
  });
});
