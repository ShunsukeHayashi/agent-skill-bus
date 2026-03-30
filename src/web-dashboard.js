/**
 * Agent Skill Bus — Web Dashboard Generator
 *
 * Generates a standalone HTML dashboard from skill-runs.jsonl,
 * queue.jsonl (prompt-request-queue.jsonl), and knowledge-diffs.jsonl.
 * Zero dependencies. Single-file output with inlined data.
 *
 * Usage (via CLI):
 *   skill-bus dashboard --web [--output ./dashboard.html] [--days 7]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Read JSONL file safely, returning array of parsed objects.
 * @param {string} filePath
 * @returns {object[]}
 */
function readJsonlSafe(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Calculate health metrics per skill from skill-runs.jsonl.
 * @param {object[]} runs
 * @param {number} days
 * @returns {object}
 */
function calcSkillHealth(runs, days = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  const bySkill = {};

  for (const r of runs) {
    const name = r.skill || 'unknown';
    if (!bySkill[name]) {
      bySkill[name] = { runs: 0, totalScore: 0, recentRuns: 0, recentScore: 0, consecutiveFails: 0, lastRun: null, history: [] };
    }
    const s = bySkill[name];
    s.runs++;
    s.totalScore += r.score ?? 0;
    s.lastRun = r.ts;
    s.history.push({ ts: r.ts, score: r.score ?? 0, result: r.result });

    const ts = new Date(r.ts).getTime();
    if (ts > cutoff) {
      s.recentRuns++;
      s.recentScore += r.score ?? 0;
    }
  }

  // Consecutive fails (from newest)
  for (const [, s] of Object.entries(bySkill)) {
    const sorted = [...s.history].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    let cf = 0;
    for (const r of sorted) {
      if (r.result === 'fail') cf++;
      else break;
    }
    s.consecutiveFails = cf;
  }

  const result = {};
  for (const [name, s] of Object.entries(bySkill)) {
    const avg = s.runs > 0 ? +(s.totalScore / s.runs).toFixed(3) : 0;
    const recentAvg = s.recentRuns > 0 ? +(s.recentScore / s.recentRuns).toFixed(3) : avg;
    const flagged = recentAvg < 0.8 || s.consecutiveFails >= 3;
    const trend = recentAvg > avg + 0.05 ? 'improving' : recentAvg < avg - 0.05 ? 'declining' : s.consecutiveFails >= 3 ? 'broken' : 'stable';
    result[name] = { avgScore: avg, recentAvg, runs: s.runs, recentRuns: s.recentRuns, flagged, trend, consecutiveFails: s.consecutiveFails, lastRun: s.lastRun, history: s.history.slice(-30) };
  }
  return result;
}

/**
 * Build queue summary from prompt-request-queue.jsonl.
 * @param {object[]} queue
 * @returns {object}
 */
function calcQueueStats(queue) {
  const byStatus = {};
  const byAgent = {};
  for (const item of queue) {
    const s = item.status || 'queued';
    byStatus[s] = (byStatus[s] || 0) + 1;
    const a = item.agent || 'unknown';
    byAgent[a] = (byAgent[a] || 0) + 1;
  }
  return { total: queue.length, byStatus, byAgent, items: queue.slice(-50).reverse() };
}

/**
 * Build knowledge diffs summary.
 * @param {object[]} diffs
 * @param {number} days
 * @returns {object[]}
 */
function calcDiffsSummary(diffs, days = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  return diffs
    .filter(d => new Date(d.ts || d.timestamp || 0).getTime() > cutoff)
    .slice(-20)
    .reverse();
}

/**
 * Generate the inline HTML dashboard.
 * @param {object} data - { health, queue, diffs, meta }
 * @returns {string} Full HTML string
 */
function buildHtml(data) {
  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Skill Bus — Dashboard</title>
<style>
:root {
  --bg: #0d1117; --surface: #161b22; --border: #30363d;
  --text: #e6edf3; --muted: #7d8590; --green: #3fb950; --yellow: #d29922;
  --red: #f85149; --blue: #58a6ff; --purple: #bc8cff; --orange: #ffa657;
  --radius: 8px; --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.5; }
header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
header h1 { font-size: 18px; font-weight: 600; }
header .badge { background: var(--blue); color: #000; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
.refresh-badge { margin-left: auto; font-size: 12px; color: var(--muted); }
main { padding: 24px; max-width: 1400px; margin: 0 auto; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.card-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
.card-value { font-size: 28px; font-weight: 700; }
.green { color: var(--green); } .red { color: var(--red); } .yellow { color: var(--yellow); } .blue { color: var(--blue); }
section { margin-bottom: 32px; }
section h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.filter-bar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.filter-bar input { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 6px 12px; font-size: 13px; flex: 1; min-width: 160px; }
.filter-bar select { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 6px 12px; font-size: 13px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 8px 12px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; white-space: nowrap; }
th:hover { color: var(--text); }
th.sorted { color: var(--blue); }
td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,.03); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.dot.green { background: var(--green); } .dot.red { background: var(--red); } .dot.yellow { background: var(--yellow); }
.bar-wrap { display: flex; align-items: center; gap: 8px; min-width: 120px; }
.bar-bg { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width .3s; }
.trend { font-size: 16px; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.pill.flagged { background: rgba(248,81,73,.2); color: var(--red); }
.pill.ok { background: rgba(63,185,80,.2); color: var(--green); }
.queue-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.queue-item { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px; }
.queue-item .status { font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: .5px; }
.status.queued { color: var(--muted); } .status.running { color: var(--blue); } .status.done { color: var(--green); } .status.failed { color: var(--red); }
.diff-list { display: flex; flex-direction: column; gap: 8px; }
.diff-item { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; font-size: 12px; }
.diff-item .diff-meta { color: var(--muted); margin-bottom: 4px; }
@media (max-width: 768px) {
  main { padding: 16px; }
  .cards { grid-template-columns: 1fr 1fr; }
  table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
</style>
</head>
<body>
<header>
  <span style="font-size:20px">🚌</span>
  <h1>Agent Skill Bus</h1>
  <span class="badge">Dashboard</span>
  <span class="refresh-badge" id="refresh-label">Auto-refresh in <span id="countdown">30</span>s</span>
</header>
<main>
  <div class="cards" id="summary-cards"></div>
  <section>
    <h2>Skill Health</h2>
    <div class="filter-bar">
      <input type="search" id="skill-search" placeholder="Search skills…">
      <select id="skill-filter">
        <option value="all">All skills</option>
        <option value="flagged">Flagged only</option>
        <option value="ok">Healthy only</option>
      </select>
      <select id="skill-sort">
        <option value="score-desc">Score ↓</option>
        <option value="score-asc">Score ↑</option>
        <option value="name">Name</option>
        <option value="runs-desc">Runs ↓</option>
      </select>
    </div>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Skill</th>
          <th>Avg Score</th>
          <th>Trend</th>
          <th>Runs</th>
          <th>Consecutive Fails</th>
          <th>Last Run</th>
        </tr>
      </thead>
      <tbody id="skills-body"></tbody>
    </table>
  </section>
  <section>
    <h2>Queue</h2>
    <div class="queue-grid" id="queue-grid"></div>
    <div style="margin-top:16px"><table><thead><tr><th>Agent</th><th>Task</th><th>Priority</th><th>Status</th><th>Skill</th></tr></thead><tbody id="queue-body"></tbody></table></div>
  </section>
  <section>
    <h2>Knowledge Diffs <span style="font-size:12px;color:var(--muted)">(last 7 days)</span></h2>
    <div class="diff-list" id="diff-list"></div>
  </section>
</main>
<script>
const D = ${json};

// Summary cards
function renderCards() {
  const health = D.health;
  const entries = Object.entries(health);
  const total = entries.length;
  const flagged = entries.filter(([,v]) => v.flagged).length;
  const healthy = total - flagged;
  const avgScore = total > 0 ? (entries.reduce((a,[,v]) => a + v.avgScore, 0) / total) : 0;
  const q = D.queue;

  document.getElementById('summary-cards').innerHTML = \`
    <div class="card"><div class="card-label">Total Skills</div><div class="card-value">\${total}</div></div>
    <div class="card"><div class="card-label">Healthy</div><div class="card-value green">\${healthy}</div></div>
    <div class="card"><div class="card-label">Flagged</div><div class="card-value \${flagged > 0 ? 'red' : 'green'}">\${flagged}</div></div>
    <div class="card"><div class="card-label">Avg Score</div><div class="card-value \${avgScore >= 0.8 ? 'green' : avgScore >= 0.6 ? 'yellow' : 'red'}">\${avgScore.toFixed(2)}</div></div>
    <div class="card"><div class="card-label">Queue Total</div><div class="card-value blue">\${q.total}</div></div>
    <div class="card"><div class="card-label">Running</div><div class="card-value blue">\${q.byStatus?.running || 0}</div></div>
  \`;
}

// Skills table
function barColor(score) {
  return score >= 0.8 ? '#3fb950' : score >= 0.6 ? '#d29922' : '#f85149';
}
function trendIcon(t) {
  return { improving: '↑', declining: '↓', broken: '✗', stable: '─' }[t] || '─';
}
function trendColor(t) {
  return { improving: 'var(--green)', declining: 'var(--red)', broken: 'var(--red)', stable: 'var(--muted)' }[t] || 'var(--muted)';
}

function renderSkills() {
  let entries = Object.entries(D.health);
  const q = document.getElementById('skill-search').value.toLowerCase();
  const f = document.getElementById('skill-filter').value;
  const s = document.getElementById('skill-sort').value;

  if (q) entries = entries.filter(([name]) => name.toLowerCase().includes(q));
  if (f === 'flagged') entries = entries.filter(([,v]) => v.flagged);
  if (f === 'ok') entries = entries.filter(([,v]) => !v.flagged);

  entries.sort(([an, av], [bn, bv]) => {
    if (s === 'score-desc') return bv.avgScore - av.avgScore;
    if (s === 'score-asc') return av.avgScore - bv.avgScore;
    if (s === 'name') return an.localeCompare(bn);
    if (s === 'runs-desc') return bv.runs - av.runs;
    return 0;
  });

  document.getElementById('skills-body').innerHTML = entries.map(([name, v]) => {
    const pct = Math.round(v.avgScore * 100);
    const dot = v.flagged ? 'red' : 'green';
    const lastRun = v.lastRun ? new Date(v.lastRun).toLocaleDateString('ja-JP') : '─';
    return \`<tr>
      <td><span class="dot \${dot}"></span><span class="pill \${v.flagged ? 'flagged' : 'ok'}">\${v.flagged ? 'Flagged' : 'OK'}</span></td>
      <td><code>\${name}</code></td>
      <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:\${pct}%;background:\${barColor(v.avgScore)}"></div></div><span>\${v.avgScore.toFixed(2)}</span></div></td>
      <td><span class="trend" style="color:\${trendColor(v.trend)}">\${trendIcon(v.trend)}</span> <span style="font-size:12px;color:var(--muted)">\${v.trend}</span></td>
      <td>\${v.runs}</td>
      <td style="color:\${v.consecutiveFails >= 3 ? 'var(--red)' : 'inherit'}">\${v.consecutiveFails}</td>
      <td style="color:var(--muted)">\${lastRun}</td>
    </tr>\`;
  }).join('');
}

// Queue
function renderQueue() {
  const q = D.queue;
  const statusColors = { queued: 'var(--muted)', running: 'var(--blue)', done: 'var(--green)', failed: 'var(--red)', pending: 'var(--yellow)' };

  document.getElementById('queue-grid').innerHTML = Object.entries(q.byStatus || {}).map(([s, n]) => \`
    <div class="queue-item">
      <div class="status \${s}">\${s}</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px;color:\${statusColors[s] || 'inherit'}">\${n}</div>
    </div>\`).join('') || '<div style="color:var(--muted);padding:12px">No queue data</div>';

  document.getElementById('queue-body').innerHTML = q.items.slice(0, 20).map(item => \`<tr>
    <td><code>\${item.agent || '─'}</code></td>
    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${item.task || '─'}</td>
    <td>\${item.priority || '─'}</td>
    <td><span class="status \${item.status || 'queued'}">\${item.status || 'queued'}</span></td>
    <td>\${(item.skills || []).join(', ') || '─'}</td>
  </tr>\`).join('') || '<tr><td colspan="5" style="color:var(--muted);text-align:center">No items</td></tr>';
}

// Diffs
function renderDiffs() {
  const diffs = D.diffs;
  document.getElementById('diff-list').innerHTML = diffs.length
    ? diffs.slice(0, 10).map(d => \`<div class="diff-item">
        <div class="diff-meta">\${d.ts || d.timestamp || ''} • \${d.source || ''} • \${d.type || ''}</div>
        <div>\${(d.summary || d.description || d.diff || JSON.stringify(d)).slice(0, 200)}</div>
      </div>\`).join('')
    : '<div style="color:var(--muted);padding:12px">No knowledge diffs in the last 7 days</div>';
}

function renderAll() {
  renderCards();
  renderSkills();
  renderQueue();
  renderDiffs();
}

renderAll();

document.getElementById('skill-search').addEventListener('input', renderSkills);
document.getElementById('skill-filter').addEventListener('change', renderSkills);
document.getElementById('skill-sort').addEventListener('change', renderSkills);

// Auto-refresh countdown
let seconds = 30;
const countdownEl = document.getElementById('countdown');
setInterval(() => {
  seconds--;
  if (seconds <= 0) {
    window.location.reload();
  } else {
    countdownEl.textContent = seconds;
  }
}, 1000);
</script>
</body>
</html>`;

/**
 * Main entry point: generate HTML dashboard from JSONL files.
 * @param {{ runsFile: string, queueFile: string, diffsFile: string, days?: number }} opts
 * @returns {string} Full HTML string
 */
export function buildWebDashboard({ runsFile, queueFile, diffsFile, days = 7 }) {
  const runs = readJsonlSafe(runsFile);
  const queue = readJsonlSafe(queueFile);
  const diffs = readJsonlSafe(diffsFile);

  const health = calcSkillHealth(runs, days);
  const queueStats = calcQueueStats(queue);
  const diffsSummary = calcDiffsSummary(diffs, days);

  return buildHtml({
    health,
    queue: queueStats,
    diffs: diffsSummary,
    meta: { generatedAt: new Date().toISOString(), days, totalRuns: runs.length },
  });
}
