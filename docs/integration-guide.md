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
