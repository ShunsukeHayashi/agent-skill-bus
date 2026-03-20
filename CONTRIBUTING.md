# Contributing to Agent Skill Bus

Thank you for your interest in contributing! This project powers AI agent orchestration in production, and we welcome improvements of all kinds.

## How to Contribute

- **Bug Reports & Feature Requests** -- Open a [GitHub Issue](https://github.com/ShunsukeHayashi/agent-skill-bus/issues)
- **Code Contributions** -- Fork the repo and submit a Pull Request
- **Questions & Ideas** -- Start a [Discussion](https://github.com/ShunsukeHayashi/agent-skill-bus/discussions)

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/agent-skill-bus.git
cd agent-skill-bus

# That's it. There are zero npm dependencies to install.
# Just make sure you have Node.js 18+ installed.
node --version  # must be >= 18.0.0

# Run the tests
node --test src/**/*.test.js
```

## The Zero-Dependencies Policy

**This project has zero npm dependencies. This is intentional and non-negotiable.**

All functionality is built on Node.js built-in modules only (`node:fs`, `node:path`, `node:crypto`, `node:test`, `node:assert`, etc.). This policy exists because:

1. **Agent infrastructure must be reliable** -- no supply chain attacks, no breaking upstream changes
2. **Instant installs** -- `npx agent-skill-bus init` should take seconds, not minutes
3. **Auditable** -- every line of code is in this repo

If you need functionality that seems to require a dependency, implement it using Node.js built-ins or propose an alternative approach in your PR description.

## Code Standards

- **ESM only** -- Use `import`/`export`, not `require()`
- **Node.js built-ins** -- Import with the `node:` prefix (e.g., `import { readFileSync } from 'node:fs'`)
- **No TypeScript source** -- Source files are plain `.js`. Type definitions live in `types/`
- **Data format** -- All persistent data uses JSONL (one JSON object per line)
- **File naming** -- `kebab-case.js` for source, `kebab-case.test.js` for tests
- **Prefer `const`** over `let`; avoid `var`
- **No build step** -- Source files are the runtime files

## Architecture Overview

The codebase has three modules that work independently or together:

```
src/
  index.js                  # Public API exports
  cli.js                    # CLI entry point (skill-bus / agent-skill-bus)
  queue.js                  # Prompt Request Bus -- DAG task queue with file locking
  queue.test.js             # Tests for queue module
  self-improve.js           # Self-Improving Skills -- 7-step quality loop
  self-improve.test.js      # Tests for self-improve module
  knowledge-watcher.js      # Knowledge Watcher -- external change detection
```

| Module | File | Purpose |
|--------|------|---------|
| **Prompt Request Bus** | `queue.js` | DAG-based task queue with dependency resolution, file-level locking, priority routing, and deduplication |
| **Self-Improving Skills** | `self-improve.js` | 7-step quality loop (Observe -> Analyze -> Diagnose -> Propose -> Evaluate -> Apply -> Record) |
| **Knowledge Watcher** | `knowledge-watcher.js` | Monitors external changes and triggers improvement requests |

**Data layer**: All state is stored in JSONL files (`queue.jsonl`, `skill-runs.jsonl`, `knowledge-diffs.jsonl`, `active-locks.jsonl`). No databases, no message brokers.

## Testing

```bash
# Run all tests
node --test src/**/*.test.js

# Run a specific test file
node --test src/queue.test.js
node --test src/self-improve.test.js
```

When adding or modifying code:

- Every new function or behavior needs a test
- Tests use Node.js built-in `node:test` and `node:assert` -- no test frameworks
- Test files live next to the source file they test (`foo.js` -> `foo.test.js`)
- Tests must be self-contained -- create temp directories, clean up after themselves

## Pull Request Process

1. **Fork** the repository and create a branch from `main`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the code standards above

3. **Add or update tests** for any changed behavior

4. **Run the full test suite** and make sure everything passes
   ```bash
   node --test src/**/*.test.js
   ```

5. **Commit** with a [Conventional Commit](https://www.conventionalcommits.org/) message
   ```bash
   git commit -m "feat(queue): add retry logic for failed tasks"
   ```

6. **Push** and open a Pull Request against `main`

### PR Checklist

- [ ] Tests pass (`node --test src/**/*.test.js`)
- [ ] No new npm dependencies added
- [ ] Uses Node.js built-in modules with `node:` prefix
- [ ] Commit message follows Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- [ ] New features include tests
- [ ] One concern per PR

## Issue Guidelines

### Bug Reports

Please include:
- Node.js version (`node --version`)
- OS and version
- Steps to reproduce
- Expected vs actual behavior
- Relevant JSONL file contents (if applicable)

### Feature Requests

Please include:
- What problem does this solve?
- Which module does it relate to (Bus / Self-Improve / Watcher)?
- Would it require a new dependency? (If so, explain why built-ins are insufficient)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Questions? Open a [Discussion](https://github.com/ShunsukeHayashi/agent-skill-bus/discussions) or reach out at shunsuke.hayashi@miyabi-ai.jp.
