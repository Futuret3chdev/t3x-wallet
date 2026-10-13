export default async function handler(req, res) {
  const mtBase = process.env.MT_TARGET_URL || 'http://161.97.106.182:4001';
  let targetPath = req.url.replace(/^\/api\/mt/, '');
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
  const targetUrl = mtBase + targetPath;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set('host', new URL(mtBase).host);

  const fetchOptions = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) {
    const body = await req.text();
    if (body) fetchOptions.body = body;
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();
    res.status(response.status);
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lower)) {
        res.setHeader(key, value);
      }
    });
    res.send(data);
  } catch (e) {
    console.error('MT core proxy error:', e);
    res.status(502).json({ error: 'MT node proxy failed: ' + e.message });
  }
}
