# Cloudflare Worker Setup Guide

This guide will help you deploy a CORS proxy using Cloudflare Workers (free tier available).

## Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
# or
npm install wrangler --save-dev
```

## Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open your browser to authenticate with Cloudflare.

## Step 3: Deploy the Worker

```bash
wrangler deploy
```

After deployment, you'll get a URL like:
`https://substack-rss-proxy.your-subdomain.workers.dev`

## Step 4: Update script.js

1. Open `script.js`
2. Find the line: `const CLOUDFLARE_PROXY_URL = 'YOUR_CLOUDFLARE_WORKER_URL_HERE';`
3. Replace it with your actual Worker URL:
   ```javascript
   const CLOUDFLARE_PROXY_URL = 'https://substack-rss-proxy.your-subdomain.workers.dev';
   ```

## Step 5: Test

The proxy should now work! The code will try the Cloudflare proxy first, then fall back to other methods if needed.

## Optional: Custom Domain

If you want to use a custom domain:

1. Add your domain to Cloudflare
2. Update `wrangler.toml` with your domain
3. Run `wrangler deploy` again

## Troubleshooting

- **Worker not working?** Check the Cloudflare dashboard for errors
- **Still getting CORS errors?** Make sure the Worker URL is correctly set in `script.js`
- **Rate limits?** Cloudflare Workers free tier has generous limits (100,000 requests/day)

## Cost

Cloudflare Workers free tier includes:
- 100,000 requests per day
- 10ms CPU time per request
- More than enough for most use cases!

