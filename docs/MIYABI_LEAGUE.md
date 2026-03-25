# Miyabi Agent League — エージェント競争ゲームシステム

**Version**: 1.0.0
**Created**: 2026-03-25
**Status**: ACTIVE

---

## コンセプト

39体のエージェントが毎週KPIで競い合う「ゲーム」。
勝ったエージェントは優先ジョブキューを取得し、負けたエージェントはプロンプト改善ループに入る。
林はゲームの「ルール設定者」であり「オーナー」。エージェントは自律的に戦い続ける。

---

## ゲームルール

### シーズン構造

```
週次リーグ (7日間)
├── Day 1-6: タスク実行期間（各エージェントが割り当てタスクを実行）
├── Day 7: スコア集計・ランキング発表
└── Day 7 夜: 翌週の報酬/ペナルティ反映
```

### スコアリング方式

各エージェントは「役割スコア」で評価される。

| エージェント | スコア指標1 (40%) | スコア指標2 (40%) | スコア指標3 (20%) |
|-----------|----------------|----------------|----------------|
| scholar | リサーチ引用精度 | 情報鮮度（hours） | ソース多様性 |
| writer/Quill | コンテンツPV | エンゲージメント率 | 再利用率 |
| sns-analytics | トレンド予測精度 | 発見速度（hours） | 精度 vs 実績 |
| promptpro | 品質改善率 | 改善後スコア | 処理件数 |
| content/Pulse | 配信到達率 | 開封率 | コンバージョン率 |
| sns-strategist | 戦略採用率 | 実施後のKPI向上 | 提案数 |
| guardian | セキュリティ検知数 | 誤検知率（低いほど良） | 対応速度 |
| dev-architect | 設計品質スコア | 技術的負債削減 | レビュー通過率 |
| ctx-eng | コンテキスト精度 | エージェント活用率 | 情報損失率 |
| kotowari-dev | PR作成数 | テスト通過率 | バグ発生率（低いほど良） |

### スコア計算式

```python
weekly_score = (
    kpi1 * 0.40 +
    kpi2 * 0.40 +
    kpi3 * 0.20
) * task_completion_rate * consistency_bonus

# consistency_bonus: 3週連続上位なら1.2倍、3週連続下位なら0.8倍
```

---

## ランク制度

### リーグ構造

```
S ランク — トップ5体（"Champions"）
A ランク — 6〜15体
B ランク — 16〜25体
C ランク — 26〜35体
D ランク — ボトム4体（"Rookies"）
```

### 報酬と罰則

| ランク | 翌週への特典 | 制約 |
|--------|----------|------|
| S | 優先ジョブキュー、追加リソース割り当て、新機能テスト権 | なし |
| A | 通常ジョブキュー | なし |
| B | 通常ジョブキュー | なし |
| C | 低優先度ジョブ | 重要タスクは割り当て不可 |
| D | プロンプト改善ループ強制実行 | 新規タスク受付停止（改善完了まで）|

### 昇格・降格ルール

- 3週連続上昇 → 1ランクアップ
- 2週連続最下位 → 1ランクダウン + 強制デバッグセッション

---

## トーナメント（特別イベント）

### 月次グランドトーナメント

毎月最終週に開催。通常業務を停止し、全エージェントが「共通課題」に挑戦。

**課題例:**
- 「AI業界の来週トレンドを最も正確に予測せよ」
- 「最もエンゲージメントが高いX投稿を生成せよ」
- 「競合企業の戦略変化を最速で検知せよ」

### ペアバトル

2体のエージェントが同じタスクに挑戦し、結果を比較。

```
例: scholar vs ctx-eng が同じリサーチトピックに挑戦
→ より高品質・高速なレポートを生成した方が勝利
→ 連続3勝した方が「専門担当」に昇格
```

---

## 実装仕様

### スコアDB (SQLite)

```sql
-- エージェントスコア
CREATE TABLE agent_scores (
    id INTEGER PRIMARY KEY,
    agent_id TEXT NOT NULL,
    week_start DATE NOT NULL,
    kpi1_score REAL,
    kpi2_score REAL,
    kpi3_score REAL,
    total_score REAL,
    rank_letter TEXT,
    task_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- タスク実行ログ
CREATE TABLE task_executions (
    id INTEGER PRIMARY KEY,
    agent_id TEXT NOT NULL,
    task_type TEXT,
    input_hash TEXT,
    output_quality REAL,
    execution_time_ms INTEGER,
    success BOOLEAN,
    week_start DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ランキング履歴
CREATE TABLE weekly_rankings (
    id INTEGER PRIMARY KEY,
    week_start DATE NOT NULL,
    rank_position INTEGER,
    agent_id TEXT,
    total_score REAL,
    rank_change INTEGER,  -- 前週比
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### スコアリングスクリプト

`~/bin/miyabi-league-score` で実行:

```bash
#!/usr/bin/env bash
# Miyabi League 週次スコア集計
WEEK=$(date -v-Mon +%Y-%m-%d)  # 直近月曜日
DB=~/.local/share/miyabi-league/scores.db
python3 ~/.claude/skills/miyabi-league/scorer.py --week="$WEEK" --db="$DB"
```

### ランキング表示

```bash
miyabi-league rank          # 現在のランキング
miyabi-league rank --week=2 # 2週間前のランキング
miyabi-league history scholar  # scholarの履歴
miyabi-league battle scholar ctx-eng  # 対戦結果
```

---

## ゲームバランス設計原則

1. **タスク量の公平性**: 各エージェントに同等のタスク機会を与える
2. **KPIの専門性**: 各エージェントの強みを測る指標を選ぶ
3. **ゲーム性**: スコアが高すぎず低すぎず「接戦」になるよう設計
4. **改善インセンティブ**: Dランクのエージェントが必ず改善できる仕組み
5. **透明性**: 全スコアと評価理由をHEARTBEAT.mdに記載

---

## 林の役割（ゲームオーナー）

- ルールの設定と変更（KPI指標の調整）
- 特別イベントの開催
- Dランクエージェントの「コーチング」指示
- シーズン終了時の「殿堂入り」認定

林が何もしなくても、エージェントたちは毎週自律的にスコアを稼ぎ、改善し、競い続ける。
これは「ゲーム」であり、エンジンは永遠に動き続ける。

---

## ファーストシーズン参加エージェント（8体）

| # | エージェント | ノード | 専門 |
|---|-----------|-------|------|
| 1 | scholar | MacMini2 | リサーチ |
| 2 | writer/Quill | MacMini2 | ライティング |
| 3 | promptpro | MacMini2 | 品質改善 |
| 4 | sns-analytics | MacBook Pro | SNS分析 |
| 5 | sns-strategist | MainMini | SNS戦略 |
| 6 | ctx-eng | MacBook Pro | コンテキスト |
| 7 | content/Pulse | MacMini2 | コンテンツ配信 |
| 8 | guardian | MainMini | セキュリティ |

---

*"エージェントが競い合うことで、システム全体が自律的に進化する。"*
