---
name: note-publisher
description: last30days JSON出力をnote.com記事として自動投稿するパイプラインスキル。毎週火曜09:00に自動配信。Triggers: note, note投稿, noteマガジン, 記事自動投稿
triggers:
  - note
  - note-publisher
  - noteマガジン
  - 記事自動投稿
---

# note.com Auto-Publish Pipeline

**Version**: 1.0.0
**Last Updated**: 2026-03-26

## Description

last30days の JSON出力 → Markdown変換 → note.com 記事自動投稿のパイプラインスキル。
毎週火曜 09:00 に自動実行され、英語圏トレンドを日本語記事として配信する。

想定単価: 980〜1,980円/記事
月次目標: 500名 × 1,980円 = 月98万円（6ヶ月目標）

## Pipeline

```
last30days --json → article-template.md に流し込み → note.com 投稿
```

## Invoke

```bash
# 1. リサーチ実行（JSON出力）
last30days "AI agents autonomous 2026" --deep --json > /tmp/research.json

# 2. OpenClaw writer/Quill で記事生成
openclaw agent message writer "以下のJSONから2500字のnote記事を生成。article-template.mdのフォーマット使用: $(cat /tmp/research.json | head -100)"

# 3. note.com に投稿（手動または API経由）
# note APIが公式提供されるまでは手動投稿 or GAS経由

# 4. 実行記録
npx agent-skill-bus record-run --agent writer --skill note-publisher --task "weekly article" --result success --score 0.9
```

## Article Format

| 項目 | 仕様 |
|------|------|
| 文字数 | 2,000〜3,500字 |
| 投稿曜日 | 毎週火曜日 09:00 |
| 価格 | 980〜1,980円（有料マガジン） |
| ハッシュタグ | #AI #生成AI #テック #週次まとめ |

## Article Structure

1. **今週のハイライト3選** — エンゲージメント重み付き上位トピック
2. **技術トレンド** — Reddit/HN 深掘り分析
3. **ビジネスインパクト** — LinkedIn/X 動向
4. **日本語圏への示唆** — 先取り情報

## OpenClaw Agent Assignment

| 役割 | エージェント | ノード |
|------|-------------|--------|
| リサーチ | scholar (5) | MacMini2 |
| 記事生成 | writer/Quill (10) | MacMini2 |
| 品質チェック | promptpro (11) | MacMini2 |
| 配信管理 | content/Pulse (2) | MacMini2 |

```bash
# OpenClaw 経由フル自動実行
openclaw agent message scholar "last30days 'AI agents 2026' --deep --json を実行してresult.jsonに保存"
openclaw agent message writer "result.jsonを2500字のnote記事に変換。article-template.mdフォーマット使用"
openclaw agent message promptpro "生成記事の品質スコアを評価。80点以上なら承認"
openclaw agent message content "承認済み記事をnote.comマガジンに投稿"
```

## Weekly Schedule (LaunchAgent)

`skills/note-publisher/com.miyabi.note-publisher.plist` を参照。

```bash
# インストール
cp skills/note-publisher/com.miyabi.note-publisher.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.miyabi.note-publisher.plist
```

## Health Check

```bash
# last30days 疎通確認
last30days --diagnose

# 直近の実行ログ
npx agent-skill-bus health --skill note-publisher
```

## Credit Consumption

| 操作 | クレジット消費 |
|------|--------------|
| --quick リサーチ | 約18クレジット |
| --deep リサーチ | 約54クレジット |
| 週1回 --deep | 月216クレジット |
| 年間 | 2,592クレジット（25,000中） |
