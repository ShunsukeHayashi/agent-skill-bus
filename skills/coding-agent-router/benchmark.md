# Agent Benchmark Results

最終更新: 2026-03-24
計測リポジトリ: ShunsukeHayashi/KOTOWARI

## Copilot Coding Agent

### テスト1: useAuth hook ユニットテスト追加

| 指標 | 結果 |
|------|------|
| 投入時刻 | 2026-03-24 14:16 JST |
| PR作成時刻 | 2026-03-24 14:34 JST |
| Issue→PR時間 | 約18分 |
| 生成コード | src/hooks/__tests__/useAuth.test.ts（185行）|
| テスト件数 | 7件 |
| テスト結果 | 7/7 PASS |
| 実行時間 | 225ms |
| 追加変更 | vitest.config.ts最適化 |
| 総合評価 | ★★★★★ |

### テスト2: useProjects hook ユニットテスト追加

| 指標 | 結果 |
|------|------|
| 投入時刻 | 2026-03-24 14:34 JST |
| PR作成時刻 | 2026-03-24 14:35 JST |
| Issue→PR時間 | 約1分未満（2回目以降の速度） |
| 生成コード | src/hooks/__tests__/useProjects.test.ts（213行）|
| テスト件数 | 10件 |
| テスト結果 | 10/10 PASS ✅ |
| 実行時間 | 441ms |
| 追加変更 | vitest.config.tsのinclude設定も自動修正（src/**追加）|
| 総合評価 | ★★★★★ |

### サイクル比較サマリー

| 指標 | サイクル1（useAuth） | サイクル2（useProjects） |
|------|-------------------|----------------------|
| Issue→PR | 約18分 | 約1分未満 |
| テスト件数 | 7件 | 10件 |
| PASS率 | 100% | 100% |
| 実行時間 | 225ms | 441ms |
| 自動修正 | vitest.config.ts | vitest.config.ts include追加 |
| 評価 | ★★★★★ | ★★★★★ |

### 判明した特性（2サイクル実測から）

1. **初回ウォームアップ**: 1回目18分 → 2回目1分未満に劇的短縮
2. **100%合格率**: 2回連続で全テストPASS
3. **自律的改善**: vitest.config.tsの問題も自分で発見・修正
4. **2段階コミット**: Initial plan → 実装 の順序は一貫
5. **コード量**: 適切な量（185行・213行）で網羅性も高い

## Devin AI

| 指標 | 結果 |
|------|------|
| APIステータス | GET 200 / POST 403 |
| 根本原因 | Coreプラン制限（POST不可）|
| 過去実績 | PR #227作成済み（UI/UX改善）|
| 推奨対応 | Teamプラン（$500/月）にアップグレード |

## Cursor Agent

| 指標 | 結果 |
|------|------|
| バイナリ | 2026.03.20-44cb435 |
| キーチェーン問題 | SSH越しでロックされる |
| 解決策 | CURSOR_API_KEY環境変数 |
| 実行テスト | 実行中（useProjectSync テスト）|

## Manus AI

| 指標 | 結果 |
|------|------|
| APIキー | 未設定（要取得）|
| Python SDK | pip install manus-ai==2.1.3 |
| 推奨用途 | リサーチ・レポート生成 |
