/**
 * examples/full-pipeline.js
 *
 * Demonstrates all three modules working together in a closed feedback loop:
 *
 *   KnowledgeWatcher detects an external change
 *        │
 *        ▼
 *   PromptRequestQueue enqueues a repair task (DAG)
 *        │
 *        ▼
 *   SkillMonitor records execution quality
 *        │
 *        ▼
 *   SkillMonitor detects degradation → queues another repair task
 *        │
 *        └──► loop continues until the skill is healthy
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PromptRequestQueue, SkillMonitor, KnowledgeWatcher } from 'agent-skill-bus';

const dataDir = join(tmpdir(), 'agent-skill-bus-pipeline-demo-' + Date.now());
mkdirSync(dataDir, { recursive: true });

const bus     = new PromptRequestQueue(dataDir);
const monitor = new SkillMonitor(dataDir);
const watcher = new KnowledgeWatcher(dataDir);

// ── Phase 1: KnowledgeWatcher detects a library version bump ─────────────────

console.log('=== Phase 1: Knowledge change detected ===');

// Seed the watcher with a previous known-good state so the bump is detectable
watcher.updateSource('openai-sdk', { version: '4.20.0' });

const checkResult = await watcher.check('openai-sdk', async (prev) => {
  // Simulate discovering that the SDK bumped from v4.20.0 → v4.28.0
  return {
    version: '4.28.0',
    affectedSkills: ['chat-completer', 'embedding-builder'],
    severity: 'high',
  };
});

const newDiffs = watcher.getUnprocessed();
console.log(`Detected ${newDiffs.length} unprocessed diff(s):`);
for (const d of newDiffs) {
  console.log(`  [${d.severity}] ${d.source}: ${d.type} — ${d.detail}`);
  console.log(`         affects skills: ${d.affectedSkills.join(', ')}`);
}

// ── Phase 2: Translate each diff into a repair task in the queue ─────────────

console.log('\n=== Phase 2: Enqueue repair tasks ===');

const repairTasks = [];
for (const diff of newDiffs) {
  for (const skill of diff.affectedSkills) {
    const task = bus.enqueue({
      source: 'knowledge-watcher',
      priority: diff.severity === 'critical' ? 'critical' : 'high',
      agent: 'skill-repair-bot',
      task: `repair-skill:${skill}`,
      context: `${diff.type}: ${diff.detail}`,
      affectedSkills: [skill],
    });
    if (task) {
      repairTasks.push(task);
      console.log(`  Queued: ${task.task} (id: ${task.id})`);
    }
  }
}

// Mark the diffs as in-progress
watcher.markProcessed(newDiffs.map((_, i) => i));

// ── Phase 3: Execute the repair tasks ────────────────────────────────────────

console.log('\n=== Phase 3: Execute repairs ===');

const ready = bus.getDispatchable();
for (const task of ready) {
  bus.startExecution(task.id);

  // Simulate: chat-completer repair succeeds; embedding-builder still has issues
  const skill = task.affectedSkills?.[0] ?? 'unknown';
  const success = skill === 'chat-completer';
  const score   = success ? 0.91 : 0.52;
  const result  = success ? 'success' : 'fail';

  monitor.recordRun({
    agent: task.agent,
    skill,
    task: task.task,
    result,
    score,
    notes: success ? '' : 'New SDK response shape not yet handled',
  });

  if (success) {
    bus.complete(task.id, `${skill} repaired successfully`);
    console.log(`  ✓ ${skill}: repaired (score ${score})`);
  } else {
    bus.fail(task.id, `${skill} still failing after repair attempt`);
    console.log(`  ✗ ${skill}: repair failed (score ${score})`);
  }
}

// ── Phase 4: SkillMonitor evaluates health → triggers follow-up task ─────────

console.log('\n=== Phase 4: Health check & follow-up ===');

const flagged = monitor.getFlagged(7);
if (flagged.length > 0) {
  console.log(`${flagged.length} skill(s) still unhealthy — queuing escalation tasks:`);
  for (const s of flagged) {
    const escalation = bus.enqueue({
      source: 'skill-monitor',
      priority: 'critical',
      agent: 'senior-repair-bot',
      task: `escalate-repair:${s.name}`,
      context: `avgScore=${s.avgScore}, consecutiveFails=${s.consecutiveFails}`,
      affectedSkills: [s.name],
    });
    if (escalation) {
      console.log(`  Escalated: ${escalation.task} (id: ${escalation.id})`);
    }

    monitor.recordImprovement({
      skill: s.name,
      diagnosis: `Score ${s.avgScore} after SDK upgrade — response shape changed`,
      proposal: 'Update response parser to handle new choices[0].message.content path',
      action: 'Escalated to senior-repair-bot for manual prompt rewrite',
      result: 'Pending',
    });
  }
} else {
  console.log('All skills healthy — no follow-up needed.');
}

// ── Phase 5: Final pipeline summary ──────────────────────────────────────────

console.log('\n=== Pipeline Summary ===');
console.log('Queue stats   :', bus.stats());
console.log('Watcher stats :', watcher.stats());
const health = monitor.updateHealth(7);
console.log('Skill health  :');
for (const [name, data] of Object.entries(health.skills)) {
  console.log(`  ${name}: avgScore=${data.avgScore}, trend=${data.trend}, flagged=${data.flagged}`);
}
