# 🚌 Agent Skill Bus

**A self-improving task orchestration framework for AI agent systems.**

Built by [合同会社みやび (LLC Miyabi)](https://miyabi-ai.jp) — Running 42 AI agents in production daily.

[![npm version](https://img.shields.io/npm/v/agent-skill-bus.svg)](https://www.npmjs.com/package/agent-skill-bus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/ShunsukeHayashi/agent-skill-bus/actions/workflows/ci.yml/badge.svg)](https://github.com/ShunsukeHayashi/agent-skill-bus/actions/workflows/ci.yml)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/agent-skill-bus)
[![GitHub Discussions](https://img.shields.io/github/discussions/ShunsukeHayashi/agent-skill-bus)](https://github.com/ShunsukeHayashi/agent-skill-bus/discussions)

> **Looking for the full ecosystem?** This repo is the core runtime. For **110+ production-ready skills**, marketplace, and the complete Miyabi Agent Society platform, visit **[agentskills.bath.me](https://agentskills.bath.me)**.

---

## What is this?

Agent Skill Bus is a framework-agnostic toolkit for orchestrating, monitoring, and self-improving AI agent skills. It consists of three integrated modules:

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
- 🔴 **Tasks collide** — Two agents edit the same file simultaneously. Data corruption.
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
╔══════════════════════════════════════════════════════════╗
║              🚌 Agent Skill Bus Dashboard               ║
╚══════════════════════════════════════════════════════════╝

📊 Queue: 3 queued │ 1 running │ 12 completed │ 0 failed

 Status   Skill               Score  Trend  Health
─────────────────────────────────────────────────────────
 ● ALERT  api-caller           0.42   ↓     ██░░░░░░░░░░
 ● OK     code-review          0.95   ↑     ███████████░
 ● OK     deploy-pipeline      0.88   ─     ██████████░░

⚠ Flagged Skills:
  api-caller — score_drop: dropped from 0.91 to 0.42 (drift: -53.8%)
```

Options: `--days N` (default: 7), `--no-color` for CI/piping.

## Modules

### 📬 Prompt Request Bus

A JSONL-based task queue with:

- **DAG dependency resolution** — Tasks specify `dependsOn` other tasks. Automatic topological execution.
- **File-level locking** — Prevent two agents from editing the same file. TTL-based deadlock prevention.
- **Priority routing** — `critical > high > medium > low`. Critical tasks bypass the queue.
- **Multi-source ingestion** — Human commands, cron jobs, GitHub webhooks, internal triggers all use the same format.
- **Deduplication** — Same task won't be queued twice.

```json
{
  "id": "pr-001",
  "ts": "2026-03-18T08:00:00Z",
  "source": "human",
  "priority": "high",
  "agent": "dev-agent",
  "task": "Fix authentication bug in auth.ts",
  "status": "queued",
  "dependsOn": [],
  "affectedFiles": ["myapp:src/auth.ts"],
  "dagId": null
}
```

[Full documentation →](skills/prompt-request-bus/SKILL.md)

### 🔄 Self-Improving Skills

A 7-step quality loop inspired by [Cognee's self-improving agents](https://www.cognee.ai):

```
OBSERVE → ANALYZE → DIAGNOSE → PROPOSE → EVALUATE → APPLY → RECORD
```

- **Automatic failure detection** — Score drops, trend analysis, consecutive failure alerts.
- **LLM-powered diagnosis** — Reads the failing skill + error logs, identifies root cause.
- **Safe auto-repair** — Low-risk fixes applied automatically. High-risk changes need human approval.
- **Drift detection** — Catches silent degradation (score drops >15% week-over-week).

[Full documentation →](skills/self-improving-skills/SKILL.md)

### 👁️ Knowledge Watcher

Monitors external changes and triggers improvement requests:

- **Tier 1 (every check):** Dependency versions, API changes, config drift
- **Tier 2 (daily):** Community patterns, user feedback, platform changes
- **Tier 3 (weekly):** Industry trends, competitor releases, best practice updates

When a change is detected:
1. Assess impact on existing skills
2. Generate a Prompt Request with severity rating
3. Route to Self-Improving Skills or human reviewer

[Full documentation →](skills/knowledge-watcher/SKILL.md)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Agent Skill Bus                     │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Knowledge   │  │    Prompt    │  │   Self-   │ │
│  │   Watcher     │──│   Request    │──│ Improving │ │
│  │   (detect)    │  │   Bus (route)│  │  (repair) │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│         │                  │                │       │
│         └──────────────────┼────────────────┘       │
│                            │                        │
│               ┌────────────┴────────────┐           │
│               │  JSONL Data Layer       │           │
│               │  • queue.jsonl          │           │
│               │  • skill-runs.jsonl     │           │
│               │  • knowledge-diffs.jsonl│           │
│               │  • active-locks.jsonl   │           │
│               └─────────────────────────┘           │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
              Your Agent Framework
         (OpenClaw, LangGraph, CrewAI,
          Claude Code, Codex, custom...)
```

## Framework Compatibility

> **Detailed comparison**: See [docs/comparison.md](docs/comparison.md) for a full feature matrix vs. LangGraph, CrewAI, AutoGen, Mastra, and VoltAgent.

Agent Skill Bus is **framework-agnostic**. It uses plain JSONL files as the data layer — no databases, no message brokers, no vendor lock-in.

| Framework | Integration | Notes |
|-----------|------------|-------|
| **OpenClaw** | Native | Built and battle-tested here |
| **Claude Code** | Via Skills | Drop into `.claude/skills/` |
| **Codex** | Via Skills | Drop into `.codex/skills/` |
| **LangGraph** | Via tool calls | Read/write JSONL in tool functions |
| **CrewAI** | Via tool calls | Same approach |
| **Custom** | Direct file I/O | It's just JSONL files |

## Production Stats

This framework runs in production at 合同会社みやび:

- **42 AI agents** coordinated daily
- **27 tasks/day** average throughput
- **44 cron jobs** feeding the bus
- **7-minute security incident response** (fastest recorded)
- **57% reduction in skill failures** after enabling self-improvement loop

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — See [LICENSE](LICENSE).

## Built by

**[合同会社みやび (LLC Miyabi)](https://miyabi-ai.jp)**

Building the future of AI agent operations.

- 🐦 [@The_AGI_WAY](https://x.com/The_AGI_WAY)
- 💬 [Discord](https://discord.gg/miyabi)
- 📧 shunsuke.hayashi@miyabi-ai.jp

---

## 日本語ドキュメント

### agent-skill-bus とは

AIエージェントシステム向けの**自己改善型タスクオーケストレーションフレームワーク**です。複数のAIエージェントが協調してタスクを実行する際に必要な、タスクキュー・スキル品質監視・ナレッジ管理の3つの機能を提供します。

Claude Code、Codex、LangGraph、CrewAI、AutoGenなど、あらゆるLLMエージェントと組み合わせて使用できます。依存関係ゼロ、MITライセンス。

### インストール

```bash
npm install agent-skill-bus
```

### クイックスタート

```bash
# プロジェクトを初期化
npx skill-bus init

# タスクキューを起動
npx skill-bus run
```

### モジュール一覧

| モジュール | 名称 | 説明 |
|-----------|------|------|
| **Prompt Request Bus** | DAGタスクキュー | 依存関係を考慮したタスクの並列・逐次実行 |
| **Self-Improving Skills** | スキル品質モニタリング | 各スキルの成功率・失敗パターンを追跡し、自動改善サイクルを実現 |
| **Knowledge Watcher** | ナレッジウォッチャー | コードベースやドキュメントの変更を監視し、エージェントのコンテキストを最新に維持 |

### ライセンス

MIT License — [合同会社みやび](https://miyabi-ai.jp)（代表: 林 駿甫）

---

> **完全版はこちら →** このリポジトリは Agent Skill Bus のコアランタイムです。**110以上の本番スキル**、マーケットプレイス、Miyabi Agent Society の全機能は **[agentskills.bath.me](https://agentskills.bath.me)** でご覧いただけます。
>
> **Full version here →** This repo is the core runtime only. For **110+ production-ready skills**, the marketplace, and the complete Miyabi Agent Society platform, head to **[agentskills.bath.me](https://agentskills.bath.me)**.
