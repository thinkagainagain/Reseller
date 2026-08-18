const express = require('express');
const os = require('os');
const { execFile } = require('child_process');
const { runSync } = require('../services/ebaySync');

// Explicit callback->Promise wrapper rather than util.promisify(execFile) --
// promisify relies on Node's internal custom-promisify hook for child_process
// to resolve {stdout, stderr} instead of just the first callback arg, and
// that didn't behave as expected on Hostinger's runtime (stdout came back
// undefined). This works the same on every Node version.
function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

const router = express.Router();

router.get('/sync', (req, res) => {
  res.render('sync', { result: null, error: null });
});

router.post('/sync/run', async (req, res) => {
  try {
    const { listings, orders } = await runSync();
    res.render('sync', { result: { listings, orders }, error: null });
  } catch (err) {
    console.error('Sync failed:', err);
    res.render('sync', { result: null, error: err.message });
  }
});

// Temporary diagnostic for the Hostinger-vs-eBay-token-endpoint issue --
// runs the exact same token request via Node's fetch AND a raw curl
// (independent HTTP client, rules out anything fetch/undici-specific) from
// wherever this server is actually running, so the output can be pasted
// straight into a Hostinger support ticket. Never echoes CLIENT_ID/SECRET/
// REFRESH_TOKEN -- only the response we get back from eBay.
router.get('/sync/diagnose', (req, res) => {
  res.render('sync-diagnose', { result: null, error: null });
});

router.post('/sync/diagnose', async (req, res) => {
  const timestamp = new Date().toISOString();
  const hostname = os.hostname();
  const nodeVersion = process.version;

  const CLIENT_ID = process.env.EBAY_CLIENT_ID;
  const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN;
  const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
  const SCOPE = 'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly';

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return res.render('sync-diagnose', {
      result: null,
      error: 'Missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET/EBAY_REFRESH_TOKEN in .env',
    });
  }

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const nodeResult = {};
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
      scope: SCOPE,
    });
    const started = Date.now();
    const fetchRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    nodeResult.durationMs = Date.now() - started;
    nodeResult.status = fetchRes.status;
    nodeResult.statusText = fetchRes.statusText;
    nodeResult.headers = Object.fromEntries(fetchRes.headers.entries());
    nodeResult.bodySnippet = (await fetchRes.text()).slice(0, 500);
  } catch (err) {
    nodeResult.error = err.message;
  }

  const curlResult = {};
  try {
    const args = [
      '-s',
      '-i',
      '--max-time',
      '15',
      '-X',
      'POST',
      TOKEN_URL,
      '-H',
      `Authorization: Basic ${basicAuth}`,
      '-H',
      'Content-Type: application/x-www-form-urlencoded',
      '--data-urlencode',
      'grant_type=refresh_token',
      '--data-urlencode',
      `refresh_token=${REFRESH_TOKEN}`,
      '--data-urlencode',
      `scope=${SCOPE}`,
    ];
    const started = Date.now();
    const { stdout } = await execFileP('curl', args, { timeout: 20000 });
    curlResult.durationMs = Date.now() - started;
    // Redact the Authorization header we sent (curl -i echoes response
    // headers only, but strip defensively in case any client here differs).
    // split/join instead of a regex -- basicAuth is base64 and can contain
    // '+', which is a regex quantifier metacharacter.
    curlResult.raw = String(stdout ?? '').split(`Basic ${basicAuth}`).join('Basic [redacted]');
  } catch (err) {
    curlResult.error = err.message;
    curlResult.notAvailable = err.code === 'ENOENT';
  }

  res.render('sync-diagnose', {
    result: { timestamp, hostname, nodeVersion, nodeResult, curlResult },
    error: null,
  });
});

module.exports = router;
