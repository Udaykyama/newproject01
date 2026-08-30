import type { PullRequestReport, FlakeFinding } from '../analysis/report.js';
import type { CostConfidence } from '../analysis/cost.js';

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
  // Backslashes must be escaped first: doing pipes first would let an input
  // such as `a\|b` emit `a\\|b`, where the added backslash is consumed as a
  // literal and the pipe still breaks out of the table cell.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function truncate(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function verdictLabel(assessment: FlakeFinding): string {
  return assessment.verdict === 'flaky_confirmed' ? 'confirmed' : 'suspected';
}

function evidence(assessment: FlakeFinding): string {
  if (assessment.contradictoryCommits > 0) {
    const commits = assessment.contradictoryCommits;
    return `passed and failed on the same commit (${commits}×)`;
  }
  return `flips ${(assessment.flipRate * 100).toFixed(0)}% of runs, ${assessment.failures}/${assessment.totalRuns} failed`;
}

function renderFlakeTable(flakes: readonly FlakeFinding[]): string {
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

/**
 * State how the cost was measured.
 *
 * A dollar figure with no provenance gets checked against a real invoice once
 * and never trusted again. Saying which runs were priced from per-job billing
 * data and which were estimated is what makes the number survive that check.
 */
function confidenceNote(confidence: CostConfidence): string | null {
  if (confidence.exact) return null;

  const caveats: string[] = [];
  if (confidence.reportedRuns > 0) {
    caveats.push(
      `${confidence.reportedRuns} run${confidence.reportedRuns === 1 ? '' : 's'} priced from a duration reported by the CI job`,
    );
  }
  if (confidence.wallClockRuns > 0) {
    caveats.push(
      `${confidence.wallClockRuns} from run wall-clock time, which under-reports parallel jobs`,
    );
  }

  if (caveats.length === 0) return null;

  return `- **Estimate:** ${caveats.join('; ')}. Install the GitHub App for per-job billing data.`;
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

  const note = confidenceNote(cost.confidence);
  if (note) lines.push(note);

  return lines.join('\n');
}

/**
 * Render the flake section.
 *
 * New findings and already-quarantined ones are kept in separate tables. A
 * reviewer needs to know what changed; mixing a test somebody already dealt
 * with into that list is how a report stops being read.
 */
function renderFlakeSection(report: PullRequestReport): string {
  const { waste } = report;
  const outstanding = report.flakes.filter((flake) => !flake.quarantined);
  const handled = report.flakes.filter((flake) => flake.quarantined);

  const lines: string[] = ['### Flaky tests', ''];

  if (outstanding.length === 0) {
    lines.push(
      handled.length > 0
        ? 'No unhandled flaky tests in this PR’s runs. ✅'
        : 'None detected in this PR’s runs. ✅',
    );
  } else {
    const confirmed = outstanding.filter((flake) => flake.verdict === 'flaky_confirmed').length;
    lines.push(
      confirmed > 0
        ? `${outstanding.length} flaky test${outstanding.length === 1 ? '' : 's'} touched by this PR (${confirmed} confirmed non-deterministic).`
        : `${outstanding.length} suspected flaky test${outstanding.length === 1 ? '' : 's'} touched by this PR.`,
      '',
      renderFlakeTable(outstanding),
    );
  }

  if (handled.length > 0) {
    lines.push(
      '',
      `<details><summary>${handled.length} already quarantined</summary>`,
      '',
      renderFlakeTable(handled),
      '',
      '</details>',
    );
  }

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
