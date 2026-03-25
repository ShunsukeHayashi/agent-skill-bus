---
name: x-scheduler
description: last30days トレンドからX(Twitter)投稿5本を自動生成・最適時間帯に投稿。OpenClaw sns-creator + x-ops連携。Triggers: x投稿, twitter, X自動投稿, SNS自動化
triggers:
  - x-scheduler
  - x投稿
  - X自動投稿
  - SNS自動化
---

# X Auto-Posting Scheduler

**Version**: 1.0.0
**Last Updated**: 2026-03-26

## Description

last30days のトレンドデータから X(Twitter) 投稿5本を自動生成し、最適時間帯にスケジュール投稿するスキル。
OpenClaw sns-creator（投稿生成）× x-ops（実際の投稿）で完全自動化。

## Pipeline

```
last30days --json → sns-creator で5投稿生成 → x-ops で最適時間帯に自動投稿
```

## 5-Post Templates

| # | タイプ | 内容 | 予測インプレ |
|---|--------|------|-------------|
| 1 | バズネタ | 英語圏高インプレ話題を日本語要約 | 5,000〜15,000 |
| 2 | 逆張り | 話題への別視点・批評的考察 | 3,000〜10,000 |
| 3 | 実用 | ツール・手法の紹介（3選形式） | 2,000〜8,000 |
| 4 | 感情訴求 | ストーリー仕立て・共感型 | 3,000〜12,000 |
| 5 | フォロー誘導 | 日本語圏先取り情報 | 1,000〜5,000 |

## Optimal Posting Times

| 時刻 | 投稿タイプ | 理由 |
|------|-----------|------|
| 07:00 | フォロー誘導 | 朝の情報収集タイム |
| 12:00 | 実用 | 昼休みの学習タイム |
| 19:00 | 感情訴求 | 帰宅後リラックスタイム |
| 21:00 | バズネタ | プライムタイム |
| 22:00 | 逆張り | 夜の考察タイム |

## Invoke

```bash
# 1. リサーチ実行
last30days "AI agents autonomous 2026" --quick --json > /tmp/x-research.json

# 2. OpenClaw sns-creator で5投稿生成（MainMini）
openclaw agent message sns-creator "以下のトレンドデータから投稿5本を生成。5つのテンプレート（バズネタ/逆張り/実用/感情/フォロー誘導）に従って日本語で。"

# 3. OpenClaw x-ops で投稿（Windows Gateway - xurl必須）
openclaw agent message x-ops "上記5本の投稿を最適時間帯（07:00/12:00/19:00/21:00/22:00）にスケジュール投稿"

# 4. 投稿履歴記録
npx agent-skill-bus record-run --agent sns-creator --skill x-scheduler --task "daily-5posts" --result success --score 0.9
```

## OpenClaw Agent Assignment

| 役割 | エージェント | Index | ノード | 備考 |
|------|-------------|-------|--------|------|
| トレンド分析 | sns-analytics (31) | 31 | MacBook Pro | last30days実行 |
| SNS戦略 | sns-strategist (28) | 28 | MainMini | 投稿方針決定 |
| 投稿生成 | sns-creator (29) | 29 | MainMini | 5本生成 |
| X投稿実行 | x-ops (12) | 12 | Windows Gateway | xurl必須 |

## Direct OpenClaw Commands

```bash
# sns-analytics にリサーチ依頼
openclaw agent message sns-analytics "last30days 'AI agents 2026' --quick --json を実行して結果をTelegramに送信"

# sns-creator に投稿生成依頼
openclaw agent message sns-creator "[TASK] 今日のトレンドから投稿5本生成。テンプレート: バズネタ/逆張り/実用/感情訴求/フォロー誘導"

# x-ops に投稿指示（Windows Gateway ローカル実行必須）
openclaw agent message x-ops "[TASK] 以下の5投稿をスケジュール投稿: {投稿リスト}"
```

## Post History Format (post-queue.jsonl)

```json
{"id":"post-001","ts":"2026-03-26T07:00:00Z","type":"buzz","content":"投稿本文","scheduled":"07:00","status":"queued"}
{"id":"post-002","ts":"2026-03-26T12:00:00Z","type":"practical","content":"投稿本文","scheduled":"12:00","status":"queued"}
```

## Health Check

```bash
# 直近の投稿実績確認
cat skills/x-scheduler/skill-runs.jsonl | tail -5

# キュー確認
cat skills/x-scheduler/post-queue.jsonl | tail -10

# OpenClaw x-ops 疎通確認
openclaw agent message x-ops "PING"
```

## Daily LaunchAgent

`skills/x-scheduler/com.miyabi.x-scheduler.plist` を参照。

```bash
# インストール
cp skills/x-scheduler/com.miyabi.x-scheduler.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.miyabi.x-scheduler.plist
```
