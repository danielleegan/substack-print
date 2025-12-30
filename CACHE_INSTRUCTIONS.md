# Cache Generation Instructions

## Quick Start

To generate the cache file for `rawandferal.substack.com`:

```bash
python3 generate-cache.py
```

This will:
1. Fetch the RSS feed from `https://rawandferal.substack.com/feed`
2. Parse it and extract the first 3 articles
3. Save it as `cache/rawandferal.json`

## What the Cache Does

The cache file stores pre-parsed RSS feed data so that:
- The default publication loads instantly (no RSS fetch needed)
- Reduces load on Substack's servers
- Works even if RSS feed is temporarily unavailable

## Cache Expiration

The cache is valid for 1 hour. After that, the app will:
1. Try to use the cache (if less than 1 hour old)
2. Fall back to fetching fresh RSS feed if cache is stale

## Updating the Cache

You can update the cache manually by running:

```bash
python3 generate-cache.py
```

Or set up a cron job to update it automatically:

```bash
# Update cache every hour
0 * * * * cd /path/to/substack-print && python3 generate-cache.py
```

## Deploying the Cache

After generating the cache file:

1. Commit it to GitHub:
   ```bash
   git add cache/rawandferal.json
   git commit -m "Update cache for rawandferal"
   git push
   ```

2. The cache will be available via jsDelivr CDN:
   `https://cdn.jsdelivr.net/gh/danielleegan/substack-print@main/cache/rawandferal.json`

## File Format

The cache file is a JSON file with this structure:

```json
{
  "timestamp": 1234567890000,
  "publication": {
    "title": "raw & feral",
    "description": "Publication description",
    "establishedDate": "2020-01-01T00:00:00"
  },
  "articles": [
    {
      "title": "Article Title",
      "content": "<html>...</html>",
      "isFeatured": true
    }
  ]
}
```

