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
 *   skill-bus dashboard [--days 7] [--no-color]
 *   skill-bus diffs [--unprocessed]
 *   skill-bus locks [--release-expired]
 */

import { PromptRequestQueue } from './queue.js';
import { SkillMonitor } from './self-improve.js';
import { KnowledgeWatcher } from './knowledge-watcher.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

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

function getDefaultDirs(baseDir) {
  const legacyDir = resolve(baseDir, '.skill-bus');
  if (existsSync(legacyDir)) {
    return {
      queueDir: resolve(baseDir, '.skill-bus/queue'),
      skillsDir: resolve(baseDir, '.skill-bus/monitor'),
      kwDir: resolve(baseDir, '.skill-bus/watcher'),
    };
  }
  return {
    queueDir: resolve(baseDir, 'skills/prompt-request-bus'),
    skillsDir: resolve(baseDir, 'skills/self-improving-skills'),
    kwDir: resolve(baseDir, 'skills/knowledge-watcher'),
  };
}

function describeResolvedPaths(baseDir, queueDir, skillsDir, kwDir) {
  const legacyDetected = existsSync(resolve(baseDir, '.skill-bus'));
  return {
    dataDir: baseDir,
    layout: legacyDetected ? 'legacy-dot-skill-bus' : 'standard-skills-subdirs',
    queueDir,
    skillsDir,
    kwDir,
    files: {
      queue: resolve(queueDir, 'prompt-request-queue.jsonl'),
      locks: resolve(queueDir, 'active-locks.jsonl'),
      dag: resolve(queueDir, 'dag-state.jsonl'),
      history: resolve(queueDir, 'prompt-request-history.md'),
      runs: resolve(skillsDir, 'skill-runs.jsonl'),
      health: resolve(skillsDir, 'skill-health.json'),
      improvements: resolve(skillsDir, 'skill-improvements.md'),
      watcherState: resolve(kwDir, 'knowledge-state.json'),
      watcherDiffs: resolve(kwDir, 'knowledge-diffs.jsonl'),
    },
  };
}

function showHelp(subcommand = null) {
  if (subcommand === 'enqueue') {
    console.log(`Usage: skill-bus enqueue --source <source> --priority <critical|high|medium|low> --agent <agent> --task "<task>"

Options:
  --context <text>
  --deadline <none|immediate|24h|week-end>
  --files <comma,separated,files>
  --skills <comma,separated,skills>
  --depends-on <comma,separated,pr-ids>
  --dag-id <id>
  --data-dir <path>
  --queue-dir <path>`);
    return;
  }

  if (subcommand === 'record-run') {
    console.log(`Usage: skill-bus record-run --agent <agent> --skill <skill> --task "<task>" --result <success|fail|partial> --score <0.0-1.0>

Options:
  --notes <text>
  --data-dir <path>
  --skills-dir <path>`);
    return;
  }

  console.log(`Agent Skill Bus v1.3.1

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
  dashboard     Visual skill health dashboard (--days N, --no-color)
  paths         Show resolved data directories and files

Knowledge Watcher:
  diffs         Show diff stats (--unprocessed for pending)

Options:
  --data-dir <path>   Base directory (default: cwd)
  --queue-dir <path>  Queue data dir (relative to data-dir or absolute)
  --skills-dir <path> Skills data dir (relative to data-dir or absolute)
  --kw-dir <path>     Knowledge watcher dir (relative to data-dir or absolute)
`);
}

const wantsHelp = args.includes('--help') || args.includes('-h');
if (wantsHelp) {
  const subcommand = command && !command.startsWith('-') ? command : null;
  showHelp(subcommand);
  process.exit(0);
}

// Default data directories
const dataDir = getFlag('data-dir', process.cwd());
const defaults = getDefaultDirs(dataDir);
const queueDir = getFlag('queue-dir', defaults.queueDir);
const skillsDir = getFlag('skills-dir', defaults.skillsDir);
const kwDir = getFlag('kw-dir', defaults.kwDir);

const queue = new PromptRequestQueue(queueDir);
const monitor = new SkillMonitor(skillsDir);
const watcher = new KnowledgeWatcher(kwDir);

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case 'slats": {
    output(queue.stats());
    break;
  }

  case 'paths': {
    output(describeResolvedPaths(dataDir, queueDir, skillsDir, kwDir));
    break;
  }