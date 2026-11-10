import { SECURITY_HEADERS, decideSolanaRpc, validateUpstreamUrl } from '../shared/security-policy.js';

function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const upstream = validateUpstreamUrl(process.env.SOLANA_RPC_URL || '');
  let bodyText = '';
  if (String(req.method || '').toUpperCase() === 'POST') {
    bodyText = await req.text();
  }
  const decision = decideSolanaRpc({
    method: req.method,
    bodyText,
    upstreamConfigured: upstream.ok,
  });
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error });
    return;
  }
  if (bodyText && Buffer.byteLength(bodyText) > 64 * 1024) {
    res.status(413).json({ error: 'Request body is too large' });
    return;
  }

  try {
    const response = await fetch(upstream.url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: bodyText,
    });
    const data = await response.text();
    res.status(response.status);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.send(data);
  } catch {
    res.status(502).json({ error: 'Solana RPC adapter failed' });
  }
}
