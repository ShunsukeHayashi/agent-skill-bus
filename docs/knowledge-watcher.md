# Knowledge Watcher: Automatic External Change Detection

> **Keywords**: external change detection AI agent, knowledge watcher, agent dependency monitoring, proactive skill maintenance

Your AI agent skills work perfectly today. Tomorrow, an npm package ships a breaking change, a cloud provider deprecates an API endpoint, or the community discovers a security vulnerability in a pattern your agents rely on. Nobody tells your agents. They keep running the old way, silently degrading, until something breaks in production.

Knowledge Watcher solves this. It is the "eyes and ears" of the Agent Skill Bus --- a continuous monitoring system that detects external changes, assesses their impact on your agent skills, and automatically generates improvement requests before those changes cause failures.

This document explains how it works, how to configure it, and how to integrate it into your own agent systems.

---

## Table of Contents

1. [The Problem: Silent External Drift](#the-problem-silent-external-drift)
2. [Three-Tier Monitoring System](#three-tier-monitoring-system)
3. [How Change Detection Works](#how-change-detection-works)
4. [Impact Assessment and Severity Scoring](#impact-assessment-and-severity-scoring)
5. [Automatic Improvement Request Generation](#automatic-improvement-request-generation)
6. [Integration with Self-Improving Skills](#integration-with-self-improving-skills)
7. [Configuration and Customization](#configuration-and-customization)
8. [Real-World Scenarios](#real-world-scenarios)
9. [Setting Up Knowledge Watcher for Your Project](#setting-up-knowledge-watcher-for-your-project)
10. [API Reference](#api-reference)
11. [FAQ](#faq)

---

## The Problem: Silent External Drift

AI agent systems do not operate in isolation. They depend on a web of external factors:

- **Dependency versions**: The npm package you use for API authentication releases v3.0 with breaking changes to its constructor signature.
- **API contracts**: A SaaS provider moves their auth endpoint from `/v2/auth` to `/v3/auth` and starts returning a different JSON schema.
- **Cloud provider defaults**: AWS changes the default encryption settings for new S3 buckets. Your deployment skill still uses the old defaults.
- **Community patterns**: The React ecosystem shifts from `useEffect` for data fetching to React Server Components. Your code-generation agent keeps producing the old pattern.
- **Security advisories**: A CVE is published for a library your agents use to parse user input.

The common thread: **none of these changes announce themselves to your agent system**. Your skills were correct when you wrote them. They become incorrect through no action of your own. This is _external drift_ --- the slow, silent divergence between your agents' knowledge and the real world.

Traditional software handles this through manual dependency updates, changelog reading, and human vigilance. Agent systems need something better: **automated, continuous, proactive monitoring** that detects changes and feeds them directly into the improvement loop.

That is what Knowledge Watcher provides.

### The cost of not monitoring

Without external change detection:

| Failure Mode | Typical Detection Time | Impact |
|-------------|----------------------|--------|
| Breaking dependency update | Hours to days (when builds fail) | Blocked deployments, agent downtime |
| API schema change | Days to weeks (when users report errors) | Silent data corruption, wrong outputs |
| Security vulnerability | Weeks (until audit or incident) | Potential breach, compliance violation |
| Best practice shift | Months (until code review catches it) | Accumulated technical debt, lower quality |

Knowledge Watcher compresses all of these detection windows to **hours or less**.

---

## Three-Tier Monitoring System

Knowledge Watcher organizes external knowledge sources into three tiers based on check frequency and impact proximity. This tiered approach respects API rate limits, minimizes unnecessary network calls, and ensures critical changes are caught quickly while slower-moving trends are still tracked.

### Tier 1: Direct Impact (Every Check Cycle)

Tier 1 sources have the highest probability of directly breaking your agent skills. They are checked on every cycle (default: every 6 hours).

| Source Type | Detection Method | Example Change |
|------------|-----------------|----------------|
| **Dependency versions** | `npm view <pkg> version`, `pip show <pkg>`, semver comparison | `express` 4.18.2 -> 5.0.0 |
| **API schema changes** | Fetch and diff API documentation URLs, OpenAPI spec comparison | Auth endpoint moved from `/v2/auth` to `/v3/auth` |
| **Config drift** | Compare current system state against expected baseline | Environment variable removed, default changed |
| **Internal issue tracker** | Query for new issues matching skill-related labels | New bug report: "api-caller returns 401 since Tuesday" |

Tier 1 checks are designed to be lightweight. A typical cycle makes 3--5 HTTP requests and completes in under 10 seconds.

### Tier 2: Indirect Impact (Daily)

Tier 2 sources represent patterns that affect skill quality but rarely cause immediate breakage. They are checked once or twice daily (default: morning and evening).

| Source Type | Detection Method | Example Change |
|------------|-----------------|----------------|
| **Community channels** | Analyze recent messages in relevant Discord/Slack channels | Multiple users reporting the same error pattern |
| **Support patterns** | Query FAQ frequency, ticket categorization | New category of user complaints emerging |
| **Platform announcements** | Check platform status pages, announcement feeds | "GitHub Actions will deprecate Node 16 runners on 2026-04-01" |
| **User feedback** | Aggregate and classify recent feedback | "The generated code doesn't follow the new ESLint flat config" |

Tier 2 checks often involve more sophisticated analysis --- natural language comparison, frequency counting, and pattern matching across multiple data points.

### Tier 3: Strategic Trends (Weekly)

Tier 3 sources track slow-moving industry shifts that represent improvement opportunities rather than immediate threats. They are checked weekly (default: Monday morning).

| Source Type | Detection Method | Example Change |
|------------|-----------------|----------------|
| **Tech blog analysis** | Targeted web searches for key topics, RSS feed monitoring | "Bun 2.0 released with native TypeScript execution" |
| **Competitor releases** | Monitor alternative tools and frameworks | "CrewAI added native tool caching --- consider similar feature" |
| **Best practice evolution** | Track style guide updates, linter rule changes | "ESLint deprecated `no-return-await` in favor of new rule" |
| **Industry standards** | Monitor RFC updates, specification changes | "OpenAPI 4.0 draft published with breaking schema changes" |

Tier 3 changes generate low-priority improvement suggestions. They rarely require immediate action but keep your agent system evolving with the ecosystem.

### Scheduling Summary

```
Tier 1: Every 6 hours     (4x/day)    -> Critical/High severity
Tier 2: Twice daily        (2x/day)    -> Medium severity
Tier 3: Once weekly        (1x/week)   -> Low severity
```

The tiered schedule ensures that your monitoring budget (API calls, compute time, network bandwidth) is spent proportionally to impact risk.

---

## How Change Detection Works

At its core, Knowledge Watcher is a **stateful diff engine**. It maintains a snapshot of the last-known state of each monitored source and compares it against the current state on each check cycle.

### The State File

All known states are stored in `knowledge-state.json`:

```json
{
  "lastCheck": "2026-03-20T05:30:00Z",
  "sources": {
    "express": {
      "version": "4.18.2",
      "checkedAt": "2026-03-20T05:30:00Z"
    },
    "openai-api": {
      "version": "v1",
      "schemaHash": "a3f8c2e1",
      "checkedAt": "2026-03-20T05:30:00Z"
    },
    "community-patterns": {
      "topIssues": ["react-19-migration", "eslint-flat-config"],
      "checkedAt": "2026-03-19T18:00:00Z"
    }
  }
}
```

### The Check Cycle

Each check follows a three-phase process:

```
Phase 1: SCAN         Phase 2: ASSESS         Phase 3: REQUEST
  |                     |                        |
  | Read previous       | For each diff:         | critical/high:
  | state from JSON     |   Identify affected    |   -> Immediate notification
  |                     |   skills               |   -> High-priority Prompt Request
  | Fetch current       |   Read SKILL.md files  |   -> Feed to Self-Improving Skills
  | state (API calls,   |   Rate severity        |
  | version checks)     |                        | medium:
  |                     |                        |   -> Queue Prompt Request
  | Diff previous       |                        |   -> Log to diffs file
  | vs. current         |                        |
  |                     |                        | low:
  | Append changes to   |                        |   -> Log only
  | knowledge-diffs     |                        |   -> Include in summary
  |                     |                        |
  | Update state file   |                        |
```

### Diff Detection Methods

Knowledge Watcher uses three complementary techniques to detect changes:

#### 1. Version String Comparison

The simplest and most reliable method. When a source has a `version` field, direct string comparison catches any update:

```javascript
// Inside KnowledgeWatcher.check()
if (currentState.version && previousState.version
    && currentState.version !== previousState.version) {
  this.recordDiff({
    source: sourceId,
    type: 'version_change',
    detail: `${previousState.version} -> ${currentState.version}`,
    affectedSkills: currentState.affectedSkills || ['*'],
    severity: currentState.severity || 'medium',
  });
}
```

Semver-aware comparison can be implemented in the checker function to distinguish patch updates (low severity) from major updates (high severity).

#### 2. Content Hashing

For sources without clean version numbers (API documentation pages, configuration files, status pages), Knowledge Watcher computes a hash of the content and compares it:

```javascript
// In your checker function:
const crypto = require('node:crypto');

async function checkApiDocs(previousState) {
  const response = await fetch('https://api.example.com/docs/openapi.json');
  const content = await response.text();
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

  if (hash === previousState.schemaHash) return null; // No change

  return {
    schemaHash: hash,
    customDiffs: [{
      type: 'schema_change',
      detail: `API schema hash changed: ${previousState.schemaHash} -> ${hash}`,
      affectedSkills: ['api-caller', 'data-fetcher'],
      severity: 'high',
    }],
  };
}
```

#### 3. Semantic Comparison

For text-heavy sources (blog posts, documentation, community discussions), simple hashing is too noisy --- minor formatting changes would trigger false positives. Instead, the checker function can extract structured information and compare semantically:

```javascript
async function checkCommunityPatterns(previousState) {
  // Extract top issues from community channels
  const currentIssues = await extractTopIssues(); // Your implementation

  const newIssues = currentIssues.filter(
    issue => !previousState.topIssues?.includes(issue)
  );

  if (newIssues.length === 0) return null;

  return {
    topIssues: currentIssues,
    customDiffs: newIssues.map(issue => ({
      type: 'community_pattern',
      detail: `New community concern: ${issue}`,
      affectedSkills: ['*'],
      severity: 'medium',
    })),
  };
}
```

### The Diffs Log

Every detected change is appended to `knowledge-diffs.jsonl` as an immutable audit trail:

```jsonl
{"ts":"2026-03-20T05:30:00Z","source":"express","type":"version_change","detail":"4.18.2 -> 5.0.0","affectedSkills":["*"],"severity":"high","processed":false}
{"ts":"2026-03-20T05:30:00Z","source":"openai-api","type":"schema_change","detail":"API schema hash changed: a3f8c2e1 -> b7d4f9a3","affectedSkills":["api-caller"],"severity":"high","processed":false}
{"ts":"2026-03-20T18:00:00Z","source":"community","type":"community_pattern","detail":"New community concern: eslint-flat-config-migration","affectedSkills":["code-linter"],"severity":"medium","processed":false}
```

Each diff entry includes a `processed` flag. Once a diff has been acted upon (turned into a Prompt Request, reviewed by a human, or dismissed), it is marked as `processed: true`. This prevents the same change from generating duplicate improvement requests.

---

## Impact Assessment and Severity Scoring

Not all changes are equally urgent. A patch version bump in a logging library is very different from a major version change in your authentication framework. Knowledge Watcher uses a four-level severity system to prioritize response.

### Severity Levels

| Severity | Meaning | Response Time | Example |
|----------|---------|--------------|---------|
| **critical** | Skill will break immediately | Immediate notification + auto-fix attempt | API endpoint removed, auth mechanism changed |
| **high** | Quality will degrade noticeably | Within hours | Model output format changed, dependency major version bump |
| **medium** | Improvement opportunity | Next processing cycle | New best practice available, minor API enhancement |
| **low** | Informational only | Weekly summary | Industry trend, competitor feature release |

### How Severity is Determined

Severity scoring happens at two levels:

#### 1. Checker-level scoring

The checker function (provided by the user) can directly specify a severity based on domain knowledge:

```javascript
async function checkFrameworkVersion(previousState) {
  const latest = await fetchLatestVersion('my-framework');
  if (latest === previousState.version) return null;

  // Semver-based severity
  const [prevMajor] = previousState.version.split('.');
  const [currMajor] = latest.split('.');
  const severity = currMajor !== prevMajor ? 'critical'
    : latest.includes('-rc') ? 'low'
    : 'medium';

  return { version: latest, severity, affectedSkills: ['*'] };
}
```

#### 2. Cross-referencing with skill health

When a detected change aligns with existing skill health problems (from Self-Improving Skills), the severity is escalated:

```
Detected: "express updated from 4.x to 5.x"           -> severity: medium
Observed: "api-caller score dropped from 0.95 to 0.42" -> flag: declining

Combined assessment: The express update likely caused the api-caller degradation.
Escalated severity: high -> immediate Prompt Request generated.
```

This cross-referencing is the key differentiator between Knowledge Watcher and simple version-checking scripts. By correlating external changes with internal health metrics, the system can identify **causation**, not just **correlation**.

### Affected Skills Mapping

Each diff includes an `affectedSkills` array. This can be:

- **`['*']`** --- Potentially affects all skills (e.g., runtime update, global config change)
- **`['api-caller', 'data-fetcher']`** --- Affects specific named skills
- **`[]`** --- No direct skill impact (informational only)

The affected skills list is used to route the generated Prompt Request to the correct agent and to focus the Self-Improving Skills diagnosis on the right SKILL.md files.

---

## Automatic Improvement Request Generation

When Knowledge Watcher detects a change and assesses its impact, the final step is to convert that assessment into an actionable Prompt Request that flows through the standard Agent Skill Bus pipeline.

### From Diff to Prompt Request

```
knowledge-diffs.jsonl entry:
{
  "source": "openai-api",
  "type": "breaking_change",
  "detail": "auth endpoint moved to /v3/auth",
  "affectedSkills": ["api-caller"],
  "severity": "high"
}

                |
                v

Generated Prompt Request:
{
  "source": "knowledge-watcher",
  "priority": "high",
  "agent": "dev-agent",
  "task": "Update api-caller skill: auth endpoint moved to /v3/auth",
  "context": "Knowledge Watcher detected a breaking API change...",
  "affectedSkills": ["api-caller"],
  "affectedFiles": []
}
```

### Priority Mapping

Severity levels map directly to Prompt Request priorities:

| Diff Severity | Prompt Request Priority | Queue Behavior |
|--------------|------------------------|----------------|
| critical | critical | Bypasses queue, dispatched immediately |
| high | high | Top of queue, dispatched next cycle |
| medium | medium | Standard queue position |
| low | _(no PR generated)_ | Logged only, included in reports |

### Request Content

The generated Prompt Request includes:

1. **Source attribution**: `"source": "knowledge-watcher"` so downstream consumers know this was auto-generated
2. **Task description**: A human-readable description of what needs to change
3. **Context**: The raw diff detail, previous state, and affected skill information
4. **Affected skills/files**: For routing and lock management

This Prompt Request enters the standard queue alongside human-generated requests, cron-triggered tasks, and webhook events. It follows the same DAG resolution, file locking, and priority routing as any other request.

---

## Integration with Self-Improving Skills

The true power of Knowledge Watcher emerges when it is combined with the Self-Improving Skills module. Together, they form a **closed-loop proactive skill maintenance** system.

### The Full Loop

```
                    EXTERNAL WORLD
                         |
                    +-----------+
                    | Knowledge |  <-- Monitors dependencies, APIs, community
                    | Watcher   |
                    +-----------+
                         |
                    Detected diff
                         |
                         v
                    +-----------+
                    |  Prompt   |  <-- Routes by priority, resolves DAG deps
                    |  Request  |
                    |  Bus      |
                    +-----------+
                         |
                    Dispatched PR
                         |
                         v
                    +-----------+
                    |  Agent    |  <-- Executes the fix (LLM, script, human)
                    |  Executor |
                    +-----------+
                         |
                    Execution result
                         |
                         v
                    +-----------+
                    |  Self-    |  <-- Logs run, detects drift, diagnoses
                    | Improving |
                    |  Skills   |
                    +-----------+
                         |
                    Health metrics
                         |
                         v
                    +-----------+
                    | Knowledge |  <-- Uses health data to refine severity
                    | Watcher   |      assessment on next cycle
                    +-----------+
```

### How They Collaborate

**Scenario**: OpenAI changes their chat completion response format.

1. **Knowledge Watcher** detects the API schema change (Tier 1 check, content hash diff).
2. A **Prompt Request** is generated with priority `high`: "Update api-caller skill: OpenAI response format changed."
3. The request is dispatched to the dev agent, which updates the response parsing logic.
4. **Self-Improving Skills** records the execution result (success/fail/partial, score).
5. Over the next few check cycles, Self-Improving Skills monitors whether the `api-caller` skill's health score recovers.
6. If the fix was partial (score improved but not fully), Self-Improving Skills generates a follow-up Prompt Request for further refinement.
7. On the next cycle, **Knowledge Watcher** uses the updated health data to validate that the external change has been fully absorbed.

### Cross-module Data Flow

| Data File | Written By | Read By |
|-----------|-----------|---------|
| `knowledge-state.json` | Knowledge Watcher | Knowledge Watcher (previous state) |
| `knowledge-diffs.jsonl` | Knowledge Watcher | Self-Improving Skills (for diagnosis context) |
| `prompt-request-queue.jsonl` | Knowledge Watcher, Self-Improving Skills | Prompt Request Bus (for dispatch) |
| `skill-runs.jsonl` | Agent executors | Self-Improving Skills (for health analysis) |
| `skill-health.json` | Self-Improving Skills | Knowledge Watcher (for severity cross-reference) |

---

## Configuration and Customization

Knowledge Watcher is designed to be flexible. You provide the checker functions; the framework handles state management, diff detection, and request generation.

### Defining a Custom Checker

A checker is an async function that receives the previous state and returns the current state (or `null` if nothing changed):

```javascript
import { KnowledgeWatcher } from 'agent-skill-bus';

const watcher = new KnowledgeWatcher('./skills/knowledge-watcher');

// Register a Tier 1 check: npm package version
const result = await watcher.check('express', async (previousState) => {
  const response = await fetch('https://registry.npmjs.org/express/latest');
  const data = await response.json();

  if (data.version === previousState.version) return null;

  return {
    version: data.version,
    severity: data.version.startsWith('5.') ? 'critical' : 'medium',
    affectedSkills: ['api-server', 'middleware-chain'],
  };
});

if (result && result.diffs.length > 0) {
  console.log(`Detected ${result.diffs.length} changes for express`);
}
```

### Checker Function Contract

Your checker function must:

- **Accept** `(previousState: object)` --- the last-known state from `knowledge-state.json`
- **Return** `null` if no changes detected
- **Return** an object with any state fields to persist, plus optional:
  - `version` (string) --- triggers automatic version comparison
  - `severity` (string) --- `'critical' | 'high' | 'medium' | 'low'`
  - `affectedSkills` (string[]) --- list of skill names or `['*']`
  - `customDiffs` (object[]) --- array of additional diffs to record

### Rate Limiting

Knowledge Watcher enforces a maximum of **3 web searches per check cycle** by default. This is implemented at the checker level, not the framework level, so you have full control:

```javascript
// Good: batch multiple checks into one HTTP call
async function checkMultiplePackages(previousState) {
  const packages = ['express', 'fastify', 'hono'];
  const results = await Promise.all(
    packages.map(pkg => fetch(`https://registry.npmjs.org/${pkg}/latest`).then(r => r.json()))
  );
  // ... compare and return diffs
}
```

### Scheduling with Cron

The recommended cron schedule for a production setup:

```cron
# Tier 1: Every 6 hours
0 */6 * * * cd /path/to/project && npx agent-skill-bus check-tier1

# Tier 2: Twice daily (8am and 6pm)
0 8,18 * * * cd /path/to/project && npx agent-skill-bus check-tier2

# Tier 3: Weekly (Monday 9am)
0 9 * * 1 cd /path/to/project && npx agent-skill-bus check-tier3
```

Or integrate directly into your agent's heartbeat cycle:

```javascript
// In your agent's heartbeat handler
const watcher = new KnowledgeWatcher(dataDir);

// Always run Tier 1
await runTier1Checks(watcher);

// Tier 2: only if 12+ hours since last check
const state = watcher.readState();
const hoursSinceLastCheck = (Date.now() - new Date(state.lastCheck).getTime()) / 3600000;
if (hoursSinceLastCheck >= 12) {
  await runTier2Checks(watcher);
}
```

---

## Real-World Scenarios

These scenarios are based on actual incidents from our production system running 42 AI agents at LLC Miyabi.

### Scenario 1: npm Breaking Change Detected Before Production Impact

**Timeline**:

```
T+0h  express 5.0.0 published to npm registry
T+2h  Knowledge Watcher Tier 1 check runs
      -> Detects: "express 4.18.2 -> 5.0.0" (major version bump)
      -> Severity: critical (major version change)
      -> Affected skills: api-server, middleware-chain

T+2h  Prompt Request auto-generated:
      "Update api-server skill: express updated from 4.x to 5.x.
       Breaking changes expected. Review migration guide."
      Priority: critical (bypasses queue)

T+3h  Dev agent reviews express 5.x migration guide
      -> Identifies: req.host behavior change, removed middleware
      -> Generates fix PR with updated middleware stack

T+4h  Fix deployed to staging, tested, promoted to production

T+8h  (Without Knowledge Watcher: first user reports 500 errors
       because npm install pulled express 5.x on next deploy)
```

**Key insight**: Knowledge Watcher detected the change **6 hours before it would have hit production** through a normal deploy cycle. The fix was in place before any user impact.

### Scenario 2: API Response Format Change Auto-Fixed

**Timeline**:

```
T+0h  OpenAI silently updates chat completion response format
      (new field structure for tool_calls)

T+6h  Knowledge Watcher Tier 1 check runs
      -> Fetches OpenAI API changelog
      -> Detects schema hash change
      -> Severity: high

T+6h  Simultaneously, Self-Improving Skills detects:
      -> api-caller skill score dropped from 0.95 to 0.62
      -> Trend: declining
      -> Flagged for attention

T+6h  Knowledge Watcher cross-references:
      -> External change (API schema) + Internal degradation (score drop)
      -> Correlation confirmed: timing matches
      -> Auto-generates Prompt Request:
         "Fix api-caller: OpenAI response format changed.
          Skill score dropped from 0.95 to 0.62. Schema diff attached."

T+7h  Dev agent analyzes the schema diff
      -> Updates response parsing in api-caller
      -> Runs tests: all passing
      -> Records skill run: score 0.94

T+12h Self-Improving Skills confirms:
      -> api-caller score recovered to 0.94
      -> Trend: improving
      -> Unflagged
```

**Key insight**: The combination of external change detection (Knowledge Watcher) and internal quality monitoring (Self-Improving Skills) enabled **automatic root cause identification**. The system did not just detect that something broke --- it identified _why_ it broke and generated a targeted fix request.

### Scenario 3: Community Pattern Triggers Proactive Update

**Timeline**:

```
Week 1  ESLint announces flat config as the new default
        Knowledge Watcher Tier 3 (weekly) detects the announcement
        -> Severity: low
        -> Logged but no Prompt Request generated

Week 2  Multiple users in community channels report confusion
        Knowledge Watcher Tier 2 (daily) detects the pattern
        -> "New community concern: eslint-flat-config-migration"
        -> Severity escalated to medium
        -> Prompt Request generated:
           "Update code-linter skill to support ESLint flat config format"

Week 3  Dev agent updates code-linter skill
        -> Adds flat config detection and generation
        -> Skill now handles both legacy and flat config
```

**Key insight**: Tier 3 caught the industry shift early. Tier 2 escalated it when user impact became apparent. The system adapted proactively, before the legacy config format was deprecated.

---

## Setting Up Knowledge Watcher for Your Project

### Step 1: Initialize Agent Skill Bus

```bash
npx agent-skill-bus init
```

This creates the data directory structure including `skills/knowledge-watcher/` with:
- `knowledge-state.json` --- State tracking file
- `knowledge-diffs.jsonl` --- Diff history log
- `SKILL.md` --- Reference documentation

### Step 2: Write Your First Checker

Create a file for your check routines (e.g., `checks/tier1.js`):

```javascript
import { KnowledgeWatcher, PromptRequestQueue } from 'agent-skill-bus';

const watcher = new KnowledgeWatcher('./skills/knowledge-watcher');
const queue = new PromptRequestQueue('./skills/prompt-request-bus');

// Check 1: Monitor a critical npm dependency
await watcher.check('my-framework', async (prev) => {
  const res = await fetch('https://registry.npmjs.org/my-framework/latest');
  const pkg = await res.json();
  if (pkg.version === prev.version) return null;

  const [prevMajor] = (prev.version || '0.0.0').split('.');
  const [currMajor] = pkg.version.split('.');
  const isMajor = currMajor !== prevMajor;

  return {
    version: pkg.version,
    severity: isMajor ? 'critical' : 'medium',
    affectedSkills: ['*'],
  };
});

// Check 2: Monitor an API endpoint
await watcher.check('payment-api', async (prev) => {
  const res = await fetch('https://api.stripe.com/healthcheck');
  // Your comparison logic here
  return null; // or return state with changes
});

// Convert unprocessed diffs into Prompt Requests
const diffs = watcher.getUnprocessed();
for (const diff of diffs) {
  if (diff.severity === 'low') continue; // Skip low severity

  queue.enqueue({
    source: 'knowledge-watcher',
    priority: diff.severity === 'critical' ? 'critical' : diff.severity,
    agent: 'dev-agent',
    task: `[Knowledge Watcher] ${diff.detail}`,
    context: JSON.stringify(diff),
    affectedSkills: diff.affectedSkills,
  });
}

// Mark processed
const allDiffs = watcher.getUnprocessed();
const indices = allDiffs.map((_, i) => i); // Mark all as processed
watcher.markProcessed(indices);

console.log(`Checked ${2} sources, generated ${diffs.length} requests`);
```

### Step 3: Schedule Regular Checks

Add to your crontab or CI pipeline:

```bash
# Tier 1: Every 6 hours
0 */6 * * * node /path/to/checks/tier1.js >> /var/log/knowledge-watcher.log 2>&1

# Tier 2: Daily
0 9,18 * * * node /path/to/checks/tier2.js >> /var/log/knowledge-watcher.log 2>&1

# Tier 3: Weekly
0 9 * * 1 node /path/to/checks/tier3.js >> /var/log/knowledge-watcher.log 2>&1
```

### Step 4: Monitor via CLI

```bash
# See diff statistics
npx agent-skill-bus diffs

# See unprocessed diffs
npx agent-skill-bus diffs --unprocessed

# Full dashboard (includes queue + skills + diffs)
npx agent-skill-bus dashboard
```

### Step 5: Close the Loop

Ensure your agents log their execution results so Self-Improving Skills can track whether Knowledge Watcher's fixes actually work:

```bash
# After executing a Knowledge Watcher-generated task
npx agent-skill-bus record-run \
  --agent dev-agent \
  --skill api-caller \
  --task "Fix response parsing for new API format" \
  --result success \
  --score 0.95
```

---

## API Reference

### `KnowledgeWatcher` Class

```javascript
import { KnowledgeWatcher } from 'agent-skill-bus';

const watcher = new KnowledgeWatcher(dataDir);
```

#### `readState()`

Returns the current state object from `knowledge-state.json`.

```javascript
const state = watcher.readState();
// { lastCheck: "2026-03-20T05:30:00Z", sources: { ... } }
```

#### `updateSource(sourceId, newState)`

Manually updates a source's state. Returns `{ old, new }`.

```javascript
watcher.updateSource('my-api', { version: '2.0.0', endpoint: '/v2' });
```

#### `check(sourceId, checkerFn)`

Runs a checker function against a source and records any diffs. Returns `{ sourceId, diffs, previousState, currentState }` or `null`.

```javascript
const result = await watcher.check('express', async (prev) => {
  // ... fetch current state, compare, return
});
```

#### `recordDiff({ source, type, detail, affectedSkills, severity })`

Manually records a diff entry.

```javascript
watcher.recordDiff({
  source: 'manual-observation',
  type: 'breaking_change',
  detail: 'API v2 sunset announced for 2026-06-01',
  affectedSkills: ['api-caller'],
  severity: 'high',
});
```

#### `getUnprocessed()`

Returns all diffs with `processed: false`.

#### `getBySeverity(severity)`

Returns all diffs matching the given severity level.

#### `markProcessed(diffIndices)`

Marks the specified diff entries (by index) as processed.

#### `stats()`

Returns summary statistics:

```javascript
const stats = watcher.stats();
// {
//   sources: 5,
//   totalDiffs: 23,
//   unprocessed: 3,
//   bySeverity: { critical: 1, high: 4, medium: 12, low: 6 }
// }
```

---

## FAQ

### How is this different from Dependabot or Renovate?

Dependabot and Renovate monitor **code dependencies** and create PRs to update `package.json`. Knowledge Watcher monitors a much broader set of external factors:

- API schema changes (not just library versions)
- Community pattern shifts
- Platform announcements
- Configuration drift
- Industry trends

More importantly, Knowledge Watcher does not just update versions --- it **assesses impact on agent skills** and generates targeted improvement requests that feed into the self-improving loop.

### Does Knowledge Watcher require an LLM?

No. The core framework (state management, diff detection, request generation) is pure JavaScript with zero dependencies. However, the checker functions you write _may_ use LLMs for semantic comparison, trend analysis, or natural language understanding of changelogs. This is your choice.

### How do I avoid false positives?

Three strategies:

1. **Semantic hashing**: Hash only the meaningful parts of a response, not timestamps or request IDs.
2. **Severity filtering**: Only generate Prompt Requests for `medium` severity and above. Log `low` severity for review.
3. **Cooldown periods**: After detecting a change, wait for a confirmation check before generating a request.

### Can I use Knowledge Watcher without the rest of Agent Skill Bus?

Yes. All three modules (Prompt Request Bus, Self-Improving Skills, Knowledge Watcher) work independently. You can use Knowledge Watcher purely as a change detection engine and route the output to your own systems.

### What is the performance impact?

Minimal. Knowledge Watcher makes network calls only during check cycles (not continuously). A typical Tier 1 check cycle completes in under 10 seconds. All data is stored in JSONL files --- no database required. The state file is typically under 10 KB even with hundreds of monitored sources.

---

## Further Reading

- [Agent Skill Bus README](../README.md) --- Full framework overview
- [Self-Improving Skills SKILL.md](../skills/self-improving-skills/SKILL.md) --- The 7-step quality loop
- [Prompt Request Bus SKILL.md](../skills/prompt-request-bus/SKILL.md) --- DAG-based task queue
- [Framework Comparison](comparison.md) --- How Agent Skill Bus compares to LangGraph, CrewAI, AutoGen, and others

---

_Knowledge Watcher is part of [Agent Skill Bus](https://github.com/ShunsukeHayashi/agent-skill-bus), built by [LLC Miyabi](https://miyabi-ai.jp). MIT License._
