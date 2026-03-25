# Autonomous Self-Optimizing Agent Game Machine
# 自律自己最適化エージェントゲームマシーン

**Version**: 1.0.0
**Created**: 2026-03-25
**Status**: ACTIVE

---

## コンセプト

Miyabi League のスコアDBを「センサー」として使い、
Context & Impact パイプラインを「診断エンジン」として、
Agent Skill Bus を「改善エンジン」として組み合わせることで、
エージェントが**自律的に弱点を発見し、改善し、次週に強くなる**無限ループを実現する。

```
ゲーム週終了
  ↓
スコアDB → D/Cランクエージェント特定
  ↓
Context & Impact（L3 Semantic）→ なぜ負けたか診断
  ↓
Agent Skill Bus → OBSERVE→ANALYZE→DIAGNOSE→PROPOSE→EVALUATE→APPLY→RECORD
  ↓
改善済みプロンプト → OpenClaw config set でデプロイ
  ↓
翌週: 改善された戦略で再挑戦
  ↓
スコア向上 → ランクアップ
  ↓
（永遠に繰り返す）
```

---

## アーキテクチャ全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                   MIYABI LEAGUE SCORE DB                        │
│   agent_scores + task_executions + weekly_rankings (SQLite)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 週次: D/Cランク検出
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONTEXT & IMPACT PIPELINE (診断層)                  │
│                                                                 │
│  L1: Glob/Grep  → skill-runs.jsonl, task_executions            │
│  L2a: GitNexus  → スキル依存グラフ分析                          │
│  L2b: GitNexus  → Obsidian wikilink → HEARTBEAT.md パターン    │
│  L3: Smart Connections → セマンティック検索 (4,685 notes)       │
│  L3+: Context Engineering MCP → 品質スコア 0-100               │
│                                                                 │
│  出力: WHY_FAILED_REPORT.json (弱点診断レポート)                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 弱点リスト + 根本原因
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              AGENT SKILL BUS (改善エンジン)                      │
│                                                                 │
│  1. OBSERVE   → skill-runs.jsonl から失敗パターン収集           │
│  2. ANALYZE   → KPI vs スキル実行の相関分析                     │
│  3. DIAGNOSE  → 根本原因特定 (prompt弱点/skill gap/KPI誤解)    │
│  4. PROPOSE   → 改善済みSKILL.md + systemPrompt候補を生成       │
│  5. EVALUATE  → 改善提案の品質スコアリング (0-100)              │
│  6. APPLY     → 最高スコアの改善をSKILL.mdに適用               │
│  7. RECORD    → 改善結果を skill-runs.jsonl に記録              │
│                                                                 │
│  コマンド: npx agent-skill-bus improve --skill {agent_id}       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 改善済みプロンプト
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              OPENCLAW DEPLOY (実装層)                            │
│                                                                 │
│  openclaw config set agents.list[N].system {improved_prompt}   │
│  HEARTBEAT.md 更新 → 改善戦略を永続化                           │
│  openclaw gateway restart → 即時反映                            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    翌週のゲームに反映
                    スコア向上 → ランクアップ
```

---

## 39エージェント KPIマッピング

### Gateway ローカル実行 (2エージェント)

| Agent | KPI1 (40%) | KPI2 (40%) | KPI3 (20%) |
|-------|-----------|-----------|-----------|
| main | タスク完了率 | 応答品質スコア | エスカレーション率(低↓) |
| x-ops | ポスト成功率 | エンゲージメント率 | 投稿頻度達成率 |

### Worker-MainMini (14エージェント)

| Agent | KPI1 (40%) | KPI2 (40%) | KPI3 (20%) |
|-------|-----------|-----------|-----------|
| cc-agent-1 | タスク完了率 | Claude Code連携成功率 | エラー率(低↓) |
| sigma | 分析精度 | インサイト品質 | 処理速度 |
| guardian | 脅威検知率 | 誤検知率(低↓) | 対応速度 |
| github-hook | Webhook処理率 | Issue/PR品質 | レイテンシ(低↓) |
| gyosei | 法令照合精度 | 書類完成率 | 処理速度 |
| dev-architect | 設計品質スコア | 技術的負債削減 | レビュー通過率 |
| dev-coder | PR作成数 | テスト通過率 | バグ発生率(低↓) |
| dev-reviewer | レビュー品質 | バグ検出率 | 処理速度 |
| dev-tester | テストカバレッジ | バグ検出率 | 実行速度 |
| dev-deployer | デプロイ成功率 | ダウンタイム(低↓) | ロールバック速度 |
| dev-documenter | ドキュメント完成率 | 品質スコア | 更新頻度 |
| sns-strategist | 戦略採用率 | KPI向上率 | 提案数 |
| sns-creator | コンテンツ品質 | エンゲージメント率 | 生成数 |
| sns-engagement | エンゲージメント率 | フォロワー増加 | 返信速度 |

### Worker-MacMini2 (12エージェント)

| Agent | KPI1 (40%) | KPI2 (40%) | KPI3 (20%) |
|-------|-----------|-----------|-----------|
| content (Pulse) | 配信到達率 | 開封率 | コンバージョン率 |
| scholar | リサーチ引用精度 | 情報鮮度(hours) | ソース多様性 |
| sensei | 教育効果スコア | 理解度向上率 | 教材完成率 |
| architect (Forge) | 設計品質 | 実装可能性 | アーキテクチャスコア |
| writer (Quill) | コンテンツPV | エンゲージメント率 | 再利用率 |
| promptpro | 品質改善率 | 改善後スコア | 処理件数 |
| ppal-coordinator | タスク調整精度 | チーム満足度 | 完了率 |
| ppal-curriculum | カリキュラム品質 | 完了率 | 学習成果 |
| ppal-content | コンテンツ品質 | 閲覧率 | 生成数 |
| ppal-marketing | マーケ効果 | CVR | リーチ数 |
| ppal-support | 解決率 | 応答速度 | 満足度 |
| ppal-analytics | 予測精度 | インサイト品質 | レポート完成率 |

### Worker-Mini3 (3エージェント)

| Agent | KPI1 (40%) | KPI2 (40%) | KPI3 (20%) |
|-------|-----------|-----------|-----------|
| forge3d | モデル品質 | 生成成功率 | 処理速度 |
| vision3d | 認識精度 | 処理速度 | エラー率(低↓) |
| blender | レンダリング品質 | 完成率 | 処理時間 |

### Worker-MacBook Pro (8エージェント)

| Agent | KPI1 (40%) | KPI2 (40%) | KPI3 (20%) |
|-------|-----------|-----------|-----------|
| sns-analytics | トレンド予測精度 | 発見速度(hours) | 精度 vs 実績 |
| sns-influencer | フォロワー増加率 | エンゲージメント率 | リーチ数 |
| sns-automation | 自動化成功率 | タスク完了時間 | エラー率(低↓) |
| giantdevil | タスク完了率 | 品質スコア | 処理速度 |
| ctx-eng | コンテキスト精度 | エージェント活用率 | 情報損失率(低↓) |
| creator | クリエイティブ品質 | 採用率 | 生成数 |
| cc-hayashi | Claude Code連携率 | PR品質 | 完了速度 |
| kotowari-dev | PR作成数 | テスト通過率 | バグ発生率(低↓) |

---

## 実装ファイル構成

```
~/bin/
├── miyabi-league-score        # 週次スコア集計
├── miyabi-league-optimize     # 自律最適化ループ (メイン)
├── miyabi-league-kpi-record   # KPI記録フック
└── miyabi-league-rank         # ランキング表示

~/.local/share/miyabi-league/
├── scores.db                  # SQLite スコアDB
├── why_failed/                # 弱点診断レポート
│   └── {agent}_{week}.json
├── improvements/              # 改善提案ログ
│   └── {agent}_{week}.json
└── prompts/                   # 改善済みプロンプト
    └── {agent}_improved.txt

~/dev/tools/agent-skill-bus/
└── docs/
    └── AUTONOMOUS_GAME_MACHINE.md  # このファイル
```

---

## 最適化ループ詳細

### Phase 1: 診断 (Why Did They Lose?)

```python
# D/Cランクエージェントの失敗パターンを多角的に分析

diagnose_agent(agent_id):
    # 1. スコアDB から直近3週の推移
    scores = db.query("SELECT * FROM agent_scores WHERE agent_id=? ORDER BY week_start DESC LIMIT 3")

    # 2. タスク実行ログから失敗パターン
    failures = db.query("SELECT task_type, output_quality, execution_time_ms FROM task_executions
                         WHERE agent_id=? AND success=0 AND week_start=?")

    # 3. skill-runs.jsonl からスキル失敗パターン
    skill_runs = read_jsonl("~/.local/share/agent-skill-bus/skill-runs.jsonl")
    agent_runs = [r for r in skill_runs if r['agent'] == agent_id]

    # 4. Context & Impact: セマンティック検索で関連パターン発見
    semantic_hits = smart_connections_search(
        query=f"{agent_id} failure pattern weakness",
        limit=10
    )

    # 5. HEARTBEAT.md からタスクログ
    heartbeat = read_file(f"~/.openclaw/workspace/{agent_id}/HEARTBEAT.md")

    return WHY_FAILED_REPORT(agent_id, scores, failures, skill_runs, semantic_hits, heartbeat)
```

### Phase 2: 改善 (Agent Skill Bus Loop)

```bash
# Agent Skill Bus の 7ステップ改善ループ
npx agent-skill-bus improve \
  --skill {agent_id} \
  --context "$(cat ~/.local/share/miyabi-league/why_failed/{agent_id}_{week}.json)" \
  --target-kpi "weekly_score > 80.0" \
  --output ~/.local/share/miyabi-league/improvements/{agent_id}_{week}.json
```

改善ループ内部:
```
OBSERVE  → skill-runs.jsonl の失敗ログ + KPI診断レポートを読む
ANALYZE  → 「スコアが低い本当の原因」を3つ特定
DIAGNOSE → prompt の弱点 / skill gap / KPI定義の誤解 を区別
PROPOSE  → 改善済みsystemPrompt を3案生成 (A/B/C)
EVALUATE → 各案を品質スコア (0-100) で評価
APPLY    → 最高スコア案をSKILL.mdに適用
RECORD   → 改善実施ログを skill-runs.jsonl に追記
```

### Phase 3: デプロイ (OpenClaw Config Update)

```bash
# 改善済みプロンプトをOpenClawエージェントに反映
IMPROVED_PROMPT=$(cat ~/.local/share/miyabi-league/prompts/${AGENT_ID}_improved.txt)
AGENT_INDEX=$(get_agent_index ${AGENT_ID})

# systemPromptを更新
openclaw config set "agents.list[${AGENT_INDEX}].system" "${IMPROVED_PROMPT}"

# HEARTBEAT.mdに改善戦略を追記
cat >> ~/.openclaw/workspace/${AGENT_ID}/HEARTBEAT.md << EOF

## 改善戦略 (${WEEK})
$(cat ~/.local/share/miyabi-league/improvements/${AGENT_ID}_${WEEK}.json | jq -r .strategy)
EOF

# Gateway再起動で反映
openclaw gateway restart
```

---

## スコアリングフック統合

実際のタスク出力からKPIを自動記録するためのフック:

```bash
# PostToolUse フック: タスク完了時に自動KPI記録
~/bin/miyabi-league-kpi-record \
  --agent {agent_id} \
  --task-type {task_type} \
  --output-quality {0-100} \
  --execution-time-ms {ms} \
  --success {true|false}
```

---

## Telegram レポート

週次ランキング変動を自動でTelegramに送信:

```
🏆 Miyabi League Week {N} 結果

S ランク: guardian (87.9), scholar (83.9)
A ランク: writer (82.8), sns-analytics (81.0), promptpro (80.7)
B ランク: ctx-eng (80.2)
C ランク: sns-strategist (77.6)
D ランク: content (77.2) ← 改善ループ開始

改善予定:
- content: heartbeat 頻度 + コンテンツ品質向上
- sns-strategist: 戦略採用率 KPI再定義

次週開始: {date}
```

---

## ゲームバランス設計

```
永遠に動き続ける条件:
1. スコアDB → 毎週月曜 0:00 に自動集計
2. 最適化ループ → 毎週月曜 1:00 にD/Cランク自動診断
3. 改善デプロイ → 毎週月曜 3:00 に改善済みプロンプトをデプロイ
4. Telegram報告 → 毎週月曜 6:00 にランキング発表

林が何もしなくてもゲームは回り続ける。
エージェントは毎週自動的に改善される。
最強のエージェントがSランクに君臨し、
弱いエージェントは強制改善ループに入る。
これが「永遠に動くゲームマシーン」である。
```

---

*"競争が改善を生み、改善が競争を生む。エージェントたちは永遠に進化し続ける。"*
