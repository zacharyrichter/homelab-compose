const express = require('express');
const app = express();

const BROWSER_HOST = process.env.BROWSER_HOST || 'browser';
const BROWSER_CDP_PORT = process.env.BROWSER_CDP_PORT || 9222;
const KASM_SESSION_URL = process.env.KASM_SESSION_URL || 'https://mgmt-kasm.example.org/';
// Comma-separated list of hostnames/IPs this helper is allowed to send the
// browser to. No default — must be set explicitly, so a stray or malicious
// kasm_url can't turn this into an open internal redirector.
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim())
  .filter(Boolean);

// Tracks the single tab this helper manages, so repeated /go hits reuse
// one tab instead of accumulating renderer processes indefinitely.
let lastTargetId = null;

app.get('/go', async (req, res) => {
  const target = req.query.kasm_url;
  if (!target) {
    return res.status(400).send('Missing kasm_url parameter');
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    return res.status(400).send('Invalid kasm_url parameter');
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).send('Unsupported protocol');
  }

  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    return res.status(403).send('Host not in allow-list');
  }

  try {
    const cdpResponse = await fetch(
      `http://${BROWSER_HOST}:${BROWSER_CDP_PORT}/json/new?${encodeURIComponent(targetUrl.toString())}`,
      { method: 'PUT' }
    );
    if (!cdpResponse.ok) {
      throw new Error(`CDP returned ${cdpResponse.status}`);
    }
    const newTab = await cdpResponse.json();

    // Close the previous tab now that the new one is open, so we don't
    // leak renderer processes across repeated /go hits. Best-effort —
    // a failure here shouldn't block the redirect to the new tab.
    if (lastTargetId && lastTargetId !== newTab.id) {
      try {
        await fetch(
          `http://${BROWSER_HOST}:${BROWSER_CDP_PORT}/json/close/${lastTargetId}`,
          { method: 'PUT' }
        );
      } catch (closeErr) {
        console.error('Failed to close previous tab:', closeErr);
      }
    }
    lastTargetId = newTab.id;
  } catch (err) {
    console.error('Failed to open tab via CDP:', err);
    return res.status(502).send('Could not reach browser session');
  }

  res.redirect(302, KASM_SESSION_URL);
});

app.get('/healthz', (req, res) => res.send('ok'));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`kasm-go-helper listening on ${port}`));