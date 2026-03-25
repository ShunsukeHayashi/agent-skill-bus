# ScrapeCreators API Wrapper

## Description

Unified wrapper skill for the [ScrapeCreators API](https://scrapecreators.com), providing access to 27 social media and ad-intelligence platforms. Designed for Miyabi Intelligence Platform data collection and competitive ad research.

**Plan**: Freelance (25,000 credits)  
**Credit rate**: ~18 credits per quick research → ~1,388 runs available

---

## Setup

Export your API key from `~/.config/last30days/.env`:

```bash
export SCRAPECREATORS_API_KEY=$(grep SCRAPECREATORS_API_KEY ~/.config/last30days/.env | cut -d= -f2)
```

Or source the file directly:

```bash
source ~/.config/last30days/.env
```

---

## Credit Balance Check

```bash
curl -s "https://api.scrapecreators.com/v1/credits" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" | jq .
```

Expected response:

```json
{
  "credits_remaining": 24982,
  "credits_used": 18,
  "plan": "freelance"
}
```

---

## Supported Platforms (27)

| # | Platform | Priority | Typical Use Case |
|---|----------|----------|-----------------|
| 1 | Reddit | ★★★ | Community voice, sentiment |
| 2 | Facebook Ad Library | ★★★ | Competitive ad intelligence |
| 3 | Instagram | ★★ | Visual content trends |
| 4 | TikTok | ★★ | Viral content, Gen-Z signals |
| 5 | YouTube | ★★ | Video SEO, influencer research |
| 6 | Twitter / X | ★★ | Real-time trends, influencers |
| 7 | LinkedIn | ★★ | B2B leads, company news |
| 8 | Pinterest | ★ | Visual discovery trends |
| 9 | Snapchat | ★ | Youth demographics |
| 10 | Twitch | ★ | Gaming / live streaming |
| 11 | Discord | ★ | Community insights |
| 12 | Quora | ★ | Q&A intent signals |
| 13 | Medium | ★ | Thought leadership content |
| 14 | Substack | ★ | Newsletter intelligence |
| 15 | Product Hunt | ★ | New product launches |
| 16 | Hacker News | ★ | Tech community opinion |
| 17 | GitHub | ★ | Open-source trends |
| 18 | Glassdoor | ★ | Employer brand signals |
| 19 | Indeed | ★ | Hiring trend intelligence |
| 20 | Yelp | ★ | Local business reviews |
| 21 | Trustpilot | ★ | Brand reputation |
| 22 | G2 | ★ | SaaS competitive reviews |
| 23 | Capterra | ★ | Software comparisons |
| 24 | App Store | ★ | Mobile app reviews |
| 25 | Google Play | ★ | Android app reviews |
| 26 | Amazon | ★ | Product reviews |
| 27 | Etsy | ★ | Handmade / niche market |

---

## Reddit (3 Endpoints)

### 1. Search Posts

Find posts mentioning a topic across all subreddits:

```bash
curl -s "https://api.scrapecreators.com/v1/reddit/search" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "query=your search term" \
  --data-urlencode "limit=25" \
  --data-urlencode "sort=relevance" \
  --data-urlencode "time=month" | jq .
```

Parameters:

| Parameter | Values | Default |
|-----------|--------|---------|
| `query` | search string | required |
| `limit` | 1–100 | 25 |
| `sort` | `relevance`, `hot`, `top`, `new`, `comments` | `relevance` |
| `time` | `hour`, `day`, `week`, `month`, `year`, `all` | `all` |
| `subreddit` | subreddit name (omit `r/`) | all subreddits |

### 2. Subreddit Posts

Fetch posts from a specific subreddit:

```bash
curl -s "https://api.scrapecreators.com/v1/reddit/subreddit" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "subreddit=entrepreneur" \
  --data-urlencode "limit=50" \
  --data-urlencode "sort=hot" | jq .
```

### 3. Post Comments

Fetch comments for a specific post (use `post_id` from search results):

```bash
curl -s "https://api.scrapecreators.com/v1/reddit/comments" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "post_id=POST_ID_HERE" \
  --data-urlencode "limit=100" | jq .
```

### Reddit Quick-Research Example

```bash
# Search for competitor mentions, extract titles and scores
curl -s "https://api.scrapecreators.com/v1/reddit/search" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "query=competitor name" \
  --data-urlencode "sort=top" \
  --data-urlencode "time=month" \
  --data-urlencode "limit=10" \
  | jq '[.posts[] | {title, score, subreddit, url, num_comments}]'
```

---

## Facebook Ad Library ★

The Facebook Ad Library endpoint reveals competitor ad creatives, targeting strategies, and spend estimates.

### Search Active Ads

```bash
curl -s "https://api.scrapecreators.com/v1/facebook/ad-library" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "query=BRAND_OR_KEYWORD" \
  --data-urlencode "country=JP" \
  --data-urlencode "ad_type=ALL" \
  --data-urlencode "limit=20" | jq .
```

Parameters:

| Parameter | Values | Default |
|-----------|--------|---------|
| `query` | advertiser name or keyword | required |
| `country` | ISO 2-letter country code | `US` |
| `ad_type` | `ALL`, `POLITICAL_AND_ISSUE_ADS` | `ALL` |
| `media_type` | `ALL`, `IMAGE`, `GIF`, `VIDEO`, `NONE` | `ALL` |
| `limit` | 1–100 | 20 |
| `active_status` | `ALL`, `ACTIVE`, `INACTIVE` | `ACTIVE` |

### Get Ads by Page ID

```bash
curl -s "https://api.scrapecreators.com/v1/facebook/ad-library" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "page_id=FACEBOOK_PAGE_ID" \
  --data-urlencode "country=JP" \
  --data-urlencode "active_status=ACTIVE" | jq .
```

### Competitive Ad Intelligence Workflow

```bash
# 1. Find all active ads for a competitor brand in Japan
BRAND="CompetitorBrand"
curl -s "https://api.scrapecreators.com/v1/facebook/ad-library" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "query=${BRAND}" \
  --data-urlencode "country=JP" \
  --data-urlencode "active_status=ACTIVE" \
  --data-urlencode "limit=50" \
  | jq '[.ads[] | {
      id,
      advertiser: .page_name,
      started: .ad_delivery_start_time,
      platforms: .publisher_platforms,
      spend_range: .spend,
      impressions_range: .impressions,
      creative_body: .ad_creative_bodies[0],
      cta: .ad_creative_link_captions[0]
    }]'
```

### Ad Response Fields

```json
{
  "id": "AD_ID",
  "page_name": "Advertiser Name",
  "ad_delivery_start_time": "2026-01-15",
  "ad_delivery_stop_time": null,
  "publisher_platforms": ["facebook", "instagram"],
  "spend": { "lower_bound": "1000", "upper_bound": "4999", "currency": "JPY" },
  "impressions": { "lower_bound": "10000", "upper_bound": "49999" },
  "ad_creative_bodies": ["Ad copy text here..."],
  "ad_creative_link_titles": ["Landing page title"],
  "ad_creative_link_captions": ["Learn More"],
  "ad_snapshot_url": "https://www.facebook.com/ads/archive/render_ad/..."
}
```

---

## Credit Consumption Guide

| Operation | Estimated Credits | Monthly Runs (25k plan) |
|-----------|------------------|------------------------|
| Reddit search (25 posts) | ~6 | ~4,166 |
| Reddit subreddit (50 posts) | ~8 | ~3,125 |
| Reddit comments (100) | ~10 | ~2,500 |
| Facebook Ad Library search (20 ads) | ~12 | ~2,083 |
| Facebook Ad Library deep (50 ads) | ~18 | ~1,388 |
| Instagram profile | ~8 | ~3,125 |
| TikTok search (25 videos) | ~10 | ~2,500 |
| LinkedIn company | ~15 | ~1,666 |
| **Quick research bundle** (Reddit+FB) | **~18** | **~1,388** |

> **Tip**: A full competitive intelligence run (Reddit search + FB Ad Library + TikTok) costs ~30 credits.

---

## Integration with last30days Skill

```bash
# Source shared environment
source ~/.config/last30days/.env

# Run 30-day competitor intelligence sweep
for BRAND in "Brand A" "Brand B" "Brand C"; do
  echo "=== ${BRAND} ==="

  # Reddit sentiment (last 30 days)
  curl -s "https://api.scrapecreators.com/v1/reddit/search" \
    -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
    -G \
    --data-urlencode "query=${BRAND}" \
    --data-urlencode "sort=top" \
    --data-urlencode "time=month" \
    --data-urlencode "limit=5" \
    | jq '[.posts[] | {title, score, subreddit}]'

  # Active Facebook ads
  curl -s "https://api.scrapecreators.com/v1/facebook/ad-library" \
    -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
    -G \
    --data-urlencode "query=${BRAND}" \
    --data-urlencode "country=JP" \
    --data-urlencode "active_status=ACTIVE" \
    --data-urlencode "limit=10" \
    | jq '[.ads[] | {page_name, spend, impressions, ad_body: .ad_creative_bodies[0]}]'
done
```

---

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Parse response |
| 401 | Invalid API key | Check `SCRAPECREATORS_API_KEY` in `~/.config/last30days/.env` |
| 402 | Insufficient credits | Check balance with credits endpoint |
| 429 | Rate limit | Wait 60s and retry |
| 503 | Platform unavailable | Platform may be temporarily blocked |

```bash
# Robust call with error checking
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "https://api.scrapecreators.com/v1/reddit/search" \
  -H "x-api-key: ${SCRAPECREATORS_API_KEY}" \
  -G \
  --data-urlencode "query=test" \
  --data-urlencode "limit=5")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "$BODY" | jq .
else
  echo "Error $HTTP_CODE: $BODY"
fi
```

---

## Recording Skill Runs

After each API call, log the result:

```bash
npx agent-skill-bus record-run \
  --agent claude \
  --skill scrapecreators \
  --task "Reddit search: competitor sentiment" \
  --result success \
  --score 1.0
```
