# 🚌 Agent Skill Bus

**The missing runtime for [Agent Skills](https://agentskills.io) — health monitoring, self-improvement, and dependency management for any AI agent framework.**

Your agent skills silently break. Agent Skill Bus detects it, diagnoses the root cause, and fixes it automatically.

Built by [合同会社みやび (LLC Miyabi)](https://miyabi-ai.jp) — Running 42 AI agents in production daily.

[![npm version](https://img.shields.io/npm/v/agent-skill-bus.svg)](https://www.npmjs.com/package/agent-skill-bus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/ShunsukeHayashi/agent-skill-bus/actions/workflows/ci.yml/badge.svg)](https://github.com/ShunsukeHayashi/agent-skill-bus/actions/workflows/ci.yml)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/agent-skill-bus)
[![GitHub Discussions](https://img.shields.io/github/discussions/ShunsukeHayashi/agent-skill-bus)](https://github.com/ShunsukeHayashi/agent-skill-bus/discussions)

> **Looking for the full ecosystem?** This repo is the core runtime. For **110+ production-ready skills**, marketplace, and the complete Miyabi Agent Society platform, visit **[agentskills.bath.me](https://agentskills.bath.me)**.

---

## What is this?

Agent Skill Bus is a **framework-agnostic runtime for AI agent skill health** — orchestrating, monitoring, and self-improving agent skills across any framework. Think of it as the operational backbone that keeps your agent skills healthy over weeks and months, not just during a single run. It consists of three integrated modules:

| Module | Purpose | Standalone? |
|--------|---------|-------------|
| **Prompt Request Bus** | DAG-based task queue with dependency resolution & file locking | ✅ Yes |
| **Self-Improving Skills** | Automatic skill quality monitoring & repair loop | ✅ Yes |
| **Knowledge Watcher** | External change detection → automatic improvement triggers | ✅ Yes |

They work independently, but together they form a **closed-loop self-improving agent system**:

```
External Changes ──→ Knowledge Watcher ──→ Prompt Request Bus ──→ Execute
                                                ↑                    │
                                                │                    ↓
                                          Self-Improving ←── Skill Runs Log
                                             Skills
```

## Why?

Most agent frameworks handle **execution** (LangGraph, CrewAI, AutoGen). None handle **operational health**:

- 🔴 **Skills silently degrade** — An API changes, a model updates, auth expires. Nobody notices until it fails in production.
- 🔴 **Tasks collide** — Two agents edit the same file. Data corruption.
- 🔴 **No dependency management** — Complex tasks need A→B→C ordering. Most systems just run everything in parallel.
- 🔴 **No learning loop** — Failures repeat because there's no feedback mechanism.

Agent Skill Bus solves all four.

## Quick Start

```bash
# One command to set up everything
npx agent-skill-bus init

# Log a skill execution
npx agent-skill-bus record-run --agent my-agent --skill api-caller --task "fetch data" --result success --score 1.0

# Check what needs attention
npx agent-skill-bus flagged

# Queue a task
npx agent-skill-bus enqueue --source human --priority high --agent dev --task "Fix auth bug"

# See what's ready to dispatch
npx agent-skill-bus dispatch

# See which data files this project is actually using
npx agent-skill-bus paths
```

### For Claude Code / Codex users

Add this to your `AGENTS.md`:
```
After completing any task, log the result:
npx agent-skill-bus record-run --agent claude --skill <skill-name> --task "<task>" --result <success|fail|partial> --score <0.0-1.0>
```

That's it. The self-improving loop runs automatically.

## Dashboard

Get a real-time overview of all your agent skills with a single command:

```bash
npx agent-skill-bus dashboard
```

```
╔═══════════════════════════════════════════════════════╗
║              🚌 Agent Skill Bus Dashboard               ║
╚══════════════════════════════════════════════════════╝