# Architecture Deep Dive

> **Agent Skill Bus** -- A self-improving task orchestration framework for AI agent systems.
> Zero dependencies. Framework-agnostic. JSONL-native.

**Target audience:** Senior engineers evaluating agent-skill-bus for production multi-agent deployments.

**Version:** 1.3.0 | **Runtime:** Node.js >= 18 (ESM) | **License:** MIT

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Module Architecture](#2-module-architecture)
3. [Data Flow Between Modules](#3-data-flow-between-modules)
4. [JSONL Data Layer Design](#4-jsonl-data-layer-design)
5. [File Locking Mechanism](#5-file-locking-mechanism)
6. [DAG Task Scheduling Algorithm](#6-dag-task-scheduling-algorithm)
7. [Self-Improving Loop: The 7-Step Cycle](#7-self-improving-loop-the-7-step-cycle)
8. [Knowledge Watcher Tiers](#8-knowledge-watcher-tiers)
9. [Integration Points](#9-integration-points)
10. [Design Decisions](#10-design-decisions)
11. [Failure Modes and Recovery](#11-failure-modes-and-recovery)
12. [Performance Characteristics](#12-performance-characteristics)

---

## 1. System Overview

Agent Skill Bus is a **complementary infrastructure layer** for multi-agent AI systems. It does not replace execution frameworks like LangGraph, CrewAI, or AutoGen -- it sits alongside them and adds three capabilities that no mainstream framework provides: a unified task queue with DAG scheduling, continuous skill health monitoring with self-improving agent skills, and automated external change detection (skill degradation detection).

### High-Level Architecture

```
                        ┌─────────────────────────────────────────────────────────────┐
                        │                     Agent Skill Bus                         │
                        │                                                             │
   External Sources     │  ┌──────────────────┐   ┌──────────────────┐   ┌──────────┐│
                        │  │                  │   │                  │   │          ││
   API changelogs ──────┼─>│  Knowledge       │──>│  Prompt Request  │──>│  Self-   ││
   Dep versions ────────┼─>│  Watcher         │   │  Bus             │   │Improving ││
   Community signals ───┼─>│  (SCAN/ASSESS/   │   │  (ENQUEUE/DAG/   │   │  Skills  ││
   Platform updates ────┼─>│   REQUEST)       │   │   LOCK/DISPATCH) │   │  (7-step ││
                        │  │                  │   │                  │   │   loop)  ││
                        │  └────────┬─────────┘   └────────┬─────────┘   └────┬─────┘│
                        │           │                      │                  │      │
                        │           └──────────────────────┼──────────────────┘      │
                        │                                  │                         │
                        │                    ┌─────────────┴──────────────┐           │
                        │                    │    JSONL Data Layer        │           │
                        │                    │                           │           │
                        │                    │  prompt-request-queue.jsonl│           │
                        │                    │  active-locks.jsonl       │           │
                        │                    │  dag-state.jsonl          │           │
                        │                    │  skill-runs.jsonl         │           │
                        │                    │  skill-health.json        │           │
                        │                    │  knowledge-state.json     │           │
                        │                    │  knowledge-diffs.jsonl    │           │
                        │                    │  skill-improvements.md    │           │
                        │                    │  prompt-request-history.md│           │
                        │                    └───────────────────────────┘           │
                        └──────────────────────────────┬────────────────────────────┘
                                                       │
                                  ┌────────────────────┼────────────────────┐
                                  │                    │                    │
                                  ▼                    ▼                    ▼
                           ┌──────────┐         ┌──────────┐        ┌──────────┐
                           │ OpenClaw │         │ Claude   │        │ LangGraph│
                           │ (native) │         │ Code/    │        │ CrewAI   │
                           │          │         │ Codex    │        │ AutoGen  │
                           └──────────┘         └──────────┘        └──────────┘
                              Your agent framework (any)
```

### Module Independence

Each module is **fully standalone**. You can adopt one, two, or all three:

| Module | Entry Class | Data Files | Can Run Without Others |
|--------|-------------|------------|------------------------|
| Prompt Request Bus | `PromptRequestQueue` | `prompt-request-queue.jsonl`, `active-locks.jsonl`, `dag-state.jsonl` | Yes |
| Self-Improving Skills | `SkillMonitor` | `skill-runs.jsonl`, `skill-health.json`, `skill-improvements.md` | Yes |
| Knowledge Watcher | `KnowledgeWatcher` | `knowledge-state.json`, `knowledge-diffs.jsonl` | Yes |

When combined, they form a **closed-loop self-improving agent system** where external changes are detected, routed through a priority queue, executed by agents, monitored for quality, and automatically repaired when skill degradation is detected.

---

## 2. Module Architecture

### 2.1 Prompt Request Bus

The Prompt Request Bus is a JSONL-based task queue with four core capabilities: DAG dependency resolution, file-level locking with TTL-based deadlock prevention, priority-based routing, and deduplication.

```
                     ┌─────────────────────────────────────────────┐
                     │            Prompt Request Bus               │
                     │                                             │
  Sources:           │  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
  human ─────────────┼─>│         │  │          │  │           │  │
  cron ──────────────┼─>│ ENQUEUE │─>│ DAG      │─>│ DISPATCH  │──┼──> Agent
  webhook ───────────┼─>│ (dedup) │  │ RESOLVE  │  │ (lock +   │  │    Execution
  knowledge-watcher ─┼─>│         │  │          │  │  priority) │  │
  self-improve ──────┼─>│         │  │          │  │           │  │
                     │  └─────────┘  └──────────┘  └───────────┘  │
                     │       │             │              │        │
                     │       ▼             ▼              ▼        │
                     │  queue.jsonl   dag-state.jsonl  locks.jsonl │
                     └─────────────────────────────────────────────┘
```

**Key implementation class:** `PromptRequestQueue` in `src/queue.js`

```javascript
// src/queue.js -- Constructor establishes the data directory contract
export class PromptRequestQueue {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.queueFile = join(dataDir, 'prompt-request-queue.jsonl');
    this.locksFile = join(dataDir, 'active-locks.jsonl');
    this.dagFile = join(dataDir, 'dag-state.jsonl');
    this.historyFile = join(dataDir, 'prompt-request-history.md');
  }
  // ...
}
```

### 2.2 Self-Improving Skills

The skill quality monitoring engine. It observes execution results, detects declining performance, diagnoses root causes, and applies fixes -- either automatically or by surfacing proposals for human review.

```
                ┌─────────────────────────────────────────────────┐
                │          Self-Improving Skills Loop              │
                │                                                 │
  skill-runs    │                                                 │
  .jsonl ───────┼──> 1.OBSERVE ──> 2.ANALYZE ──> 3.DIAGNOSE      │
                │                                      │          │
                │         7.RECORD <── 6.APPLY <── 5.EVALUATE     │
                │             │                        │          │
                │             ▼                   4.PROPOSE       │
                │    skill-improvements.md                        │
                │    skill-health.json                            │
                └─────────────────────────────────────────────────┘
```

**Key implementation class:** `SkillMonitor` in `src/self-improve.js`

### 2.3 Knowledge Watcher

The external change detector. It monitors knowledge sources at three tiers of frequency, detects diffs from known baselines, and generates Prompt Requests for the bus.

```
                ┌───────────────────────────────────────────────┐
                │           Knowledge Watcher                   │
                │                                               │
  External      │  ┌───────┐    ┌────────┐    ┌──────────┐     │
  sources ──────┼─>│ SCAN  │───>│ ASSESS │───>│ REQUEST  │─────┼──> queue.jsonl
                │  │(diff) │    │(impact)│    │(generate │     │
                │  └───────┘    └────────┘    │ PR)      │     │
                │      │                      └──────────┘     │
                │      ▼                                       │
                │  knowledge-state.json                        │
                │  knowledge-diffs.jsonl                        │
                └───────────────────────────────────────────────┘
```

**Key implementation class:** `KnowledgeWatcher` in `src/knowledge-watcher.js`

---

## 3. Data Flow Between Modules

The three modules communicate exclusively through JSONL flat files. There are no in-process message buses, no shared memory, no RPC calls. This makes the system resilient to process restarts, framework changes, and language boundaries.

### 3.1 Primary Data Flow

```
  ┌──────────────┐        knowledge-diffs.jsonl        ┌──────────────────┐
  │  Knowledge   │ ─────────────────────────────────── │  Self-Improving  │
  │  Watcher     │    (external diffs feed into        │  Skills          │
  │              │     DIAGNOSE as root causes)        │                  │
  └──────┬───────┘                                     └────────┬─────────┘
         │                                                      │
         │ Prompt Request                         Prompt Request │
         │ (source: "knowledge-watcher")  (source: "self-improve")
         │                                                      │
         ▼                                                      ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                      prompt-request-queue.jsonl                      │
  │                                                                      │
  │  All sources converge here. Unified routing, priority, DAG, locks.   │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼ dispatch
                              Agent Execution
                                     │
                                     ▼ record result
                              skill-runs.jsonl
                                     │
                                     ▼ analyze
                              skill-health.json
                                     │
                     ┌───────────────┴────────────────┐
                     │                                │
                     ▼                                ▼
              Score healthy?                   Score degrading?
              (no action)                      (trigger DIAGNOSE)
```

### 3.2 Cross-Module Interactions

| From | To | Mechanism | Trigger |
|------|----|-----------|---------|
| Knowledge Watcher | Prompt Request Bus | Append to `queue.jsonl` with `source: "knowledge-watcher"` | External diff detected |
| Self-Improving Skills | Prompt Request Bus | Append to `queue.jsonl` with `source: "self-improve"` | Skill flagged for repair |
| Prompt Request Bus | Self-Improving Skills | Agent appends to `skill-runs.jsonl` after task completion | Every task execution |
| Knowledge Watcher | Self-Improving Skills | Read `knowledge-diffs.jsonl` during DIAGNOSE step | Correlation of external changes with skill failures |

### 3.3 The Closed Loop

The complete feedback loop in a production system:

```
1. Knowledge Watcher detects: "API v2 deprecated"
     │
2.   └──> Generates PR: { source: "knowledge-watcher", priority: "high",
                           task: "Update api-caller skill: v2 endpoint removed" }
     │
3.   └──> Prompt Request Bus routes to target agent
     │
4.   └──> Agent executes the fix, records to skill-runs.jsonl
     │
5.   └──> Self-Improving Skills analyzes: score improved? trend stabilized?
     │
6a.  └──> YES: Record improvement to skill-improvements.md. Done.
6b.  └──> NO:  Re-diagnose with richer context (knowledge-diffs + recent failures),
               generate a new PR. Back to step 3.
```

---

## 4. JSONL Data Layer Design

### 4.1 Why Flat Files

See [Section 10: Design Decisions](#10-design-decisions) for the full rationale. In short: JSONL files require zero infrastructure (no database, no message broker, no Redis), survive process restarts without data loss, are human-readable and `grep`-able, and can be read/written from any language or framework with a single `appendFileSync` call.

### 4.2 File Inventory

| File | Module | Format | Access Pattern | Retention |
|------|--------|--------|----------------|-----------|
| `prompt-request-queue.jsonl` | Bus | JSONL (1 line per PR) | Append + full rewrite on status change | 100 entries max |
| `active-locks.jsonl` | Bus | JSONL (1 line per lock) | Append + full rewrite on release | Transient |
| `dag-state.jsonl` | Bus | JSONL (1 line per DAG) | Full rewrite on DAG update | Until DAG completes |
| `prompt-request-history.md` | Bus | Markdown | Append-only | Indefinite (audit trail) |
| `skill-runs.jsonl` | Self-Improving | JSONL (1 line per run) | Append-only | Rolling (analyzed over 7d/30d windows) |
| `skill-health.json` | Self-Improving | JSON (single object) | Full rewrite | Latest snapshot |
| `skill-improvements.md` | Self-Improving | Markdown | Append-only | Indefinite (audit trail) |
| `knowledge-state.json` | Watcher | JSON (single object) | Full rewrite | Latest snapshot |
| `knowledge-diffs.jsonl` | Watcher | JSONL (1 line per diff) | Append + rewrite on mark processed | Indefinite |

### 4.3 Schema: Prompt Request

Every action in the system -- human commands, cron triggers, webhook events, internal improvement requests -- becomes a **Prompt Request** in a single normalized format:

```jsonc
{
  "id": "pr-1710749200000-a1b2c3d4",    // Unique ID: "pr-" + epoch + "-" + UUID fragment
  "ts": "2026-03-18T08:00:00.000Z",     // ISO 8601 creation timestamp
  "source": "human",                     // Origin: human|cron|webhook|knowledge-watcher|self-improve|dag
  "priority": "high",                    // Execution order: critical|high|medium|low
  "agent": "dev-agent",                  // Target agent identifier
  "task": "Fix authentication bug",      // Human-readable task description
  "context": "Users report 401 errors",  // Background / trigger reason
  "affectedSkills": ["api-caller"],      // Skills this PR relates to
  "affectedFiles": ["myapp:src/auth.ts"],// Files this PR will modify (repo:path format)
  "deadline": "24h",                     // Urgency: immediate|24h|week-end|next-cycle|none
  "status": "queued",                    // Lifecycle: queued|running|done|failed|deferred|blocked
  "result": null,                        // Completion result or error message
  "dependsOn": [],                       // PR IDs that must complete first (DAG edges)
  "dagId": null                          // DAG group ID (null for standalone tasks)
}
```

**ID generation** uses epoch milliseconds concatenated with a UUID fragment to ensure uniqueness without coordination:

```javascript
// src/queue.js
const pr = {
  id: `pr-${Date.now()}-${randomUUID().slice(0, 8)}`,
  // ...
};
```

### 4.4 Schema: Skill Run

The execution log that powers self-improving agent skills and agent skill health monitoring:

```jsonc
{
  "ts": "2026-03-18T12:05:00Z",     // When the skill was executed
  "agent": "my-agent",               // Which agent ran it
  "skill": "api-caller",             // Skill identifier
  "task": "fetch user data",         // What was attempted
  "result": "fail",                  // Outcome: success|partial|fail
  "score": 0.0,                      // Quality score 0.0-1.0 (clamped)
  "notes": "401 Unauthorized"        // Error details, context
}
```

Score clamping is enforced at write time:

```javascript
// src/self-improve.js
recordRun({ agent, skill, task, result, score, notes = '' }) {
  const entry = {
    ts: new Date().toISOString(),
    agent, skill, task, result,
    score: Math.max(0, Math.min(1, score)),  // Clamp to [0, 1]
    notes,
  };
  appendJsonl(this.runsFile, entry);
  return entry;
}
```

### 4.5 Schema: Lock Entry

File-level lock with TTL for deadlock prevention:

```jsonc
{
  "agent": "dev-agent",                  // Lock holder
  "files": ["myapp:src/auth.ts"],        // Locked files (repo:path format)
  "prId": "pr-1710749200000-a1b2c3d4",   // Associated Prompt Request
  "lockedAt": "2026-03-18T06:00:00Z",    // Lock acquisition time
  "ttl": 7200                            // Time-to-live in seconds (default: 2 hours)
}
```

### 4.6 Schema: Knowledge Diff

Detected external change with impact metadata:

```jsonc
{
  "ts": "2026-03-18T05:30:00Z",          // Detection timestamp
  "source": "api-service",               // Knowledge source identifier
  "type": "breaking_change",             // Change type: version_change|breaking_change|deprecation|...
  "detail": "auth endpoint moved to /v3",// Human-readable description
  "affectedSkills": ["api-caller"],       // Skills impacted (["*"] for global)
  "severity": "high",                    // Impact level: critical|high|medium|low
  "processed": false                     // Has this been routed to the bus?
}
```

### 4.7 Schema: DAG State

Aggregate progress for a task group:

```jsonc
{
  "dagId": "dag-feature-v2",             // DAG identifier
  "updated": "2026-03-18T08:30:00Z",     // Last state change
  "total": 5,                            // Total PRs in this DAG
  "queued": 2,                           // Waiting for dependencies
  "running": 1,                          // Currently executing
  "done": 1,                             // Completed successfully
  "failed": 0,                           // Failed
  "blocked": 1                           // Blocked by a failed dependency
}
```

### 4.8 JSONL Helpers

The entire data layer is built on three functions:

```javascript
// src/queue.js -- The complete JSONL I/O layer

export function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export function writeJsonl(filePath, entries) {
  writeFileSync(filePath,
    entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '')
  );
}

export function appendJsonl(filePath, entry) {
  appendFileSync(filePath, JSON.stringify(entry) + '\n');
}
```

Key properties:
- **`readJsonl`**: Tolerates missing files (returns `[]`), empty files, and trailing newlines.
- **`writeJsonl`**: Full overwrite. Used for status updates where the entire file must be consistent.
- **`appendJsonl`**: Atomic single-line append. Used for new entries (queue, runs, diffs, locks).

---

## 5. File Locking Mechanism

The file locking system prevents two agents from modifying the same source file simultaneously. It operates at the application level using JSONL records -- not OS-level file locks -- which makes it portable across operating systems and agent runtimes.

### 5.1 Lock Lifecycle

```
  PR submitted with affectedFiles: ["myapp:src/auth.ts"]
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ DISPATCH: Can this PR run?                                   │
  │                                                              │
  │  1. Read active-locks.jsonl                                  │
  │  2. Build lockedFiles set from all active locks              │
  │  3. Check: any file in PR.affectedFiles already locked?      │
  │     ├── YES: Skip this PR (try next dispatch cycle)          │
  │     └── NO:  PR is dispatchable                              │
  └──────────────────────────────────────────────────────────────┘
         │ (dispatchable)
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ START EXECUTION: Double-check and acquire                    │
  │                                                              │
  │  1. Re-read active-locks.jsonl (race condition guard)        │
  │  2. Re-verify no conflicts                                  │
  │     ├── CONFLICT: throw Error("Lock conflict: ...")          │
  │     └── CLEAR: append lock to active-locks.jsonl             │
  │  3. Update PR status to "running"                            │
  └──────────────────────────────────────────────────────────────┘
         │ (running)
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ COMPLETION / FAILURE: Release lock                           │
  │                                                              │
  │  1. Remove lock entry from active-locks.jsonl                │
  │  2. Update PR status to "done" or "failed"                  │
  │  3. Update DAG state if applicable                           │
  │  4. Promote dependent PRs whose deps are now satisfied       │
  └──────────────────────────────────────────────────────────────┘
```

### 5.2 Two-Phase Lock Verification

The system checks locks at two points to minimize race conditions:

```javascript
// Phase 1: Dispatch-time filtering (src/queue.js, getDispatchable)
if (pr.affectedFiles.length > 0) {
  const hasConflict = pr.affectedFiles.some(f => lockedFiles.has(f));
  if (hasConflict) continue; // Skip, try next cycle
}

// Phase 2: Execution-time verification (src/queue.js, startExecution)
if (pr.affectedFiles.length > 0) {
  const currentLocks = this.readLocks();
  const lockedFiles = new Set(currentLocks.flatMap(l => l.files));
  const conflicts = pr.affectedFiles.filter(f => lockedFiles.has(f));
  if (conflicts.length > 0) {
    throw new Error(`Lock conflict: files [${conflicts.join(', ')}] are already locked.`);
  }
  // Acquire lock
  const lock = {
    agent: pr.agent,
    files: pr.affectedFiles,
    prId: pr.id,
    lockedAt: new Date().toISOString(),
    ttl: 7200,
  };
  appendJsonl(this.locksFile, lock);
}
```

### 5.3 TTL-Based Deadlock Prevention

If an agent crashes while holding a lock, the lock would be held forever without intervention. The TTL mechanism prevents this:

```javascript
// src/queue.js
releaseExpiredLocks() {
  const locks = this.readLocks();
  const now = Date.now();
  const active = [];
  const expired = [];

  for (const lock of locks) {
    const lockTime = new Date(lock.lockedAt).getTime();
    if (now - lockTime > (lock.ttl || 7200) * 1000) {
      expired.push(lock);
    } else {
      active.push(lock);
    }
  }

  if (expired.length > 0) {
    writeJsonl(this.locksFile, active);
    // Mark expired PRs as failed
    for (const lock of expired) {
      this._updateStatus(lock.prId, 'failed', 'lock_timeout');
    }
  }

  return { released: expired.length, active: active.length };
}
```

**Default TTL: 7200 seconds (2 hours).** This is deliberately generous -- most agent tasks complete in minutes, but long-running operations (large refactors, test suites) need headroom. The `releaseExpiredLocks()` method should be called periodically via cron or at the start of each dispatch cycle.

### 5.4 Lock Granularity

| Granularity | `affectedFiles` Example | Use Case |
|-------------|------------------------|----------|
| **File-level** (default) | `["myapp:src/auth.ts"]` | Targeted edits to specific files |
| **Multi-file** | `["myapp:src/auth.ts", "myapp:src/user.ts"]` | Changes spanning multiple files |
| **Repo-level** | `["myapp:*"]` | Large refactors that touch many files |
| **No lock** | `[]` | Read-only tasks, external API calls |

### 5.5 Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max concurrent locks | 10 | Prevents resource exhaustion in large clusters |
| Lock TTL default | 7200 seconds | Balances long tasks vs. crash recovery |
| Lock TTL for `critical` priority | 7200 seconds (same) | Critical tasks should complete fast, but TTL stays consistent |

---

## 6. DAG Task Scheduling Algorithm

The DAG (Directed Acyclic Graph) scheduler enables complex multi-step tasks where some steps depend on others and independent steps run in parallel.

### 6.1 DAG Construction

When a large task arrives, it is decomposed into subtasks with dependency edges:

```
Input: "Implement user authentication feature"

Decomposition:
  pr-001: DB schema change          dependsOn: []          (root)
  pr-002: Auth module refactor      dependsOn: []          (root)
  pr-003: API endpoints             dependsOn: [001, 002]  (waits for both)
  pr-004: Frontend update           dependsOn: [003]       (sequential)
  pr-005: E2E tests                 dependsOn: [003, 004]  (waits for both)

dagId: "dag-feature-auth"

Visualization:
  pr-001 ─────┐
              ├──> pr-003 ──> pr-004 ──┐
  pr-002 ─────┘                       ├──> pr-005
                          pr-004 ──────┘
```

All PRs in a DAG share the same `dagId`. The `createDag` method enqueues all subtasks atomically:

```javascript
// src/queue.js
createDag(dagId, tasks) {
  const prs = [];
  for (const t of tasks) {
    const pr = this.enqueue({ ...t, dagId });
    if (pr) prs.push(pr);
  }
  this._updateDagState(dagId);
  return prs;
}
```

### 6.2 Dispatch Algorithm

The dispatch algorithm performs topological resolution inline -- it does not pre-compute a topological sort but instead evaluates readiness for each PR at dispatch time:

```
Algorithm: getDispatchable(maxCount)

Input:  All PRs in queue, all active locks
Output: Up to maxCount PRs ready for immediate execution

1. Build index sets:
   - doneIds  = { pr.id | pr.status == "done" }
   - failedIds = { pr.id | pr.status == "failed" }
   - lockedFiles = union of all files in active-locks.jsonl

2. For each PR where status == "queued":
   a. DAG dependency check:
      - If any dependency in failedIds:
          Mark PR as "blocked" (propagate failure)
          Continue to next PR
      - If not all dependencies in doneIds:
          Skip (still waiting)
          Continue to next PR

   b. File lock check:
      - If any file in PR.affectedFiles is in lockedFiles:
          Skip (will retry next cycle)
          Continue to next PR

   c. PR is dispatchable. Add to candidates.

3. Sort candidates:
   - Primary: priority (critical=0, high=1, medium=2, low=3)
   - Secondary: timestamp (oldest first, FIFO within same priority)

4. Return candidates[0..maxCount]
```

### 6.3 Dependency Failure Propagation

When a PR fails, all downstream dependents are marked as `blocked`:

```javascript
// During dispatch -- src/queue.js, getDispatchable()
if (pr.dependsOn.length > 0) {
  const anyFailed = pr.dependsOn.some(depId => failedIds.has(depId));
  if (anyFailed) {
    this._updateStatus(pr.id, 'blocked', 'Dependency failed');
    continue;
  }
}
```

This prevents cascading execution of tasks that can no longer succeed. Blocked PRs remain in the queue for human review.

### 6.4 Auto-Parallelization

Independent subtasks within a DAG execute simultaneously. If pr-001 and pr-002 both have `dependsOn: []`, both are returned by `getDispatchable()` in the same cycle.

```
Timeline for dag-feature-auth:

  Cycle 1: dispatch → [pr-001, pr-002]       (parallel roots)
  Cycle 2: both complete → [pr-003]           (unblocked)
  Cycle 3: pr-003 complete → [pr-004]         (unblocked)
  Cycle 4: pr-004 complete → [pr-005]         (final)
```

### 6.5 DAG State Tracking

Every time a PR in a DAG changes status, the aggregate state is recalculated:

```javascript
// src/queue.js
_updateDagState(dagId) {
  const all = this.readAll().filter(pr => pr.dagId === dagId);
  const state = {
    dagId,
    updated: new Date().toISOString(),
    total: all.length,
    queued:   all.filter(pr => pr.status === 'queued').length,
    running:  all.filter(pr => pr.status === 'running').length,
    done:     all.filter(pr => pr.status === 'done').length,
    failed:   all.filter(pr => pr.status === 'failed').length,
    blocked:  all.filter(pr => pr.status === 'blocked').length,
  };
  // Upsert into dag-state.jsonl
  const dags = readJsonl(this.dagFile);
  const idx = dags.findIndex(d => d.dagId === dagId);
  if (idx >= 0) dags[idx] = state;
  else dags.push(state);
  writeJsonl(this.dagFile, dags);
}
```

### 6.6 Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max PRs per DAG | 20 | Prevents overly complex dependency graphs |
| Max auto-executions per dispatch cycle | 5 | Rate limiting to prevent resource exhaustion |
| Queue size limit | 100 entries | Oldest low-priority entries purged on overflow |
| Circular dependency detection | Implicit | A cycle means no PR ever becomes dispatchable; the DAG stalls and is detected by monitoring |

---

## 7. Self-Improving Loop: The 7-Step Cycle

The self-improving skills system implements a continuous quality feedback loop that detects skill degradation, diagnoses root causes, and applies fixes. This is the core differentiator of agent-skill-bus -- no mainstream framework ships built-in agent skill health monitoring with automatic repair.

### 7.1 The 7 Steps

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │   Step 1: OBSERVE         Read skill-runs.jsonl (last N days)            │
  │      │                                                                   │
  │      ▼                                                                   │
  │   Step 2: ANALYZE         Calculate per-skill metrics:                   │
  │      │                    - avgScore (all-time vs. recent window)        │
  │      │                    - trend: improving|stable|declining|broken     │
  │      │                    - consecutiveFails count                       │
  │      │                    - flagged: score < 0.7 OR declining OR broken  │
  │      ▼                                                                   │
  │   Step 3: DIAGNOSE        For flagged skills:                            │
  │      │                    - Read the SKILL.md (instruction file)         │
  │      │                    - Read recent failure notes                    │
  │      │                    - Cross-reference knowledge-diffs.jsonl        │
  │      │                    - LLM analysis: "What is the root cause?"     │
  │      ▼                                                                   │
  │   Step 4: PROPOSE         Generate 1-3 concrete fixes:                  │
  │      │                    - Fix incorrect instructions                  │
  │      │                    - Add error handling guidance                  │
  │      │                    - Update outdated API references              │
  │      │                    - Add missing prerequisites                   │
  │      ▼                                                                   │
  │   Step 5: EVALUATE        Score each proposal on 3 axes:                │
  │      │                    - Relevance (0-1): addresses the failure?     │
  │      │                    - Safety (0-1): could it break other things?  │
  │      │                    - Effort (0-1): how much change needed?       │
  │      ▼                                                                   │
  │   Step 6: APPLY           Decision gate:                                │
  │      │                    - relevance > 0.7 AND safety > 0.8            │
  │      │                      AND not security-sensitive:                 │
  │      │                        → Auto-apply (edit SKILL.md)              │
  │      │                    - Otherwise:                                  │
  │      │                        → Write proposal, notify human            │
  │      ▼                                                                   │
  │   Step 7: RECORD          Append to skill-improvements.md               │
  │                           Update skill-health.json                      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

### 7.2 OBSERVE Implementation

```javascript
// src/self-improve.js
observe(days = 7) {
  const runs = readJsonl(this.runsFile);
  const cutoff = Date.now() - days * 86400000;
  return runs.filter(r => new Date(r.ts).getTime() > cutoff);
}
```

The observe step reads the raw execution log and applies a time window. The default 7-day window balances recency with statistical significance.

### 7.3 ANALYZE Implementation

The analyze step computes health metrics per skill with trend detection:

```javascript
// src/self-improve.js -- Key analysis logic

// Trend detection: compare recent average against all-time average
let trend = 'stable';
if (recentAvg !== null && avgScore > 0) {
  const delta = recentAvg - avgScore;
  if (delta > 0.05) trend = 'improving';
  else if (delta < -0.05) trend = 'declining';
}
if (s.consecutiveFails >= 3) trend = 'broken';

// Flagging thresholds
report[name] = {
  // ...
  flagged: avgScore < 0.7 || trend === 'declining' || trend === 'broken',
};
```

**Flagging criteria (any triggers a flag):**

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| Average score below threshold | `avgScore < 0.7` | Skill is consistently underperforming |
| Score trend declining | `recentAvg - avgScore < -0.05` | Skill is getting worse over time |
| Consecutive failures | `consecutiveFails >= 3` | Skill is broken (marked as `trend: "broken"`) |

### 7.4 Silent Drift Detection

Drift detection catches skills that were once healthy but are silently degrading -- the most dangerous failure mode because nobody notices until it is too late:

```javascript
// src/self-improve.js
detectDrift() {
  const thisWeek = this.analyze(7);
  // ...calculate last week's averages from 7-14 day window...

  const drifting = [];
  for (const [name, data] of Object.entries(thisWeek)) {
    if (!lastWeek[name] || lastWeek[name].count === 0) continue;
    const lastAvg = lastWeek[name].total / lastWeek[name].count;
    if (data.recentAvg !== null && lastAvg - data.recentAvg > 0.15) {
      drifting.push({
        name,
        lastWeekAvg: +lastAvg.toFixed(3),
        thisWeekAvg: data.recentAvg,
        drop: +(lastAvg - data.recentAvg).toFixed(3),
      });
    }
  }
  return drifting;
}
```

**Drift threshold: >15% score drop week-over-week.** This catches scenarios like:
- An upstream API silently changes its response format
- A model update causes subtle behavior changes
- An authentication token expires and starts producing intermittent failures

### 7.5 Improvement Recording

Every improvement -- whether auto-applied or human-reviewed -- is permanently logged:

```javascript
// src/self-improve.js
recordImprovement({ skill, diagnosis, proposal, action, result }) {
  const line = `\n### ${new Date().toISOString()} -- ${skill}\n` +
    `- **Diagnosis:** ${diagnosis}\n` +
    `- **Proposal:** ${proposal}\n` +
    `- **Action:** ${action}\n` +
    `- **Result:** ${result}\n`;
  appendFileSync(this.improvementsFile, line);
}
```

### 7.6 Safety Constraints

| Constraint | Value | Purpose |
|------------|-------|---------|
| Max auto-edits per skill per day | 1 | Prevents runaway auto-repair loops |
| Auto-apply threshold (relevance) | > 0.7 | Only high-confidence fixes are auto-applied |
| Auto-apply threshold (safety) | > 0.8 | Conservative safety margin |
| Security-sensitive skills | Never auto-apply | Human approval always required |
| All edits logged | Always | Full audit trail in `skill-improvements.md` |
| Rollback mechanism | Git history | Previous SKILL.md versions recoverable via `git log` |

---

## 8. Knowledge Watcher Tiers

The Knowledge Watcher monitors external sources at three tiers of frequency, each targeting a different category of change that could cause skill degradation.

### 8.1 Tier Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                   Knowledge Watcher Tiers                       │
  │                                                                 │
  │  Tier 1: DIRECT IMPACT (every check cycle / every 6h)          │
  │  ├── Dependency versions (npm view, pip show)                  │
  │  ├── API changelogs (fetch changelog URLs)                     │
  │  ├── Config drift (compare current vs. expected state)         │
  │  └── Internal issues (issue tracker queries)                   │
  │                                                                 │
  │  Tier 2: INDIRECT IMPACT (daily)                               │
  │  ├── Community channels (recurring user complaints)            │
  │  ├── Support patterns (FAQ frequency analysis)                 │
  │  └── Platform changes (provider status/policy pages)           │
  │                                                                 │
  │  Tier 3: TRENDS (weekly)                                       │
  │  ├── Tech blogs (new best practices via web search)            │
  │  ├── Competitor releases (feature parity gap detection)        │
  │  └── Industry trends (paradigm shifts via curated RSS)         │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

### 8.2 Tier Scheduling

| Tier | Frequency | Max API Calls per Cycle | Notification Policy |
|------|-----------|-------------------------|---------------------|
| Tier 1 | Every 6 hours | Unlimited (local checks) | Critical = immediate, High = batch |
| Tier 2 | Twice daily (morning + evening) | 3 web searches | Batch with daily summary |
| Tier 3 | Once weekly (Monday morning) | 3 web searches | Weekly digest |

### 8.3 The Check Flow

The `KnowledgeWatcher.check()` method accepts a user-provided checker function, making it fully extensible:

```javascript
// src/knowledge-watcher.js
async check(sourceId, checkerFn) {
  const state = this.readState();
  const previousState = state.sources[sourceId] || {};

  // User-provided checker runs the actual detection logic
  const currentState = await checkerFn(previousState);

  if (!currentState) return null; // No change

  // Built-in version change detection
  if (currentState.version && previousState.version
      && currentState.version !== previousState.version) {
    const diff = this.recordDiff({
      source: sourceId,
      type: 'version_change',
      detail: `${previousState.version} -> ${currentState.version}`,
      affectedSkills: currentState.affectedSkills || ['*'],
      severity: currentState.severity || 'medium',
    });
  }

  // Custom diffs (user-defined change types)
  if (currentState.customDiffs) {
    for (const cd of currentState.customDiffs) {
      this.recordDiff({ source: sourceId, ...cd });
    }
  }

  this.updateSource(sourceId, currentState);
  return { sourceId, diffs, previousState, currentState };
}
```

### 8.4 Usage Example: Monitoring a Framework Version

```javascript
import { KnowledgeWatcher } from 'agent-skill-bus';

const watcher = new KnowledgeWatcher('./skills/knowledge-watcher');

// Tier 1 check: detect framework version changes
const result = await watcher.check('next-framework', async (previous) => {
  const { execSync } = await import('node:child_process');
  const version = execSync('npm view next version', { encoding: 'utf-8' }).trim();

  if (version === previous.version) return null; // No change

  return {
    version,
    affectedSkills: ['*'],       // All skills may be affected
    severity: version.startsWith(previous.version?.split('.')[0])
      ? 'medium'                 // Minor/patch update
      : 'critical',              // Major version change
  };
});
```

### 8.5 Severity-Based Routing

| Severity | Action | Priority in Bus | Human Notification |
|----------|--------|----------------|-------------------|
| `critical` | Immediate PR generation + human alert | `critical` | Immediate |
| `high` | PR generation + batch notification | `high` | Next batch |
| `medium` | PR generation, queued normally | `medium` | Daily summary |
| `low` | Log only, included in reports | N/A (no PR) | Weekly digest |

### 8.6 Knowledge Watcher Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max web searches per check cycle | 3 | Respect rate limits, minimize cost |
| Critical diffs | Immediate notification | Time-sensitive (API removals, auth changes) |
| All diffs stored | Indefinitely | Audit trail and correlation with skill failures |

---

## 9. Integration Points

### 9.1 Framework Integration Matrix

Agent Skill Bus integrates with any agent framework through its file-based data layer. No SDKs, no adapters, no plugins -- just read and write JSONL.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Integration Architecture                        │
│                                                                     │
│  Framework         Integration Point          Data Format           │
│  ─────────         ─────────────────          ───────────           │
│  OpenClaw          Native skill dispatch      JSONL files           │
│  Claude Code       .claude/skills/ SKILL.md   JSONL + markdown      │
│  Codex             .codex/skills/ SKILL.md    JSONL + markdown      │
│  LangGraph         Tool functions             JSONL via fs module   │
│  CrewAI            Task callbacks             JSONL via subprocess  │
│  AutoGen           GroupChat hooks            JSONL via any method  │
│  Mastra            Sidecar process            JSONL via fs module   │
│  Custom            Direct file I/O            JSONL (it's files)    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Integration Pattern: Post-Execution Hook

The simplest integration is a post-execution hook. After any agent completes a task, it records the result:

```bash
# CLI integration (works from any language, any framework)
npx agent-skill-bus record-run \
  --agent my-agent \
  --skill api-caller \
  --task "fetch user data" \
  --result success \
  --score 0.95

# Or for failures:
npx agent-skill-bus record-run \
  --agent my-agent \
  --skill api-caller \
  --task "fetch user data" \
  --result fail \
  --score 0.0 \
  --notes "401 Unauthorized - token expired"
```

### 9.3 Integration Pattern: Task Queue Consumer

An agent framework can consume tasks from the Prompt Request Bus:

```javascript
import { PromptRequestQueue } from 'agent-skill-bus';

const queue = new PromptRequestQueue('./skills/prompt-request-bus');

// Poll for dispatchable tasks
const tasks = queue.getDispatchable(3);

for (const task of tasks) {
  // Acquire lock and mark running
  queue.startExecution(task.id);

  try {
    // Your framework executes the task
    const result = await yourFramework.execute(task);

    // Mark complete and release lock
    queue.complete(task.id, result);
  } catch (err) {
    // Mark failed and release lock
    queue.fail(task.id, err.message);
  }
}
```

### 9.4 Integration Pattern: Claude Code / Codex Skills

Drop the SKILL.md files into your skills directory. Agents read the instructions and know how to interact with the JSONL files:

```
.claude/skills/
  prompt-request-bus/
    SKILL.md           # Instructions for the agent
  self-improving-skills/
    SKILL.md           # Instructions for the agent
  knowledge-watcher/
    SKILL.md           # Instructions for the agent
```

The agent reads SKILL.md, understands the JSONL schema, and autonomously manages the queue, records runs, and responds to flagged skills.

### 9.5 Integration Pattern: Cron-Based Monitoring

```cron
# Tier 1 knowledge checks every 6 hours
0 */6 * * * cd /path/to/project && npx agent-skill-bus locks --release-expired

# Daily health check
0 9 * * * cd /path/to/project && npx agent-skill-bus health --days 7

# Weekly drift detection
0 9 * * 1 cd /path/to/project && npx agent-skill-bus drift
```

### 9.6 Programmatic API

The full API surface exported from `src/index.js`:

```javascript
// src/index.js
export { PromptRequestQueue, readJsonl, writeJsonl, appendJsonl } from './queue.js';
export { SkillMonitor } from './self-improve.js';
export { KnowledgeWatcher } from './knowledge-watcher.js';
```

| Class | Key Methods |
|-------|-------------|
| `PromptRequestQueue` | `enqueue()`, `getDispatchable()`, `startExecution()`, `complete()`, `fail()`, `createDag()`, `getDagState()`, `releaseExpiredLocks()`, `stats()` |
| `SkillMonitor` | `observe()`, `analyze()`, `getFlagged()`, `recordRun()`, `updateHealth()`, `readHealth()`, `recordImprovement()`, `detectDrift()` |
| `KnowledgeWatcher` | `readState()`, `updateSource()`, `recordDiff()`, `getUnprocessed()`, `getBySeverity()`, `markProcessed()`, `check()`, `stats()` |
| Helpers | `readJsonl()`, `writeJsonl()`, `appendJsonl()` |

---

## 10. Design Decisions

### 10.1 Why JSONL (Not SQLite, Redis, or PostgreSQL)

| Concern | JSONL | SQLite | Redis | PostgreSQL |
|---------|-------|--------|-------|------------|
| **Zero dependencies** | Yes | Requires native module | Requires server | Requires server |
| **Human readable** | Yes (`cat`, `grep`, `jq`) | No (binary) | No (protocol) | No (protocol) |
| **Framework agnostic** | Yes (any language reads files) | Partial (needs binding) | No (needs client) | No (needs client) |
| **Process restart survival** | Yes (files on disk) | Yes | Configurable | Yes |
| **Concurrent write safety** | Append is atomic on POSIX | WAL mode needed | Built-in | Built-in |
| **Debuggability** | `tail -f queue.jsonl` | SQL queries | `redis-cli MONITOR` | SQL queries |
| **Cross-node support** | Shared filesystem / git | Same | Network protocol | Network protocol |
| **Setup time** | 0 seconds | npm install | Redis server + config | DB server + schema |

**The decisive factor:** Agent Skill Bus targets teams running heterogeneous agent systems -- OpenClaw on Windows, Claude Code on macOS, Codex in a sandbox, LangGraph in Python. JSONL is the only format that all of these can natively produce and consume without any shared runtime.

### 10.2 Why Zero Dependencies

```json
// package.json -- dependencies section
// (empty -- there are none)
```

The entire framework uses only Node.js built-in modules:
- `node:fs` (readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync)
- `node:crypto` (randomUUID)
- `node:path` (join, resolve)
- `node:os` (tmpdir -- tests only)
- `node:test` (test runner -- tests only)

**Why this matters:**
1. **No supply chain risk.** Zero `node_modules` means zero CVEs from transitive dependencies.
2. **No version conflicts.** Agent frameworks already have deep dependency trees. Adding more creates diamond dependency hell.
3. **Instant installation.** `npm install agent-skill-bus` adds exactly one package. No native compilation. No postinstall scripts.
4. **Long-term stability.** Node.js built-ins have backward compatibility guarantees. Third-party libraries do not.

### 10.3 Why Framework-Agnostic

Most agent skill monitoring solutions are tightly coupled to a specific framework (LangSmith for LangChain, CrewAI's built-in logging). This means:
- Switching frameworks requires rebuilding monitoring infrastructure
- Multi-framework deployments (common in production) cannot share a single quality dashboard
- Framework updates can break monitoring

Agent Skill Bus avoids this by operating at the **file system level**. Any process that can write a line to a JSONL file can participate. This includes shell scripts, Python processes, Go binaries, and manual `echo` commands.

### 10.4 Why Append-Only for Execution Logs

`skill-runs.jsonl` is append-only by design:
- **Immutable audit trail.** You can always reconstruct the complete history of every skill execution.
- **No data loss from concurrent writes.** Multiple agents can append simultaneously without coordination.
- **Simple backup.** Copy the file.
- **Stream processing friendly.** `tail -f skill-runs.jsonl` for real-time monitoring.

Status updates in `prompt-request-queue.jsonl` use full rewrite (`writeJsonl`) because status is mutable state that must be consistent. This is a deliberate trade-off: status updates are less frequent (one per PR lifecycle transition) and require read-modify-write atomicity.

### 10.5 Why File-Level Locking (Not OS Locks)

OS-level file locks (`flock`, `lockf`) are not portable across platforms and do not survive process crashes cleanly. Application-level locks stored in JSONL:
- Are visible to all processes (any agent can read `active-locks.jsonl`)
- Have explicit TTLs for deadlock recovery
- Are debuggable (human-readable JSON)
- Work identically on Linux, macOS, and Windows

The trade-off is that application-level locks are not atomic between the "check" and "acquire" steps. The two-phase verification (check at dispatch time, re-check at execution time) minimizes this window.

---

## 11. Failure Modes and Recovery

### 11.1 Agent Crash During Execution

**Symptom:** PR stuck in `running` state; lock held indefinitely.

**Recovery:** `releaseExpiredLocks()` detects locks older than TTL and:
1. Removes the lock entry from `active-locks.jsonl`
2. Marks the associated PR as `failed` with reason `lock_timeout`
3. Unblocks any PRs that were waiting for the locked files

```bash
# Manual recovery
npx agent-skill-bus locks --release-expired
```

### 11.2 Queue File Corruption

**Symptom:** `readJsonl()` throws JSON parse error.

**Recovery:** Because JSONL is line-delimited, corruption typically affects a single line. Remove the corrupted line with a text editor or `sed`. All other entries remain valid. History can be reconstructed from `prompt-request-history.md` (append-only markdown log).

### 11.3 DAG Stall (All PRs Blocked)

**Symptom:** No dispatchable PRs; DAG state shows all entries as `blocked` or `queued` with unmet dependencies.

**Diagnosis:**
1. Check for circular dependencies (PR A depends on PR B which depends on PR A).
2. Check for a failed root task that blocked the entire tree.

**Recovery:** Manually update the failed PR's status or remove the cycle.

### 11.4 Skill Self-Improvement Loop Runaway

**Symptom:** Skill is auto-edited repeatedly without improvement.

**Prevention:** The "max 1 auto-edit per skill per day" constraint prevents this. After one auto-edit, subsequent proposals are logged but require human approval.

### 11.5 Knowledge Watcher Rate Limiting

**Symptom:** External API calls fail with 429 Too Many Requests.

**Prevention:** Max 3 web searches per check cycle. Tier 2 and Tier 3 checks run infrequently (daily/weekly). All detection results are cached in `knowledge-state.json` to avoid redundant checks.

---

## 12. Performance Characteristics

### 12.1 Scalability Profile

| Dimension | Tested Range | Bottleneck |
|-----------|-------------|------------|
| Queue size | 1 - 100 PRs | Full rewrite on status change: O(n) for n entries |
| Concurrent agents | 1 - 42 | File I/O serialization (single-node) |
| Skill runs | 1 - 10,000+ entries | `readJsonl` reads entire file: O(n) |
| DAG depth | 1 - 20 PRs per DAG | Dependency check: O(n * d) for n PRs and d deps |
| Lock count | 1 - 10 | Set lookup: O(1) per file check |

### 12.2 Production Benchmarks

From the production deployment at LLC Miyabi (42 agents, 27 tasks/day):

| Operation | Typical Latency | File Size at Steady State |
|-----------|----------------|--------------------------|
| `enqueue()` | < 5ms | queue.jsonl: ~50KB |
| `getDispatchable()` | < 20ms | Reads queue + locks |
| `startExecution()` | < 10ms | Appends lock + rewrites queue |
| `recordRun()` | < 3ms | Single append |
| `analyze(7)` | < 50ms | Reads all runs, computes per-skill |
| `detectDrift()` | < 100ms | Two-pass over runs |
| `dashboard` (CLI) | < 200ms | Reads + analyzes + renders |

### 12.3 When to Outgrow JSONL

Agent Skill Bus is designed for single-node or small-cluster deployments. Consider migrating the data layer if:

- **Queue exceeds 1,000 entries.** Full rewrite on status change becomes expensive.
- **Skill runs exceed 100,000 entries.** `readJsonl` reads the entire file into memory.
- **Multiple nodes need real-time consistency.** JSONL on a shared filesystem has no transaction guarantees.
- **You need sub-second dispatch latency.** File I/O adds 5-20ms per operation.

The migration path is straightforward: replace `readJsonl`/`writeJsonl`/`appendJsonl` with database calls. The schema is already normalized.

---

## Appendix A: CLI Command Reference

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `init` | Initialize data directories and files | `--dir <path>` |
| `enqueue` | Add a Prompt Request | `--source`, `--priority`, `--agent`, `--task`, `--files`, `--depends-on`, `--dag-id` |
| `dispatch` | Get next dispatchable PRs | `--max <N>` |
| `start <id>` | Acquire locks, set PR to running | |
| `complete <id>` | Release locks, set PR to done | `--result` |
| `fail <id>` | Release locks, set PR to failed | `--reason` |
| `stats` | Queue statistics | |
| `locks` | Show or clean active locks | `--release-expired` |
| `dag <id>` | Show DAG group state | |
| `record-run` | Log a skill execution | `--agent`, `--skill`, `--task`, `--result`, `--score`, `--notes` |
| `health` | Update and show skill health | `--days <N>` |
| `flagged` | List skills needing attention | `--days <N>` |
| `drift` | Detect silent score degradation | |
| `dashboard` | Visual health dashboard | `--days <N>`, `--no-color` |
| `diffs` | Knowledge diff statistics | `--unprocessed` |

## Appendix B: File Layout After `init`

```
your-project/
  skills/
    prompt-request-bus/
      SKILL.md                        # Agent instructions
      prompt-request-queue.jsonl      # Task queue (empty)
      active-locks.jsonl              # File locks (empty)
      dag-state.jsonl                 # DAG progress (empty)
      prompt-request-history.md       # Completed task log
    self-improving-skills/
      SKILL.md                        # Agent instructions
      skill-runs.jsonl                # Execution log (empty)
      skill-health.json               # Health snapshot
      skill-improvements.md           # Improvement audit trail
    knowledge-watcher/
      SKILL.md                        # Agent instructions
      knowledge-state.json            # Source baseline
      knowledge-diffs.jsonl           # Detected changes (empty)
```

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Prompt Request (PR)** | A normalized task entry in the queue. Not a GitHub Pull Request. |
| **DAG** | Directed Acyclic Graph -- a set of PRs with dependency relationships. |
| **Flagged Skill** | A skill whose health metrics crossed the alert threshold. |
| **Drift** | Silent degradation where a skill's score drops >15% week-over-week without obvious errors. |
| **Knowledge Diff** | A detected change in an external source that may impact skill quality. |
| **TTL** | Time-To-Live -- the maximum duration a file lock can be held before automatic release. |
| **Closed Loop** | The cycle where external changes are detected, routed, executed, monitored, and repaired automatically. |

---

*Built by [LLC Miyabi](https://miyabi-ai.jp). Running 42 AI agents in production daily.*
