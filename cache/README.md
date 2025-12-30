# Cache Directory

This directory contains cached publication data for faster loading.

## File Format

Each cache file should be a JSON file with the following structure:

```json
{
  "timestamp": 1234567890000,
  "publication": {
    "title": "Publication Name",
    "description": "Publication description",
    "establishedDate": "2020-01-01T00:00:00.000Z"
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

## Updating Cache

To update the cache for `rawandferal.substack.com`:

1. Fetch the RSS feed: `https://rawandferal.substack.com/feed`
2. Parse it using `parseRSSFeed()` function
3. Add a `timestamp` field with current time: `Date.now()`
4. Save as `rawandferal.json` in this directory
5. Commit and push to GitHub

The cache will be automatically used if it's less than 1 hour old.

## CDN URL

The cache files are served via jsDelivr CDN:
- `https://cdn.jsdelivr.net/gh/danielleegan/substack-print@main/cache/rawandferal.json`

