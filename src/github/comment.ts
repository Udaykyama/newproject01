import type { PullRequestReport } from '../analysis/report.js';
import type { FlakeAssessment } from '../types.js';

/**
 * Hidden marker used to find and update our previous comment instead of
 * posting a new one on every run. A bot that spams a PR gets uninstalled.
 */
export const COMMENT_MARKER = '<!-- ci-ledger:pr-report -->';

/** Only the worst offenders are listed; the rest live in the dashboard. */
const MAX_FLAKES_LISTED = 10;

function usd(amount: number): string {
  if (amount === 0) return '$0.00';
  // Sub-cent amounts are common on cheap Linux runners; rendering them as
  // "$0.00" would make the tool look broken.
  if (Math.abs(amount) < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function signedUsd(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${usd(Math.abs(amount))}`;
}

function pct(value: number | null): string {
  if (value === null) return 'n/a';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function minutes(value: number): string {
  return value === 1 ? '1 min' : `${value} min`;
}

function escapeCell(value: string): string {
  // Pipes and newlines would break the surrounding markdown table.
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function truncate(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function verdictLabel(assessment: FlakeAssessment): string {
  return assessment.verdict === 'flaky_confirmed' ? 'confirmed' : 'suspected';
}

function evidence(assessment: FlakeAssessment): string {
  if (assessment.contradictoryCommits > 0) {
    const commits = assessment.contradictoryCommits;
    return `passed and failed on the same commit (${commits}×)`;
  }
  return `flips ${(assessment.flipRate * 100).toFixed(0)}% of runs, ${assessment.failures}/${assessment.totalRuns} failed`;
}

function renderFlakeTable(flakes: readonly FlakeAssessment[]): string {
  const rows = flakes
    .slice(0, MAX_FLAKES_LISTED)
    .map((flake) => {
      const test = truncate(escapeCell(`${flake.suite} › ${flake.name}`), 90);
      return `| \`${test}\` | ${verdictLabel(flake)} | ${(flake.score * 100).toFixed(0)} | ${escapeCell(evidence(flake))} |`;
    })
    .join('\n');

  const overflow =
    flakes.length > MAX_FLAKES_LISTED ? `\n\n_…and ${flakes.length - MAX_FLAKES_LISTED} more._` : '';

  return ['| Test | Verdict | Score | Evidence |', '| --- | --- | --: | --- |', rows].join('\n') + overflow;
}

function renderCostSection(report: PullRequestReport): string {
  const { cost, baseline } = report;

  const lines = [
    '### CI cost',
    '',
    `- **This PR:** ${usd(cost.usd)} across ${cost.runCount} run${cost.runCount === 1 ? '' : 's'} (${minutes(cost.billableMinutes)} billable)`,
  ];

  if (baseline.baselineUsd > 0) {
    lines.push(
      `- **vs \`${report.baseBranch}\` baseline:** ${signedUsd(baseline.deltaUsd)} (${pct(baseline.deltaPct)})`,
    );
  } else {
    lines.push(`- **vs \`${report.baseBranch}\` baseline:** not enough history yet`);
  }

  if (cost.retryCount > 0) {
    lines.push(`- **Re-runs:** ${cost.retryCount} costing ${usd(cost.retryUsd)}`);
  }

  if (cost.byWorkflow.length > 1) {
    const breakdown = cost.byWorkflow
      .map((workflow) => `\`${escapeCell(workflow.workflowName)}\` ${usd(workflow.usd)}`)
      .join(' · ');
    lines.push(`- **By workflow:** ${breakdown}`);
  }

  return lines.join('\n');
}

function renderFlakeSection(report: PullRequestReport): string {
  const { flakes, waste } = report;

  if (flakes.length === 0) {
    return ['### Flaky tests', '', 'None detected in this PR’s runs. ✅'].join('\n');
  }

  const confirmed = flakes.filter((flake) => flake.verdict === 'flaky_confirmed').length;
  const headline =
    confirmed > 0
      ? `${flakes.length} flaky test${flakes.length === 1 ? '' : 's'} touched by this PR (${confirmed} confirmed non-deterministic).`
      : `${flakes.length} suspected flaky test${flakes.length === 1 ? '' : 's'} touched by this PR.`;

  const lines = ['### Flaky tests', '', headline, '', renderFlakeTable(flakes)];

  if (waste.runCount > 0) {
    lines.push(
      '',
      `> **${usd(waste.usd)} wasted** on ${waste.runCount} re-run${waste.runCount === 1 ? '' : 's'} ` +
        `(${minutes(waste.billableMinutes)}) that failed only on flaky tests.`,
    );
  }

  return lines.join('\n');
}

/**
 * Render the PR comment.
 *
 * Cost first, flakes second: the cost number is what a reviewer skims for, and
 * the flake list is what they act on.
 */
export function renderPullRequestComment(report: PullRequestReport): string {
  const sections = [
    COMMENT_MARKER,
    '## CI Ledger',
    '',
    renderCostSection(report),
    '',
    renderFlakeSection(report),
  ];

  if (report.quarantined.length > 0) {
    const names = report.quarantined
      .slice(0, MAX_FLAKES_LISTED)
      .map((entry) => `\`${escapeCell(entry.name)}\``)
      .join(', ');
    sections.push('', `### Quarantined`, '', `${report.quarantined.length} test(s) quarantined: ${names}`);
  }

  sections.push('', `<sub>Updated ${report.generatedAt} · costs are estimates from configured runner rates.</sub>`);

  return sections.join('\n');
}
