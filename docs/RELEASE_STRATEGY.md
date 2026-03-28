# Release Strategy — Agent Skill Bus

_Last updated: 2026-03-28_

---

## バージョニング（Semantic Versioning）

```
MAJOR.MINOR.PATCH
  │     │     └─ バグ修正、ドキュメント修正、リンク修正
  │     └─── 新機能追加（後方互換性あり）
  └───── 破壊的変更（データフォーマット変更、CLI引数変更）
```

| 変更例 | バージョン |
|---|---|
| README修正、リンク修正 | PATCH (1.4.0 → 1.4.1) |
| 新スキル追加、新CLIコマンド | MINOR (1.4.0 → 1.5.0) |
| JSONLフォーマット変更、CLI引数変更 | MAJOR (1.4.0 → 2.0.0) |

---

## リリースフロー

### 1. コミット規約（Conventional Commits）

```
feat: 新機能
fix: バグ修正
docs: ドキュメント
chore: ビルド・ツール
refactor: リファクタ
test: テスト
perf: パフォーマンス
ci: CI/CD変更
```

### 2. リリース判定基準

| トリガー | アクション |
|---|---|
| `feat:` が1件以上 masterにマージ | MINOR リリースを作成 |
| `fix:` のみ | PATCH リリースを作成 |
| 1週間以上 masterに未リリースコミットがある | 強制リリース |
| セキュリティ修正 | 即時 PATCH リリース |

### 3. リリース手順（チェックリスト）

```
□ CHANGELOG.md を更新
□ package.json のバージョンをバンプ
□ git commit -m "chore: bump to vX.Y.Z"
□ git tag vX.Y.Z
□ git push origin master --tags
□ gh release create vX.Y.Z --notes-file release_notes.md --latest
□ npm publish (要 npm login)
□ X で告知投稿 (@The_AGI_WAY)
```

### 4. npm publish 認証

```bash
# 初回のみ
npm login
# 以降は自動
npm publish
```

---

## リリーススケジュール

### 定期リリース（推奨）
- **毎週金曜 or 土曜**: masterに溜まった変更をまとめてリリース
- 変更がなければスキップ

### 臨時リリース
- セキュリティ修正 → 即時
- 大きな新機能 → 完成次第

---

## 自動化（GitHub Actions）

### 将来的に `release.yml` を追加

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**設定手順:**
1. npmjs.com → Access Tokens → Generate New Token (Automation)
2. GitHub → Settings → Secrets → `NPM_TOKEN` に保存
3. 以降、`git tag` + `git push --tags` だけでnpm publishが自動実行

---

## X投稿テンプレート（リリース告知）

### MINORリリース
```
🚌 agent-skill-bus v{VERSION} リリース！

{主要な新機能1行}

新機能:
• {feature 1}
• {feature 2}
• {feature 3}

npm i agent-skill-bus@{VERSION}

⭐ {star数} stars — ありがとうございます！

#AIAgents #OpenSource #AgentSkills
```

### PATCHリリース
```
🔧 agent-skill-bus v{VERSION}

• {fix 1}
• {fix 2}

npm update agent-skill-bus
```

---

## リリース履歴

| Version | Date | Type | Highlights |
|---|---|---|---|
| v1.0.0 | 2026-03-18 | Initial | Core runtime (PRB + SIS + KW) |
| v1.1.0 | 2026-03-18 | Minor | CLI flag parsing fix |
| v1.2.0 | 2026-03-19 | Minor | TypeScript types, CI, integration examples |
| v1.2.1 | 2026-03-20 | Patch | npm keywords |
| v1.3.0 | 2026-03-20 | Minor | Dashboard command |
| v1.3.1 | 2026-03-20 | Patch | npm only (no GitHub Release — mistake) |
| v1.4.0 | 2026-03-28 | Minor | AI review pipeline, 7 skills, Copilot automation |

---

_合同会社みやび / LLC Miyabi_
