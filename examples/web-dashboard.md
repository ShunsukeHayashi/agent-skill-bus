# Web Dashboard Example

Generate a standalone HTML dashboard from your skill-bus data files.

## Quick Start

```bash
# In your project with skill-bus data
npx agent-skill-bus dashboard --web

# Specify output path
npx agent-skill-bus dashboard --web --output ./public/dashboard.html

# Custom time window
npx agent-skill-bus dashboard --web --days 14

# Open in browser
open dashboard.html
```

## What it shows

| Section | Data Source |
|---------|-------------|
| Summary cards | skill-runs.jsonl + queue |
| Skill health table | skill-runs.jsonl |
| Queue status | prompt-request-queue.jsonl |
| Knowledge diffs | knowledge-diffs.jsonl |

## Features

- **Zero dependencies** — vanilla JS + CSS only
- **Dark mode** — GitHub-style dark theme
- **Auto-refresh** — reloads every 30 seconds
- **Filterable** — search, filter by health status, sort by score/runs
- **Mobile responsive** — works on phones and tablets

## Programmatic use

```js
import { buildWebDashboard } from 'agent-skill-bus/web-dashboard';

const html = buildWebDashboard({
  runsFile: '.skill-bus/monitor/skill-runs.jsonl',
  queueFile: '.skill-bus/queue/prompt-request-queue.jsonl',
  diffsFile: '.skill-bus/watcher/knowledge-diffs.jsonl',
  days: 7,
});

import { writeFileSync } from 'node:fs';
writeFileSync('dashboard.html', html);
```
