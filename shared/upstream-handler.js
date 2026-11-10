import { SECURITY_HEADERS, decideProxy, pickForwardHeaders } from './security-policy.js';

export function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

export function createUpstreamHandler(kind) {
  return async function handler(req, res) {
    applySecurityHeaders(res);
    const decision = decideProxy({
      kind,
      method: req.method,
      url: req.url || '/',
      env: process.env,
      queryPath: req.query?.path,
    });
    if (!decision.ok) {
      res.status(decision.status).json({ error: decision.error });
      return;
    }

    const headers = pickForwardHeaders(req.headers);
    if (!headers.accept) headers.accept = 'application/json';
    let body;
    if (decision.forwardBody) {
      body = await req.text();
      if (body && Buffer.byteLength(body) > decision.maxBody) {
        res.status(413).json({ error: 'Request body is too large' });
        return;
      }
      if (!body) body = undefined;
      else if (!headers['content-type']) headers['content-type'] = 'application/json';
    }

    try {
      const response = await fetch(decision.targetUrl, {
        method: decision.method,
        headers,
        body,
      });
      const data = await response.text();
      res.status(response.status);
      const contentType = response.headers.get('content-type') || '';
      if (/^(application\/json|text\/plain)(?:\s|;|$)/i.test(contentType) && !/[\r\n]/.test(contentType)) {
        res.setHeader('content-type', contentType.split('\n')[0].trim());
      } else {
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      res.send(data);
    } catch {
      res.status(502).json({ error: 'Upstream request failed' });
    }
  };
}
