# Note Publisher

## Description
last30days の JSON 出力を受け取り、note.com 記事フォーマットに変換して自動投稿するパイプラインスキル。週次 AI トレンドまとめを 980〜1,980円/記事で継続的に配信する。

## Architecture

```
last30days --json   →   Markdown変換   →   note形式フォーマット   →   note.com 自動投稿
   (JSON入力)           (normalize)          (apply template)          (POST /api/v1/note)
```

```
┌──────────────┐   ┌───────────────┐   ┌────────────────────┐   ┌──────────────────┐
│  last30days  │──→│  JSON Parser  │──→│  Article Formatter │──→│  note.com API    │
│  --json      │   │  (normalize)  │   │  (template apply)  │   │  (publish/draft) │
└──────────────┘   └───────────────┘   └────────────────────┘   └──────────────────┘
                                               │
                                               ↓
                                    article-template.md
```

## Pipeline Steps

### Step 1: INPUT — last30days JSON を取得

```bash
# last30days スキルを実行して JSON 出力を保存
last30days --json > /tmp/last30days-output.json
```

期待される入力形式:
```json
{
  "period": "2026-03-01T00:00:00Z/2026-03-31T23:59:59Z",
  "highlights": [
    { "rank": 1, "title": "...", "summary": "...", "impact": "high", "tags": ["AI"] },
    { "rank": 2, "title": "...", "summary": "...", "impact": "medium", "tags": ["LLM"] }
  ],
  "trends": [
    { "name": "...", "direction": "rising|stable|falling", "detail": "..." }
  ],
  "stats": { "totalItems": 0, "avgImpactScore": 0.0 }
}
```

### Step 2: CONVERT — Markdown 変換

```bash
# JSON → Markdown 変換（article-template.md を適用）
# scripts/publish-to-note.js が変換とテンプレート適用を担当
node scripts/publish-to-note.js \
  --input /tmp/last30days-output.json \
  --template skills/note-publisher/article-template.md \
  --output /tmp/note-article.md
# → テンプレート変数を置換して note 記事 Markdown を生成
```

変換ルール:
- `{{YEAR_MONTH}}` → 対象期間の年月 (例: `2026年3月`)
- `{{WEEK_NUM}}` → 対象週番号 (例: `4`)
- `{{LEAD_TEXT}}` → リード文（150〜200字）
- `{{HIGHLIGHTS}}` → ハイライト3選ブロック
- `{{TRENDS}}` → 技術トレンドブロック
- `{{BUSINESS_IMPACT}}` → ビジネスインパクトブロック
- `{{JP_INSIGHTS}}` → 日本語圏への示唆ブロック
- `{{HASHTAGS}}` → ハッシュタグ行

### Step 3: FORMAT — note 記事フォーマット適用

記事仕様:
- **文字数**: 2,000〜3,500字
- **タイトル形式**: `【週次まとめ】YYYY年MM月W週 AI・テックハイライト`
- **構成**:
  1. リード文（150〜200字）
  2. ハイライト3選（各 300〜400字）
  3. 技術トレンド（400〜600字）
  4. ビジネスインパクト（300〜400字）
  5. 日本語圏への示唆（300〜400字）
  6. まとめ（100〜150字）
  7. ハッシュタグ
- **ハッシュタグ**: `#AI #生成AI #テック #週次まとめ`

### Step 4: PUBLISH — note.com に投稿

```bash
# 下書き投稿（確認後に公開）
curl -s -X POST https://note.com/api/v1/text_notes \
  -H "Content-Type: application/json" \
  -H "Cookie: note_session_v2=${NOTE_SESSION}" \
  -d "$(jq -n \
    --arg title "$(head -1 /tmp/note-article.md | sed 's/^# //')" \
    --arg body "$(cat /tmp/note-article.md)" \
    '{name: $title, body: $body, status: "draft", price: 980}')"

# 公開済みに更新（任意）
# note.com 管理画面からも手動で公開可能
```

環境変数:
| 変数名 | 説明 | 取得方法 |
|--------|------|---------|
| `NOTE_SESSION` | note.com セッション Cookie | ブラウザの DevTools → Application → Cookies → `note_session_v2` の値をコピー。Cookie は定期的に失効するため（目安: 数週間〜数ヶ月）、自動化ランが失敗したら再取得して `.env` を更新する |

## Data Files

| ファイル | 用途 |
|---------|------|
| `article-template.md` | note 記事 Markdown テンプレート |
| `weekly-schedule.plist` | macOS LaunchAgent 週次スケジューラー |
| `publish-log.jsonl` | 投稿履歴ログ（自動生成） |

### `publish-log.jsonl` (投稿ログ)

```jsonl
{"ts":"2026-03-25T09:00:00Z","period":"2026-03-18/2026-03-24","title":"【週次まとめ】2026年3月W4 AI・テックハイライト","noteUrl":"https://note.com/your-handle/n/xxxxx","status":"published","wordCount":2850,"price":980}
```

## Scheduling

### macOS LaunchAgent（週次自動実行）

`weekly-schedule.plist` を使って毎週火曜日 09:00 に自動実行:

```bash
# インストール
cp skills/note-publisher/weekly-schedule.plist ~/Library/LaunchAgents/jp.miyabi-ai.note-publisher.plist
launchctl load ~/Library/LaunchAgents/jp.miyabi-ai.note-publisher.plist

# 確認
launchctl list | grep note-publisher

# アンインストール
launchctl unload ~/Library/LaunchAgents/jp.miyabi-ai.note-publisher.plist
```

## Integration

### → OpenClaw Writer / Quill エージェント連携

OpenClaw Writer または Quill エージェントと連携して文章クオリティを向上させる:

```bash
# Prompt Request Bus 経由で Quill エージェントに文章生成を依頼
# 注: ヒアドキュメントは <<EOF（引用符なし）にして $(date) を展開する
cat <<EOF >> skills/prompt-request-bus/prompt-request-queue.jsonl
{
  "id": "pr-note-$(date +%Y%m%d)-001",
  "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "cron",
  "priority": "medium",
  "agent": "quill",
  "task": "last30days JSON を元に note.com 用週次まとめ記事を生成する。article-template.md に従い 2,000〜3,500字で執筆",
  "context": "毎週火曜定期配信。前週分の last30days --json 出力を添付",
  "affectedSkills": ["note-publisher"],
  "affectedFiles": [],
  "deadline": "24h",
  "status": "queued",
  "result": null,
  "dependsOn": [],
  "dagId": "dag-note-weekly"
}
EOF
```

OpenClaw Writer との連携例:
```bash
# OpenClaw writer モードで記事生成
openclaw write \
  --input /tmp/last30days-output.json \
  --template skills/note-publisher/article-template.md \
  --style "日本語, わかりやすく, 実務的" \
  --target-length 2500 \
  --output /tmp/note-article.md
```

### → Self-Improving Skills

投稿後に実行結果を記録:
```bash
npx agent-skill-bus record-run \
  --agent note-publisher \
  --skill note-publisher \
  --task "週次まとめ記事投稿 $(date +%Y-%m-%d)" \
  --result success \
  --score 1.0
```

### → Prompt Request Bus

DAG を使って last30days 取得 → 記事生成 → 投稿を順序実行:

```json
{
  "dagId": "dag-note-weekly-20260325",
  "tasks": [
    { "id": "pr-001", "agent": "data-fetcher", "task": "last30days --json を実行して /tmp/last30days-output.json に保存", "dependsOn": [] },
    { "id": "pr-002", "agent": "quill",        "task": "last30days JSON を note 記事に変換（article-template.md 適用）",  "dependsOn": ["pr-001"] },
    { "id": "pr-003", "agent": "note-publisher","task": "note.com に下書き投稿 → レビュー後公開",                         "dependsOn": ["pr-002"] }
  ]
}
```

## Constraints

- **認証**: `NOTE_SESSION` Cookie は `.env` または Keychain に保管。ソースコードにコミットしない
- **投稿レート**: note.com の公式 API 制限は非公開だが、実運用上の目安として 10件/日 を超えないようにする。制限を超えた場合は HTTP 429 が返却され、一時的にリクエストがブロックされる。週次スケジュール（1件/週）であれば問題ない
- **文字数チェック**: 2,000字未満の場合は投稿せず `quill` エージェントに再生成依頼
- **価格設定**: デフォルト 980円。3,000字超は 1,980円に自動変更
- **下書きファースト**: 初回実行は必ず `status: "draft"` で投稿し、人間がレビューしてから公開
- **ログ保持**: `publish-log.jsonl` に全投稿履歴を記録（監査証跡）
