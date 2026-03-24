---
name: cursor-agent
description: Cursor Agent CLI（cursor-agent バイナリ）でターミナルから自律コーディングを完全自動化。--print/--yolo/--worktree/--approve-mcps等の高度オプション対応。バイナリ直接解析済み。Triggers: cursor agent, カーソルエージェント, cursor cli, cursor --print
triggers:
  - cursor agent
  - cursor-agent
  - カーソルエージェント
  - cursor cli
  - cursor --print
  - background agent
---

# Cursor Agent CLI スキル（バイナリ直接解析版）

**バイナリ**: `~/.local/bin/cursor-agent` → `~/.local/share/cursor-agent/versions/2026.03.20-44cb435/cursor-agent`
**ラッパー**: `~/.local/bin/cursor` （シムスクリプト）
**バージョン**: 2026.03.20-44cb435（@anysphere/agent-cli-runtime）
**認証**: supernovasyun@gmail.com（ログイン済み）
**注意**: macOSキーチェーンロック時は `security unlock-keychain` が必要

---

## 重要な実態

`cursor agent` は実際には `cursor-agent` という独立したCLIバイナリ。
Cursor IDEのインストールは**不要**。バイナリ単体で動作する。

```bash
# cursor コマンドは「agent」以外の引数を受け付けない（IDE未インストール環境）
cursor agent --print "..."   # ✅ OK
cursor --help               # ❌ IDE未インストールエラー

# cursor-agent を直接呼ぶ場合
~/.local/bin/cursor-agent --print "..."
```

---

## 全オプション（バイナリ解析済み）

### 実行モード制御

| オプション | 説明 |
|-----------|------|
| `--print` | 非インタラクティブ・ヘッドレスモード（**自動化必須**） |
| `--yolo` | `--force` の別名。全コマンドを強制許可（確認プロンプトなし） |
| `-f, --force` | コマンドを強制許可（明示的に拒否されない限り） |
| `--cloud` / `-c` | クラウドモード（Background Agent起動） |
| `--background` / `-b` | `--cloud` の非推奨エイリアス |
| `--mode plan` | 読み取り専用・計画モード（コード変更なし） |
| `--mode ask` | Q&Aモード（説明・質問のみ） |
| `--plan` | `--mode=plan` のショートハンド |
| `--trust` | ワークスペースを確認なしで信頼（`--print`/ヘッドレス時のみ有効） |

### ワークスペース・Git

| オプション | 説明 |
|-----------|------|
| `--workspace <path>` | ワークスペースディレクトリ指定（デフォルト: カレント） |
| `-w, --worktree [name]` | 隔離されたgit worktreeで実行 `~/.cursor/worktrees/<repo>/<name>` |
| `--worktree-base <branch>` | worktreeのベースブランチ指定（デフォルト: 現在のHEAD） |
| `--skip-worktree-setup` | `.cursor/worktrees.json` のセットアップスクリプトをスキップ |

### MCP・サンドボックス

| オプション | 説明 |
|-----------|------|
| `--approve-mcps` | 全MCPサーバーを自動承認 |
| `--sandbox enabled/disabled` | サンドボックスモードを明示的に制御（設定上書き） |

### モデル・出力

| オプション | 説明 |
|-----------|------|
| `--model <model>` | 使用モデル指定 |
| `--list-models` | 利用可能なモデル一覧を表示して終了 |
| `--output-format` | 出力形式（デフォルト: テキスト） |
| `--stream-partial-output` | 部分出力をストリーミング |
| `--verbose` | 詳細ログ出力 |
| `--debug` | デバッグモード |

### セッション管理

| オプション | 説明 |
|-----------|------|
| `--resume [chatId]` | 指定セッションを再開（chatId省略時は選択UI） |
| `--continue` | 直前のセッションを継続 |

### ファイル制御（自動化向け）

| オプション | 説明 |
|-----------|------|
| `--allow-paths <paths>` | 操作許可パスを明示指定 |
| `--readonly-paths <paths>` | 読み取り専用パスを指定 |
| `--blocked-patterns <patterns>` | 操作ブロックするパターン |
| `--cursor-ignore` | .cursorignore を適用 |
| `--exclude-workspace-context` | ルール・スキル・トランスクリプト等のワークスペースコンテキストを除外 |
| `--disable-indexing` | インデックス作成を無効化 |

---

## 利用可能なモデル（バイナリ解析済み）

```
sonnet-4                      # Claude Sonnet 4（デフォルト推奨）
sonnet-4-thinking             # Claude Sonnet 4 + 思考モード
gpt-5                         # GPT-5
us.anthropic.claude-sonnet-4-6
us.anthropic.claude-opus-4-6-v1
```

---

## 自動化パターン（ベストプラクティス）

### 完全自動化（確認ゼロ）

```bash
cursor agent --print --yolo --trust \
  --workspace ~/dev/products/kotowari \
  "タスク内容"
```

### MCP有効化 + 完全自動

```bash
cursor agent --print --yolo --approve-mcps \
  --workspace ~/dev/products/kotowari \
  "GitHubのPRを確認してコードレビューして"
```

### 隔離worktreeで安全実行（本番コードを汚さない）

```bash
# feature/xxx ブランチをベースに隔離worktreeで実行
cursor agent --print --yolo \
  --worktree my-feature \
  --worktree-base main \
  --workspace ~/dev/products/kotowari \
  "新機能を実装してください"
# 作業後: ~/.cursor/worktrees/kotowari/my-feature/ に結果
```

### 特定ファイルのみ許可（セキュア実行）

```bash
cursor agent --print --yolo \
  --workspace ~/dev/products/kotowari \
  --allow-paths "src/hooks,src/components" \
  --readonly-paths "src/services,supabase" \
  "hooksのリファクタリングをしてください"
```

### 計画確認のみ（コード変更なし）

```bash
cursor agent --print --mode plan \
  --workspace ~/dev/products/kotowari \
  "認証フローのセキュリティ問題を分析して"
```

### OpenClawエージェントからの呼び出し

```bash
RESULT=$(cursor agent --print --yolo --trust \
  --workspace /path/to/repo \
  "タスク内容" 2>&1)
echo "$RESULT"
```

### バックグラウンド実行 + 完了通知

```bash
cursor agent --print --yolo \
  --workspace ~/dev/products/kotowari \
  "テストを追加して" > /tmp/cursor_result.txt 2>&1 && \
  ~/bin/announce "Cursor Agent完了: $(wc -l < /tmp/cursor_result.txt)行の出力" || \
  ~/bin/announce "Cursor Agentエラー発生"
```

---

## 適材適所マトリクス

| タスク種別 | Cursor Agent | Claude Code | Copilot | Devin |
|-----------|-------------|-------------|---------|-------|
| 大量ファイルリファクタ（>15ファイル） | ✅ 最適 | 可能 | △ | ✅ |
| 長時間・バックグラウンド | ✅ 最適 | △ | ✅ | ✅ |
| worktree隔離実行 | ✅ 最適 | △ | ✗ | ✗ |
| MCP連携タスク | ✅ | ✅ | △ | ✗ |
| 即時・小規模修正（<3ファイル） | △ オーバーキル | ✅ 最適 | ✗ | ✗ |
| 中規模機能追加（3-15ファイル） | ✅ | ✅ | ✅ 最適 | ✅ |
| 自律的バグ修正+PR作成 | △ | ✗ | ✅ | ✅ 最適 |
| セキュリティ機密変更 | ⚠️ 要注意 | ✅ 最適 | ✗ | ⚠️ |
| コードレビュー・分析のみ | ✅ (plan mode) | ✅ | ✗ | ✗ |

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `keychain is locked` | macOSキーチェーンロック | `security unlock-keychain` → パスワード入力 |
| `No Cursor IDE installation found` | シムが`agent`以外の引数 | `cursor agent` を使う（`cursor --help`はNG） |
| タイムアウト | 長時間タスク | `--yolo` + バックグラウンド実行 |
| 許可プロンプトで停止 | インタラクティブ待ち | `--print --yolo --trust` を付加 |
| ワークスペース不明 | 相対パス | `--workspace` に絶対パスを指定 |

---

## 設定ファイル

### .cursor/worktrees.json（worktreeセットアップ定義）

```json
{
  "setup": [
    "npm install",
    "cp .env.example .env"
  ]
}
```

### .cursorrules（プロジェクト固有ルール）

```
# このプロジェクトのルール
- TypeScriptを使用すること
- テストはVitestで書くこと
- コメントは日本語で
```


---

## 実測・判明事項（2026-03-24）

### キーチェーン問題（重要）

macOSキーチェーンがロックされているとcursor-agentが起動しない。
SSH越しの自動化では特に問題になる。

**回避策（推奨）**:
```bash
# 方法1: CURSOR_API_KEY環境変数（最も確実）
export CURSOR_API_KEY="your_key_here"
cursor agent --print --trust --yolo "タスク"

# 方法2: --trust フラグ（ヘッドレス環境向け）
cursor agent --print --trust --yolo --workspace /path/to/repo "タスク"
```

**CURSOR_API_KEYの取得**:
Cursor Settings > Account > API Keys でAPIキーを生成してtokens.confに追記:
```bash
export CURSOR_API_KEY="cursor_..."
```

### 完全自動化コマンド（SSH越しでも動作）

```bash
ssh macbook "
  source ~/.config/claude-env/tokens.conf
  CURSOR_API_KEY=\$CURSOR_API_KEY cursor agent --print --yolo --trust \
    --workspace ~/dev/products/kotowari \
    'タスク内容' > /tmp/cursor_result.txt 2>&1
  cat /tmp/cursor_result.txt
  ~/bin/announce 'Cursor Agent完了'
"
```

### コマンド体系（バイナリ解析で判明した全サブコマンド）

```
cursor agent login/logout/status    # 認証管理
cursor agent models                 # 利用可能モデル一覧
cursor agent ls                     # 過去セッション一覧
cursor agent resume [chatId]        # セッション再開
cursor agent create-chat            # 新規チャット作成
cursor agent generate-rule          # ルール生成
cursor agent mcp list/enable/disable # MCP管理
cursor agent update                 # バージョン更新
cursor agent about                  # バージョン情報
```

### 利用可能モデル（バイナリ解析済み）

```
sonnet-4                    # Claude Sonnet 4（推奨）
sonnet-4-thinking           # Claude Sonnet 4 + 思考
gpt-5                       # GPT-5
us.anthropic.claude-sonnet-4-6
us.anthropic.claude-opus-4-6-v1
auto                        # コスト・品質・安定性で自動選択
```

### output-format stream-json のイベント形式

```json
{"type":"system","subtype":"init","session_id":"uuid"}
{"type":"assistant","message":{"content":[{"text":"..."}]}}
{"type":"tool_call","subtype":"started","name":"write_file"}
{"type":"tool_call","subtype":"completed","result":"..."}
{"type":"result","subtype":"success","session_id":"uuid"}
```
