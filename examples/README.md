# Examples

Runnable examples for `agent-skill-bus`. Each file is self-contained — it creates its own temporary data directory and leaves no residue.

## Prerequisites

```bash
npm install -g agent-skill-bus   # or: npx agent-skill-bus
node --version                   # requires Node.js >= 18
```

## Index

| File | What it shows |
|------|--------------|
| [`basic-usage.js`](./basic-usage.js) | Quick start: queue + dispatch + skill monitoring in one script |
| [`basic-dag-queue.js`](./basic-dag-queue.js) | Core DAG scheduler: enqueue tasks with `dependsOn`, dispatch them in dependency order |
| [`skill-monitoring.js`](./skill-monitoring.js) | SkillMonitor 7-step loop: record runs, detect degradation, generate repair proposals |
| [`full-pipeline.js`](./full-pipeline.js) | All three modules in a closed loop: change detection → task queue → quality monitoring |

### Framework Integration Guides

| File | Framework |
|------|-----------|
| [`claude-code-integration.md`](./claude-code-integration.md) | Claude Code / Codex — add to CLAUDE.md, auto-record after tasks |
| [`langchain-integration.md`](./langchain-integration.md) | LangChain / LangGraph — callback handler, tool wrapping, direct JSONL |
| [`crewai-integration.md`](./crewai-integration.md) | CrewAI — per-agent tracking, tool-level recording, self-healing |

---

## basic-dag-queue.js

**Concepts covered:** `enqueue`, `dependsOn`, `getDispatchable`, `startExecution`, `complete`, `stats`

```
fetch-data  ──┐
              ├──► process-data ──► generate-report
fetch-meta  ──┘
```

Tasks `fetch-data` and `fetch-meta` are independent and dispatch together in Round 1.
`process-data` waits until both finish (Round 2).
`generate-report` runs last (Round 3).

```bash
node examples/basic-dag-queue.js
```

Expected output:
```
Queued tasks: [pr-... (fetch-data), pr-... (fetch-meta), ...]
Round 1 — dispatchable: fetch-data, fetch-meta
  ▶ running  : fetch-data
  ✓ completed: fetch-data
  ...
Round 2 — dispatchable: process-data
Round 3 — dispatchable: generate-report
Final queue stats: { total: 4, byStatus: { done: 4 }, activeLocks: 0 }
```

---

## skill-monitoring.js

**Concepts covered:** `recordRun`, `analyze`, `getFlagged`, `detectDrift`, `updateHealth`, `recordImprovement`

Simulates an `article-drafter` skill that starts healthy (score ~0.9) and then regrades
(three consecutive failures, score ~0.5). The monitor flags it, diagnoses the cause, and
records a repair proposal in `skill-improvements.md`.

```bash
node examples/skill-monitoring.js
```

Expected output:
```
Recorded 9 skill runs for "article-drafter".

Health report for "article-drafter":
  avgScore       : 0.733
  recentAvg      : 0.56
  trend          : declining
  consecutiveFails: 3
  flagged        : true

Flagged skills requiring repair:
  Skill    : article-drafter
  Diagnosis: Consecutive failures — prompt likely broken
  Proposal : Revert to last known-good prompt version ...
```

---

## full-pipeline.js

**Concepts covered:** all three modules together in an event-driven closed loop

```
KnowledgeWatcher.check()
    │  detected: openai-sdk 4.20.0 → 4.28.0
    ▼
PromptRequestQueue.enqueue() × 2 skills
    │
    ▼
(execute repairs)
    │  chat-completer: ✓ success (0.91)
    │  embedding-builder: ✗ fail  (0.52)
    ▼
SkillMonitor.getFlagged()
    │  embedding-builder still unhealthy
    ▼
PromptRequestQueue.enqueue()  ← escalation task
```

```bash
node examples/full-pipeline.js
```

---

## Key Concepts

### DAG dependency resolution

`dependsOn` accepts an array of PR IDs. `getDispatchable()` only returns tasks whose
entire dependency set has status `done`. If any dependency transitions to `failed`, the
dependent task is automatically set to `blocked`.

### Self-improvement loop

```
OBSERVE  → readJsonl(skill-runs.jsonl)
ANALYZE  → calculate avgScore, trend, consecutiveFails
DIAGNOSE → flagged = avgScore < 0.7 || trend === 'declining' || trend === 'broken'
PROPOSE  → human or agent picks a repair action
EVALUATE → run the skill again after applying the fix
APPLY    → update prompt, code, or config
RECORD   → appendFileSync(skill-improvements.md, ...)
```

### Knowledge watcher check function

`watcher.check(sourceId, async (prevState) => newState)` — you supply the
fetching logic. Return `null` to signal "no change". Return an object with a
`version` field and the watcher auto-detects `version_change` diffs. Use
`customDiffs` for arbitrary change types.
