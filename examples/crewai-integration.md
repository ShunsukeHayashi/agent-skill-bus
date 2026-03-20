# Integrating agent-skill-bus with CrewAI

Track per-agent, per-task quality across your CrewAI crews.
Each agent's task execution gets logged to a JSONL file.
Over time, you see which agents/tools are degrading and can auto-repair.

## How It Works

```
CrewAI Crew
┌───────────────────────┐
│  Agent: researcher    │ ─── record-run ──┐
│  Agent: writer        │ ─── record-run ──┤     agent-skill-bus
│  Agent: editor        │ ─── record-run ──┼───► skill-runs.jsonl
└───────────────────────┘                  │
                                           │
                                    npx skill-bus health
                                    npx skill-bus flagged
```

No CrewAI plugin needed. Append one JSONL line per task. Done.

## Setup

```bash
pip install crewai
npm install agent-skill-bus
npx agent-skill-bus init
```

## Integration Options

### Option A: Direct JSONL append (recommended)

Write to the JSONL file directly from Python. Zero overhead, no subprocess.

```python
import json
from datetime import datetime, timezone
from pathlib import Path

RUNS_FILE = Path("skills/self-improving-skills/skill-runs.jsonl")

def record_run(agent: str, skill: str, task: str, result: str, score: float, notes: str = ""):
    """Append a skill run to agent-skill-bus."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent": agent,
        "skill": skill,
        "task": task,
        "result": result,
        "score": max(0.0, min(1.0, score)),
        "notes": notes,
    }
    with open(RUNS_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
```

### Option B: CLI call (simpler, slightly slower)

```python
import subprocess

def record_run_cli(agent, skill, task, result, score, notes=""):
    subprocess.run([
        "npx", "agent-skill-bus", "record-run",
        "--agent", agent,
        "--skill", skill,
        "--task", task,
        "--result", result,
        "--score", str(score),
        "--notes", notes,
    ], capture_output=True)
```

## CrewAI Integration Patterns

### Pattern 1: Wrap task execution with recording

```python
from crewai import Agent, Task, Crew
from record_runs import record_run  # the helper above

# Define agents
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find comprehensive data on the given topic",
    backstory="Expert at finding and synthesizing information.",
    verbose=True,
)

writer = Agent(
    role="Content Writer",
    goal="Write clear, engaging articles from research data",
    backstory="Skilled technical writer with 10 years experience.",
    verbose=True,
)

# Define tasks
research_task = Task(
    description="Research the latest trends in AI agent frameworks.",
    expected_output="A detailed report with sources.",
    agent=researcher,
)

writing_task = Task(
    description="Write a blog post based on the research report.",
    expected_output="A 1000-word blog post in markdown.",
    agent=writer,
)

# Run crew
crew = Crew(agents=[researcher, writer], tasks=[research_task, writing_task])
result = crew.kickoff()

# Record results per task
# In practice, you'd evaluate quality more carefully.
# Here we use simple heuristics.
for task in [research_task, writing_task]:
    output = task.output
    has_output = output is not None and len(str(output)) > 50
    score = 0.9 if has_output else 0.3

    record_run(
        agent=task.agent.role,
        skill=f"crew-{task.agent.role.lower().replace(' ', '-')}",
        task=task.description[:200],
        result="success" if has_output else "fail",
        score=score,
        notes=f"Output length: {len(str(output))} chars" if output else "No output",
    )
```

### Pattern 2: CrewAI callback for automatic recording

```python
from crewai.callbacks import BaseCallback

class SkillBusCallback(BaseCallback):
    """Automatically records every task result to agent-skill-bus."""

    def on_task_completion(self, task, output, agent):
        has_output = output is not None and len(str(output)) > 50
        record_run(
            agent=agent.role,
            skill=f"crew-{agent.role.lower().replace(' ', '-')}",
            task=task.description[:200],
            result="success" if has_output else "partial",
            score=0.9 if has_output else 0.4,
            notes=f"Output: {len(str(output))} chars",
        )

    def on_task_failure(self, task, error, agent):
        record_run(
            agent=agent.role,
            skill=f"crew-{agent.role.lower().replace(' ', '-')}",
            task=task.description[:200],
            result="fail",
            score=0.0,
            notes=str(error)[:200],
        )


# Usage
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    callbacks=[SkillBusCallback()],
)
```

### Pattern 3: Tool-level recording

Track individual tool calls, not just tasks:

```python
from crewai.tools import BaseTool

class TrackedSearchTool(BaseTool):
    name: str = "web_search"
    description: str = "Search the web for information"

    def _run(self, query: str) -> str:
        try:
            results = self._do_search(query)
            record_run("tool", "web-search", query, "success", 1.0)
            return results
        except Exception as e:
            record_run("tool", "web-search", query, "fail", 0.0, str(e))
            raise

    def _do_search(self, query: str) -> str:
        # Your actual search logic
        ...
```

### Pattern 4: Use the task queue for crew orchestration

Instead of hard-coding task order, use the DAG queue:

```python
import subprocess
import json

def enqueue(task_desc, agent_role, priority="medium", depends_on=None):
    cmd = [
        "npx", "agent-skill-bus", "enqueue",
        "--source", "crewai",
        "--agent", agent_role,
        "--task", task_desc,
        "--priority", priority,
    ]
    if depends_on:
        cmd.extend(["--depends-on", ",".join(depends_on)])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

# Build a task DAG
r1 = enqueue("Research AI frameworks", "researcher", priority="high")
r2 = enqueue("Research market data", "researcher", priority="high")
w1 = enqueue("Write article", "writer", depends_on=[r1["pr"]["id"], r2["pr"]["id"]])
e1 = enqueue("Edit and polish", "editor", depends_on=[w1["pr"]["id"]])

# Then dispatch in order:
# npx agent-skill-bus dispatch  →  returns research tasks first
# After they complete:
# npx agent-skill-bus dispatch  →  returns write task
# After that completes:
# npx agent-skill-bus dispatch  →  returns edit task
```

## Monitoring Your Crew

### Check health after each crew run

```bash
# Update health report
npx agent-skill-bus health

# Show degrading agents/skills
npx agent-skill-bus flagged

# Example output:
# {
#   "count": 1,
#   "skills": [
#     {
#       "name": "crew-content-writer",
#       "avgScore": 0.65,
#       "trend": "declining",
#       "consecutiveFails": 2,
#       "flagged": true
#     }
#   ]
# }
```

### Detect week-over-week drift

```bash
npx agent-skill-bus drift

# Shows skills where score dropped >15% compared to last week
```

### Self-healing: auto-enqueue repairs

```python
import subprocess
import json

def check_and_repair():
    """If any crew skill is flagged, enqueue a repair task."""
    result = subprocess.run(
        ["npx", "agent-skill-bus", "flagged"],
        capture_output=True, text=True,
    )
    data = json.loads(result.stdout)

    for skill in data.get("skills", []):
        subprocess.run([
            "npx", "agent-skill-bus", "enqueue",
            "--source", "self-improve",
            "--priority", "high",
            "--agent", "crew-maintainer",
            "--task", f"Investigate and fix: {skill['name']} "
                      f"(avgScore={skill['avgScore']}, trend={skill['trend']})",
        ], capture_output=True)

# Run after each crew execution
check_and_repair()
```

## JSONL Schema Reference

Each line in `skill-runs.jsonl`:

```json
{
  "ts": "2026-03-20T10:30:00.000Z",
  "agent": "Senior Research Analyst",
  "skill": "crew-senior-research-analyst",
  "task": "Research the latest trends in AI agent frameworks",
  "result": "success",
  "score": 0.92,
  "notes": "Output: 2450 chars"
}
```

Valid `result` values: `"success"`, `"fail"`, `"partial"`
Valid `score` range: `0.0` to `1.0` (clamped automatically)

## Key Points

1. **No CrewAI plugin required.** Just append to a JSONL file.
2. **Per-agent tracking.** Use the agent's role as the `agent` field.
3. **Per-tool tracking.** Wrap tools to record individual call results.
4. **Offline analysis.** Run `health` / `flagged` / `drift` anytime.
5. **Works with CrewAI 0.1+.** Python 3.10+, Node.js 18+ (for CLI).
