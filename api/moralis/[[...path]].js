import { SECURITY_HEADERS, decideMoralisProxy } from '../../shared/security-policy.js';

const MORALIS_ORIGIN = 'https://solana-gateway.moralis.io';

function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const apiKey = process.env.MORALIS_API_KEY || '';
  const decision = decideMoralisProxy({
    method: req.method,
    url: req.url || '/',
    queryPath: req.query?.path,
    hasApiKey: apiKey.length > 0,
  });
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error });
    return;
  }

  try {
    const response = await fetch(`${MORALIS_ORIGIN}${decision.upstreamPath}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-Api-Key': apiKey,
      },
    });
    const data = await response.text();
    res.status(response.status);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.send(data);
  } catch {
    res.status(502).json({ error: 'Moralis adapter failed' });
  }
}
