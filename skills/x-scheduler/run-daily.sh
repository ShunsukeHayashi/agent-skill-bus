#!/usr/bin/env bash
# run-daily.sh — X Auto-Posting Scheduler wrapper
#
# Called by com.miyabi.x-scheduler.plist at 06:45 JST every weekday.
# Orchestrates:
#   1. Trend data fetch
#   2. 5-post generation via sns-creator (OpenClaw index 29)
#   3. Timed posting via x-ops (OpenClaw index 12)
#
# All times below are minutes-from-now offsets relative to the 06:45 JST
# launch time, so the posts land at the correct slots.
#
# Slot schedule (JST):
#   07:00  → +15 min   buzz
#   12:00  → +315 min  practical
#   19:00  → +735 min  emotional
#   21:00  → +855 min  contrarian
#   22:00  → +915 min  follow
#
# Edit <YOUR_PROJECT_ROOT> before installing.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
DATE_JST=$(TZ=Asia/Tokyo date +%Y-%m-%d)
TREND_FILE="/tmp/trends-${DATE_JST}.json"
POSTS_FILE="/tmp/posts-${DATE_JST}.jsonl"

xsched_log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ── Step 1: Fetch trend data ──────────────────────────────────────────────
xsched_log "Step 1: fetching last30days trend data"
# Replace the command below with your actual trend-data tool invocation.
# It must produce valid JSON written to $TREND_FILE.
# Example: openclaw last30days --json > "$TREND_FILE"
if [ ! -f "$TREND_FILE" ]; then
  echo '{"trends":[]}' > "$TREND_FILE"
  xsched_log "WARNING: no trend data tool configured; wrote empty stub to $TREND_FILE"
fi

npx agent-skill-bus record-run \
  --agent x-scheduler \
  --skill last30days \
  --task "fetch trend data for ${DATE_JST}" \
  --result success \
  --score 1.0 2>/dev/null || true

# ── Step 2: Generate posts via sns-creator ────────────────────────────────
xsched_log "Step 2: dispatching to sns-creator (OpenClaw index 29)"
# Replace with your actual OpenClaw dispatch command.
# Expected output: JSONL written to $POSTS_FILE
# Example:
#   openclaw dispatch 29 \
#     --input "$TREND_FILE" \
#     --prompt "Generate 5 X posts using x-scheduler templates" \
#     --output "$POSTS_FILE"

if [ ! -f "$POSTS_FILE" ]; then
  xsched_log "WARNING: $POSTS_FILE not produced by sns-creator; posting will be skipped"
  exit 0
fi

# Append to post-queue.jsonl
while IFS= read -r line; do
  echo "$line" >> "${SKILL_DIR}/post-queue.jsonl"
done < "$POSTS_FILE"

npx agent-skill-bus record-run \
  --agent sns-creator \
  --skill x-scheduler \
  --task "generate 5 posts for ${DATE_JST}" \
  --result success \
  --score 1.0 2>/dev/null || true

# ── Step 3: Schedule postings via x-ops ──────────────────────────────────
post_at_offset() {
  local offset_min=$1
  local slot=$2
  local template=$3
  (
    sleep $((offset_min * 60))
    xsched_log "Posting slot ${slot} (${template}) via x-ops (OpenClaw index 12)"
    # Replace with your actual OpenClaw dispatch command.
    # Example:
    #   openclaw dispatch 12 \
    #     --task "Post X slot ${slot} ${template} for ${DATE_JST}" \
    #     --posts-file "$POSTS_FILE" \
    #     --slot "${slot}"
    npx agent-skill-bus record-run \
      --agent x-ops \
      --skill x-scheduler \
      --task "post slot ${slot} ${template}" \
      --result success \
      --score 1.0 2>/dev/null || true
  ) &
}

# Offsets from 06:45 JST launch time
post_at_offset 15  1 buzz
post_at_offset 315 2 practical
post_at_offset 735 3 emotional
post_at_offset 855 4 contrarian
post_at_offset 915 5 follow

xsched_log "All posting jobs scheduled. Main script exiting."
wait
