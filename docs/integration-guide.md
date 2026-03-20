# Integration Guide: Agent Skill Bus with Your Framework

> **Framework-agnostic, JSONL-based, zero dependencies.**
> Integrate AI agent monitoring into Claude Code, Codex, LangGraph, CrewAI, or any custom system in minutes.

---

## 1. Quick Setup (30 Seconds)

Run this once in your project root:

```bash
npx agent-skill-bus init
```

This scaffolds the data directory:

```
skills/
  prompt-request-bus/
    prompt-request-queue.jsonl    # Shared task queue
    active-locks.jsonl            # File-level concurrency locks
    dag-state.jsonl               # DAG group progress
    SKILL.md                      # Queue documentation
  self-improving-skills/
    skill-runs.jsonl              # Execution log (append-only)
    skill-health.json             # Aggregated health snapshot
    SKILL.md                      # Monitor documentation
  knowledge-watcher/
    knowledge-state.json          # Last known state of external sources
    knowledge-diffs.jsonl         # Detected changes
    SKILL.md                      # Watcher documentation
```

After init, record your first run and verify the dashboard:

```bash
# Record a test run
npx agent-skill-bus record-run \
  --agent my-agent \
  --skill smoke-test \
  --task "verify setup" \
  --result success \
  --score 1.0

# Check the dashboard
npx agent-skill-bus dashboard
```

Requires Node.js >= 18. No runtime dependencies. Works offline.

---

## 2. Claude Code Integration

Claude Code reads skill instructions from `.claude/skills/` and follows directions in `AGENTS.md` or `CLAUDE.md`. The integration pattern is: drop instructions in, add a record-run step, done.

### 2.1 Drop Skill Files into `.claude/skills/`

```bash
mkdir -p .claude/skills/agent-skill-bus
cp skills/prompt-request-bus/SKILL.md .claude/skills/agent-skill-bus/prompt-request-bus.md
cp skills/self-improving-skills/SKILL.md .claude/skills/agent-skill-bus/self-improving-skills.md
cp skills/knowledge-watcher/SKILL.md .claude/skills/agent-skill-bus/knowledge-watcher.md
```

Claude Code will now understand how to operate the queue, read health data, and surface knowledge diffs directly in its reasoning context.

### 2.2 Add `record-run` to AGENTS.md

Add the following block to your project's `AGENTS.md` or `CLAUDE.md`:

```markdown
## Skill Monitoring

After completing any task, log the result to Agent Skill Bus:

```bash
npx agent-skill-bus record-run \
  --agent claude \
  --skill <skill-name> \
  --task "<what was done>" \
  --result <success|partial|fail> \
  --score <0.0-1.0>
```

Before starting work, check for flagged skills:

```bash
npx agent-skill-bus flagged
```

Skill names should be consistent and reusable across sessions:
- `code-review` — reviewing pull requests
- `bug-fix` — fixing reported bugs
- `feature-impl` — implementing new features
- `refactor` — code refactoring tasks
- `test-writing` — writing or updating tests
- `docs-update` — documentation changes
```

### 2.3 Example AGENTS.md Snippet (Full)

This is a complete, copy-pasteable block for real projects:

```markdown
## Agent Skill Bus

This project uses Agent Skill Bus to track skill quality over time.

### Record every completed task

After any task completes — success or failure — run:

```bash
npx agent-skill-bus record-run \
  --agent claude \
  --skill <skill-name> \
  --task "<brief task description>" \
  --result <success|partial|fail> \
  --score <0.0-1.0> \
  --notes "<optional: error message or observations>"
```

Score guide: 1.0 = perfect, 0.8 = minor issues, 0.5 = partial completion, 0.0 = failed entirely.

### Check queue for work

```bash
npx agent-skill-bus dispatch --max 5
```

### Check skill health

```bash
npx agent-skill-bus dashboard --days 7
```

### Enqueue a task for another agent

```bash
npx agent-skill-bus enqueue \
  --source claude \
  --priority medium \
  --agent codex \
  --task "Add unit tests for src/utils/*.ts"
```
```

---

## 3. Codex Integration

Codex CLI follows a similar pattern. Skill files go in `.codex/skills/`, and the `record-run` call hooks into the agent-turn-complete lifecycle.

### 3.1 Drop into `.codex/skills/`

```bash
mkdir -p .codex/skills
cat > .codex/skills/agent-skill-bus.md << 'EOF'
# Agent Skill Bus

## After Task Completion

Always log completed tasks:

```bash
npx agent-skill-bus record-run \
  --agent codex \
  --skill <skill-name> \
  --task "<task description>" \
  --result <success|partial|fail> \
  --score <0.0-1.0>
```

## Before Starting Work

Check for flagged skills and pending queue items:

```bash
npx agent-skill-bus flagged --days 7
npx agent-skill-bus dispatch --max 3
```
EOF
```

### 3.2 Hook into Agent-Turn-Complete

If your Codex setup supports post-completion hooks, create `.codex/hooks/post-task.sh`:

```bash
#!/bin/bash
# .codex/hooks/post-task.sh
# Called after each agent turn completes.

SKILL="${CODEX_SKILL:-general}"
TASK="${CODEX_TASK_DESCRIPTION:-completed task}"

# Map Codex exit codes to result values
case "$CODEX_EXIT_STATUS" in
  success) RESULT="success"; SCORE="1.0" ;;
  partial) RESULT="partial"; SCORE="0.5" ;;
  *)       RESULT="fail";    SCORE="0.0" ;;
esac

npx agent-skill-bus record-run \
  --agent codex \
  --skill "$SKILL" \
  --task "$TASK" \
  --result "$RESULT" \
  --score "$SCORE"
```

Make it executable:

```bash
chmod +x .codex/hooks/post-task.sh
```

Codex and Claude Code can share the same `skills/` directory. Tasks enqueued by one are visible to the other — the file-level locking prevents concurrent edits to the same file.

---

## 4. LangGraph Integration

LangGraph builds stateful, multi-agent Python graphs. Since Agent Skill Bus uses plain JSONL, the bridge is a thin Python file with no extra dependencies.

### 4.1 Python Helper for Recording Runs

Create `skill_bus.py` in your project:

```python
# skill_bus.py -- zero-dependency bridge to Agent Skill Bus
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SKILL_RUNS_FILE = Path("skills/self-improving-skills/skill-runs.jsonl")
QUEUE_FILE = Path("skills/prompt-request-bus/prompt-request-queue.jsonl")


def record_run(
    agent: str,
    skill: str,
    task: str,
    result: str,       # "success" | "partial" | "fail"
    score: float,      # 0.0 to 1.0
    notes: str = "",
) -> dict:
    """Append one skill run entry to skill-runs.jsonl."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "agent": agent,
        "skill": skill,
        "task": task[:300],                     # cap length
        "result": result,
        "score": round(max(0.0, min(1.0, score)), 4),
        "notes": notes[:500],
    }
    SKILL_RUNS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with SKILL_RUNS_FILE.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    return entry


def read_queue(agent_filter: str | None = None) -> list[dict]:
    """Read the task queue, optionally filtered by target agent."""
    if not QUEUE_FILE.exists():
        return []
    entries = []
    for line in QUEUE_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            if agent_filter is None or entry.get("agent") == agent_filter:
                entries.append(entry)
        except json.JSONDecodeError:
            pass
    return entries


def enqueue_task(source: str, priority: str, agent: str, task: str, **kwargs) -> None:
    """Add a task to the queue via the CLI (handles ID generation and locking)."""
    cmd = [
        "npx", "agent-skill-bus", "enqueue",
        "--source", source,
        "--priority", priority,
        "--agent", agent,
        "--task", task,
    ]
    for key, val in kwargs.items():
        if val is not None:
            cmd += [f"--{key.replace('_', '-')}", str(val)]
    subprocess.run(cmd, check=True, capture_output=True)
```

### 4.2 Recording Results in Graph Nodes

Wrap each LangGraph node with a `record_run` call after the node logic:

```python
from langgraph.graph import StateGraph, END
from skill_bus import record_run, enqueue_task


def research_node(state: dict) -> dict:
    query = state["query"]

    # --- your node logic ---
    result = run_web_search(query)
    # -----------------------

    record_run(
        agent="research-agent",
        skill="web-research",
        task=query[:200],
        result="success" if result.hits else "fail",
        score=result.confidence,
        notes=result.summary[:200] if result.hits else "No results",
    )
    return {"research": result}


def synthesis_node(state: dict) -> dict:
    findings = state["research"]

    # --- your node logic ---
    article = synthesize(findings)
    # -----------------------

    record_run(
        agent="synthesis-agent",
        skill="content-synthesis",
        task=f"Synthesize findings for: {state['query'][:100]}",
        result="success" if article.word_count > 200 else "partial",
        score=article.quality_score,
    )
    return {"article": article}


# Build graph
graph = StateGraph(dict)
graph.add_node("research", research_node)
graph.add_node("synthesis", synthesis_node)
graph.add_edge("research", "synthesis")
graph.add_edge("synthesis", END)
graph.set_entry_point("research")

app = graph.compile()
```

---

## 5. CrewAI Integration

CrewAI organizes agents into typed crews. Agent Skill Bus integrates through task callbacks and the same Python file-I/O bridge.

### 5.1 Task Completion Hook

```python
from crewai import Agent, Task, Crew
from skill_bus import record_run


def make_skill_callback(agent_id: str, skill_name: str):
    """Returns a CrewAI task callback that records a skill run."""
    def callback(task_output):
        raw = str(task_output)
        # Derive result from output content
        result = "success"
        score = 1.0
        if "error" in raw.lower() or "failed" in raw.lower():
            result = "fail"
            score = 0.0
        elif "partial" in raw.lower() or "incomplete" in raw.lower():
            result = "partial"
            score = 0.5

        record_run(
            agent=agent_id,
            skill=skill_name,
            task=raw[:200],
            result=result,
            score=score,
        )
    return callback


# Define agents
researcher = Agent(
    role="Senior Researcher",
    goal="Gather accurate information on any topic",
    backstory="Expert researcher with access to web search tools.",
)

writer = Agent(
    role="Content Writer",
    goal="Produce well-structured articles",
    backstory="Professional technical writer.",
)

# Define tasks with monitoring callbacks
research_task = Task(
    description="Research the current state of AI agent frameworks",
    agent=researcher,
    callback=make_skill_callback("researcher", "web-research"),
)

writing_task = Task(
    description="Write a 500-word summary based on the research findings",
    agent=writer,
    callback=make_skill_callback("writer", "article-writing"),
)

crew = Crew(agents=[researcher, writer], tasks=[research_task, writing_task])
result = crew.kickoff()
```

### 5.2 Cross-Crew Task Routing

Use the Prompt Request Bus to hand off work between independent crews:

```python
from skill_bus import enqueue_task, read_queue


# Crew A finishes and queues work for Crew B
def research_crew_done_callback(output):
    enqueue_task(
        source="research-crew",
        priority="medium",
        agent="writing-crew",
        task=f"Write article: {str(output)[:200]}",
        context="Handed off from research pipeline",
    )


# Crew B polls for its tasks at startup
def get_pending_writing_tasks() -> list[dict]:
    return [
        t for t in read_queue(agent_filter="writing-crew")
        if t.get("status") == "queued"
    ]
```

---

## 6. Custom Framework Integration

No framework at all? Integration is a single append operation in any language.

### 6.1 Direct JSONL File I/O

The only requirement: append one valid JSON line to `skills/self-improving-skills/skill-runs.jsonl` after each task.

**Minimum valid entry:**

```json
{"ts":"2026-03-21T10:00:00Z","agent":"my-agent","skill":"data-pipeline","task":"Process batch #42","result":"success","score":0.95,"notes":""}
```

### 6.2 Node.js Example

```javascript
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SKILL_RUNS = 'skills/self-improving-skills/skill-runs.jsonl';

function recordRun({ agent, skill, task, result, score, notes = '' }) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    agent,
    skill,
    task: task.slice(0, 300),
    result,                             // "success" | "partial" | "fail"
    score: Math.max(0, Math.min(1, score)),
    notes: notes.slice(0, 500),
  });
  mkdirSync(dirname(SKILL_RUNS), { recursive: true });
  appendFileSync(SKILL_RUNS, entry + '\n', 'utf8');
}

// Usage
recordRun({
  agent: 'data-pipeline',
  skill: 'etl-transform',
  task: 'Transform daily sales CSV',
  result: 'success',
  score: 0.97,
  notes: 'Processed 12,840 rows',
});
```

### 6.3 Python Example

```python
import json
from datetime import datetime, timezone
from pathlib import Path

SKILL_RUNS = Path("skills/self-improving-skills/skill-runs.jsonl")


def record_run(agent, skill, task, result, score, notes=""):
    SKILL_RUNS.parent.mkdir(parents=True, exist_ok=True)
    entry = json.dumps({
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "agent": agent,
        "skill": skill,
        "task": task[:300],
        "result": result,
        "score": round(max(0.0, min(1.0, score)), 4),
        "notes": notes[:500],
    })
    with SKILL_RUNS.open("a") as f:
        f.write(entry + "\n")


# Usage
record_run(
    agent="ml-pipeline",
    skill="model-inference",
    task="Run daily churn prediction batch",
    result="success",
    score=0.94,
    notes="Scored 8,320 users in 42s",
)
```

---

## 7. CI/CD Integration

### 7.1 Add `npx agent-skill-bus flagged` to Your Pipeline

The `flagged` command exits with code `0` even when skills are flagged — it always outputs JSON. Wrap it in a check:

```bash
# In any CI pipeline script:
FLAGGED_COUNT=$(npx agent-skill-bus flagged --days 7 | grep -o '"count":[0-9]*' | cut -d: -f2)
if [ "${FLAGGED_COUNT:-0}" -gt "0" ]; then
  echo "WARNING: $FLAGGED_COUNT skill(s) need attention."
  npx agent-skill-bus dashboard --no-color
fi
```

### 7.2 GitHub Actions Example

```yaml
# .github/workflows/agent-skill-health.yml
name: Agent Skill Health

on:
  schedule:
    - cron: '0 8 * * *'      # Daily at 08:00 UTC
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  skill-health:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # No install needed — npx fetches on demand
      # But pre-install for faster runs:
      - name: Install agent-skill-bus
        run: npm install --no-save agent-skill-bus

      - name: Print dashboard
        run: npx agent-skill-bus dashboard --days 7 --no-color

      - name: Check for flagged skills
        id: flagged
        run: |
          OUTPUT=$(npx agent-skill-bus flagged --days 7)
          COUNT=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])")
          echo "count=$COUNT" >> "$GITHUB_OUTPUT"
          if [ "$COUNT" -gt "0" ]; then
            echo "::warning::$COUNT skill(s) are flagged. Run the dashboard locally for details."
          fi

      - name: Block merge on broken skills (PR gate)
        if: github.event_name == 'push'
        run: |
          BROKEN=$(npx agent-skill-bus flagged --days 3 | \
            python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for s in d['skills'] if s.get('trend')=='broken'))")
          if [ "${BROKEN:-0}" -gt "0" ]; then
            echo "::error::$BROKEN skill(s) are broken (3+ consecutive failures). Fix before merging."
            exit 1
          fi

      - name: Detect silent drift
        run: |
          npx agent-skill-bus drift || true

      - name: Release expired queue locks
        run: npx agent-skill-bus locks --release-expired || true
```

---

## 8. Monitoring Dashboard

### 8.1 Run the Dashboard

```bash
# Terminal dashboard (uses ANSI colors)
npx agent-skill-bus dashboard

# Plain text (for logs and CI)
npx agent-skill-bus dashboard --no-color

# Custom time window (default: 7 days)
npx agent-skill-bus dashboard --days 30
```

Sample output:

```
╔══════════════════════════════════════════════════════════════╗
║  Agent Skill Bus -- Dashboard              (7-day window)  ║
╚══════════════════════════════════════════════════════════════╝

  Queue
  |-- Total: 12  |  Pending: 3  |  Running: 1  |  Done: 8
  +-- Active locks: 1  (src/auth.ts, held by codex, 2m ago)

  Skills  (5 tracked)
  ----------------------------------------------------------
    Status  Skill              Score  Trend       Runs  Fails
  ----------------------------------------------------------
  * OK      code-review         0.94   stable        31      1
  * OK      feature-impl        0.89   improving     12      0
  ! WARN    bug-fix             0.64   declining      9      3
  * OK      test-writing        0.91   stable        18      1
  ! BROKEN  docs-update         0.20   broken         4      3
  ----------------------------------------------------------

  * Healthy: 3  ! Flagged: 2
```

### 8.2 Cron-Based Monitoring

For production setups, run these cron jobs on the machine that owns the `skills/` directory:

```bash
# crontab -e

# Every 6 hours: refresh aggregated health snapshot
0 */6 * * * cd /path/to/project && npx agent-skill-bus health --days 7 >/dev/null 2>&1

# Every hour: release stale file locks (> 30 min old)
0 * * * * cd /path/to/project && npx agent-skill-bus locks --release-expired >/dev/null 2>&1

# Daily at midnight: write drift report to tmp
0 0 * * * cd /path/to/project && npx agent-skill-bus drift > /tmp/skill-drift.json 2>&1

# Weekly Sunday: print full dashboard to log file
0 9 * * 0 cd /path/to/project && npx agent-skill-bus dashboard --days 30 --no-color >> /var/log/skill-health.log 2>&1
```

---

## 9. Advanced: Multi-Agent Coordination

When multiple agents run concurrently, Agent Skill Bus uses file-level locking to prevent them from editing the same source file simultaneously.

### 9.1 File Locking for Concurrent Access

The lock mechanism is built into the queue. When an agent picks up a task, it acquires locks on `affectedFiles`:

```bash
# Enqueue a task that touches two files
npx agent-skill-bus enqueue \
  --source human \
  --priority high \
  --agent dev \
  --task "Refactor auth module" \
  --files "myapp:src/auth.ts" "myapp:src/middleware/session.ts"

# The agent claims the task (locks those files)
npx agent-skill-bus dispatch --max 1

# While claimed, no other agent can claim a task touching those files
# Check current locks:
npx agent-skill-bus locks
```

Locks expire automatically after 30 minutes. Release them explicitly when done:

```bash
# Complete the task and release locks
npx agent-skill-bus complete --id pr-1711000000-abc12345 --result "Refactored successfully"
```

### 9.2 DAG Dependencies Between Agents

The Prompt Request Bus supports DAG groups — tasks that must execute in dependency order:

```bash
# Step 1: Create a schema migration (must run first)
npx agent-skill-bus enqueue \
  --source human \
  --priority high \
  --agent db-agent \
  --task "Add users.preferences column" \
  --dag-id "feature-prefs-v2" \
  --dag-step 1

# Step 2: Backend logic (depends on step 1)
npx agent-skill-bus enqueue \
  --source human \
  --priority high \
  --agent backend-agent \
  --task "Implement preferences API endpoints" \
  --dag-id "feature-prefs-v2" \
  --dag-step 2 \
  --depends-on "pr-db-step-id"

# Step 3: Frontend (depends on step 2)
npx agent-skill-bus enqueue \
  --source human \
  --priority medium \
  --agent frontend-agent \
  --task "Add preferences UI components" \
  --dag-id "feature-prefs-v2" \
  --dag-step 3 \
  --depends-on "pr-backend-step-id"
```

The `dispatch` command only surfaces tasks whose `dependsOn` IDs are all in `done` status — agents never need to check dependencies themselves.

### 9.3 Cross-Framework Agent Coordination

Because the queue is plain JSONL, agents from completely different frameworks can coordinate:

```
Claude Code (Node.js)  -->  enqueues tasks for  -->  LangGraph agent (Python)
LangGraph agent        -->  enqueues tasks for  -->  CrewAI crew
CrewAI crew            -->  records results to  -->  skill-runs.jsonl
npx agent-skill-bus dashboard  reads all results from all frameworks
```

The data layer is the coordination layer. No message broker needed.

---

## Summary

| Framework | Integration Point | Time | What You Get |
|-----------|------------------|------|-------------|
| **Claude Code** | `AGENTS.md` + `.claude/skills/` | 5 min | Skill tracking, queue access |
| **Codex** | `.codex/skills/` + post-task hook | 5 min | Same as Claude Code |
| **LangGraph** | Node callbacks + `skill_bus.py` | 15 min | Cross-graph routing + monitoring |
| **CrewAI** | Task callbacks + `skill_bus.py` | 15 min | Cross-crew coordination |
| **Custom** | Direct JSONL append (any language) | 2 min | Monitoring only |
| **CI/CD** | GitHub Actions YAML | 10 min | Automated health gates |

The core pattern is always identical:

1. After task completion -> append one line to `skill-runs.jsonl`
2. Periodically -> run `npx agent-skill-bus dashboard` or `flagged`
3. Optionally -> use the Prompt Request Bus for cross-agent task routing and DAG scheduling

Start with step 1. Add the rest incrementally.

---

*Keywords: integrate AI agent monitoring, Claude Code skills, LangGraph agent health, CrewAI monitoring, agent framework integration, JSONL agent bus, multi-agent coordination, agent skill quality tracking.*
