# Context & Impact — Context-to-Execution Pipeline (OpenClaw版)

## Description

4層統合コンテキスト収集 → プロンプト最適化 → スキル探索 → 実行 の完全パイプライン。
OpenClawエージェントがCLIコマンドで実行できる形式に最適化。

- **Layer 1**: Grep / find（完全一致・正規表現）
- **Layer 2a**: gitnexus CLI（コードグラフ・インパクト分析）
- **Layer 2b**: gitnexus cypher --repo obsidian（wikilink グラフ）
- **Layer 3**: Python + SmartConnectionsDatabase（セマンティック検索）
- **Phase B**: Context Engineering MCP（オプション・要Python backend起動）
- **Phase C**: agent-skill-bus（スキル探索・タスクキュー・自己改善ループ）

## Architecture

```
Task Input
    │
    ▼ PHASE A: Context Assembly
    ├── [L3]  semantic_search_cli()      → セマンティック関連ノート
    ├── [L2b] gitnexus cypher obsidian  → wikilink 依存ノート
    ├── [L2a] gitnexus impact           → コード変更リスク評価
    └── [L1]  grep / find              → 具体的なファイル内容
    │
    ▼ PHASE B: Context Optimization (Optional)
    └── context_engineering_mcp → quality score → template
    │
    ▼ PHASE C: Skill Selection & Dispatch
    ├── agent-skill-bus dashboard       → スキル健全性確認
    ├── agent-skill-bus enqueue         → タスクキュー投入
    └── openclaw agent message          → エージェントディスパッチ
```

---

## PHASE A: Context Assembly

### Golden Rule: どの層を使うか

| やりたいこと | 使う層 | コマンド |
|-------------|--------|---------|
| 概念・意味で検索 | L3 | `semantic_search_cli "{query}"` |
| ノートのwikilink依存確認 | L2b | `gitnexus cypher --repo obsidian "..."` |
| コード変更の影響範囲 | L2a | `gitnexus impact {target}` |
| ファイル名検索 | L1 | `find ~/dev -name "*{keyword}*"` |
| テキスト内容検索 | L1 | `grep -r "{keyword}" ~/dev/content/obsidian/` |

---

### Layer 1: Grep / Find（基盤層）

```bash
# ファイル名検索
find ~/dev/content/obsidian -name "*{キーワード}*" -type f | head -20

# テキスト内容検索（Obsidian vault）
grep -rl "{キーワード}" ~/dev/content/obsidian/ --include="*.md" | head -20

# コードベース検索
grep -rn "{関数名|クラス名}" ~/dev/products/kotowari/src/ --include="*.ts" | head -30

# フロントマター検索（タグ・タイトル）
grep -r "tags:.*{タグ名}" ~/dev/content/obsidian/ --include="*.md" | head -10
```

---

### Layer 2a: GitNexus コードグラフ

```bash
# インパクト分析（コード変更前に必ず実行）
gitnexus impact {functionName} --direction upstream --min-confidence 0.8 --max-depth 3

# 概念検索
gitnexus query "{payment processing}" --repo {repo-name}

# シンボル360°ビュー（呼び出し元・呼び出し先）
gitnexus context {functionName}

# git差分ベースの影響確認（コミット前）
gitnexus detect-changes --scope staged

# リポジトリ一覧
gitnexus repos
```

**リスク判定**:

| 影響シンボル数 | リスクレベル |
|--------------|-------------|
| < 5 symbols | LOW |
| 5〜15 symbols | MEDIUM |
| > 15 symbols | HIGH |
| 認証・決済経路 | CRITICAL |

---

### Layer 2b: GitNexus Obsidian wikilink グラフ

```bash
# ノート検索（名前・パス）
gitnexus cypher --repo obsidian \
  "MATCH (f:File) WHERE f.name CONTAINS '{キーワード}' RETURN f.name, f.filePath LIMIT 20"

# ノートのインパクト分析（参照元を全て取得）
gitnexus cypher --repo obsidian "
MATCH (doc:File) WHERE doc.name = '{filename.md}'
OPTIONAL MATCH (doc)-[out]->(outbound:File) WHERE out.reason = 'obsidian-wikilink'
OPTIONAL MATCH (inbound:File)-[inn]->(doc) WHERE inn.reason = 'obsidian-wikilink'
RETURN
  doc.name AS target,
  collect(DISTINCT outbound.name) AS references_to,
  collect(DISTINCT inbound.name) AS referenced_by,
  size(collect(DISTINCT inbound.name)) AS impact_count
"

# ドメイン横断リンク探索
gitnexus cypher --repo obsidian "
MATCH (a:File)-[r1]->(mid:File)-[r2]->(b:File)
WHERE r1.reason = 'obsidian-wikilink' AND r2.reason = 'obsidian-wikilink'
  AND (a.filePath STARTS WITH 'Docs-Legal' OR a.filePath STARTS WITH 'Docs-Financial')
RETURN a.name, mid.name, b.name LIMIT 30
"

# 孤立ノート検出
gitnexus cypher --repo obsidian "
MATCH (f:File) WHERE NOT (f)<-[]-(:File) AND NOT f.filePath STARTS WITH 'Daily/'
RETURN f.name, f.filePath LIMIT 20
"
```

**注意**: KùzuDB は `split()` 非対応。`STARTS WITH` + `CASE WHEN` で代替。

---

### Layer 3: セマンティック検索（SmartConnections）

MacBook Pro 上の SmartConnections MCP サーバーを Python 経由で直接呼び出す。

```bash
# セマンティック検索（CLIラッパー）
python3 -c "
import sys
sys.path.insert(0, '/Users/shunsukehayashi/dev/tools/smart-connections-mcp')
from server import SmartConnectionsDatabase
db = SmartConnectionsDatabase('/Users/shunsukehayashi/dev/content/obsidian')
db.load_embeddings()
results = db.semantic_search('$QUERY', limit=10)
for r in results:
    print(f\"{r['similarity']:.3f}  {r.get('path', r['key'])}\")
" 2>/dev/null
```

**シェル変数として使う場合**:

```bash
QUERY="合同会社みやび 設立 必要書類"
python3 -c "
import sys, os
sys.path.insert(0, '/Users/shunsukehayashi/dev/tools/smart-connections-mcp')
from server import SmartConnectionsDatabase
db = SmartConnectionsDatabase('/Users/shunsukehayashi/dev/content/obsidian')
db.load_embeddings()
results = db.semantic_search(os.environ['QUERY'], limit=10)
for r in results:
    print(f\"{r['similarity']:.3f}  {r.get('path', r['key'])}\")
" 2>/dev/null
```

**similarity の目安**:

| similarity | 意味 |
|-----------|------|
| 0.9〜 | ほぼ同一トピック |
| 0.7〜0.9 | 高い関連性 |
| 0.5〜0.7 | 関連あり |
| < 0.5 | 周辺的な関連 |

**注意**: MacBook Pro ローカル実行専用。他ノード（MainMini, MacMini2, Mini3）からは SSH 経由で実行。

```bash
# 他ノードからの呼び出し例（MainMini → MacBook Pro）
ssh macbook "QUERY='検索クエリ' python3 -c '...'"
```

---

## PHASE B: Context Engineering MCP（オプション）

Python バックエンドが必要。高精度タスク時のみ起動。

```bash
# バックエンド起動（MacBook Pro 上で実行）
cd ~/dev/platform/_mcp/context_engineering_MCP
uvicorn main:app --port 8888 --reload &
cd context_engineering && python context_api.py &

# MCPサーバー起動
cd mcp-server && node context_mcp_server.js &

# ヘルスチェック
curl -s http://localhost:9003/health | python3 -m json.tool
```

**コンテキスト品質スコア基準**:
```
< 70点: 改善必要
70〜85点: 標準的
85点以上: 高品質
```

---

## PHASE C: Agent Skill Bus

### スキル健全性チェック

```bash
# ダッシュボード
npx agent-skill-bus dashboard

# フラグ状態のスキルを確認
npx agent-skill-bus flagged

# 直近の実行状況
npx agent-skill-bus dashboard --days 3
```

### タスクキュー投入

```bash
# シンプルなタスク投入
npx agent-skill-bus enqueue \
  --source human \
  --priority high \
  --agent {agent-id} \
  --task "{タスク内容}"

# DAG依存タスク（A→B→C順序保証）
npx agent-skill-bus enqueue \
  --source human --priority high \
  --agent kotowari-dev \
  --task "認証リファクタリング" \
  --depends-on "db-migration-001"

# ディスパッチ可能なタスク確認
npx agent-skill-bus dispatch
```

### 実行結果記録（タスク完了後に必ず実行）

```bash
npx agent-skill-bus record-run \
  --agent {agent-id} \
  --skill context-and-impact \
  --task "{タスク概要}" \
  --result {success|fail|partial} \
  --score {0.0-1.0}
```

### OpenClaw エージェントへのディスパッチ

```bash
# openclaw-agents スキル経由
openclaw agent message {agent-id} "[TASK] {context付きタスク内容}"

# または tmux 経由（MacBook Pro上のエージェント）
tmux send-keys -t {pane-id} "[TASK] {タスク内容}" Enter
sleep 0.5
tmux send-keys -t {pane-id} Enter
```

**エージェント選択基準**:

| タスク種別 | 推奨エージェント | ノード |
|-----------|-----------------|--------|
| KOTOWARI開発 | kotowari-dev (38) | MacBook Pro |
| SNS投稿・分析 | sns-creator (29) | MainMini |
| コンテンツ生成 | content (2) | MacMini2 |
| 3Dモデリング | forge3d (13) | Mini3 |
| Claude Code連携 | cc-hayashi (37) | MacBook Pro |
| プロンプト最適化 | promptpro (11) | MacMini2 |
| 汎用 | main (0) | Windows Gateway |

---

## 統合ワークフロー例

### W1: コード変更前の完全チェック

```bash
# Step 1: コードグラフでインパクト分析
gitnexus impact AuthController --direction upstream --max-depth 3

# Step 2: 関連ドキュメントをセマンティック検索
QUERY="AuthController 認証 JWT" python3 -c "..."

# Step 3: wikilink で設計ドキュメントを展開
gitnexus cypher --repo obsidian \
  "MATCH (f:File) WHERE f.name CONTAINS 'auth' RETURN f.name LIMIT 10"

# Step 4: 実装ファイルの確認
grep -rn "AuthController" ~/dev/products/kotowari/src/ | head -20

# Step 5: タスク投入
npx agent-skill-bus enqueue --source human --priority high \
  --agent kotowari-dev --task "認証モジュールの改修（インパクト確認済み）"
```

### W2: Obsidian ノートの影響確認

```bash
# Step 1: セマンティック検索で関連ノートを発見
QUERY="{トピック}" python3 -c "..."

# Step 2: wikilink 依存を展開（どのノートから参照されているか）
gitnexus cypher --repo obsidian \
  "MATCH (inbound:File)-[r]->(doc:File) WHERE doc.name = '{filename.md}'
   AND r.reason = 'obsidian-wikilink' RETURN inbound.name, inbound.filePath"

# Step 3: ファイル内容を確認
cat ~/dev/content/obsidian/{path/to/note.md}
```

### W3: 未知の領域を探索

```bash
# Step 1: セマンティック検索で概念的に関連するものを発見
QUERY="{未知のトピック}" python3 -c "..."

# Step 2: コードグラフで実装を発見
gitnexus query "{トピック}"

# Step 3: wikilink追跡で関連ノートを広げる
gitnexus cypher --repo obsidian \
  "MATCH (f:File)-[r]->(related:File) WHERE f.name CONTAINS '{ヒット名}'
   AND r.reason = 'obsidian-wikilink' RETURN related.name, related.filePath"
```

---

## インデックス管理

```bash
# GNI Obsidian 再インデックス
cd ~/dev/content/obsidian && gitnexus analyze --force --embeddings

# GNI コードリポジトリ再インデックス
cd ~/dev/{repo-dir} && gitnexus analyze --force

# Smart Connections 埋め込み状態確認
python3 -c "
import sys
sys.path.insert(0, '/Users/shunsukehayashi/dev/tools/smart-connections-mcp')
from server import SmartConnectionsDatabase
db = SmartConnectionsDatabase('/Users/shunsukehayashi/dev/content/obsidian')
db.load_embeddings()
embedded = sum(1 for v in db.db.values() if v.get('embeddings'))
print(f'埋め込み済み: {embedded}')
" 2>/dev/null

# GNI インデックス状態確認
gitnexus status --repo obsidian
```

---

## 設定情報

| サービス | パス | 備考 |
|---------|------|------|
| Smart Connections MCP | `~/dev/tools/smart-connections-mcp/` | MacBook Pro ローカル |
| Obsidian Vault | `~/dev/content/obsidian/` | 4,685件 埋め込み済み |
| GNI repo (obsidian) | GNI内部 | 5,824ノード / 5,995エッジ |
| Context Engineering MCP | `~/dev/platform/_mcp/context_engineering_MCP/` | 要別途起動 |
| Agent Skill Bus | `~/dev/tools/agent-skill-bus/` | `npx agent-skill-bus` |
| agentskills.io | https://agentskills.io | 110+ スキル |

## Procedure

### Phase 0: 準備

1. `gitnexus status` でインデックスが最新か確認
2. 必要なら `gitnexus analyze --force` で再インデックス
3. `npx agent-skill-bus dashboard` でスキル健全性確認

### Phase A: コンテキスト収集

1. **L3** セマンティック検索で意味的に関連するノートを収集（上位 5〜10件）
2. **L2b** 収集したノートの wikilink 依存を展開（参照元・参照先）
3. **L2a** 変更対象コードのインパクト分析（`gitnexus impact`）
4. **L1** `grep` / `find` でファイル内容を詳細確認

### Phase B: コンテキスト最適化（高精度タスク時）

1. Context Engineering MCP バックエンドを起動
2. `analyze_context` で品質スコアを確認
3. 70点未満なら `auto_optimize_context` で改善
4. `render_template` でタスク種別最適テンプレートに整形

### Phase C: スキル選択と実行

1. `npx agent-skill-bus dashboard` でスキル健全性確認
2. タスク種別に合うエージェントを選択（上記エージェント選択基準参照）
3. `npx agent-skill-bus enqueue` でキューに投入（または直接 `openclaw agent message`）
4. タスク完了後に `record-run` で結果を記録

### Phase D: フィードバックループ

1. 実行結果を `record-run` に記録（score 0.0〜1.0）
2. `npx agent-skill-bus flagged` でスコア低下を検知
3. 劣化があれば `npx agent-skill-bus improve --skill context-and-impact` で自動修復
