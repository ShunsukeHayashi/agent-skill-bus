# Integrating agent-skill-bus with Claude Code

Add self-improving skill tracking to any Claude Code project in 5 minutes.
Every task Claude Code completes gets logged. Over time, the system detects
which skills are degrading and surfaces repair suggestions.

## Setup

### 1. Install and initialize

```bash
npm install agent-skill-bus
npx agent-skill-bus init
```

This creates three directories under `skills/`:

```
skills/
├── prompt-request-bus/       # Task queue (JSONL)
├── self-improving-skills/    # Skill run logs + health
└── knowledge-watcher/        # External change tracking
```

### 2. Add to CLAUDE.md (or AGENTS.md)

Paste this block into your project's `CLAUDE.md` so Claude Code automatically
records every task result:

```markdown
## Skill Bus Integration

After completing any task, log the result with the CLI:

\`\`\`bash
npx agent-skill-bus record-run \
  --agent claude-code \
  --skill <skill-name> \
  --task "<one-line description of what you did>" \
  --result <success|fail|partial> \
  --score <0.0-1.0>
\`\`\`

### Skill names to use

| When you... | Skill name |
|------------|------------|
| Write new code | `code-generation` |
| Fix a bug | `bug-fix` |
| Refactor existing code | `code-refactor` |
| Write tests | `test-writing` |
| Review code | `code-review` |
| Write documentation | `documentation` |
| Debug an issue | `debugging` |
| Create a PR | `pr-management` |

### Scoring guide

| Score | Meaning |
|-------|---------|
| 1.0 | Perfect — no revisions needed |
| 0.8 | Good — minor adjustments |
| 0.6 | Partial — significant rework needed |
| 0.3 | Poor — mostly failed, some salvageable |
| 0.0 | Total failure |

### Before starting work, check the queue

\`\`\`bash
npx agent-skill-bus dispatch
\`\`\`

Pick the highest-priority task from the output. After finishing it:

\`\`\`bash
npx agent-skill-bus complete <pr-id> --result "description of what was done"
\`\`\`
```

### 3. Add a health check to your workflow

Run this periodically (or add it to a pre-commit hook / CI step):

```bash
# Update health report
npx agent-skill-bus health

# Show skills that need attention
npx agent-skill-bus flagged

# Detect silent degradation (score drop >15% week-over-week)
npx agent-skill-bus drift
```

## Usage Patterns

### Pattern 1: Record after every task (simplest)

In your CLAUDE.md instructions, Claude Code will run `record-run` after each
completed task. No code changes needed — it is pure CLI.

```bash
# Claude Code runs this after fixing a bug:
npx agent-skill-bus record-run \
  --agent claude-code \
  --skill bug-fix \
  --task "Fix null pointer in auth middleware" \
  --result success \
  --score 0.9 \
  --notes "Root cause: missing null check on user.session"
```

### Pattern 2: Enqueue tasks from issues

When you create GitHub issues, also enqueue them in the skill bus:

```bash
npx agent-skill-bus enqueue \
  --source github-issue-42 \
  --priority high \
  --agent claude-code \
  --task "Implement OAuth2 login flow" \
  --files "src/auth/oauth.ts,src/auth/callback.ts" \
  --skills "code-generation,test-writing"
```

Claude Code then dispatches from the queue:

```bash
# Get next task
npx agent-skill-bus dispatch --max 1

# Start it (acquires file locks)
npx agent-skill-bus start pr-1710900000-a1b2c3d4

# ... do the work ...

# Complete it (releases locks, updates history)
npx agent-skill-bus complete pr-1710900000-a1b2c3d4 --result "OAuth2 implemented"
```

### Pattern 3: DAG pipelines for multi-step tasks

Chain tasks with dependencies:

```bash
# Step 1: Generate code
npx agent-skill-bus enqueue \
  --source pipeline \
  --agent coder \
  --task "Implement feature" \
  --dag-id feature-42

# Step 2: Write tests (depends on step 1)
npx agent-skill-bus enqueue \
  --source pipeline \
  --agent tester \
  --task "Write tests" \
  --depends-on pr-STEP1-ID \
  --dag-id feature-42

# Step 3: Code review (depends on step 2)
npx agent-skill-bus enqueue \
  --source pipeline \
  --agent reviewer \
  --task "Review implementation" \
  --depends-on pr-STEP2-ID \
  --dag-id feature-42
```

### Pattern 4: Self-healing loop

When health checks detect a degrading skill, enqueue a repair task:

```bash
# Check for flagged skills
FLAGGED=$(npx agent-skill-bus flagged 2>/dev/null)

# If any skill is flagged, create a repair task
if echo "$FLAGGED" | grep -q '"flagged": true'; then
  npx agent-skill-bus enqueue \
    --source self-improve \
    --priority high \
    --agent claude-code \
    --task "Investigate and fix degrading skill" \
    --context "$(echo "$FLAGGED" | head -20)"
fi
```

## Programmatic Usage (ESM)

If you prefer to call the API from JavaScript instead of CLI:

```javascript
import { SkillMonitor, PromptRequestQueue } from 'agent-skill-bus';

const monitor = new SkillMonitor('./skills/self-improving-skills');
const queue = new PromptRequestQueue('./skills/prompt-request-bus');

// Record a run
monitor.recordRun({
  agent: 'claude-code',
  skill: 'bug-fix',
  task: 'Fix auth timeout',
  result: 'success',
  score: 0.95,
});

// Check health
const health = monitor.analyze();
const flagged = monitor.getFlagged();

// Enqueue a follow-up task if needed
if (flagged.length > 0) {
  queue.enqueue({
    source: 'self-improve',
    priority: 'high',
    agent: 'claude-code',
    task: `Repair degrading skill: ${flagged[0].name}`,
  });
}
```

## File Structure After Integration

```
your-project/
├── CLAUDE.md                              # ← instructions added here
├── skills/
│   ├── prompt-request-bus/
│   │   ├── SKILL.md                       # Queue skill definition
│   │   ├── prompt-request-queue.jsonl     # Task queue (auto-managed)
│   │   ├── active-locks.jsonl            # File locks (auto-managed)
│   │   └── prompt-request-history.md     # Completed task log
│   ├── self-improving-skills/
│   │   ├── SKILL.md                       # Monitor skill definition
│   │   ├── skill-runs.jsonl              # Run log (append-only)
│   │   ├── skill-health.json             # Latest health snapshot
│   │   └── skill-improvements.md         # Improvement history
│   └── knowledge-watcher/
│       ├── SKILL.md                       # Watcher skill definition
│       ├── knowledge-state.json          # Source state tracking
│       └── knowledge-diffs.jsonl         # Detected changes
└── ...
```

All data files are JSONL (one JSON object per line) or plain Markdown.
They are human-readable, git-friendly, and trivial to parse from any language.
