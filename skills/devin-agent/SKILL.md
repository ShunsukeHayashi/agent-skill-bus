---
name: devin-agent
description: Devin AI自律コーディングエージェント。V3 API + 公式CLI対応。Playbook/Snapshot/structured_output活用。Team以上プランで本領発揮。Triggers: devin, Devin, 自律コーディング, coding agent
triggers:
  - devin
  - Devin
  - 自律コーディングエージェント
  - coding agent委任
---

# Devin AI コーディングエージェント統合スキル（V3完全版）

**API**: V3推奨（V1/V2は非推奨・廃止予定）
**Key変数**: DEVIN_API_KEY（~/.config/claude-env/tokens.conf）
**Key形式**: apk_user_...（V1/V2 Legacy）/ cog_...（V3 Service User）
**ベースURL**: https://api.devin.ai

---

## 重要: プラン制限

| プラン | API POST（セッション作成） | 月額 |
|-------|------------------------|------|
| Core | 不可（403になる） | 従量 min0 |
| Team | 可能 | 00/月 |
| Enterprise | 可能 | カスタム |

現在のAPIキー（apk_user_）でPOSTが403になる = Coreプランの可能性大
→ Teamプラン以上にアップグレードが必要

---

## 公式CLI（Devin for Terminal）

インストール（macOS/Linux）:
  curl -fsSL https://cli.devin.ai/install.sh | bash

非公式CLI（pip）:
  pip install devin-cli
  devin configure
  devin create-session タスク内容

---

## V3 APIクイックリファレンス

### セッション作成

source ~/.config/claude-env/tokens.conf

curl -X POST https://api.devin.ai/v3/organizations/sessions   -H Authorization: Bearer    -H Content-Type: application/json   -d '{prompt: タスク説明, repos: [{repo_url: https://github.com/ShunsukeHayashi/KOTOWARI}], max_acu_limit: 10, tags: [auto-pipeline]}'

### ポーリング（10秒間隔推奨）

curl https://api.devin.ai/v3/organizations/sessions/SESSION_ID   -H Authorization: Bearer 

終了判定: status が exit/error/suspended になったら完了

---

## セッションステータス（V3）

| status | status_detail | 意味 |
|--------|--------------|------|
| running | working | 作業中 |
| running | waiting_for_user | 入力待ち |
| running | finished | 完了 |
| suspended | out_of_credits | ACU枯渇 |
| exit | - | 正常終了 |
| error | - | エラー終了 |

---

## V3 セッション作成パラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| prompt | 必須 | タスク指示（具体的に） |
| repos | 推奨 | 対象リポジトリURL配列 |
| playbook_id | 任意 | 再利用テンプレートID |
| snapshot_id | 任意 | VM環境スナップショットID |
| max_acu_limit | 推奨 | ACU上限（コスト管理） |
| structured_output_schema | 任意 | 結果をJSON形式で取得 |
| tags | 任意 | タスク分類タグ |
| idempotent | 任意 | 重複実行防止 |

---

## Playbookセクション構成

Procedure: 1ステップ1行、命令形
Specifications: 完了後の期待状態
Advice: プロジェクト固有注意点
Forbidden Actions: 禁止アクション
Required from User: ユーザーへの確認事項

---

## 適材適所

| タスク | 適性 |
|-------|------|
| 大規模コード近代化（数万ファイル） | 最高 |
| テストカバレッジ向上 | 最高 |
| バグ修正（再現手順明確） | 優秀 |
| リファクタリング（範囲限定） | 優秀 |
| バックログ大量消化 | 優秀 |
| 1-2ファイルの即時修正 | 不向き（Claude Codeで十分） |

---

## ACU消費目安

| タスク | 消費ACU |
|--------|---------|
| シンプルなバグ修正 | 2-5 |
| テスト追加（1ファイル） | 3-8 |
| 中規模機能実装 | 10-20 |
| 大規模リファクタリング | 20-50 |

Team: 00/月 = 250 ACU。max_acu_limitで上限設定必須。

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| POST 403 | Coreプラン制限 | Teamプランにアップグレード |
| out_of_credits | ACU枯渇 | ダッシュボードで確認 |
| セッション停止 | 追加入力待ち | /message エンドポイントで続行 |
