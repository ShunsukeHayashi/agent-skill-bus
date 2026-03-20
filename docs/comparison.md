# How agent-skill-bus compares

## Positioning

agent-skill-bus is **not a replacement** for LangGraph, CrewAI, AutoGen, Mastra, or VoltAgent. Those are full agent orchestration frameworks — they manage LLM calls, tool execution, memory, and agent lifecycles. agent-skill-bus is a complementary infrastructure layer that sits on top of any of them. It adds a unified task queue (Prompt Request Bus), a skill quality monitoring loop (Self-Improving Skills), and an external change detector (Knowledge Watcher) — three concerns that most frameworks leave entirely to you.

## Feature Comparison

| Feature | agent-skill-bus | LangGraph | CrewAI | AutoGen | Mastra | VoltAgent |
|---|---|---|---|---|---|---|
| DAG Task Queue | Yes (JSONL, file locks) | Yes (graph-native) | Partial | Yes (GroupChat) | Yes | Yes |
| Skill Quality Monitoring | Yes (7-step loop) | No | No | No | No | No |
| Self-Improving Loop | Yes (auto-edit SKILL.md) | No | No | No | No | No |
| Knowledge Watching | Yes (Tier 1/2/3 sources) | No | No | No | No | No |
| Zero Dependencies | Yes (flat files only) | No (Python + many deps) | No | No | No | No |
| Framework Agnostic | Yes | No (LangChain) | No | No | Partial | No |
| Standalone Modules | Yes (use any 1 of 3) | No | No | No | No | No |
| CLI Tool | No (JSONL + cron) | No | No | No | No | Yes |
| npm Package Size | N/A (no package) | N/A (Python) | N/A (Python) | N/A (Python) | ~large | Medium |

## Key Differences

- **Scope**: agent-skill-bus adds quality infrastructure (monitoring, self-repair, knowledge tracking); the others are full execution frameworks that handle LLM calls, routing, and tool bindings that agent-skill-bus deliberately does not touch.
- **Portability**: Because agent-skill-bus uses only JSONL flat files and markdown, it works with any LLM provider, any agent runtime, and any language. There is nothing to install.
- **Self-repair focus**: No mainstream framework ships a built-in loop that detects declining skill performance, diagnoses root causes, and auto-edits its own instruction files. That is the core differentiator.
- **Granularity**: agent-skill-bus operates at the skill/task level, not the LLM-call or node level. It is coarser by design — it cares whether a skill is healthy over time, not whether a single prompt completed.

## When to Use agent-skill-bus

- You already have agents (in any framework) and want to track whether their skills are degrading over weeks.
- You need a shared task queue that multiple independent agents (OpenClaw, Claude Code, Codex, Gemini CLI) can all read from without a shared runtime.
- You want external changes (API version bumps, dependency updates, community issue patterns) to automatically surface as actionable improvement requests.
- You are building on minimal infrastructure (no servers, no databases) and want orchestration that survives node restarts via plain files.
- You want to adopt just one module — for example, only the Knowledge Watcher — without taking on the rest.

## When NOT to Use agent-skill-bus

- You need an LLM execution layer, tool routing, memory management, or structured prompt chaining — use LangGraph, CrewAI, or Mastra for those.
- You need a production-grade task queue with transactional guarantees, replay, or distributed locking — use a real message broker (Redis, RabbitMQ).
- Your team is Python-first and wants a single framework end-to-end — LangGraph or AutoGen will feel more native.
- Your skill library is small and stable with no external dependencies — the self-improving loop adds overhead without enough signal to act on.

## Using Together

**With LangGraph**: Use LangGraph for node-level graph execution and LLM calls. Feed completed node results into `skill-runs.jsonl` so Self-Improving Skills can monitor quality trends across LangGraph runs over time.

**With CrewAI**: CrewAI handles agent roles and task delegation. Route all crew task completions through the Prompt Request Bus for a centralized audit trail and DAG dependency tracking across crews.

**With AutoGen**: AutoGen manages multi-agent conversation flows. Attach a Knowledge Watcher cron to monitor the external APIs or libraries your AutoGen tools depend on; pipe detected diffs into the GroupChat as context.

**With Mastra**: Mastra provides the full TypeScript agent stack. Use agent-skill-bus as the quality monitoring sidecar — Mastra runs the agents, agent-skill-bus watches whether they stay healthy over weeks and proposes fixes.

**With VoltAgent**: VoltAgent manages real-time agent execution with its CLI. Pair it with agent-skill-bus's Prompt Request Bus as the persistent cross-session task queue, so tasks survive VoltAgent restarts and can be prioritized with DAG dependencies.
