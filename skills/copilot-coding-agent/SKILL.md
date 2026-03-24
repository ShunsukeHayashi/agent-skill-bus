---
name: copilot-coding-agent
description: GitHub Copilot Coding Agent をパイプラインに統合。Issue に @copilot をアサインして自動 Draft PR 生成。Triggers: copilot, コーパイロット, @copilot, coding agent, copilot pr
triggers:
  - copilot
  - copilot-coding-agent
  - "@copilot"
  - coding agent
  - copilot pr
---

# GitHub Copilot Coding Agent 統合スキル

**Version**: 1.0.0
**Last Updated**: 2026-03-24
**前提条件**: GitHub Copilot Pro 以上（アップグレード済み）

---

## 概要

GitHub Copilot Coding Agent は、Issue に `@copilot` をアサインするだけでクラウド上で
コードを実装し、Draft PR を自動生成するエージェント。

```
Issue 作成
  └── @copilot アサイン
        └── Copilot がクラウドで実装
              └── Draft PR 自動生成
                    └── Claude Code がレビュー → マージ判断
```

---

## 事前設定（リポジトリごとに1回）

### 1. GitHub.com で Copilot Coding Agent を有効化

```
リポジトリ → Settings → Copilot → Coding agent
→ "Enable Copilot coding agent" をオン
```

対象リポジトリ:
- `ShunsukeHayashi/KOTOWARI`
- `ShunsukeHayashi/HAYASHI_SHUNSUKE`
- `ShunsukeHayashi/context-and-impact`
- その他必要なリポジトリ

### 2. MCP アクセス許可（オプション）

```
Settings → Copilot → Coding agent → MCP servers
→ "Allow Copilot to use MCP servers" をオン
```

---

## クイックスタート

### パターン A: 新規 Issue を作って Copilot に投げる

```bash
# 1. Issue を作成して即アサイン
gh issue create \
  --repo ShunsukeHayashi/KOTOWARI \
  --title "feat: ログインページにダークモード追加" \
  --body "## やりたいこと
ログイン画面にダークモードを追加する。

## 要件
- ヘッダーにトグルボタン配置
- localStorage で設定保持
- Tailwind dark: プレフィックス使用" \
  --assignee @copilot
```

### パターン B: 既存 Issue に Copilot をアサイン

```bash
# Issue #123 に @copilot をアサイン
gh issue edit 123 \
  --repo ShunsukeHayashi/KOTOWARI \
  --add-assignee @copilot
```

### パターン C: [auto] ラベル + Copilot（既存 webhook-gate との併用）

```bash
# [auto] でウォームアップし、Copilot も同時アサイン
gh issue create \
  --repo ShunsukeHayashi/KOTOWARI \
  --title "[auto] feat: 機能概要" \
  --label "auto,feat" \
  --assignee @copilot \
  --body "..."
```

---

## 実行後の確認フロー

### 1. Copilot の作業状況を確認

```bash
# Issue のタイムラインを確認（Copilot のコメントが流れる）
gh issue view {number} --repo ShunsukeHayashi/KOTOWARI

# @copilot アサイン済み Issue を一覧
gh issue list \
  --repo ShunsukeHayashi/KOTOWARI \
  --assignee @copilot \
  --state open
```

### 2. Draft PR の確認

```bash
# Copilot が作成した Draft PR を確認
gh pr list \
  --repo ShunsukeHayashi/KOTOWARI \
  --author @copilot \
  --draft

# PR の diff を確認
gh pr diff {number} --repo ShunsukeHayashi/KOTOWARI

# CI ステータス確認
gh pr checks {number} --repo ShunsukeHayashi/KOTOWARI
```

### 3. レビュー → マージ

```bash
# Ready に変更
gh pr ready {number} --repo ShunsukeHayashi/KOTOWARI

# CI 通過後にマージ
gh pr merge {number} --repo ShunsukeHayashi/KOTOWARI --squash --delete-branch
```

### 4. Copilot に追加指示（PR コメント経由）

```bash
# PR に @github-copilot でフィードバック
gh pr comment {number} \
  --repo ShunsukeHayashi/KOTOWARI \
  --body "@github-copilot テストカバレッジを80%以上にしてください"
```

---

## 既存パイプラインとの使い分け

| シナリオ | 使うべき手段 | 理由 |
|---------|------------|------|
| 中規模の新機能（3-15 ファイル） | **Copilot Coding Agent** | クラウド実行・PR まで全自動 |
| 緊急バグ修正（1-2 ファイル） | **Claude Code（自分で）** | レイテンシが低い |
| 既存 webhook-gate 対象リポジトリ | **[auto] Issue** または **@copilot** | どちらも使える |
| 大規模リファクタリング | **Claude Code + Codex** | 文脈理解が必要 |
| セキュリティ修正 | **Claude Code（自分で）** | Issue に詳細を書けない |
| テストのみ追加 | **Copilot Coding Agent** | 定型作業に強い |
| ドキュメント整備 | **Copilot Coding Agent** | 機械的作業に最適 |

---

## OpenClaw パイプラインとの統合

### main エージェントへの Copilot タスク依頼フロー

```bash
# context-and-impact → main 経由で Copilot Issue 作成を依頼
openclaw agent --agent main --json -m '{
  "action": "copilot_issue",
  "repo": "ShunsukeHayashi/KOTOWARI",
  "title": "feat: 追加したい機能",
  "body": "要件...",
  "assignee": "@copilot"
}'
```

### Cron ベースの自動化（OpenClaw）

```yaml
# openclaw cron で週次タスクを Copilot に投げる例
name: weekly-tech-debt
schedule: "0 9 * * 1"  # 毎週月曜 9:00
agent: main
message: |
  技術的負債タスクを Copilot に投げてください:
  gh issue create --repo ShunsukeHayashi/KOTOWARI
    --title "[copilot] chore: 未使用インポートを全ファイルから除去"
    --assignee @copilot
    --body "..."
```

---

## Copilot vs [auto] 比較表

| 項目 | Copilot Coding Agent | [auto] Pipeline |
|------|---------------------|-----------------|
| 実行場所 | GitHub クラウド | Windows Gateway |
| 起動方法 | `@copilot` アサイン | `[auto]` タイトル |
| 対応リポジトリ | 全リポジトリ（設定後） | Webhook 設定済みのみ |
| MCP サポート | Pro 以上で可能 | なし |
| PR 作成 | 自動（Draft） | 自動（Draft/Ready） |
| テスト実行 | GitHub Actions | GitHub Actions |
| CI 連携 | 自動 | 自動 |
| セキュリティ Gate | GitHub ネイティブ | webhook-gate 独自 |
| レイテンシ | 数分〜 | 数分〜 |
| 追加指示 | PR コメント @github-copilot | 非対応 |
| 中断・再開 | 可能 | 非対応 |

---

## 全エージェントへの統合フロー

```
ユーザー / OpenClaw main
  │
  ├── [auto] Issue 作成  → webhook-gate → Windows Pipeline → PR
  │
  ├── @copilot アサイン  → GitHub Cloud  → Copilot → Draft PR
  │
  ├── Claude Code 直接実装
  │
  └── Codex 実装 (%305 ペイン)
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| Copilot が反応しない | リポジトリ設定未完了 | GitHub.com で Coding Agent を有効化 |
| Draft PR が来ない | Copilot が分析中 | `gh issue view {n}` でコメント確認（通常5-10分） |
| PR のコードが不正確 | Issue の要件が曖昧 | PR コメントで `@github-copilot 修正して` |
| CI が失敗 | 実装の不具合 | `@github-copilot CI エラーを修正して` |
| @copilot アサインできない | ライセンス不足 | Pro プランの確認 |

---

## 関連スキル

- `prompt-request` — [auto] Issue パイプライン（既存）
- `githubops-workflow` — GitHub Issue 駆動開発
- `openclaw-context-bridge` — OpenClaw main への指示送信
- `codex-workers` — Codex CLI 並行実装

---

## 設定状況（2026-03-24 時点）

| 項目 | 状態 |
|------|------|
| GitHub Copilot Pro | ✅ アップグレード済み |
| VS Code 拡張 | ✅ インストール済み (GitHub.copilot + GitHub.copilot-chat) |
| gh copilot CLI | ✅ v1.2.0 インストール済み |
| KOTOWARI リポジトリ有効化 | 要設定（GitHub.com Settings > Copilot） |
| MCP 統合 | 要設定（Settings > Copilot > MCP servers） |


---

## 実測データ（2026-03-24 KOTOWARIリポジトリで測定）

### パフォーマンス計測結果

| 指標 | サイクル1 (useAuth) | サイクル2 (useProjects) |
|------|-------------------|----------------------|
| Issue投入→PR作成 | 約18分 | 約1分未満（2回目以降） |
| テストコード量 | 185行 | 213行 |
| テスト結果 | 7/7 PASS ✅ | 10/10 PASS ✅ |
| テスト実行時間 | 225ms | 441ms |
| コード品質 | ◎ モック設計適切・型エラーなし | ◎ include設定も自律修正 |
| 追加変更 | vitest.config.ts最適化 | vitest.config.ts include追加 |

### 動作シーケンス（実測）

1. Issue作成 + @copilot アサイン
2. 数秒〜1分: Copilotがタスク解析開始 → `Initial plan` コミット作成 → Draft PR生成
3. 数分〜20分: 実装コミット追加（`test: ファイル名` 形式）
4. CI（Vercel Preview等）が自動実行

### 品質評価（useAuth テスト実測）

- vi.mock で依存サービスを正確にモック
- supabaseConfigured を変数で制御（テストごとに状態リセット）
- waitFor を使った非同期状態変化のテスト
- buildSession ヘルパーで型安全なテストデータ生成
- beforeEach で vi.clearAllMocks() 実施

### 判明した特性（2サイクル実測から確定）

- **初回ウォームアップ**: クラウド側のウォームアップで初回18分→2回目1分未満に劇的短縮
- **100%合格率**: 2回連続で全テストPASS（7/7, 10/10）
- **自律的改善**: vitest.config.tsの問題も自分で発見・修正
- **2段階コミット**: Initial plan → 実装コミットの順で進む（一貫）
- **仕様明確タスクに強い**: 繰り返し可能タスクで高品質（185行・213行）
- **フォールバックなし**: 失敗してもリトライしない（手動でPRコメントして再依頼）

### 最適投入タスクテンプレート

```bash
gh issue create \
  --repo OWNER/REPO \
  --title 'test: [対象ファイル名] のユニットテスト追加' \
  --body '## タスク
[対象ファイルパス] に対するユニットテストを Vitest + @testing-library/react で作成してください。

## 要件
- [配置先パス] に配置
- テストすべき状態: [状態A], [状態B], [状態C]
- 既存の vitest.config.ts に準拠
- TypeScript型エラーなし
- テストが実際にpassすること

## 注意
既存コードを変更しないこと。Draft PRで作成してください。' \
  --assignee @copilot \
  --label 'enhancement'
```

### PR確認・マージフロー

```bash
# 実装完了確認
gh pr list --repo OWNER/REPO --author @copilot --draft

# ローカルでテスト実行（必須）
git stash
git fetch origin [branch-name]
git checkout [branch-name]
npx vitest run [テストファイル] --reporter=verbose
git checkout -
git stash pop

# CI通過後にマージ
gh pr ready [PR番号] --repo OWNER/REPO
gh pr merge [PR番号] --repo OWNER/REPO --squash --delete-branch
```
