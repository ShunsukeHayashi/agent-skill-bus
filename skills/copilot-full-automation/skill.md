# Copilot Full Automation Pipeline Skill

## 概要

GitHub Copilot Coding Agent を使った完全自動化パイプライン。
Issue ラベルを付けるだけで、コード実装 → AI レビュー → 自動マージまでを無人で完結する。

## アーキテクチャ

```
Issue に "copilot" ラベル
        │
        ▼
copilot-assign.yml
  GraphQL replaceActorsForAssignable
  + agentAssignment.targetRepositoryId
        │
        ▼
Copilot Coding Agent が実装開始
  → ブランチ作成
  → コミット
  → Draft PR 作成
        │
        ▼
ai-review.yml (PR open/sync トリガー)
  Claude Opus 4.6 がdiffをレビュー
  → APPROVE or REQUEST_CHANGES を PR に投稿
        │
        ▼
auto-merge.yml (check_run + review トリガー)
  CI (Type Check + Build Check) 通過 かつ
  AI レビュー APPROVE → squash merge
        │
        ▼
master ブランチにマージ完了
```

## GitHub Actions ワークフロー一覧

| ファイル | トリガー | 役割 |
|---------|---------|------|
| `copilot-assign.yml` | Issue labeled/opened (`copilot` ラベル) | Copilot Coding Agent を GraphQL でアサイン |
| `ci.yml` | PR open/push to master | Type Check (tests) + Build Check (syntax) |
| `ai-review.yml` | PR open/sync (Copilot PR のみ) | Claude Opus 4.6 による自動コードレビュー |
| `auto-merge.yml` | check_run + PR review | CI + APPROVE 確認後 squash merge |

## 使い方

### 新機能 Issue を Copilot に実装させる

```bash
# 1. Issue 作成（copilot ラベルを付ける）
gh issue create \
  --repo ShunsukeHayashi/agent-skill-bus \
  --title "feat: 新しいスキルの説明" \
  --label "copilot" \
  --body "## やりたいこと
詳細な要件...

## 完了条件
- [ ] テストが通る
- [ ] skill.md が正しい形式"

# 2. あとは自動で動く
# copilot-assign.yml → Copilot が実装開始
# ai-review.yml → Claude Opus がレビュー
# auto-merge.yml → CI + APPROVE でマージ
```

### CI 失敗時の自動修正

CI が失敗すると `ci.yml` の `notify-failure` ジョブが自動的に：
1. `[CI Failure]` Issue を作成
2. `copilot` ラベルを付与
3. Copilot Coding Agent をアサイン
4. エラーログを Issue 本文に添付

## 必須 GitHub Secrets

| Secret 名 | 説明 |
|-----------|------|
| `ANTHROPIC_API_KEY` | Claude Opus 4.6 用（メイントークン） |
| `ANTHROPIC_API_KEY_2` | レートリミット時のフォールバック |
| `ANTHROPIC_API_KEY_3` | 3つ目のフォールバック |

設定方法:
```bash
gh secret set ANTHROPIC_API_KEY --repo ShunsukeHayashi/agent-skill-bus
gh secret set ANTHROPIC_API_KEY_2 --repo ShunsukeHayashi/agent-skill-bus
gh secret set ANTHROPIC_API_KEY_3 --repo ShunsukeHayashi/agent-skill-bus
```

## 必須 GitHub ラベル

| ラベル | 色 | 用途 |
|--------|-----|------|
| `copilot` | `#0075ca` | Copilot Coding Agent 起動トリガー |
| `ci-failure` | `#d73a4a` | CI 失敗自動 Issue に付与 |
| `ai-review` | `#7057ff` | 手動でAIレビューをトリガー |

```bash
gh label create copilot --color "0075ca" --description "Trigger Copilot Coding Agent" --repo ShunsukeHayashi/agent-skill-bus
gh label create ci-failure --color "d73a4a" --description "CI failure auto-issue" --repo ShunsukeHayashi/agent-skill-bus
gh label create ai-review --color "7057ff" --description "Trigger Claude AI review" --repo ShunsukeHayashi/agent-skill-bus
```

## 重要な実装詳細

### なぜ REST API では Copilot が起動しないか

`gh issue create --assignee @copilot` や `assignees: ['Copilot']` は Copilot Coding Agent を**起動しない**。
必ず GraphQL `replaceActorsForAssignable` mutation + `agentAssignment.targetRepositoryId` を使う必要がある。

```javascript
// ✅ 正しい方法（copilot-assign.yml が使う方法）
await github.graphql(`
  mutation AssignCopilot($input: ReplaceActorsForAssignableInput!) {
    replaceActorsForAssignable(input: $input) { ... }
  }
`, {
  input: {
    assignableId: issueNodeId,
    actorLogins: [],
    agentAssignment: {
      targetRepositoryId: repoId,  // ← これが必須
      baseRef: 'master',
      customInstructions: '',
    },
  },
});

// ❌ 動かない方法
gh issue create --assignee @copilot
// または REST API の assignees フィールド
```

### AI レビューの判定ロジック

`ai-review.yml` は Claude Opus 4.6 に以下の形式で出力させる：
- `**[APPROVE]**` → `auto-merge.yml` がマージを実行
- `**[REQUEST_CHANGES]**` → マージをブロック、開発者が確認

### auto-merge の条件

```
CI チェック名 "Type Check" と "Build Check" が両方 success
かつ
PR レビュー state "APPROVED" が存在
かつ
"CHANGES_REQUESTED" が存在しない
```

## OpenClaw エージェント連携

```bash
# agent-skill-bus の Copilot Pipeline を OpenClaw から起動
# (copilot ラベル付き Issue を作成するだけで自動起動)
gh issue create \
  --repo ShunsukeHayashi/agent-skill-bus \
  --title "feat: $(echo $TASK_DESCRIPTION)" \
  --label "copilot" \
  --body "$TASK_BODY"
```

推奨エージェント:
- **cc-hayashi** (MacBook Pro): Claude Code 連携、Issue 作成、PR レビュー
- **kotowari-dev** (MacBook Pro): コーディングエージェント、実装
- **scholar** (MacMini2): リサーチ、仕様調査

## スキル実行記録

実行後は必ず記録:
```bash
npx agent-skill-bus record-run \
  --agent claude \
  --skill copilot-full-automation \
  --task "Copilot pipeline: <PR/Issue summary>" \
  --result success \
  --score 0.95
```
