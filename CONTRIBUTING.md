# Contributing to agent-skill-bus

## Local Setup

```bash
git clone https://github.com/your-org/agent-skill-bus.git
cd agent-skill-bus
```

No install step needed — the project has zero dependencies and uses only Node.js built-ins.

## Running Tests

```bash
node --test src/**/*.test.js
```

Or run a single test file:

```bash
node --test src/bus/bus.test.js
```

## Adding a New Module

1. Create `src/<module-name>/<module-name>.js` (ESM, no external imports)
2. Create `src/<module-name>/<module-name>.test.js` using `node:test`
3. Export your public API from `src/index.js`
4. Update `README.md` with usage examples

## Pull Request Guidelines

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Every new feature or bug fix must include tests
- All existing tests must pass before opening a PR
- Keep PRs focused — one concern per PR
- Squash commits before merge if the history is noisy

## Code Style

- ESM only (`import`/`export`, `"type": "module"` in `package.json`)
- No external dependencies — Node.js built-ins only (`node:fs`, `node:events`, etc.)
- Target Node.js 18+ (LTS)
- Prefer `const` over `let`; avoid `var`
- No build step required

## Issue Templates

Use the issue templates in `.github/ISSUE_TEMPLATE/` for bug reports and feature requests.
