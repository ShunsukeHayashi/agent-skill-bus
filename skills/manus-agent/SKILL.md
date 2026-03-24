---
name: manus-agent
description: Manus AI汎用エージェント。リサーチ・ドキュメント生成・ブラウザ操作の完全自動実行。REST API+Python SDK対応。100並列エージェントで大規模リサーチが得意。Triggers: manus, マヌス, リサーチエージェント, 調査自動化
triggers:
  - manus
  - マヌス
  - manus agent
  - リサーチエージェント
  - 調査自動化
---

# Manus AI エージェント統合スキル

バージョン: 1.0.0
作成日: 2026-03-24
特徴: 汎用AIエージェント。Mind（思考）とHand（実行）を橋渡し。ブラウザ操作・コード実行・ファイル生成をエンドツーエンドで自律実行。

---

## 概要・強み

- Wide Research: 100体以上のエージェントを並列展開して大規模リサーチ
- GAIAベンチマークでGPT-4・OpenAI DeepResearchを上回るスコア
- 成果物をファイルとして直接出力（スライド、レポート、コードなど）
- Manus's Computerウィンドウでリアルタイム作業観察・介入可能
- Stripe/Slack/Notion/Google Sheets統合（Manus 1.5以降）

---

## API基本情報

ベースURL: https://open.manus.im
ドキュメント: https://open.manus.im/docs
認証: Bearer Token（APIキー）

Python SDK:
  pip install manus-ai==2.1.3

---

## 主要エンドポイント

| メソッド | パス | 内容 |
|---|---|---|
| POST | /v1/tasks | タスク作成・実行開始 |
| GET | /v1/tasks | タスク一覧（フィルタ・ページング対応）|
| GET | /v1/tasks/{task_id} | タスク詳細・結果取得 |
| POST | /v1/files | ファイルアップロード |
| POST | /v1/webhooks | Webhook登録 |
| POST | /v1/projects | プロジェクト作成 |

---

## タスク投入フロー

1. POST /v1/tasks でタスク投入
2. Webhookまたはポーリング（GET /v1/tasks/{task_id}）で結果取得
3. stop_reason: finish または ask（ユーザー入力待ち）で完了判定

---

## Webhookイベント

| イベント | タイミング |
|---------|---------|
| task_created | タスク作成時 |
| task_progress | 進捗更新時 |
| task_stopped | タスク完了時 |

注意: エンドポイントは10秒以内にHTTP 200を返す必要あり
署名: RSA-SHA256で検証推奨

---

## 料金プラン

| プラン | 月額 | クレジット | 並列タスク |
|--------|------|-----------|---------|
| Free | /data/data/com.termux/files/usr/bin/bash | 300/日 + 初回1,000 | 1 |
| Standard | 0 | 4,000/月 + 300/日 | 20 |
| Customizable | 0 | 8,000/月 + 300/日 | 20 |
| Extended | 00 | 40,000/月 + 300/日 | 20 |

注意: 未使用クレジットは月末失効（繰り越し不可）
注意: 複雑なタスクで900+クレジット消費することあり

---

## 適材適所

| タスク | 適性 | 理由 |
|-------|------|------|
| 大規模リサーチ・情報収集 | 最高 | 100並列エージェント |
| レポート・ドキュメント生成 | 最高 | 直接編集可能ファイルで出力 |
| スライド自動生成 | 最高 | AI Slides機能 |
| ブラウザ操作自動化 | 優秀 | フォーム入力・スクレイピング |
| データ収集・分析 | 優秀 | CSV/スプレッドシート操作 |
| コーディング | 普通 | コード生成はできるが専門エージェント向き |
| セキュリティ対応 | 不向き | コーディングエージェント使用 |

---

## 他エージェントとの使い分け

コーディングタスク → Copilot / Devin / Cursor Agent
リサーチ・調査・レポート作成 → Manus（最適）
ブラウザ操作・Webスクレイピング → Manus（最適）
即時コード修正 → Claude Code（直接）

---

## セットアップ（APIキー取得）

1. https://manus.im にアクセス
2. アカウント作成
3. Settings > API Keys でキー生成
4. ~/.config/claude-env/tokens.conf に追記:
   export MANUS_API_KEY=your_key_here

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| クレジット枯渇 | ダッシュボードで残量確認・プランアップグレード |
| Webhook応答タイムアウト | エンドポイントの応答を10秒以内に |
| タスクがask状態で停止 | POST /v1/tasks/{id}/messages で続行指示 |
