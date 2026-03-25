# X Auto-Posting Scheduler

## Description
Generates and schedules 5 X (Twitter) posts per day from `last30days` trend data.
The pipeline fetches trending topics, generates 5 post variants via OpenClaw `sns-creator`,
and dispatches them at optimal times via OpenClaw `x-ops`.

Post history is recorded in `skill-runs.jsonl` in this directory so the
Self-Improving Skills loop can track quality over time.

## Pipeline

```
last30days --json
    │
    ▼
sns-creator (OpenClaw index 29, MainMini)
    │  Generate 5 posts from trend JSON
    ▼
post-queue.jsonl  ─── scheduler ───▶  x-ops (OpenClaw index 12, Windows Gateway)
                                            │
                                            ▼
                                     skill-runs.jsonl
```

## Optimal Posting Times (JST, weekdays)

| Slot | Time  | Post type (recommended) |
|------|-------|-------------------------|
| 1    | 07:00 | バズネタ型 (buzz)        |
| 2    | 12:00 | 実用型 (practical)       |
| 3    | 19:00 | 感情訴求型 (emotional)   |
| 4    | 21:00 | 逆張り型 (contrarian)    |
| 5    | 22:00 | フォロー誘導型 (follow)  |

## 5-Post Templates

### Template 1 — バズネタ型 (Buzz)
> 英語圏の高インプレ話題を日本語要約
- Expected impressions: 5,000–15,000
- Hook: 数字・驚き・意外性
- Structure: `【速報】{topic} が話題に。\n{summary}\n{cta}`
- Hashtags: `#{topic_tag} #AI #テクノロジー`

### Template 2 — 逆張り型 (Contrarian)
> 話題に対する別視点・反論
- Expected impressions: 3,000–10,000
- Hook: 「〜は間違っている」「実は〜」
- Structure: `「{popular_opinion}」という意見が広がっているが、実は…\n{counterpoint}\n{evidence}`
- Hashtags: `#{topic_tag} #考察`

### Template 3 — 実用型 (Practical)
> ツール・手法の具体的な紹介
- Expected impressions: 2,000–8,000
- Hook: 「〜の使い方」「〜で解決」
- Structure: `{tool_name} でできること:\n✅ {point1}\n✅ {point2}\n✅ {point3}\n👇 詳細スレッド`
- Hashtags: `#{tool_tag} #便利ツール #エンジニア`

### Template 4 — 感情訴求型 (Emotional)
> ストーリー仕立て・共感を呼ぶ
- Expected impressions: 3,000–12,000
- Hook: 体験談・Before/After
- Structure: `{time_ago}、{situation}。\n{turning_point}。\n今は{outcome}。\n同じ悩みがある人へ→`
- Hashtags: `#{emotion_tag} #体験談`

### Template 5 — フォロー誘導型 (Follow)
> 日本語圏への先取り情報提供
- Expected impressions: 1,000–5,000
- Hook: 「日本語でまとめました」「まだ知らない人が多い」
- Structure: `海外で話題の{topic}、日本語でまとめました🧵\n{summary}\nフォローすると毎日届きます→`
- Hashtags: `#{topic_tag} #まとめ #フォロー`

## Step-by-Step Procedure

### Step 1: Fetch Trend Data

```bash
# Generate trend JSON for the last 30 days (adapt to your data source)
npx agent-skill-bus record-run \
  --agent x-scheduler \
  --skill last30days \
  --task "fetch trend data" \
  --result success \
  --score 1.0
```

Save output to `/tmp/trends-$(date +%Y%m%d).json`.

### Step 2: Generate 5 Posts via OpenClaw sns-creator

Dispatch to OpenClaw agent **index 29** (sns-creator, MainMini):

```
@sns-creator
Input: /tmp/trends-YYYYMMDD.json
Task: Generate 5 X posts using the templates below.
Output format: JSONL, one post object per line, written to /tmp/posts-YYYYMMDD.jsonl

Post object schema:
{"slot":1,"template":"buzz","text":"...","hashtags":["..."],"scheduled_jst":"07:00"}
{"slot":2,"template":"contrarian","text":"...","hashtags":["..."],"scheduled_jst":"12:00"}
{"slot":3,"template":"practical","text":"...","hashtags":["..."],"scheduled_jst":"19:00"}
{"slot":4,"template":"emotional","text":"...","hashtags":["..."],"scheduled_jst":"21:00"}
{"slot":5,"template":"follow","text":"...","hashtags":["..."],"scheduled_jst":"22:00"}

Templates:
1. バズネタ型: 英語圏の高インプレ話題を日本語要約（予測5,000〜15,000インプレ）
2. 逆張り型: 話題に対する別視点（予測3,000〜10,000インプレ）
3. 実用型: ツール・手法の紹介（予測2,000〜8,000インプレ）
4. 感情訴求型: ストーリー仕立て（予測3,000〜12,000インプレ）
5. フォロー誘導型: 日本語圏先取り情報（予測1,000〜5,000インプレ）

Constraints:
- Each post ≤ 280 characters (Twitter counts all characters equally, regardless of language)
- Include 1–3 hashtags per post
- No duplicate topics across the 5 posts
```

Append generated posts to `post-queue.jsonl` in this skill directory.

### Step 3: Post via OpenClaw x-ops

At each scheduled time, dispatch to OpenClaw agent **index 12** (x-ops, Windows Gateway):

```
@x-ops
Task: Post the following tweet using twitter-api-v2.
Text: {post.text} {post.hashtags joined by space}
After posting, report: tweet_id, impressions_estimate, posted_at (ISO 8601 UTC)
```

#### twitter-api-v2 integration

`x-ops` uses the `twitter-api-v2` Node.js library. Ensure the following environment
variables are set on the Windows Gateway host:

```
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...
```

Minimal post command (run inside x-ops):

```js
import { TwitterApi } from 'twitter-api-v2';
const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});
const tweet = await client.v2.tweet(text);
console.log(JSON.stringify({ tweet_id: tweet.data.id }));
```

### Step 4: Record Post History

After each successful post, append one line to `skill-runs.jsonl` in **this directory**:

```jsonl
{"ts":"2026-03-25T07:00:00Z","agent":"x-ops","skill":"x-scheduler","task":"post slot 1 buzz","result":"success","score":1.0,"notes":"tweet_id=1234567890123456789 slot=1 template=buzz"}
```

Also append the full post record to `post-queue.jsonl` with `status` updated to `posted`:

```jsonl
{"date":"2026-03-25","slot":1,"template":"buzz","text":"...","hashtags":["..."],"scheduled_jst":"07:00","status":"posted","tweet_id":"1234567890123456789","posted_at":"2026-03-25T22:00:00Z"}
```

## Data Files

### `post-queue.jsonl` — Daily Post Queue

One JSON object per line, one line per scheduled post:

| Field | Type | Description |
|-------|------|-------------|
| `date` | YYYY-MM-DD | Target posting date (JST) |
| `slot` | 1–5 | Posting slot (1=07:00 … 5=22:00) |
| `template` | string | Template name: `buzz`, `contrarian`, `practical`, `emotional`, `follow` |
| `text` | string | Post body (without hashtags) |
| `hashtags` | string[] | Hashtag strings including `#` |
| `scheduled_jst` | HH:MM | Scheduled time in JST |
| `status` | string | `queued`, `posted`, `failed`, `skipped` |
| `tweet_id` | string\|null | Twitter tweet ID after posting |
| `posted_at` | ISO 8601\|null | Actual UTC time posted |

### `skill-runs.jsonl` — Execution Log

Standard Agent Skill Bus format (compatible with Self-Improving Skills loop):

```jsonl
{"ts":"2026-03-25T07:00:00Z","agent":"x-ops","skill":"x-scheduler","task":"post slot 1 buzz","result":"success","score":1.0,"notes":"tweet_id=... slot=1 template=buzz"}
{"ts":"2026-03-25T12:00:00Z","agent":"x-ops","skill":"x-scheduler","task":"post slot 2 practical","result":"success","score":1.0,"notes":"tweet_id=... slot=2 template=practical"}
```

## Prompt Request Bus Integration

Queue the daily generation run via the Prompt Request Bus:

```json
{
  "id": "pr-xsched-YYYYMMDD",
  "ts": "2026-03-25T06:45:00Z",
  "source": "cron",
  "priority": "medium",
  "agent": "sns-creator",
  "task": "Generate 5 X posts from last30days trends for 2026-03-25",
  "context": "Daily x-scheduler run. Trend data at /tmp/trends-20260325.json",
  "affectedSkills": ["x-scheduler"],
  "affectedFiles": ["agent-skill-bus:skills/x-scheduler/post-queue.jsonl"],
  "deadline": "24h",
  "status": "queued",
  "dependsOn": [],
  "dagId": "xsched-20260325"
}
```

Then queue each posting slot as a dependent task:

```json
{"id":"pr-xsched-20260325-s1","source":"dag","priority":"medium","agent":"x-ops","task":"Post X slot 1 (07:00 JST) for 2026-03-25","dependsOn":["pr-xsched-YYYYMMDD"],"dagId":"xsched-20260325","status":"queued"}
{"id":"pr-xsched-20260325-s2","source":"dag","priority":"medium","agent":"x-ops","task":"Post X slot 2 (12:00 JST) for 2026-03-25","dependsOn":["pr-xsched-YYYYMMDD"],"dagId":"xsched-20260325","status":"queued"}
{"id":"pr-xsched-20260325-s3","source":"dag","priority":"medium","agent":"x-ops","task":"Post X slot 3 (19:00 JST) for 2026-03-25","dependsOn":["pr-xsched-YYYYMMDD"],"dagId":"xsched-20260325","status":"queued"}
{"id":"pr-xsched-20260325-s4","source":"dag","priority":"medium","agent":"x-ops","task":"Post X slot 4 (21:00 JST) for 2026-03-25","dependsOn":["pr-xsched-YYYYMMDD"],"dagId":"xsched-20260325","status":"queued"}
{"id":"pr-xsched-20260325-s5","source":"dag","priority":"medium","agent":"x-ops","task":"Post X slot 5 (22:00 JST) for 2026-03-25","dependsOn":["pr-xsched-YYYYMMDD"],"dagId":"xsched-20260325","status":"queued"}
```

## LaunchAgent (macOS)

See `com.miyabi.x-scheduler.plist` in this directory for a ready-to-use macOS
LaunchAgent that runs the generation step at **06:45 JST** every weekday and
triggers the posting pipeline at each scheduled slot.

## Safety Constraints

- **Rate limits**: Twitter API v2 Free tier allows 17 tweets/24 h per app. Keep 5 posts/day well within limits.
- **Duplicate guard**: Before posting, check `post-queue.jsonl` for `tweet_id != null` on the same `date+slot` to avoid double-posting.
- **Max retries**: 2 retries on `5xx` errors with 60-second back-off; mark as `failed` after that.
- **Human review**: Any post with `score < 0.6` in the previous day's `skill-runs.jsonl` triggers a Prompt Request to human reviewer before the next day's run.
- **No secrets in files**: API credentials are environment variables only; never written to JSONL files.
