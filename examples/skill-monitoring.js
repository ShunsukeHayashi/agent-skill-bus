/**
 * examples/skill-monitoring.js
 *
 * Demonstrates the SkillMonitor self-improvement loop:
 *
 *   OBSERVE → ANALYZE → DIAGNOSE → PROPOSE → EVALUATE → APPLY → RECORD
 *
 * Simulates a skill that degrades over time and triggers repair.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillMonitor } from 'agent-skill-bus';

const dataDir = join(tmpdir(), 'agent-skill-bus-monitor-demo-' + Date.now());
mkdirSync(dataDir, { recursive: true });

const monitor = new SkillMonitor(dataDir);

// ── Step 1: OBSERVE — simulate past skill runs ───────────────────────────────

// First batch: healthy runs recorded in the past (scores ~0.9)
// Back-date timestamps so they appear as "all runs" but not skew the recent window
const pastDate = new Date(Date.now() - 8 * 86400000).toISOString(); // 8 days ago
const { appendJsonl } = await import('agent-skill-bus');
for (let i = 0; i < 5; i++) {
  appendJsonl(monitor.runsFile, {
    ts: pastDate,
    agent: 'writer', skill: 'article-drafter', task: `draft-${i}`,
    result: 'success', score: 0.90 + i * 0.01, notes: '',
  });
}

// Second batch: recent degraded runs (last 3 all fail — simulates a prompt regression)
for (let i = 0; i < 4; i++) {
  monitor.recordRun({
    agent: 'writer', skill: 'article-drafter', task: `draft-${5 + i}`,
    result: i >= 1 ? 'fail' : 'success',
    score: 0.45 + i * 0.04,
    notes: i >= 1 ? 'Output missing conclusion section' : '',
  });
}

console.log('Recorded 9 skill runs for "article-drafter" (5 past-healthy + 4 recent-degraded).\n');

// ── Step 2: ANALYZE — calculate quality metrics ──────────────────────────────

const health = monitor.analyze(7);
const skillData = health['article-drafter'];
console.log('Health report for "article-drafter":');
console.log('  avgScore       :', skillData.avgScore);
console.log('  recentAvg      :', skillData.recentAvg);
console.log('  trend          :', skillData.trend);       // "declining" or "broken"
console.log('  consecutiveFails:', skillData.consecutiveFails);
console.log('  flagged        :', skillData.flagged);     // true → needs attention

// ── Step 3: DIAGNOSE & PROPOSE — inspect flagged skills ──────────────────────

const flagged = monitor.getFlagged(7);
if (flagged.length > 0) {
  console.log('\nFlagged skills requiring repair:');
  for (const s of flagged) {
    const diagnosis = s.consecutiveFails >= 3
      ? 'Consecutive failures — prompt likely broken'
      : `Score dropped to ${s.recentAvg} (below 0.70 threshold)`;

    const proposal = s.consecutiveFails >= 3
      ? 'Revert to last known-good prompt version and re-run validation'
      : 'Add explicit "include a conclusion" instruction to the prompt';

    console.log(`  Skill    : ${s.name}`);
    console.log(`  Diagnosis: ${diagnosis}`);
    console.log(`  Proposal : ${proposal}`);

    // ── Step 7: RECORD — persist the improvement cycle ─────────────────────
    monitor.recordImprovement({
      skill: s.name,
      diagnosis,
      proposal,
      action: 'Updated system prompt — appended conclusion requirement',
      result: 'Pending re-evaluation after next 5 runs',
    });
  }
}

// ── Step 4: Update the health snapshot file ──────────────────────────────────

const snapshot = monitor.updateHealth(7);
console.log('\nHealth snapshot saved to:', join(dataDir, 'skill-health.json'));
console.log('Snapshot lastUpdated:', snapshot.lastUpdated);

// ── Step 5: Drift detection — week-over-week comparison ──────────────────────

const drifting = monitor.detectDrift();
console.log('\nSilent drift detected:', drifting.length > 0 ? drifting : 'none (need 2+ weeks of data)');
