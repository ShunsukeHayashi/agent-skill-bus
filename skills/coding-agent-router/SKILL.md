# Coding Agent Router

## Description
タスクを自動分析して最適なコーディングエージェント（Copilot/Devin/Cursor/Claude Code/Manus）にルーティングする自動化スキル。実測データに基づく精度の高い振り分けロジック。

## Core Concept

```
ユーザー/OpenClaw
    ↓
[agent-router] タスク分析（キーワード + ファイル数 + 緊急度）
    ↓
┌──────────────┬──────────┬──────────────┬────────────┬─────────┐
│ Claude Code  │ Copilot  │ Cursor Agent │ Devin      │ Manus   │
│ 即時/機密    │ 中規模   │ 大規模/bg    │ 自律バグ   │ リサーチ│
│ セキュリティ │ テスト   │ リファクタ   │ PR自動作成 │ レポート│
└──────────────┴──────────┴──────────────┴────────────┴─────────┘
    ↓
PR自動作成 → CI確認 → announce通知
```

## Agent Capability Matrix（実測データ付き）

| エージェント | Issue→PR | テスト品質 | 対応規模 | コスト | 自律度 |
|------------|---------|-----------|---------|-------|-------|
| Copilot | 1分〜18分 | ◎（7/7 PASS実測） | 中（3-15ファイル） | Proプランに含む | 高 |
| Cursor Agent | 即時 | ◎ | 大（制限なし） | Proプラン | 高 |
| Devin | 数分〜 | ◎ | 大 | $2.25/ACU（Team以上必要） | 最高 |
| Manus | 数分〜 | - | リサーチ特化 | 300クレジット/日（無料） | 高 |
| Claude Code | 即時 | ◎ | 小〜中 | 会話コスト | 中 |

## Routing Logic

```bash
# セキュリティ・機密 → Claude Code
security|secret|credential → claude

# リサーチ・レポート・調査 → Manus
リサーチ|調査|レポート|research|report → manus

# 大量ファイル・リファクタ → Cursor Agent
全.*ファイル|大量|一括|refactor|migration → cursor

# 自律バグ修正・PR自動作成 → Devin（Teamプラン以上）
バグ修正|bug.*fix|自律|自動.*PR → devin

# テスト追加・中規模機能 → Copilot
テスト.*追加|機能.*追加|feat|test.*add → copilot

# デフォルト → Claude Code
```

## Usage

```bash
# インストール
cp ~/bin/agent-router /usr/local/bin/

# 実行
agent-router "useProjectsのテストを追加して" --repo ShunsukeHayashi/KOTOWARI
agent-router "セキュリティ脆弱性を修正して"
agent-router "競合他社のAIサービスをリサーチしてレポートを作成"
agent-router "全TypeScriptファイルのimportをまとめてリファクタ"

# ドライラン（エージェント選択確認のみ）
agent-router "テストを追加して" --dry-run
```

## Known Limitations

- Devin: Coreプランではセッション作成API（POST）が403。Teamプラン（$500/月）以上が必要
- Manus: APIキー未設定時はスキップ（tokens.confにMANUS_API_KEYを追加で有効化）
- Cursor Agent: SSH越しでのキーチェーンロック問題 → CURSOR_API_KEY環境変数で回避

## Files

- `skill.md` - このファイル
- `../../bin/agent-router` - 実行スクリプト（~/bin/agent-router）

## Integrations

- `copilot-coding-agent` - GitHub Copilot Coding Agent
- `cursor-agent` - Cursor Agent CLI
- `devin-agent` - Devin AI
- `manus-agent` - Manus AI
