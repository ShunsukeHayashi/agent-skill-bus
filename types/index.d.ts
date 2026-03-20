/**
 * agent-skill-bus v1.2.0
 *
 * Self-improving task orchestration framework for AI agent systems.
 * Zero dependencies. Framework-agnostic.
 *
 * @module agent-skill-bus
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive types
// ─────────────────────────────────────────────────────────────────────────────

/** Task priority levels, ordered highest → lowest. */
export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** Lifecycle status of a Prompt Request. */
export type PRStatus = 'queued' | 'running' | 'done' | 'failed' | 'blocked';

/**
 * Deadline shorthand values accepted by the queue.
 * - `'none'`      – no deadline (default)
 * - `'immediate'` – dispatch immediately, skip normal ordering
 * - `'24h'`       – expire after 24 hours
 * - `'week-end'`  – expire after 7 days
 * Any other string is stored verbatim but not evaluated.
 */
export type Deadline = 'none' | 'immediate' | '24h' | 'week-end' | (string & {});

/** Severity levels used by the KnowledgeWatcher for recorded diffs. */
export type DiffSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Trend direction reported by SkillMonitor health analysis. */
export type SkillTrend = 'improving' | 'stable' | 'declining' | 'broken';

// ─────────────────────────────────────────────────────────────────────────────
// PromptRequestQueue — JSONL-based task queue with DAG scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input object passed to {@link PromptRequestQueue.enqueue}.
 * Only `source`, `agent`, and `task` are strictly required; all other
 * fields have default values applied by the implementation.
 */
export interface EnqueueInput {
  /** Where this request originated, e.g. `'human'`, `'heartbeat'`, `'agent'`. */
  source: string;
  /** Agent identifier that should execute this task. */
  agent: string;
  /** Human-readable description of the work to perform. */
  task: string;
  /** Task priority. Defaults to `'medium'`. */
  priority?: Priority;
  /** Free-form context string passed to the executing agent. Defaults to `''`. */
  context?: string;
  /** Skill names that this task will read or mutate. Defaults to `[]`. */
  affectedSkills?: string[];
  /** File paths that this task will read or write. Used for lock arbitration. Defaults to `[]`. */
  affectedFiles?: string[];
  /** Deadline shorthand. Defaults to `'none'`. */
  deadline?: Deadline;
  /** IDs of {@link PromptRequest} objects that must reach `'done'` status before this one is dispatchable. Defaults to `[]`. */
  dependsOn?: string[];
  /** Optional DAG identifier. When set, DAG state is updated on enqueue and completion. Defaults to `null`. */
  dagId?: string | null;
}

/** A Prompt Request (PR) as stored in the JSONL queue. */
export interface PromptRequest {
  /** Unique identifier, format `pr-<timestamp>-<uuid8>`. */
  id: string;
  /** ISO-8601 creation timestamp. */
  ts: string;
  source: string;
  priority: Priority;
  agent: string;
  task: string;
  context: string;
  affectedSkills: string[];
  affectedFiles: string[];
  deadline: Deadline;
  status: PRStatus;
  /** Completion result string, or `null` while pending. */
  result: string | null;
  dependsOn: string[];
  dagId: string | null;
}

/** An active file lock held by a running PR. */
export interface FileLock {
  /** Agent that holds the lock. */
  agent: string;
  /** List of locked file paths. */
  files: string[];
  /** ID of the PR that acquired the lock. */
  prId: string;
  /** ISO-8601 timestamp when the lock was acquired. */
  lockedAt: string;
  /** Lock TTL in seconds (default 7200). Lock is expired when `now - lockedAt > ttl * 1000`. */
  ttl: number;
}

/** Aggregated statistics returned by {@link PromptRequestQueue.stats}. */
export interface QueueStats {
  /** Total number of PRs in the queue (all statuses). */
  total: number;
  /** Count of PRs keyed by their current status string. */
  byStatus: Record<string, number>;
  /** Number of currently active file locks. */
  activeLocks: number;
}

/** Snapshot of a DAG's progress stored in `dag-state.jsonl`. */
export interface DagState {
  dagId: string;
  /** ISO-8601 timestamp of the last update. */
  updated: string;
  total: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  blocked: number;
}

/**
 * Input descriptor for a single task inside a DAG.
 * Identical to {@link EnqueueInput} but `dagId` is injected automatically by
 * {@link PromptRequestQueue.createDag} — you do not need to set it here.
 */
export type DagTaskInput = Omit<EnqueueInput, 'dagId'>;

/** Result returned by {@link PromptRequestQueue.releaseExpiredLocks}. */
export interface ReleaseLocksResult {
  /** Number of expired locks that were removed and their PRs marked failed. */
  released: number;
  /** Number of locks that remain active. */
  active: number;
}

/**
 * JSONL-based task queue with DAG dependency resolution and file-level locking.
 *
 * @example
 * ```ts
 * import { PromptRequestQueue } from 'agent-skill-bus';
 *
 * const q = new PromptRequestQueue('./skills/prompt-request-bus');
 *
 * const pr = q.enqueue({
 *   source: 'heartbeat',
 *   agent: 'dev-coder',
 *   task: 'Implement login page',
 *   priority: 'high',
 *   affectedFiles: ['src/pages/login.tsx'],
 * });
 *
 * const [next] = q.getDispatchable(1);
 * q.startExecution(next.id);
 * q.complete(next.id, 'PR #42 merged');
 * ```
 */
export class PromptRequestQueue {
  /** Path to the directory that holds all JSONL/Markdown data files. */
  readonly dataDir: string;
  /** Absolute path to `prompt-request-queue.jsonl`. */
  readonly queueFile: string;
  /** Absolute path to `active-locks.jsonl`. */
  readonly locksFile: string;
  /** Absolute path to `dag-state.jsonl`. */
  readonly dagFile: string;
  /** Absolute path to `prompt-request-history.md`. */
  readonly historyFile: string;

  /**
   * @param dataDir Directory where queue data files will be read and written.
   *                The directory must already exist. Use `skill-bus init` to
   *                create it with the required empty files.
   */
  constructor(dataDir: string);

  /** Read and return every PR currently in the queue (all statuses). */
  readAll(): PromptRequest[];

  /**
   * Add a new Prompt Request to the queue.
   *
   * Deduplication is applied: if a PR with the same `source`, `agent`, and
   * `task` already exists with `status === 'queued'` it will **not** be
   * duplicated and `null` is returned instead.
   *
   * @returns The newly created {@link PromptRequest}, or `null` if a duplicate was detected.
   */
  enqueue(input: EnqueueInput): PromptRequest | null;

  /**
   * Return up to `maxCount` PRs that are ready to be dispatched.
   *
   * A PR is dispatchable when:
   * - Its `status` is `'queued'`
   * - All `dependsOn` IDs have `status === 'done'`
   * - None of its `affectedFiles` are currently locked
   *
   * Results are sorted by priority (critical → low) then by creation time.
   *
   * @param maxCount Maximum number of PRs to return. Defaults to 5.
   */
  getDispatchable(maxCount?: number): PromptRequest[];

  /**
   * Acquire file locks for the given PR and transition its status to `'running'`.
   *
   * Lock conflicts are re-verified at execution time (not just at dispatch time)
   * to guard against races. Throws if the PR is not found or a conflict exists.
   *
   * @throws {Error} When the PR ID is not found in the queue.
   * @throws {Error} When one or more of the PR's `affectedFiles` are already locked.
   * @returns The updated {@link PromptRequest} (status = `'running'`).
   */
  startExecution(prId: string): PromptRequest;

  /**
   * Mark a PR as `'done'`, release its file locks, update the DAG state,
   * and append a line to the history Markdown file.
   *
   * @param prId    ID of the PR to complete.
   * @param result  Human-readable completion message. Defaults to `'done'`.
   */
  complete(prId: string, result?: string): void;

  /**
   * Mark a PR as `'failed'`, release its file locks, and update the DAG state.
   * Any dependent PRs will subsequently be marked `'blocked'` by the next
   * call to {@link getDispatchable}.
   *
   * @param prId   ID of the PR to fail.
   * @param reason Human-readable failure reason. Defaults to `'unknown error'`.
   */
  fail(prId: string, reason?: string): void;

  /** Return all currently active file locks. */
  readLocks(): FileLock[];

  /**
   * Scan active locks for entries whose age exceeds their TTL.
   * Expired locks are removed and their associated PRs are marked `'failed'`.
   *
   * @returns Counts of released vs. still-active locks.
   */
  releaseExpiredLocks(): ReleaseLocksResult;

  /**
   * Return the current DAG state snapshot for the given DAG ID,
   * or `undefined` if no such DAG exists.
   */
  getDagState(dagId: string): DagState | undefined;

  /**
   * Enqueue all tasks in `tasks` under a shared `dagId` and initialise the
   * DAG state record. Duplicate tasks are silently skipped.
   *
   * @param dagId A unique identifier for this DAG execution.
   * @param tasks Array of task descriptors (same shape as {@link EnqueueInput} without `dagId`).
   * @returns Array of successfully created {@link PromptRequest} objects.
   */
  createDag(dagId: string, tasks: DagTaskInput[]): PromptRequest[];

  /** Return aggregated queue statistics. */
  stats(): QueueStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillMonitor — 7-step self-improvement loop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for recording a single skill execution result.
 * All fields are required except `notes`.
 */
export interface SkillRunInput {
  /** Agent that executed the skill. */
  agent: string;
  /** Name of the skill that was invoked. */
  skill: string;
  /** Task description or prompt that triggered the run. */
  task: string;
  /** Outcome of the run. Use `'success'` or `'fail'` for the built-in analytics. */
  result: 'success' | 'fail' | (string & {});
  /**
   * Quality score in the range `[0, 1]`.
   * Values outside this range are clamped automatically.
   */
  score: number;
  /** Optional free-form notes. Defaults to `''`. */
  notes?: string;
}

/** A stored skill execution record as it appears in `skill-runs.jsonl`. */
export interface SkillRun {
  /** ISO-8601 timestamp of the run. */
  ts: string;
  agent: string;
  skill: string;
  task: string;
  result: string;
  /** Quality score, clamped to `[0, 1]`. */
  score: number;
  notes: string;
}

/** Per-skill health metrics produced by {@link SkillMonitor.analyze}. */
export interface SkillHealth {
  /** Total number of runs ever recorded for this skill. */
  runs: number;
  /** Average quality score across all runs (0–1). */
  avgScore: number;
  /**
   * Average quality score over the analysis window.
   * `null` if no runs exist within the window.
   */
  recentAvg: number | null;
  /** Trend direction derived from the delta between `recentAvg` and `avgScore`. */
  trend: SkillTrend;
  /** ISO-8601 timestamp of the most recent failure, or `null` if none. */
  lastFail: string | null;
  /** Number of consecutive failures at the tail of the run history. */
  consecutiveFails: number;
  /**
   * `true` when the skill needs attention:
   * - `avgScore < 0.7`, or
   * - `trend === 'declining'`, or
   * - `trend === 'broken'`
   */
  flagged: boolean;
}

/** Entry returned by {@link SkillMonitor.getFlagged} — health data with the skill name inlined. */
export interface FlaggedSkill extends SkillHealth {
  name: string;
}

/** Drift report entry returned by {@link SkillMonitor.detectDrift}. */
export interface DriftEntry {
  /** Skill name. */
  name: string;
  /** Average score for the previous week window. */
  lastWeekAvg: number;
  /** Average score for the current week window. */
  thisWeekAvg: number;
  /** Absolute score drop (`lastWeekAvg - thisWeekAvg`). Always positive. */
  drop: number;
}

/** Full health state written to `skill-health.json` by {@link SkillMonitor.updateHealth}. */
export interface HealthState {
  /** ISO-8601 timestamp of the last update. */
  lastUpdated: string;
  /** Map of skill name → health metrics. */
  skills: Record<string, SkillHealth>;
}

/** Input for recording an improvement event. */
export interface ImprovementInput {
  /** Skill that was improved. */
  skill: string;
  /** Root-cause diagnosis. */
  diagnosis: string;
  /** Proposed fix or change. */
  proposal: string;
  /** Actual action taken. */
  action: string;
  /** Outcome after the improvement was applied. */
  result: string;
}

/**
 * Skill quality monitor implementing the 7-step self-improvement loop:
 * OBSERVE → ANALYZE → DIAGNOSE → PROPOSE → EVALUATE → APPLY → RECORD.
 *
 * @example
 * ```ts
 * import { SkillMonitor } from 'agent-skill-bus';
 *
 * const monitor = new SkillMonitor('./skills/self-improving-skills');
 *
 * monitor.recordRun({
 *   agent: 'dev-coder',
 *   skill: 'api-caller',
 *   task: 'Fetch user list',
 *   result: 'success',
 *   score: 0.95,
 * });
 *
 * const flagged = monitor.getFlagged(7);
 * const drifting = monitor.detectDrift();
 * ```
 */
export class SkillMonitor {
  /** Path to the directory that holds skill monitoring data files. */
  readonly dataDir: string;
  /** Absolute path to `skill-runs.jsonl`. */
  readonly runsFile: string;
  /** Absolute path to `skill-health.json`. */
  readonly healthFile: string;
  /** Absolute path to `skill-improvements.md`. */
  readonly improvementsFile: string;

  /**
   * @param dataDir Directory where skill monitoring data files will be read and written.
   */
  constructor(dataDir: string);

  /**
   * Step 1 — OBSERVE: Return all skill runs within the last `days` days.
   *
   * @param days Look-back window in days. Defaults to 7.
   */
  observe(days?: number): SkillRun[];

  /**
   * Steps 2–3 — ANALYZE & DIAGNOSE: Calculate per-skill health metrics.
   *
   * @param days Look-back window for the "recent" window calculation. Defaults to 7.
   * @returns Map of skill name → {@link SkillHealth}.
   */
  analyze(days?: number): Record<string, SkillHealth>;

  /**
   * Return only the skills that are currently flagged as unhealthy.
   *
   * @param days Look-back window forwarded to {@link analyze}. Defaults to 7.
   */
  getFlagged(days?: number): FlaggedSkill[];

  /**
   * Append a skill execution result to `skill-runs.jsonl`.
   * The `score` is clamped to `[0, 1]` before storage.
   *
   * @returns The stored {@link SkillRun} entry.
   */
  recordRun(input: SkillRunInput): SkillRun;

  /**
   * Recompute health metrics and persist them to `skill-health.json`.
   *
   * @param days Look-back window. Defaults to 7.
   * @returns The newly written {@link HealthState}.
   */
  updateHealth(days?: number): HealthState;

  /**
   * Read the last persisted health state from `skill-health.json`.
   * Returns `{ lastUpdated: '', skills: {} }` when the file does not exist.
   */
  readHealth(): HealthState;

  /**
   * Step 7 — RECORD: Append an improvement event to `skill-improvements.md`.
   */
  recordImprovement(input: ImprovementInput): void;

  /**
   * Detect silent score drift: skills whose average score dropped more than
   * 0.15 points week-over-week.
   *
   * @returns Array of drifting skill entries, empty when none are detected.
   */
  detectDrift(): DriftEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// KnowledgeWatcher — External change detector
// ─────────────────────────────────────────────────────────────────────────────

/** Per-source state entry stored inside `knowledge-state.json`. */
export interface SourceState {
  /** ISO-8601 timestamp of the last check. */
  checkedAt: string;
  /** Current version string (used for automatic version-change diff detection). */
  version?: string;
  /**
   * Skill names affected by changes to this source.
   * Used when the checker returns automatic version-change diffs.
   */
  affectedSkills?: string[];
  /** Severity to use for auto-detected diffs. Defaults to `'medium'`. */
  severity?: DiffSeverity;
  /**
   * Custom diffs provided by the checker function; each entry is merged into
   * a {@link RecordDiffInput} and recorded automatically.
   */
  customDiffs?: Array<Omit<RecordDiffInput, 'source'>>;
  /** Any other fields the checker wants to persist for its own use. */
  [key: string]: unknown;
}

/** Top-level structure of `knowledge-state.json`. */
export interface KnowledgeState {
  /** ISO-8601 timestamp of the most recent check across any source. */
  lastCheck: string;
  /** Map of source ID → last observed state. */
  sources: Record<string, SourceState>;
}

/** Input for recording a detected diff manually. */
export interface RecordDiffInput {
  /** Source identifier. */
  source: string;
  /** Type of change, e.g. `'version_change'`, `'content_update'`, `'api_deprecation'`. */
  type: string;
  /** Human-readable description of what changed. */
  detail: string;
  /** Skill names whose docs or behaviour may need updating. Defaults to `[]`. */
  affectedSkills?: string[];
  /** How urgently this diff needs attention. Defaults to `'medium'`. */
  severity?: DiffSeverity;
}

/** A recorded diff entry as stored in `knowledge-diffs.jsonl`. */
export interface KnowledgeDiff {
  /** ISO-8601 timestamp when the diff was detected. */
  ts: string;
  source: string;
  type: string;
  detail: string;
  affectedSkills: string[];
  severity: DiffSeverity;
  /** `false` on creation; set to `true` by {@link KnowledgeWatcher.markProcessed}. */
  processed: boolean;
}

/** Statistics returned by {@link KnowledgeWatcher.stats}. */
export interface WatcherStats {
  /** Number of distinct sources currently tracked in state. */
  sources: number;
  /** Total number of diff entries ever recorded. */
  totalDiffs: number;
  /** Number of diffs where `processed === false`. */
  unprocessed: number;
  /** Diff counts broken out by severity level. */
  bySeverity: Record<DiffSeverity, number>;
}

/**
 * Return value of {@link KnowledgeWatcher.updateSource} — the old and new
 * state for the given source.
 */
export interface UpdateSourceResult {
  /** Previous state (or `undefined` if this is the first check). */
  old: SourceState | undefined;
  /** Newly written state (includes the injected `checkedAt` timestamp). */
  new: SourceState;
}

/**
 * Return value of {@link KnowledgeWatcher.check} when a check succeeds and
 * produces a non-null result. Returns `null` when `checkerFn` returns `null`
 * (no change detected).
 */
export interface CheckResult {
  /** Source ID that was checked. */
  sourceId: string;
  /** Diffs that were automatically recorded during this check. */
  diffs: KnowledgeDiff[];
  /** State before this check. */
  previousState: Partial<SourceState>;
  /** State written during this check. */
  currentState: SourceState;
}

/**
 * User-supplied checker function passed to {@link KnowledgeWatcher.check}.
 *
 * - Receives the previously stored state for the source (empty object on first run).
 * - Should return the new/current state object to persist, or `null` to signal
 *   that nothing has changed and no state update is needed.
 * - May be `async`.
 */
export type CheckerFn = (previousState: Partial<SourceState>) => SourceState | null | Promise<SourceState | null>;

/**
 * Monitors external knowledge sources, detects diffs, and tracks processing status.
 *
 * @example
 * ```ts
 * import { KnowledgeWatcher } from 'agent-skill-bus';
 *
 * const watcher = new KnowledgeWatcher('./skills/knowledge-watcher');
 *
 * await watcher.check('anthropic-sdk', async (prev) => {
 *   const latest = await fetchLatestVersion('@anthropic-ai/sdk');
 *   if (latest === prev.version) return null; // no change
 *   return { version: latest, affectedSkills: ['api-caller'], severity: 'high' };
 * });
 *
 * const pending = watcher.getUnprocessed();
 * watcher.markProcessed(pending.map((_, i) => i));
 * ```
 */
export class KnowledgeWatcher {
  /** Path to the directory that holds knowledge watcher data files. */
  readonly dataDir: string;
  /** Absolute path to `knowledge-state.json`. */
  readonly stateFile: string;
  /** Absolute path to `knowledge-diffs.jsonl`. */
  readonly diffsFile: string;

  /**
   * @param dataDir Directory where watcher data files will be read and written.
   */
  constructor(dataDir: string);

  /**
   * Read and return the full knowledge state from disk.
   * Returns `{ lastCheck: '', sources: {} }` when the file does not exist.
   */
  readState(): KnowledgeState;

  /**
   * Persist a new state snapshot for the given source.
   * The `checkedAt` timestamp is injected automatically.
   *
   * @returns The old and new state for the source.
   */
  updateSource(sourceId: string, newState: Omit<SourceState, 'checkedAt'>): UpdateSourceResult;

  /**
   * Append a detected diff to `knowledge-diffs.jsonl`.
   *
   * @returns The stored {@link KnowledgeDiff} entry.
   */
  recordDiff(input: RecordDiffInput): KnowledgeDiff;

  /**
   * Return all diffs where `processed === false`.
   */
  getUnprocessed(): KnowledgeDiff[];

  /**
   * Return all diffs matching the given severity level.
   */
  getBySeverity(severity: DiffSeverity): KnowledgeDiff[];

  /**
   * Set `processed = true` on diffs at the given 0-based indices in the
   * `knowledge-diffs.jsonl` file and rewrite the file atomically.
   *
   * @param diffIndices Array of 0-based indices into the full diffs array.
   */
  markProcessed(diffIndices: number[]): void;

  /**
   * Run a user-provided checker function against a source.
   *
   * The checker receives the previous state and should return the new state,
   * or `null` if nothing changed. Version changes and `customDiffs` in the
   * returned state are recorded automatically.
   *
   * @param sourceId  Unique identifier for the knowledge source.
   * @param checkerFn Function (sync or async) that detects changes.
   * @returns A {@link CheckResult} with detected diffs, or `null` when the checker
   *          returned `null` (no change).
   */
  check(sourceId: string, checkerFn: CheckerFn): Promise<CheckResult | null>;

  /** Return aggregated statistics for all diffs and tracked sources. */
  stats(): WatcherStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONL helpers — re-exported from src/queue.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a JSONL file and parse each non-empty line as JSON.
 * Returns an empty array when the file does not exist.
 *
 * @param filePath Absolute or relative path to the `.jsonl` file.
 */
export function readJsonl<T = unknown>(filePath: string): T[];

/**
 * Overwrite a JSONL file with the serialised contents of `entries`.
 * Each entry is written as a single JSON line followed by `\n`.
 *
 * @param filePath Absolute or relative path to the `.jsonl` file.
 * @param entries  Array of values to serialise.
 */
export function writeJsonl<T = unknown>(filePath: string, entries: T[]): void;

/**
 * Append a single entry to a JSONL file as a new JSON line.
 * The file is created if it does not yet exist.
 *
 * @param filePath Absolute or relative path to the `.jsonl` file.
 * @param entry    Value to serialise and append.
 */
export function appendJsonl<T = unknown>(filePath: string, entry: T): void;
