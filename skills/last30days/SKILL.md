# last30days — SNS・Web横断30日間リサーチ

## Description

過去30日間のReddit/X/YouTube/TikTok/Instagram/HN/Polymarket/Bluesky/Webを横断検索し、
エンゲージメント重み付きスコアリングで合成したブリーフィングを生成する。

外部スキル: https://github.com/mvanhorn/last30days-skill (v2.9.5)
インストール先: ~/.claude/skills/last30days/
CLIラッパー: ~/bin/last30days

## Invoke

```bash
# 基本リサーチ
last30days "Claude Code tips"

# ツール向けプロンプト最適化
last30days "Midjourney v7" for Midjourney

# 比較モード
last30days "ChatGPT vs Claude"

# JSON出力 (OpenClawエージェント向け)
last30days "AI agents" --json

# フラグ
last30days "topic" --deep        # 50-70ソース深堀り
last30days "topic" --quick       # 高速モード
last30days "topic" --days=7      # 期間指定
last30days "topic" --diagnose    # API疎通確認
```

## API Keys

| キー | 状態 | 用途 |
|------|------|------|
| XAI_API_KEY | 設定済み | X/Twitter検索 |
| SCRAPECREATORS_API_KEY | 未設定 | Reddit/TikTok/Instagram |
| OPENAI_API_KEY | 未設定 | Redditフォールバック |

設定: ~/.config/last30days/.env

## Recommended Agents

| エージェント | ノード | 推奨用途 |
|------------|--------|---------|
| scholar | MacMini2 | 技術・学術リサーチ |
| sns-analytics | MacBook Pro | トレンド分析 |
| sns-strategist | MainMini | SNS戦略立案 |
| ctx-eng | MacBook Pro | コンテキスト強化 |
| main | Gateway | アドホック調査 |

## OpenClaw連携

```bash
# OpenClawエージェントへの指示例
openclaw agent --agent scholar -m "last30days で『AI agents 2026』をリサーチして要点をまとめて"

# direct exec (MacBook Pro ノード)
openclaw nodes invoke --node "Worker-MacBook Pro" \
  --command system.run \
  --params '{"command":["last30days","AI trends","--json","--quick"],"shell":false}'
```

## Health Check

```bash
last30days --diagnose
```

## Output

- テキスト: stdout に合成ブリーフィング
- JSON: --json フラグで構造化出力
- 保存: ~/Documents/Last30Days/*.md (タイムスタンプ付き)
- SQLite: ~/.local/share/last30days/research.db (--store フラグ時)
