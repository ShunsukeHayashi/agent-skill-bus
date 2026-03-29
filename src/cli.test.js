import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const CLI = join(process.cwd(), 'src/cli.js');

function initSkillLayout(baseDir) {
  const queueDir = join(baseDir, 'skills/prompt-request-bus');
  const skillsDir = join(baseDir, 'skills/self-improving-skills');
  mkdirSync(queueDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(join(queueDir, 'prompt-request-queue.jsonl'), '');
  writeFileSync(join(queueDir, 'active-locks.jsonl'), '');
  writeFileSync(join(queueDir, 'dag-state.jsonl'), '');
  writeFileSync(join(queueDir, 'prompt-request-history.md'), '# History\n');
  writeFileSync(join(skillsDir, 'skill-runs.jsonl'), '');
  writeFileSync(join(skillsDir, 'skill-health.json'), '{"lastUpdated":"","skills":{}}');
  writeFileSync(join(skillsDir, 'skill-improvements.md'), '# Skill Improvements\n');
}

describe('agent-skill-bus cli', () => {
  it('does not mutate queue on enqueue --help', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'asb-cli-help-'));
    initSkillLayout(tempDir);

    const result = spawnSync(process.execPath, [CLI, 'enqueue', '--help', '--data-dir', tempDir], { encoding: 'utf-8' });
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /Usage: skill-bus enqueue/);
    assert.strictEqual(readFileSync(join(tempDir, 'skills/prompt-request-bus/prompt-request-queue.jsonl'), 'utf-8'), '');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers legacy .skill-bus directories when present', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'asb-cli-legacy-'));
    const queueDir = join(tempDir, '.skill-bus/queue');
    const monitorDir = join(tempDir, '.skill-bus/monitor');
    const watcherDir = join(tempDir, '.skill-bus/watcher');
    mkdirSync(queueDir, { recursive: true });
    mkdirSync(monitorDir, { recursive: true });
    mkdirSync(watcherDir, { recursive: true });
    writeFileSync(join(queueDir, 'prompt-request-queue.jsonl'), '');
    writeFileSync(join(queueDir, 'active-locks.jsonl'), '');
    writeFileSync(join(queueDir, 'dag-state.jsonl'), '');
    writeFileSync(join(queueDir, 'prompt-request-history.md'), '# History\n');
    writeFileSync(join(monitorDir, 'skill-runs.jsonl'), '');
    writeFileSync(join(monitorDir, 'skill-health.json'), '{"lastUpdated":"","skills":{}}');
    writeFileSync(join(monitorDir, 'skill-improvements.md'), '# Skill Improvements\n');

    const result = spawnSync(process.execPath, [CLI, 'enqueue', '--data-dir', tempDir, '--source', 'test', '--agent', 'dev', '--task', 'legacy path works'], { encoding: 'utf-8' });
    assert.strictEqual(result.status, 0);
    assert.match(readFileSync(join(queueDir, 'prompt-request-queue.jsonl'), 'utf-8'), /legacy path works/);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
