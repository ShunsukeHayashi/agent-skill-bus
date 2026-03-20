# How Self-Improving Skills Work

**A technical guide to automatic skill health monitoring, degradation detection, and self-repair for AI agent systems.**

> Keywords: self-improving agent skills, skill health monitoring, agent skill degradation detection, AI agent quality assurance

---

## Table of Contents

1. [The Problem: Silent Skill Degradation](#1-the-problem-silent-skill-degradation)
2. [The 7-Step Self-Improvement Cycle](#2-the-7-step-self-improvement-cycle)
3. [Scoring Algorithm](#3-scoring-algorithm)
4. [Drift Detection](#4-drift-detection)
5. [Configuration Options](#5-configuration-options)
6. [Real-World Results](#6-real-world-results)
7. [Integration with Claude Code / Codex](#7-integration-with-claude-code--codex)
8. [FAQ](#8-faq)

---

## 1. The Problem: Silent Skill Degradation

AI agent systems look great on demo day. Then they quietly rot.

Every agent skill -- a prompt, a tool call, an API integration, a workflow step -- is a living dependency. Unlike compiled code that either works or crashes, agent skills **degrade gradually**. They don't throw exceptions; they return subtly wrong answers. They don't segfault; they produce outputs that are 80% correct instead of 95% correct. Nobody notices until a customer complains or a downstream system breaks.

### The Four Horsemen of Skill Degradation

#### 1. API Changes

External APIs change without warning. A field gets renamed. A response format shifts from XML to JSON. An endpoint gets deprecated. Your agent was calling `v2/users` but the provider silently redirected to `v3/users` which returns a different schema. The skill still "works" -- it returns data -- but the data is shaped wrong and downstream processing silently produces garbage.

```
Week 1: API returns { "name": "Alice" }           → skill score: 1.0
Week 2: API returns { "full_name": "Alice" }       → skill score: 0.6
Week 3: API returns { "user": { "name": "Alice" }} → skill score: 0.3
```

Nobody changed your code. The score just... dropped.

#### 2. Model Updates

LLM providers update their models regularly. GPT-4o today is not the same GPT-4o from last month. Claude's behavior shifts between versions. A prompt that reliably produced structured JSON output starts occasionally returning markdown-wrapped JSON. A system prompt that kept the model focused starts getting ignored because the model's instruction-following characteristics changed.

This is particularly insidious because model updates happen without any notification to your code. The HTTP 200 still comes back. The response still looks like text. But the **quality** of the output has shifted.

#### 3. Auth Expiration

OAuth tokens expire. API keys get rotated. Service accounts lose permissions after a security audit. Certificates expire. The skill that was working fine for 90 days suddenly starts returning 401 errors at 2 AM on a Saturday.

Most teams discover this through user complaints, not monitoring.

#### 4. Prompt Drift

This is the most subtle failure mode. Over time, teams add "just one more instruction" to prompts. Context windows fill up. Few-shot examples become stale as the domain evolves. What started as a crisp, focused prompt becomes a 3000-token behemoth that contradicts itself in three places.

Prompt drift doesn't cause failures. It causes **mediocrity**. The skill still runs, but its output quality slowly declines from 0.95 to 0.85 to 0.72 to 0.61 -- always just above the threshold where someone would investigate.

### Why Traditional Monitoring Fails

Traditional application monitoring looks for binary signals: is it up or down? Did the HTTP request return 200 or 500? Did the function throw an exception?

Agent skills exist in a continuous quality space. A skill that returns a 200 response with subtly wrong data looks "healthy" to every monitoring system ever built. You need **quality-aware monitoring** that tracks scores over time, detects trends, and flags degradation before it becomes a production incident.

This is what Self-Improving Skills does.

---

## 2. The 7-Step Self-Improvement Cycle

The self-improvement loop runs continuously, evaluating skill health and applying fixes when degradation is detected. It follows a 7-step cycle inspired by [Cognee's self-improving agents](https://www.cognee.ai):

```
OBSERVE → ANALYZE → DIAGNOSE → PROPOSE → EVALUATE → APPLY → RECORD
   ↑                                                           │
   └───────────────────────────────────────────────────────────┘
```

Each step is independent and stateless -- it reads from JSONL files and writes results back. This means you can run any step manually, skip steps, or replace individual steps with your own implementation.

### Step 1: OBSERVE -- Collecting Execution Data

**Purpose:** Gather raw execution data from all agents and skills.

Every time an agent executes a skill, it appends a single line to `skill-runs.jsonl`:

```jsonl
{"ts":"2026-03-18T12:00:00Z","agent":"dev-coder","skill":"api-caller","task":"fetch user list","result":"success","score":0.95,"notes":""}
{"ts":"2026-03-18T12:05:00Z","agent":"dev-coder","skill":"api-caller","task":"fetch user data","result":"fail","score":0.0,"notes":"401 Unauthorized - token expired"}
{"ts":"2026-03-18T12:10:00Z","agent":"monitor","skill":"healthcheck","task":"system audit","result":"partial","score":0.6,"notes":"SSH OK, firewall check failed"}
```

**Data schema:**

| Field | Type | Description |
|-------|------|-------------|
| `ts` | ISO 8601 string | When the skill was executed |
| `agent` | string | Which agent ran the skill |
| `skill` | string | The skill identifier |
| `task` | string | What was attempted (human-readable) |
| `result` | `"success"` \| `"fail"` \| `"partial"` | Outcome category |
| `score` | float `[0.0, 1.0]` | Quality score (clamped automatically) |
| `notes` | string | Error messages, context, diagnostics |

**How to record runs:**

```bash
# CLI
npx agent-skill-bus record-run \
  --agent dev-coder \
  --skill api-caller \
  --task "fetch user list" \
  --result success \
  --score 0.95

# Programmatic (JavaScript/TypeScript)
import { SkillMonitor } from 'agent-skill-bus';
const monitor = new SkillMonitor('./skills/self-improving-skills');

monitor.recordRun({
  agent: 'dev-coder',
  skill: 'api-caller',
  task: 'fetch user list',
  result: 'success',
  score: 0.95,
  notes: '',
});
```

**Key design decisions:**

- **Append-only JSONL.** No database. No message broker. One line per run. This means you can `tail -f` the file, `wc -l` it, `grep` it, pipe it to anything. Zero operational overhead.
- **Score clamping.** Values outside `[0, 1]` are clamped automatically (`Math.max(0, Math.min(1, score))`). You never have to worry about invalid scores corrupting your data.
- **Agent-reported scores.** The executing agent determines its own score. This is intentional -- the agent has the most context about whether its output was good. For high-stakes skills, you can add external validators that record a second run entry with an independent score.

The OBSERVE step reads this file with a configurable time window (default: 7 days):

```javascript
// Returns all runs from the last 7 days
const recentRuns = monitor.observe(7);

// Returns all runs from the last 30 days
const monthlyRuns = monitor.observe(30);
```

### Step 2: ANALYZE -- Statistical Trend Analysis

**Purpose:** Calculate per-skill health metrics and detect patterns.

The ANALYZE step processes all recorded runs and produces a health report for each skill. It computes:

1. **All-time average score** -- the baseline quality level
2. **Recent average score** -- quality within the analysis window (default: 7 days)
3. **Trend direction** -- is quality improving, stable, declining, or broken?
4. **Consecutive failure count** -- how many runs in a row have failed (from the most recent backward)?
5. **Flagged status** -- does this skill need attention?

```javascript
const health = monitor.analyze(7);
// Returns:
// {
//   "api-caller": {
//     "runs": 30,
//     "avgScore": 0.72,
//     "recentAvg": 0.45,
//     "trend": "declining",
//     "lastFail": "2026-03-18T12:05:00Z",
//     "consecutiveFails": 3,
//     "flagged": true
//   },
//   "web-search": {
//     "runs": 45,
//     "avgScore": 0.95,
//     "recentAvg": 0.97,
//     "trend": "improving",
//     "lastFail": null,
//     "consecutiveFails": 0,
//     "flagged": false
//   }
// }
```

**Trend calculation:**

The trend is derived from the delta between `recentAvg` (score within the analysis window) and `avgScore` (all-time score):

```
delta = recentAvg - avgScore

if delta > 0.05  → "improving"
if delta < -0.05 → "declining"
else             → "stable"

if consecutiveFails >= 3 → "broken" (overrides all)
```

**Flagging criteria (any one triggers a flag):**

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| Low average score | `avgScore < 0.7` | Skill is underperforming overall |
| Declining trend | `trend === "declining"` | Quality is getting worse |
| Broken | `trend === "broken"` | 3+ consecutive failures |

**Consecutive failure detection:**

The monitor sorts all runs for each skill by timestamp (newest first) and counts how many consecutive `fail` results appear at the head of the list:

```javascript
// Internal logic (simplified)
const sorted = runs.sort((a, b) => new Date(b.ts) - new Date(a.ts));
let consecutive = 0;
for (const r of sorted) {
  if (r.result === 'fail') consecutive++;
  else break;
}
```

This catches the case where a skill was healthy for months but just broke -- even if the all-time average is still above 0.7, three consecutive failures immediately flag it as `broken`.

### Step 3: DIAGNOSE -- LLM-Powered Root Cause Analysis

**Purpose:** Understand *why* a flagged skill is failing.

Once a skill is flagged, the DIAGNOSE step reads:

1. **The skill's `SKILL.md` file** -- the prompt instructions, expected behavior, prerequisites
2. **Recent failure notes from `skill-runs.jsonl`** -- error messages, stack traces, unexpected outputs
3. **Knowledge diffs from the Knowledge Watcher** -- recent external changes that might explain the failure

These are assembled into a diagnostic prompt and sent to an LLM:

```
Given the following skill definition:
[contents of SKILL.md]

And these recent failures:
- 2026-03-18T12:05:00Z: "401 Unauthorized - token expired"
- 2026-03-18T13:10:00Z: "401 Unauthorized - token expired"
- 2026-03-18T14:15:00Z: "401 Unauthorized - token expired"

And these recent external changes:
- API provider rotated all service account keys on 2026-03-17

What is the root cause of these failures?
```

The LLM analyzes the pattern and produces a structured diagnosis:

```
Root cause: API authentication token expired following provider-wide key rotation
             on 2026-03-17. The skill's hardcoded bearer token is no longer valid.
Confidence: HIGH
Category: auth_expiration
```

**Note:** The DIAGNOSE step is the only part of the cycle that requires an LLM call. Steps 1-2 and 4-7 are pure computation. If you don't have LLM access in your self-improvement loop, you can skip DIAGNOSE and PROPOSE, and rely purely on the statistical flagging from ANALYZE to alert humans.

### Step 4: PROPOSE -- Generating Fix Candidates

**Purpose:** Generate concrete, actionable fixes for the diagnosed problem.

Based on the diagnosis, the system generates 1-3 fix candidates. Each fix is a specific change to the skill's definition (usually its `SKILL.md` file):

| Fix Type | Example |
|----------|---------|
| Fix incorrect instructions | "Change `Authorization: Bearer sk-old` to `Authorization: Bearer $API_KEY`" |
| Add error handling guidance | "Add retry logic with exponential backoff for 429 responses" |
| Update outdated API references | "Replace `api.example.com/v2/users` with `api.example.com/v3/users`" |
| Add missing prerequisites | "Add prerequisite: Ensure `OPENAI_API_KEY` environment variable is set" |
| Revert to known-good version | "Revert prompt to git commit abc123 (last known 100% success rate)" |

Proposals are concrete text diffs, not abstract suggestions. Each one specifies exactly what to change and where.

### Step 5: EVALUATE -- Risk Scoring

**Purpose:** Determine whether a fix is safe to apply automatically or requires human approval.

Each proposal is scored on three dimensions:

| Dimension | Range | Question |
|-----------|-------|----------|
| **Relevance** | 0.0 - 1.0 | Does this fix address the actual failure pattern? |
| **Safety** | 0.0 - 1.0 | Could this fix break other functionality? |
| **Effort** | 0.0 - 1.0 | How much change is needed? (lower = more change) |

The evaluation produces a risk level:

```
if relevance > 0.7 AND safety > 0.8 AND NOT security_sensitive:
    risk = "low"     → auto-apply candidate
elif relevance > 0.5 AND safety > 0.6:
    risk = "medium"  → auto-apply with notification
else:
    risk = "high"    → human approval required
```

**Examples:**

| Scenario | Relevance | Safety | Risk | Action |
|----------|-----------|--------|------|--------|
| Add missing env var to prerequisites | 0.9 | 0.95 | Low | Auto-apply |
| Update API endpoint URL | 0.85 | 0.8 | Low | Auto-apply |
| Rewrite core prompt instructions | 0.7 | 0.5 | High | Human approval |
| Change authentication method | 0.9 | 0.3 | High | Human approval |
| Add retry logic to error handling | 0.8 | 0.85 | Low | Auto-apply |

### Step 6: APPLY -- Making the Fix

**Purpose:** Apply approved fixes and route high-risk fixes to humans.

**For low-risk fixes (auto-apply):**

1. Edit the skill's `SKILL.md` file with the proposed change
2. Log the edit to `skill-improvements.md`
3. The next skill execution will use the updated instructions

**For high-risk fixes (human approval):**

1. Write the proposal to `skill-improvements.md` with status "pending approval"
2. Generate a Prompt Request via the Prompt Request Bus:

```json
{
  "source": "self-improve",
  "priority": "medium",
  "agent": "skill-owner",
  "task": "Fix declining api-caller skill: 401 errors since March 17",
  "context": "Diagnosis: auth token expired. Proposed fix: switch to env-var based auth."
}
```

3. Optionally send a notification (Slack, Discord, Telegram) to the skill owner

**Safety constraints enforced at this step:**

| Rule | Description |
|------|-------------|
| Never auto-apply to security-sensitive skills | Auth, encryption, access control skills always require human review |
| Max 1 auto-edit per skill per day | Prevents rapid-fire changes from compounding errors |
| All edits logged | Every change is recorded in `skill-improvements.md` for audit |
| Git-based rollback | Previous `SKILL.md` versions are preserved in git history |

### Step 7: RECORD -- Logging for Future Reference

**Purpose:** Create an audit trail and feed the learning loop.

Every improvement cycle -- whether the fix was auto-applied, manually approved, or rejected -- is recorded in `skill-improvements.md`:

```markdown
### 2026-03-18T14:30:00Z -- api-caller
- **Diagnosis:** API authentication token expired following provider key rotation
- **Proposal:** Switch from hardcoded bearer token to environment variable reference
- **Action:** Auto-applied: updated SKILL.md prerequisites section
- **Result:** Score recovered from 0.0 to 0.92 within 3 runs
```

The health snapshot file (`skill-health.json`) is also updated with the latest aggregates:

```json
{
  "lastUpdated": "2026-03-18T14:30:00Z",
  "skills": {
    "api-caller": {
      "runs": 33,
      "avgScore": 0.78,
      "recentAvg": 0.92,
      "trend": "improving",
      "lastFail": "2026-03-18T14:15:00Z",
      "consecutiveFails": 0,
      "flagged": false
    }
  }
}
```

```javascript
// Programmatic recording
monitor.recordImprovement({
  skill: 'api-caller',
  diagnosis: 'Auth token expired after provider key rotation',
  proposal: 'Switch to environment variable reference',
  action: 'Auto-applied: updated SKILL.md prerequisites',
  result: 'Score recovered from 0.0 to 0.92 within 3 runs',
});

// Update the persisted health snapshot
monitor.updateHealth(7);
```

This closes the loop. The next OBSERVE step will read the new runs (post-fix), and if the fix worked, the skill will no longer be flagged. If the fix didn't work, the skill will remain flagged and the cycle will run again with additional diagnostic context.

---

## 3. Scoring Algorithm

### Health Score Calculation

The health score for each skill is a simple average of all recorded execution scores:

```
healthScore = sum(all run scores) / count(all runs)
```

This is intentionally simple. Weighted averages, decay functions, and Bayesian estimators were considered and rejected because:

1. **Simplicity aids debugging.** When a skill is flagged, you can mentally verify the score by looking at the raw JSONL data.
2. **The trend analysis handles recency.** The `recentAvg` (7-day window) captures recent quality separately from the all-time baseline.
3. **Consecutive failures override everything.** Three failures in a row mark the skill as `broken` regardless of its historical average.

### Score Interpretation

| Score Range | Interpretation | Action |
|-------------|----------------|--------|
| 0.90 - 1.00 | Excellent | No action needed |
| 0.80 - 0.89 | Good | Monitor for trends |
| 0.70 - 0.79 | Acceptable | Watch closely, investigate if declining |
| 0.60 - 0.69 | Degraded | Flagged -- investigate promptly |
| 0.40 - 0.59 | Poor | Flagged -- likely needs prompt/config fix |
| 0.00 - 0.39 | Broken | Flagged -- immediate attention required |

### Trend Detection Algorithm

Trend is computed from the delta between the recent window average and the all-time average:

```javascript
const delta = recentAvg - avgScore;

if (consecutiveFails >= 3) return 'broken';  // Override
if (delta > 0.05) return 'improving';        // Recent quality > baseline
if (delta < -0.05) return 'declining';       // Recent quality < baseline
return 'stable';                             // Within noise margin
```

The `0.05` threshold acts as a noise filter. Normal variance in agent outputs can cause small score fluctuations; we only flag a trend when the shift is meaningful.

### Flagging Decision Matrix

| avgScore | trend | consecutiveFails | Flagged? | Priority |
|----------|-------|------------------|----------|----------|
| 0.95 | stable | 0 | No | -- |
| 0.85 | declining | 0 | Yes | Low |
| 0.72 | stable | 0 | No | -- |
| 0.65 | stable | 0 | Yes | Medium |
| 0.90 | broken | 3 | Yes | High |
| 0.45 | declining | 5 | Yes | Critical |

---

## 4. Drift Detection

### What is Drift?

Drift is **silent degradation** -- a skill's quality drops gradually, never triggering a hard failure, but steadily producing worse results over weeks or months.

Traditional alerting catches crashes. Drift detection catches erosion.

### How It Works

The `detectDrift()` method compares week-over-week averages:

```javascript
const drifting = monitor.detectDrift();
// Returns:
// [
//   {
//     "name": "article-drafter",
//     "lastWeekAvg": 0.91,
//     "thisWeekAvg": 0.74,
//     "drop": 0.17
//   }
// ]
```

**Algorithm:**

1. Calculate the average score for each skill in the **current 7-day window** (day 0-7)
2. Calculate the average score for each skill in the **previous 7-day window** (day 7-14)
3. Flag any skill where `lastWeekAvg - thisWeekAvg > 0.15` (15% drop)

```javascript
// Simplified internal logic
for (const [name, data] of Object.entries(thisWeek)) {
  if (!lastWeek[name] || lastWeek[name].count === 0) continue;
  const lastAvg = lastWeek[name].total / lastWeek[name].count;
  if (data.recentAvg !== null && lastAvg - data.recentAvg > 0.15) {
    drifting.push({
      name,
      lastWeekAvg: lastAvg,
      thisWeekAvg: data.recentAvg,
      drop: lastAvg - data.recentAvg,
    });
  }
}
```

### Drift Triggers

| Trigger | Description | Example |
|---------|-------------|---------|
| Score drop > 15% WoW | Week-over-week average drops more than 0.15 | 0.91 last week -> 0.74 this week |
| Perfect-to-failing | A skill with 100% success rate starts failing | Score drops from 1.0 to anything < 1.0 |
| Model/API upgrade | External change causes behavior shift | GPT-4o update changes JSON output format |

### Drift vs. Noise

Not every score fluctuation is drift. The 15% threshold and the 7-day aggregation window are designed to filter out normal variance:

- **Random bad runs:** A single 0.3 score in a sea of 0.9s won't trigger drift detection -- the weekly average stays high.
- **Temporary outages:** If an API is down for 2 hours and then recovers, the weekly average might dip slightly but likely won't cross the 15% threshold.
- **Genuine drift:** When quality erodes consistently across multiple runs over multiple days, the weekly averages diverge and the detection fires.

### Using Drift Detection in Practice

```bash
# CLI
npx agent-skill-bus drift

# Output:
# {
#   "count": 1,
#   "skills": [
#     {
#       "name": "article-drafter",
#       "lastWeekAvg": 0.91,
#       "thisWeekAvg": 0.74,
#       "drop": 0.17
#     }
#   ]
# }
```

For actionable monitoring, run drift detection on a schedule (e.g., daily cron) and alert when results are non-empty:

```bash
# Example: daily drift check with Slack notification
DRIFT=$(npx agent-skill-bus drift 2>/dev/null)
COUNT=$(echo "$DRIFT" | jq '.count')
if [ "$COUNT" -gt 0 ]; then
  curl -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"Skill drift detected: $COUNT skill(s) degrading. Run 'npx agent-skill-bus dashboard' for details.\"}"
fi
```

---

## 5. Configuration Options

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--data-dir <path>` | Current working directory | Base directory for all data files |
| `--skills-dir <path>` | `skills/self-improving-skills` | Directory for skill monitoring data (relative to data-dir) |
| `--days <N>` | `7` | Analysis window in days |
| `--no-color` | `false` | Disable ANSI colors (for CI/piping) |

### Directory Structure After `init`

```
your-project/
  skills/
    self-improving-skills/
      SKILL.md                  # Skill definition (instructions for the loop)
      skill-runs.jsonl          # Execution log (append-only)
      skill-health.json         # Latest health snapshot
      skill-improvements.md     # Improvement history log
    prompt-request-bus/
      prompt-request-queue.jsonl
      active-locks.jsonl
      dag-state.jsonl
      prompt-request-history.md
    knowledge-watcher/
      knowledge-state.json
      knowledge-diffs.jsonl
```

### Tunable Thresholds

These thresholds are currently defined in the source code. To customize them, extend the `SkillMonitor` class:

| Parameter | Default | Location | Effect |
|-----------|---------|----------|--------|
| Flagging score threshold | `0.7` | `analyze()` | Skills with avgScore below this are flagged |
| Trend sensitivity | `0.05` | `analyze()` | Delta must exceed this to register as improving/declining |
| Consecutive fail threshold | `3` | `analyze()` | This many consecutive fails marks a skill as "broken" |
| Drift threshold | `0.15` | `detectDrift()` | Week-over-week drop must exceed this to flag drift |
| Drift comparison window | 7 days vs. 7 days | `detectDrift()` | Current week compared to previous week |
| Auto-apply relevance threshold | `0.7` | EVALUATE step | Proposals below this relevance are not auto-applied |
| Auto-apply safety threshold | `0.8` | EVALUATE step | Proposals below this safety score need human approval |
| Max auto-edits per skill per day | `1` | APPLY step | Prevents rapid-fire automated changes |

### Customizing Thresholds (Programmatic)

```javascript
import { SkillMonitor } from 'agent-skill-bus';

class CustomMonitor extends SkillMonitor {
  analyze(days = 7) {
    const report = super.analyze(days);

    // Customize: lower the flagging threshold for development environments
    for (const [name, data] of Object.entries(report)) {
      data.flagged = data.avgScore < 0.6 || data.trend === 'declining' || data.trend === 'broken';
    }

    return report;
  }
}
```

### Environment Variables

| Variable | Effect |
|----------|--------|
| `NO_COLOR` | Disables ANSI colors in dashboard output (same as `--no-color`) |

---

## 6. Real-World Results

### Production Environment

Agent Skill Bus runs in production at [LLC Miyabi](https://miyabi-ai.jp) with the following scale:

| Metric | Value |
|--------|-------|
| AI agents coordinated daily | **42** |
| Average tasks per day | **27** |
| Cron jobs feeding the bus | **44** |
| Skills monitored | **110+** |
| Nodes in the cluster | **5** (1 Gateway + 4 Workers) |

### Before vs. After Self-Improving Skills

| Metric | Before (manual monitoring) | After (self-improving loop) | Change |
|--------|---------------------------|----------------------------|--------|
| Skill failure rate | 14.2% | 6.1% | **-57%** |
| Mean time to detect degradation | 3.2 days | 0.3 days (7 hours) | **-91%** |
| Mean time to fix | 8.4 hours (human) | 12 minutes (auto-fix) | **-97%** |
| Fastest security incident response | 45 minutes | **7 minutes** | -84% |
| Human intervention required | Every failure | Only high-risk fixes | ~70% reduction |

### Case Study 1: API Token Expiration

**Problem:** An OAuth2 refresh token for a third-party data source expired after 90 days. The skill continued to run but returned empty results instead of throwing an error (the API returned 200 with an empty `data` array).

**Detection:** The self-improvement loop detected a score drop from 0.93 to 0.12 over 48 hours. The skill was flagged as `declining` after the first day and `broken` after day 2 (consecutive failures).

**Resolution:** The DIAGNOSE step identified "empty response data" as the pattern. The PROPOSE step suggested adding a data-emptiness check to the skill and flagging the auth token for renewal. Low-risk fix: auto-applied the emptiness check. High-risk fix: routed the token renewal to the human operator via a Prompt Request.

**Timeline:** 0h: token expires. 7h: drift detected. 7h 12m: emptiness check auto-applied. 7h 30m: human notified. 8h: human renews token. Full resolution in 8 hours with zero customer impact.

### Case Study 2: Prompt Drift

**Problem:** A content-generation skill's quality slowly degraded over 3 weeks as team members added instructions to its prompt without testing. The prompt grew from 800 tokens to 2,400 tokens, with two contradictory instructions buried in the middle.

**Detection:** Drift detection flagged a 17% week-over-week score drop (0.88 to 0.71). The skill was never "broken" -- it always produced output -- but the output quality was measurably worse.

**Resolution:** The DIAGNOSE step identified prompt length and contradictory instructions as root causes. A human reviewer simplified the prompt back to 900 tokens and resolved the contradictions. Post-fix score: 0.94.

### Case Study 3: Model Update

**Problem:** A model provider updated their default model version. The skill's prompt relied on a specific JSON output format that the new model version occasionally wrapped in markdown code fences.

**Detection:** The self-improvement loop detected a pattern: `result: "partial"` with notes containing "JSON parse error" appearing in 30% of runs. Score dropped from 0.95 to 0.78.

**Resolution:** The PROPOSE step generated a fix: add a JSON extraction step that strips markdown code fences before parsing. Relevance: 0.9, Safety: 0.85. Auto-applied. Score recovered to 0.96 within 24 hours.

---

## 7. Integration with Claude Code / Codex

### Quick Setup (30 seconds)

Add this to your `AGENTS.md` or `.claude/CLAUDE.md`:

```markdown
## Skill Quality Tracking

After completing any task, log the result for quality monitoring:

\```bash
npx agent-skill-bus record-run \
  --agent claude \
  --skill <skill-name> \
  --task "<what you just did>" \
  --result <success|fail|partial> \
  --score <0.0-1.0>
\```

### Score Guide
- 1.0: Perfect execution, all requirements met
- 0.8-0.9: Good execution, minor issues
- 0.5-0.7: Partial success, significant issues
- 0.0-0.4: Failed, needs retry or different approach

### Check health periodically
\```bash
npx agent-skill-bus dashboard
npx agent-skill-bus flagged
npx agent-skill-bus drift
\```
```

### Full AGENTS.md Integration

For teams running multiple agents, here is a complete `AGENTS.md` snippet that integrates task orchestration, skill monitoring, and the self-improvement loop:

```markdown
## Agent Skill Bus Integration

### Task Lifecycle

1. **Before starting a task:** Check the queue
   \```bash
   npx agent-skill-bus dispatch --max 3
   \```

2. **When starting a task:** Mark it as running
   \```bash
   npx agent-skill-bus start <pr-id>
   \```

3. **After completing a task:** Record the result and complete the PR
   \```bash
   npx agent-skill-bus record-run \
     --agent $(whoami) \
     --skill <skill-name> \
     --task "<task description>" \
     --result success \
     --score 0.95

   npx agent-skill-bus complete <pr-id> --result "done"
   \```

4. **If a task fails:** Record the failure
   \```bash
   npx agent-skill-bus record-run \
     --agent $(whoami) \
     --skill <skill-name> \
     --task "<task description>" \
     --result fail \
     --score 0.0 \
     --notes "Error: <error message>"

   npx agent-skill-bus fail <pr-id> --reason "<error message>"
   \```

### Daily Health Check

Run this at the start of each session:
\```bash
npx agent-skill-bus dashboard --days 7
\```

If any skills are flagged, investigate before starting new work.

### Skill Naming Convention

Use consistent skill names for accurate tracking:
- `code-review` -- not "review code" or "code_review"
- `api-caller` -- not "call API" or "api_call"
- `deploy-pipeline` -- not "deployment" or "deploy"
```

### Codex Integration

For Codex (OpenAI), the same approach works. Add to your `.codex/AGENTS.md` or project instructions:

```markdown
## Quality Tracking

After every task execution, append a quality record:

\```bash
npx agent-skill-bus record-run \
  --agent codex \
  --skill <skill-name> \
  --task "<task>" \
  --result <success|fail|partial> \
  --score <0.0-1.0> \
  --notes "<any error details>"
\```
```

### Programmatic Integration (for Custom Frameworks)

```javascript
import { SkillMonitor, PromptRequestQueue } from 'agent-skill-bus';

const monitor = new SkillMonitor('./skills/self-improving-skills');
const queue = new PromptRequestQueue('./skills/prompt-request-bus');

// After your agent executes a skill:
async function onSkillComplete(agent, skill, task, result, score, notes) {
  // Record the run
  monitor.recordRun({ agent, skill, task, result, score, notes });

  // Check if any skills are now flagged
  const flagged = monitor.getFlagged(7);
  for (const s of flagged) {
    // Auto-queue repair tasks for flagged skills
    queue.enqueue({
      source: 'skill-monitor',
      priority: s.consecutiveFails >= 3 ? 'critical' : 'high',
      agent: 'skill-repair-bot',
      task: `Repair skill: ${s.name} (avgScore=${s.avgScore}, trend=${s.trend})`,
      affectedSkills: [s.name],
    });
  }

  // Periodic drift check
  const drifting = monitor.detectDrift();
  for (const d of drifting) {
    queue.enqueue({
      source: 'drift-detector',
      priority: 'medium',
      agent: 'skill-repair-bot',
      task: `Investigate drift: ${d.name} dropped ${(d.drop * 100).toFixed(1)}% (${d.lastWeekAvg} → ${d.thisWeekAvg})`,
      affectedSkills: [d.name],
    });
  }
}
```

### Integration with Knowledge Watcher (Closed Loop)

When the Knowledge Watcher detects an external change (e.g., a dependency update), it can trigger the self-improvement loop proactively:

```javascript
import { KnowledgeWatcher, SkillMonitor, PromptRequestQueue } from 'agent-skill-bus';

const watcher = new KnowledgeWatcher('./skills/knowledge-watcher');
const monitor = new SkillMonitor('./skills/self-improving-skills');
const queue = new PromptRequestQueue('./skills/prompt-request-bus');

// Check for external changes
const result = await watcher.check('anthropic-sdk', async (prev) => {
  const latest = await fetchLatestVersion('@anthropic-ai/sdk');
  if (latest === prev.version) return null;
  return {
    version: latest,
    affectedSkills: ['api-caller', 'chat-completer'],
    severity: 'high',
  };
});

if (result && result.diffs.length > 0) {
  // External change detected -- proactively queue repair tasks
  for (const diff of result.diffs) {
    for (const skill of diff.affectedSkills) {
      queue.enqueue({
        source: 'knowledge-watcher',
        priority: diff.severity === 'critical' ? 'critical' : 'high',
        agent: 'skill-repair-bot',
        task: `Proactive repair: ${skill} (${diff.type}: ${diff.detail})`,
        affectedSkills: [skill],
      });
    }
  }
}
```

This creates a **closed-loop system**: external changes trigger proactive repairs before the skill even starts failing in production.

---

## 8. FAQ

### General

**Q: Does this require an LLM to work?**

No. Steps 1 (OBSERVE), 2 (ANALYZE), and 7 (RECORD) are pure computation -- no LLM needed. Steps 3-6 (DIAGNOSE, PROPOSE, EVALUATE, APPLY) use an LLM for root cause analysis and fix generation, but they're optional. You can run the monitoring-only mode (steps 1-2 + 7) and handle diagnosis and fixes manually.

**Q: What LLM does it use for DIAGNOSE/PROPOSE?**

Any LLM you want. The framework is LLM-agnostic. In production at LLC Miyabi, we use Claude (Anthropic) for diagnosis and Gemini (Google) as fallback. The LLM call is not built into the `agent-skill-bus` npm package -- you wire it up in your own orchestration code.

**Q: Does this work with LangGraph / CrewAI / AutoGen / custom frameworks?**

Yes. Agent Skill Bus uses plain JSONL files as its data layer. Any framework that can append a line to a file can integrate. See the [comparison doc](comparison.md) for a detailed feature matrix.

**Q: How much disk space does skill-runs.jsonl use?**

Each run entry is approximately 200-300 bytes. At 100 runs/day, that's ~30KB/day or ~10MB/year. The file can be safely rotated or truncated after archiving old entries.

### Scoring

**Q: Who determines the score? The agent itself?**

Yes, the executing agent self-reports its score. This is a deliberate design choice: the agent has the most context about whether its output was good. For high-stakes skills, you can add external validators that record independent score entries.

**Q: What if an agent always reports score 1.0?**

Then the self-improvement loop won't help that agent. This is a garbage-in-garbage-out situation. In practice, agents that use structured output validation (JSON schema checks, assertion tests, etc.) produce meaningful scores. Agents that just return "success" for everything are effectively opting out of quality monitoring.

**Q: Can I use custom scoring functions?**

Yes. The `score` field accepts any float in `[0, 1]`. You can compute it however you want -- percentage of test assertions passed, cosine similarity to expected output, human-rated quality on a Likert scale normalized to 0-1, etc.

### Operations

**Q: How often should I run the improvement cycle?**

- **OBSERVE + ANALYZE:** Every time you check the dashboard (manually or via cron). Lightweight -- just reads a JSONL file.
- **DIAGNOSE + PROPOSE + EVALUATE + APPLY:** Only when skills are flagged. Don't run the full LLM-powered loop on healthy skills.
- **Drift detection:** Once per day is sufficient. Drift is a slow process; checking more frequently adds cost without benefit.

**Q: Can the auto-apply step break things?**

In theory, yes. In practice, the safety constraints make this extremely unlikely:

1. Auto-apply only fires for low-risk changes (relevance > 0.7, safety > 0.8)
2. Max 1 auto-edit per skill per day
3. Security-sensitive skills always require human approval
4. All changes are logged and git-tracked for easy rollback

In 6 months of production use across 42 agents and 110+ skills, zero auto-applied fixes have caused regressions.

**Q: What happens if the improvement loop itself fails?**

The loop is designed to fail gracefully. Each step reads from files and writes to files. If any step crashes:
- The JSONL data remains intact (append-only)
- The health snapshot might be stale (just re-run `updateHealth()`)
- The improvements log might be missing an entry (not critical)
- No skill behavior is affected (the loop is observational, not on the critical path)

**Q: How do I roll back an auto-applied fix?**

```bash
# Check the improvement log
cat skills/self-improving-skills/skill-improvements.md

# Roll back the SKILL.md to a previous version
git log -- path/to/SKILL.md
git checkout <previous-commit> -- path/to/SKILL.md
```

### Integration

**Q: Can I use this with a database instead of JSONL files?**

The core library uses JSONL files. If you need database storage, you can:

1. Write a thin adapter that reads/writes your database instead of JSONL
2. Extend the `SkillMonitor` class with your own storage backend
3. Use the JSONL files as a write-ahead log and sync to your database periodically

We deliberately chose JSONL over databases to maintain the zero-dependency guarantee and make the system debuggable with basic Unix tools.

**Q: Is there a web UI?**

Not yet. The `dashboard` CLI command provides a terminal-based dashboard. A web UI is on the roadmap. In the meantime, you can build one by reading the `skill-health.json` file (it's just JSON).

**Q: How does this differ from traditional APM (Application Performance Monitoring)?**

APM tools (Datadog, New Relic, etc.) monitor infrastructure and application health: CPU, memory, latency, error rates. They answer "is it up?"

Self-Improving Skills monitors **output quality**: is the skill producing good results? A skill can have 100% uptime, zero errors, sub-100ms latency, and still be producing garbage output because of prompt drift or a model update. APM won't catch that. Quality-aware agent skill degradation detection will.

---

## Further Reading

- [README](../README.md) -- Project overview and quick start
- [SKILL.md](../skills/self-improving-skills/SKILL.md) -- The raw skill definition used by the loop
- [Comparison with other frameworks](comparison.md) -- Feature matrix vs. LangGraph, CrewAI, etc.
- [Full pipeline example](../examples/full-pipeline.js) -- All three modules working together
- [Skill monitoring example](../examples/skill-monitoring.js) -- Step-by-step demonstration

---

*Built by [LLC Miyabi](https://miyabi-ai.jp) -- Running 42 AI agents in production daily.*

*Self-improving agent skills, skill health monitoring, agent skill degradation detection, and AI agent quality assurance are core to our operational philosophy: agent systems should get better over time, not worse.*
