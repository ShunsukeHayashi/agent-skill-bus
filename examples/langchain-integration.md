# Integrating agent-skill-bus with LangChain / LangGraph

Track skill quality across your LangChain agents with zero coupling.
The integration point is simple: after each tool call or chain run,
append one line to a JSONL file.

## How It Works

```
LangChain Agent                        agent-skill-bus
┌──────────────┐                      ┌──────────────────┐
│  Tool call   │ ──── record-run ───► │ skill-runs.jsonl  │
│  Chain run   │                      │                   │
│  Graph step  │                      │ skill-health.json │
└──────────────┘                      └──────────────────┘
                                             │
                                      npx skill-bus health
                                      npx skill-bus flagged
                                      npx skill-bus drift
```

No LangChain plugin needed. No monkey-patching. Just log results.

## Setup

```bash
npm install agent-skill-bus
npx agent-skill-bus init
```

## Integration Options

### Option A: CLI calls from tool functions (simplest)

Call the CLI after each tool execution. Works with any LangChain version.

```python
# Python — call the CLI via subprocess
import subprocess
import json

def record_skill_run(skill: str, task: str, result: str, score: float, notes: str = ""):
    """Log a skill run to agent-skill-bus."""
    subprocess.run([
        "npx", "agent-skill-bus", "record-run",
        "--agent", "langchain-agent",
        "--skill", skill,
        "--task", task,
        "--result", result,
        "--score", str(score),
        "--notes", notes,
    ], capture_output=True)


# Use in a LangChain tool:
from langchain.tools import tool

@tool
def search_database(query: str) -> str:
    """Search the product database."""
    try:
        results = db.search(query)
        record_skill_run("db-search", query, "success", 1.0)
        return json.dumps(results)
    except Exception as e:
        record_skill_run("db-search", query, "fail", 0.0, str(e))
        raise
```

### Option B: Direct JSONL append (zero subprocess overhead)

Skip the CLI entirely. Write directly to the JSONL file.

```python
import json
from datetime import datetime, timezone
from pathlib import Path

SKILL_RUNS_FILE = Path("skills/self-improving-skills/skill-runs.jsonl")

def record_run(agent: str, skill: str, task: str, result: str, score: float, notes: str = ""):
    """Append a skill run directly to the JSONL file."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent": agent,
        "skill": skill,
        "task": task,
        "result": result,
        "score": max(0.0, min(1.0, score)),
        "notes": notes,
    }
    with open(SKILL_RUNS_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
```

This is the recommended approach for high-throughput pipelines.
The JSONL format is the same as what the CLI writes — the `health`
and `flagged` commands will read it seamlessly.

### Option C: LangChain callback handler

Wrap the recording logic in a LangChain callback:

```python
from langchain.callbacks.base import BaseCallbackHandler
from datetime import datetime, timezone
import json

class SkillBusCallback(BaseCallbackHandler):
    """Records tool/chain results to agent-skill-bus."""

    def __init__(self, runs_file="skills/self-improving-skills/skill-runs.jsonl"):
        self.runs_file = runs_file

    def on_tool_end(self, output, *, run_id, parent_run_id=None, name=None, **kwargs):
        self._record(skill=name or "unknown-tool", task=str(output)[:200], result="success", score=1.0)

    def on_tool_error(self, error, *, run_id, parent_run_id=None, name=None, **kwargs):
        self._record(skill=name or "unknown-tool", task=str(error)[:200], result="fail", score=0.0)

    def on_chain_end(self, outputs, *, run_id, parent_run_id=None, **kwargs):
        self._record(skill="chain-run", task=str(outputs)[:200], result="success", score=0.9)

    def on_chain_error(self, error, *, run_id, parent_run_id=None, **kwargs):
        self._record(skill="chain-run", task=str(error)[:200], result="fail", score=0.0)

    def _record(self, skill, task, result, score, notes=""):
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "agent": "langchain",
            "skill": skill,
            "task": task,
            "result": result,
            "score": score,
            "notes": notes,
        }
        with open(self.runs_file, "a") as f:
            f.write(json.dumps(entry) + "\n")


# Usage:
from langchain.agents import AgentExecutor

agent = AgentExecutor(
    agent=my_agent,
    tools=my_tools,
    callbacks=[SkillBusCallback()],
)
agent.invoke({"input": "What products are on sale?"})
```

## LangGraph Integration

For LangGraph, record results at each node:

```python
from langgraph.graph import StateGraph
from typing import TypedDict

class State(TypedDict):
    query: str
    results: list
    answer: str

def search_node(state: State) -> State:
    results = vector_store.similarity_search(state["query"])
    # Record the skill run
    record_run("langgraph", "vector-search", state["query"], "success", 0.95)
    return {"results": results}

def answer_node(state: State) -> State:
    answer = llm.invoke(format_prompt(state["results"], state["query"]))
    score = evaluate_answer_quality(answer)  # your quality function
    record_run("langgraph", "answer-generation", state["query"],
               "success" if score > 0.7 else "partial", score)
    return {"answer": answer}

# Build graph
graph = StateGraph(State)
graph.add_node("search", search_node)
graph.add_node("answer", answer_node)
graph.add_edge("search", "answer")
app = graph.compile()
```

## Using the Task Queue with LangChain

Route tasks through the queue for DAG-ordered execution:

```python
import subprocess
import json

def enqueue_task(task: str, priority: str = "medium", depends_on: list[str] = None):
    """Add a task to the skill-bus queue."""
    cmd = [
        "npx", "agent-skill-bus", "enqueue",
        "--source", "langchain",
        "--agent", "langchain-agent",
        "--task", task,
        "--priority", priority,
    ]
    if depends_on:
        cmd.extend(["--depends-on", ",".join(depends_on)])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def get_next_tasks(max_count: int = 3):
    """Get dispatchable tasks from the queue."""
    result = subprocess.run(
        ["npx", "agent-skill-bus", "dispatch", "--max", str(max_count)],
        capture_output=True, text=True,
    )
    return json.loads(result.stdout)

def complete_task(pr_id: str, result_msg: str = "done"):
    """Mark a queued task as complete."""
    subprocess.run([
        "npx", "agent-skill-bus", "complete", pr_id, "--result", result_msg,
    ], capture_output=True)
```

## Monitoring

After accumulating runs, use the CLI to check health:

```bash
# Health summary (writes skill-health.json)
npx agent-skill-bus health

# Skills needing attention (avgScore < 0.7, declining trend, or 3+ consecutive fails)
npx agent-skill-bus flagged

# Week-over-week degradation detection (>15% score drop)
npx agent-skill-bus drift
```

### Automate with cron or CI

```bash
# Add to crontab for daily health checks
0 9 * * * cd /path/to/project && npx agent-skill-bus health >> /var/log/skill-health.log
```

## Key Points

1. **Integration is just JSONL appends.** No SDK, no plugin, no runtime coupling.
2. **The JSONL format is stable.** Fields: `ts`, `agent`, `skill`, `task`, `result`, `score`, `notes`.
3. **Analysis is offline.** Run `health` / `flagged` / `drift` whenever you want. The JSONL file is append-only.
4. **Works with any LangChain version.** Python 3.8+, LangChain 0.1+, LangGraph 0.1+.
