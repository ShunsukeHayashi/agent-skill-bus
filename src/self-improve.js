/**
 * Self-Improving Skills — Quality Monitor
 * 
 * 7-step loop: OBSERVE → ANALYZE → DIAGNOSE → PROPOSE → EVALUATE → APPLY → RECORD
 * Zero dependencies. Framework-agnostic.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonl, appendJsonl } from './queue.js';

export class SkillMonitor {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.runsFile = join(dataDir, 'skill-runs.jsonl');
    this.healthFile = join(dataDir, 'skill-health.json');
    this.improvementsFile = join(dataDir, 'skill-improvements.md');
  }

  /** Step 1: OBSERVE — Read all skill runs */
  observe(days = 7) {
    const runs = readJsonl(this.runsFile);
    const cutoff = Date.now() - days * 86400000;
    return runs.filter(r => new Date(r.ts).getTime() > cutoff);
  }

  /** Step 2: ANALYZE — Calculate health metrics per skill */
  analyze(days = 7) {
    const recentRuns = this.observe(days);
    const allRuns = readJsonl(this.runsFile);
    
    const skills = {};

    for (const run of allRuns) {
      const name = run.skill;
      if (!skills[name]) {
        skills[name] = { runs: 0, totalScore: 0, recentRuns: 0, recentScore: 0, fails: 0, recentFails: 0, lastFail: null, consecutiveFails: 0 };
      }
      const s = skills[name];
      s.runs++;
      s.totalScore += run.score;
      if (run.result === 'fail') {
        s.fails++;
        s.lastFail = run.ts;
      }
    }

    // Recent window
    for (const run of recentRuns) {
      const s = skills[run.skill];
      if (!s) continue;
      s.recentRuns++;
      s.recentScore += run.score;
      if (run.result === 'fail') s.recentFails++;
    }

    // Calculate consecutive fails (from latest)
    const bySkill = {};
    for (const run of allRuns) {
      if (!bySkill[run.skill]) bySkill[run.skill] = [];
      bySkill[run.skill].push(run);
    }
    for (const [name, runs] of Object.entries(bySkill)) {
      const sorted = runs.sort((a, b) => new Date(b.ts) - new Date(a.ts));
      let consecutive = 0;
      for (const r of sorted) {
        if (r.result === 'fail') consecutive++;
        else break;
      }
      if (skills[name]) skills[name].consecutiveFails = consecutive;
    }

    // Build health report
    const report = {};
    for (const [name, s] of Object.entries(skills)) {
      const avgScore = s.runs > 0 ? +(s.totalScore / s.runs).toFixed(3) : 0;
      const recentAvg = s.recentRuns > 0 ? +(s.recentScore / s.recentRuns).toFixed(3) : null;
      
      let trend = 'stable';
      if (recentAvg !== null && avgScore > 0) {
        const delta = recentAvg - avgScore;
        if (delta > 0.05) trend = 'improving';
        else if (delta < -0.05) trend = 'declining';
      }
      if (s.consecutiveFails >= 3) trend = 'broken';

      report[name] = {
        runs: s.runs,
        avgScore,
        recentAvg,
        trend,
        lastFail: s.lastFail,
        consecutiveFails: s.consecutiveFails,
        flagged: avgScore < 0.8 || trend === 'declining' || trend === 'broken',
      };
    }

    return report;
  }

  /** Get flagged (unhealthy) skills */
  getFlagged(days = 7) {
    const health = this.analyze(days);
    return Object.entries(health)
      .filter(([_, v]) => v.flagged)
      .map(([name, data]) => ({ name, ...data }));
  }

  /** Record a skill run */
  recordRun({ agent, skill, task, result, score, notes = '' }) {
    const entry = {
      ts: new Date().toISOString(),
      agent,
      skill,
      task,
      result,
      score: Math.max(0, Math.min(1, score)),
      notes,
    };
    appendJsonl(this.runsFile, entry);
    return entry;
  }

  /** Update skill-health.json with latest analysis */
  updateHealth(days = 7) {
    const health = this.analyze(days);
    const state = {
      lastUpdated: new Date().toISOString(),
      skills: health,
    };
    writeFileSync(this.healthFile, JSON.stringify(state, null, 2));
    return state;
  }

  /** Read current health state */
  readHealth() {
    if (!existsSync(this.healthFile)) return { lastUpdated: '', skills: {} };
    return JSON.parse(readFileSync(this.healthFile, 'utf-8'));
  }

  /** Record an improvement (Step 7: RECORD) */
  recordImprovement({ skill, diagnosis, proposal, action, result }) {
    const line = `\n### ${new Date().toISOString()} — ${skill}\n` +
      `- **Diagnosis:** ${diagnosis}\n` +
      `- **Proposal:** ${proposal}\n` +
      `- **Action:** ${action}\n` +
      `- **Result:** ${result}\n`;
    appendFileSync(this.improvementsFile, line);
  }

  /** Detect silent drift: score drop >15% week-over-week */
  detectDrift() {
    const thisWeek = this.analyze(7);
    const lastWeek = {};
    const allRuns = readJsonl(this.runsFile);
    const cutoffThis = Date.now() - 7 * 86400000;
    const cutoffLast = Date.now() - 14 * 86400000;

    // Calculate last week's averages
    const lastWeekRuns = allRuns.filter(r => {
      const t = new Date(r.ts).getTime();
      return t > cutoffLast && t <= cutoffThis;
    });

    for (const run of lastWeekRuns) {
      if (!lastWeek[run.skill]) lastWeek[run.skill] = { total: 0, count: 0 };
      lastWeek[run.skill].total += run.score;
      lastWeek[run.skill].count++;
    }

    const drifting = [];
    for (const [name, data] of Object.entries(thisWeek)) {
      if (!lastWeek[name] || lastWeek[name].count === 0) continue;
      const lastAvg = lastWeek[name].total / lastWeek[name].count;
      if (data.recentAvg !== null && lastAvg - data.recentAvg > 0.15) {
        drifting.push({ name, lastWeekAvg: +lastAvg.toFixed(3), thisWeekAvg: data.recentAvg, drop: +(lastAvg - data.recentAvg).toFixed(3) });
      }
    }

    return drifting;
  }
}
