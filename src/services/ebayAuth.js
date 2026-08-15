const CLIENT_ID = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN;

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

async function getAccessToken(scopes) {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET/EBAY_REFRESH_TOKEN in .env');
  }

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
    scope: scopes.join(' '),
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `eBay token refresh failed. Node ${process.version}, status ${res.status}, ` +
        `server header: ${res.headers.get('server')}, x-ebay-c-request-id: ${res.headers.get('x-ebay-c-request-id')}`
    );
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

module.exports = { getAccessToken };
