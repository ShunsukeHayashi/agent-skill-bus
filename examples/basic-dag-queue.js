/**
 * examples/basic-dag-queue.js
 *
 * Demonstrates a simple 3-task DAG where tasks execute in dependency order.
 *
 * Dependency graph:
 *   fetch-data  ──┐
 *                 ├──► process-data ──► generate-report
 *   fetch-meta  ──┘
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PromptRequestQueue } from 'agent-skill-bus';

// Use a temp directory so the example is self-contained and leaves no residue
const dataDir = join(tmpdir(), 'agent-skill-bus-dag-demo-' + Date.now());
mkdirSync(dataDir, { recursive: true });

const bus = new PromptRequestQueue(dataDir);

// ── Step 1: Add tasks with explicit dependency wiring ────────────────────────

const t1 = bus.enqueue({
  source: 'example',
  priority: 'high',
  agent: 'data-fetcher',
  task: 'fetch-data',
  context: 'Pull latest sales records from API',
});

const t2 = bus.enqueue({
  source: 'example',
  priority: 'high',
  agent: 'meta-fetcher',
  task: 'fetch-meta',
  context: 'Pull product catalog metadata',
});

// t3 depends on BOTH t1 and t2 finishing first
const t3 = bus.enqueue({
  source: 'example',
  priority: 'medium',
  agent: 'processor',
  task: 'process-data',
  context: 'Join sales records with metadata',
  dependsOn: [t1.id, t2.id],
});

// t4 depends only on t3
const t4 = bus.enqueue({
  source: 'example',
  priority: 'low',
  agent: 'reporter',
  task: 'generate-report',
  context: 'Produce weekly summary PDF',
  dependsOn: [t3.id],
});

console.log('Queued tasks:', [t1, t2, t3, t4].map(t => `${t.id} (${t.task})`));

// ── Step 2: Dispatch loop — simulate ordered execution ───────────────────────

let round = 0;
while (true) {
  round++;
  const ready = bus.getDispatchable();
  if (ready.length === 0) break;

  console.log(`\nRound ${round} — dispatchable: ${ready.map(t => t.task).join(', ')}`);

  for (const task of ready) {
    bus.startExecution(task.id);
    console.log(`  ▶ running  : ${task.task} (agent: ${task.agent})`);

    // Simulate async work
    bus.complete(task.id, `${task.task} finished`);
    console.log(`  ✓ completed: ${task.task}`);
  }
}

// ── Step 3: Show final stats ──────────────────────────────────────────────────

const stats = bus.stats();
console.log('\nFinal queue stats:', stats);
// Expected: { total: 4, byStatus: { done: 4 }, activeLocks: 0 }
