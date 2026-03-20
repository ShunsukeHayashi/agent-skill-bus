#!/usr/bin/env node

/**
 * Agent Skill Bus CLI
 * 
 * Usage:
 *   skill-bus enqueue --source human --priority high --agent dev --task "Fix auth bug"
 *   skill-bus dispatch [--max 5]
 *   skill-bus complete <pr-id> [--result "done"]
 *   skill-bus fail <pr-id> [--reason "error message"]
 *   skill-bus stats
 *   skill-bus health [--days 7]
 *   skill-bus record-run --agent dev --skill api-caller --task "fetch" --result success --score 1.0
 *   skill-bus flagged [--days 7]
 *   skill-bus drift
 *   skill-bus diffs [--unprocessed]
 *   skill-bus locks [--release-expired]
 */

import { PromptRequestQueue } from './queue.js';
import { SkillMonitor } from './self-improve.js';
import { KnowledgeWatcher } from './knowledge-watcher.js';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name, defaultValue = undefined) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

// Default data directories
const dataDir = getFlag('data-dir', process.cwd());
const queueDir = resolve(dataDir, getFlag('queue-dir', 'skills/prompt-request-bus'));
const skillsDir = resolve(dataDir, getFlag('skills-dir', 'skills/self-improving-skills'));
const kwDir = resolve(dataDir, getFlag('kw-dir', 'skills/knowledge-watcher'));

const queue = new PromptRequestQueue(queueDir);
const monitor = new SkillMonitor(skillsDir);
const watcher = new KnowledgeWatcher(kwDir);

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case 'init': {
    // Initialize skill-bus in current directory
    const initDir = getFlag('dir', process.cwd());
    const { mkdirSync, writeFileSync: wf, existsSync: ex, readFileSync: rf } = await import('node:fs');
    const { dirname: dn, join: jn } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const dirs = [
      'skills/prompt-request-bus',
      'skills/self-improving-skills',
      'skills/knowledge-watcher',
    ];

    for (const d of dirs) {
      const full = resolve(initDir, d);
      mkdirSync(full, { recursive: true });
    }

    // Data files (empty/default)
    const files = {
      'skills/prompt-request-bus/prompt-request-queue.jsonl': '',
      'skills/prompt-request-bus/active-locks.jsonl': '',
      'skills/prompt-request-bus/dag-state.jsonl': '',
      'skills/prompt-request-bus/prompt-request-history.md': '# Prompt Request History\n',
      'skills/self-improving-skills/skill-runs.jsonl': '',
      'skills/self-improving-skills/skill-health.json': '{"lastUpdated":"","skills":{}}',
      'skills/self-improving-skills/skill-improvements.md': '# Skill Improvements\n',
      'skills/knowledge-watcher/knowledge-state.json': '{"lastCheck":"","sources":{}}',
      'skills/knowledge-watcher/knowledge-diffs.jsonl': '',
    };

    let created = 0;
    for (const [f, content] of Object.entries(files)) {
      const full = resolve(initDir, f);
      if (!ex(full)) {
        wf(full, content);
        created++;
      }
    }

    // Copy bundled SKILL.md files from package
    const pkgDir = dn(dn(fileURLToPath(import.meta.url)));
    const skillMds = [
      'skills/prompt-request-bus/SKILL.md',
      'skills/self-improving-skills/SKILL.md',
      'skills/knowledge-watcher/SKILL.md',
    ];

    for (const s of skillMds) {
      const dest = resolve(initDir, s);
      const src = jn(pkgDir, s);
      if (!ex(dest) && ex(src)) {
        wf(dest, rf(src, 'utf-8'));
        created++;
      }
    }

    output({
      status: 'initialized',
      directory: initDir,
      filesCreated: created,
      message: `Agent Skill Bus initialized with data files and SKILL.md guides. Run 'skill-bus stats' to verify.`,
    });
    break;
  }

  case 'enqueue': {
    // Parse comma-separated list flags
    const parseList = (name) => {
      const val = getFlag(name, '');
      return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
    };

    const pr = queue.enqueue({
      source: getFlag('source', 'human'),
      priority: getFlag('priority', 'medium'),
      agent: getFlag('agent', 'default'),
      task: getFlag('task', ''),
      context: getFlag('context', ''),
      deadline: getFlag('deadline', 'none'),
      affectedFiles: parseList('files'),
      affectedSkills: parseList('skills'),
      dependsOn: parseList('depends-on'),
      dagId: getFlag('dag-id', null),
    });
    if (pr) {
      output({ status: 'enqueued', pr });
    } else {
      output({ status: 'duplicate', message: 'Identical PR already in queue' });
    }
    break;
  }

  case 'dispatch': {
    const max = parseInt(getFlag('max', '5'), 10);
    const dispatchable = queue.getDispatchable(max);
    output({ count: dispatchable.length, prs: dispatchable });
    break;
  }

  case 'start': {
    const prId = args[1];
    if (!prId) { console.error('Usage: skill-bus start <pr-id>'); process.exit(1); }
    const pr = queue.startExecution(prId);
    output({ status: 'running', pr });
    break;
  }

  case 'complete': {
    const prId = args[1];
    if (!prId) { console.error('Usage: skill-bus complete <pr-id>'); process.exit(1); }
    queue.complete(prId, getFlag('result', 'done'));
    output({ status: 'completed', prId });
    break;
  }

  case 'fail': {
    const prId = args[1];
    if (!prId) { console.error('Usage: skill-bus fail <pr-id>'); process.exit(1); }
    queue.fail(prId, getFlag('reason', 'unknown'));
    output({ status: 'failed', prId });
    break;
  }

  case 'stats': {
    output(queue.stats());
    break;
  }

  case 'record-run': {
    const entry = monitor.recordRun({
      agent: getFlag('agent', 'default'),
      skill: getFlag('skill', ''),
      task: getFlag('task', ''),
      result: getFlag('result', 'success'),
      score: parseFloat(getFlag('score', '1.0')),
      notes: getFlag('notes', ''),
    });
    output({ status: 'recorded', entry });
    break;
  }

  case 'health': {
    const days = parseInt(getFlag('days', '7'), 10);
    const health = monitor.updateHealth(days);
    output(health);
    break;
  }

  case 'flagged': {
    const days = parseInt(getFlag('days', '7'), 10);
    const flagged = monitor.getFlagged(days);
    output({ count: flagged.length, skills: flagged });
    break;
  }

  case 'drift': {
    const drifting = monitor.detectDrift();
    output({ count: drifting.length, skills: drifting });
    break;
  }

  case 'diffs': {
    if (hasFlag('unprocessed')) {
      output(watcher.getUnprocessed());
    } else {
      output(watcher.stats());
    }
    break;
  }

  case 'locks': {
    if (hasFlag('release-expired')) {
      const result = queue.releaseExpiredLocks();
      output({ status: 'cleaned', ...result });
    } else {
      output(queue.readLocks());
    }
    break;
  }

  case 'dag': {
    const dagId = args[1];
    if (!dagId) { console.error('Usage: skill-bus dag <dag-id>'); process.exit(1); }
    output(queue.getDagState(dagId));
    break;
  }

  default:
    console.log(`Agent Skill Bus v1.2.0

Usage: skill-bus <command> [options]
       npx agent-skill-bus <command> [options]

Setup:
  init          Initialize skill-bus in current directory

Queue Commands:
  enqueue       Add a prompt request to the queue
  dispatch      Get next dispatchable PRs
  start <id>    Mark a PR as running (acquire locks)
  complete <id> Mark a PR as done (release locks)
  fail <id>     Mark a PR as failed
  stats         Show queue statistics
  locks         Show active locks (--release-expired to clean)
  dag <id>      Show DAG state

Skill Monitoring:
  record-run    Log a skill execution result
  health        Update and show skill health summary
  flagged       Show skills that need attention
  drift         Detect silent score degradation

Knowledge Watcher:
  diffs         Show diff stats (--unprocessed for pending)

Options:
  --data-dir <path>   Base directory (default: cwd)
  --queue-dir <path>  Queue data dir (relative to data-dir)
  --skills-dir <path> Skills data dir (relative to data-dir)
  --kw-dir <path>     Knowledge watcher dir (relative to data-dir)
`);
}
