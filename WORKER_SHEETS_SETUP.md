# Cloudflare Worker + Google Sheets Setup

This guide explains how to configure the Worker to log submitted URLs to your Google Sheet.

## Prerequisites

- Google Cloud project with Sheets API enabled
- Service account created and JSON key downloaded
- Google Sheet created with header row: `Timestamp` | `User ID` | `Mode` | `URL(s)`
- Sheet shared with the service account email (Editor access)

## 1. Install dependencies

```bash
npm install
```

## 2. Set Worker secrets

From your project root, run:

```bash
# Service account JSON (paste the entire contents of your key file)
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# When prompted, paste the full JSON (or: cat path/to/key.json | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON)

# Spreadsheet ID (from the sheet URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit)
npx wrangler secret put SPREADSHEET_ID
# When prompted, paste just the ID (e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms)
```

### Optional: Custom sheet name

If your sheet tab isn't named "Sheet1", set:

```bash
npx wrangler secret put SHEET_NAME
# Enter the exact tab name (e.g. Submissions)
```

## 3. Deploy the Worker

```bash
npx wrangler deploy
```

## 4. Verify

1. Open your Substack Print site
2. Submit a URL (single or choose-articles mode)
3. Check your Google Sheet—a new row should appear with Timestamp, User ID, Mode, and URL(s). User ID is an anonymized ID (stored in localStorage) to track how many submissions come from the same person.

## Troubleshooting

- **No rows appearing**: Check that the sheet is shared with the service account email (from `client_email` in your JSON key)
- **"Logging not configured"**: Ensure `GOOGLE_SERVICE_ACCOUNT_JSON` and `SPREADSHEET_ID` secrets are set
- **CORS errors**: The Worker returns `Access-Control-Allow-Origin: *`—if issues persist, check the browser console
