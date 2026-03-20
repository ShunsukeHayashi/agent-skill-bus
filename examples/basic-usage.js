#!/usr/bin/env node

/**
 * examples/basic-usage.js
 *
 * Minimal working example: enqueue tasks, dispatch them, record skill runs,
 * and check health — all in one script. Copy-paste friendly.
 *
 * Run:
 *   node examples/basic-usage.js
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PromptRequestQueue, SkillMonitor } from 'agent-skill-bus';

// ── Setup: temp directories so nothing leaks ─────────────────────────────────

const base = join(tmpdir(), 'skill-bus-basic-' + Date.now());
const queueDir = join(base, 'queue');
const skillsDir = join(base, 'skills');
mkdirSync(queueDir, { recursive: true });
mkdirSync(skillsDir, { recursive: true });

const queue = new PromptRequestQueue(queueDir);
const monitor = new SkillMonitor(skillsDir);

// ── 1. Enqueue a task ────────────────────────────────────────────────────────

console.log('=== 1. Enqueue Tasks ===\n');

const task1 = queue.enqueue({
  source: 'human',
  priority: 'high',
  agent: 'dev-agent',
  task: 'Refactor auth middleware',
  context: 'Current middleware has 3 nested try-catch blocks',
  affectedFiles: ['src/middleware/auth.ts'],
  affectedSkills: ['code-refactor'],
});

const task2 = queue.enqueue({
  source: 'monitor',
  priority: 'medium',
  agent: 'test-agent',
  task: 'Add unit tests for auth middleware',
  context: 'Coverage is at 45%, target is 90%',
  affectedFiles: ['tests/auth.test.ts'],
  affectedSkills: ['test-writer'],
  dependsOn: [task1.id],  // waits for refactor to finish first
});

console.log(`  Enqueued: ${task1.id} — "${task1.task}" (priority: ${task1.priority})`);
console.log(`  Enqueued: ${task2.id} — "${task2.task}" (depends on ${task1.id})`);

// ── 2. Dispatch and execute ──────────────────────────────────────────────────

console.log('\n=== 2. Dispatch Loop ===\n');

// Round 1: only task1 is ready (task2 has an unmet dependency)
const round1 = queue.getDispatchable();
console.log(`  Round 1 ready: ${round1.map(t => t.task).join(', ')}`);

for (const t of round1) {
  queue.startExecution(t.id);
  console.log(`    Running: ${t.task}`);

  // Simulate work... then record the result
  monitor.recordRun({
    agent: t.agent,
    skill: 'code-refactor',
    task: t.task,
    result: 'success',
    score: 0.92,
    notes: 'Reduced nesting from 3 to 1 level',
  });

  queue.complete(t.id, 'Refactored successfully');
  console.log(`    Done: ${t.task}`);
}

// Round 2: task2 is now unblocked
const round2 = queue.getDispatchable();
console.log(`  Round 2 ready: ${round2.map(t => t.task).join(', ')}`);

for (const t of round2) {
  queue.startExecution(t.id);
  console.log(`    Running: ${t.task}`);

  monitor.recordRun({
    agent: t.agent,
    skill: 'test-writer',
    task: t.task,
    result: 'success',
    score: 0.85,
    notes: 'Added 12 test cases, coverage now 91%',
  });

  queue.complete(t.id, 'Tests added');
  console.log(`    Done: ${t.task}`);
}

// ── 3. Check queue stats ─────────────────────────────────────────────────────

console.log('\n=== 3. Queue Stats ===\n');

const stats = queue.stats();
console.log(`  Total tasks : ${stats.total}`);
console.log(`  By status   : ${JSON.stringify(stats.byStatus)}`);
console.log(`  Active locks: ${stats.activeLocks}`);

// ── 4. Check skill health ────────────────────────────────────────────────────

console.log('\n=== 4. Skill Health ===\n');

// Add a few more runs to make the health report interesting
monitor.recordRun({ agent: 'dev-agent', skill: 'code-refactor', task: 'simplify parser', result: 'success', score: 0.88 });
monitor.recordRun({ agent: 'dev-agent', skill: 'code-refactor', task: 'extract utility', result: 'fail', score: 0.3, notes: 'Broke import chain' });

const health = monitor.analyze();

for (const [skillName, data] of Object.entries(health)) {
  console.log(`  ${skillName}:`);
  console.log(`    avgScore : ${data.avgScore}`);
  console.log(`    trend    : ${data.trend}`);
  console.log(`    flagged  : ${data.flagged}`);
  console.log(`    runs     : ${data.runs}`);
}

// ── 5. Check for flagged skills ──────────────────────────────────────────────

console.log('\n=== 5. Flagged Skills ===\n');

const flagged = monitor.getFlagged();
if (flagged.length === 0) {
  console.log('  All skills healthy.');
} else {
  for (const s of flagged) {
    console.log(`  ${s.name}: avgScore=${s.avgScore}, trend=${s.trend}, consecutiveFails=${s.consecutiveFails}`);
  }
}

console.log('\nDone. Data was written to:', base);
