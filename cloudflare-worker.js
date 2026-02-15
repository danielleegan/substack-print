/**
 * Cloudflare Worker to proxy RSS feeds, handle CORS, and log URL submissions to Google Sheets
 */

import * as jose from 'jose';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getGoogleAccessToken(serviceAccountJson) {
  const { client_email, private_key } = serviceAccountJson;
  const key = await jose.importPKCS8(private_key, 'RS256');
  const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setSubject(client_email)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google OAuth failed: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function appendToSheet(accessToken, spreadsheetId, sheetName, row) {
  const range = `${sheetName}!A:D`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API failed: ${err}`);
  }
}

async function handleLogSubmission(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId = env.SPREADSHEET_ID;
  const sheetName = env.SHEET_NAME || 'Sheet1';

  if (!saJson || !spreadsheetId) {
    return new Response(
      JSON.stringify({ error: 'Logging not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const mode = body.mode || 'single';
  const timestamp = body.timestamp || new Date().toISOString();
  const userId = body.user_id || '';

  // Support single url or urls array (choose-articles: one row per URL)
  let urlsToLog = [];
  if (Array.isArray(body.urls) && body.urls.length > 0) {
    urlsToLog = body.urls.map(u => String(u).trim()).filter(Boolean);
  } else if (body.url) {
    urlsToLog = [body.url.trim()];
  }
  if (urlsToLog.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Missing url or urls' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const serviceAccount = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
    const accessToken = await getGoogleAccessToken(serviceAccount);
    for (const url of urlsToLog) {
      const row = [timestamp, userId, mode, url];
      await appendToSheet(accessToken, spreadsheetId, sheetName, row);
    }
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleRssProxy(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  try {
    const decodedUrl = decodeURIComponent(targetUrl);
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS-Proxy/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      return new Response(`Failed to fetch: ${response.statusText}`, {
        status: response.status,
        headers: CORS_HEADERS,
      });
    }

    const content = await response.text();
    return new Response(content, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': response.headers.get('Content-Type') || 'application/xml',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/log') {
      return handleLogSubmission(request, env);
    }

    return handleRssProxy(request);
  },
};
