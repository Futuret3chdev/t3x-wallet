/**
 * Shared security decisions for the wallet UI and the serverless proxies.
 * No secrets, no network, no new cryptography. Callers pass env and hostnames in.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024;

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://quote-api.jup.ag https://admin.futuret3ch.com.au",
    "worker-src 'self'",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

export function isLocalDevHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return LOCAL_HOSTS.has(host);
}

/** Demo auth responses are a localhost convenience. Every other host fails closed. */
export function demoAuthAllowed(hostname) {
  return isLocalDevHost(hostname);
}

/**
 * Sign-in is locked unless a build or runtime flag is explicitly off.
 * Unset, empty, and any other value stay locked.
 */
export function isSignInLocked(env = {}) {
  const flag = env.VITE_SIGNIN_LOCK ?? env.SIGNIN_LOCK;
  if (flag === undefined || flag === null) return true;
  const normalized = String(flag).trim().toLowerCase();
  if (!normalized) return true;
  return !['0', 'false', 'off'].includes(normalized);
}

export function isProductionEnv(env = {}) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';
}

export function validateUpstreamUrl(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'missing' };
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { ok: false, reason: 'invalid' };
  }
  if (url.pathname.includes('..') || url.pathname.includes('\\')) {
    return { ok: false, reason: 'invalid' };
  }
  const local = isLocalDevHost(url.hostname);
  if (url.protocol === 'https:') return { ok: true, url };
  if (url.protocol === 'http:' && local) return { ok: true, url };
  return { ok: false, reason: 'https-required' };
}

/**
 * Same-origin relative paths, https URLs, and http only for localhost.
 * Bare public hosts are not upgraded to cleartext http.
 */
export function coerceServiceUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\.+$/, '').replace(/\/+$/, '');
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) {
    if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.includes('//')) return null;
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return validateUpstreamUrl(trimmed).ok ? trimmed : null;
  }
  const host = trimmed.split('/')[0].split(':')[0];
  if (isLocalDevHost(host)) {
    const localUrl = `http://${trimmed}`;
    return validateUpstreamUrl(localUrl).ok ? localUrl : null;
  }
  const httpsUrl = `https://${trimmed}`;
  return validateUpstreamUrl(httpsUrl).ok ? httpsUrl : null;
}

export function resolveAuthTransport(hostname, hasBase) {
  const local = demoAuthAllowed(hostname);
  if (!hasBase) return local ? 'demo' : 'fail';
  return local ? 'remote-or-demo' : 'remote-or-fail';
}

/** Account-password bodies sent to mt-auth. Vault passphrases are not a field. */
export function buildLoginRequest(emailOrPhone, accountPassword) {
  return { emailOrPhone, password: accountPassword };
}

export function buildSignupRequest(email, phone, accountPassword) {
  return { email, phone, password: accountPassword };
}

export const AUTH_ALLOW = Object.freeze([
  { methods: ['POST'], path: /^\/signup$/ },
  { methods: ['POST'], path: /^\/verify$/ },
  { methods: ['POST'], path: /^\/login$/ },
  { methods: ['GET', 'HEAD'], path: /^\/me$/ },
  { methods: ['GET', 'HEAD'], path: /^\/wallets$/ },
  { methods: ['POST'], path: /^\/wallets\/backup$/ },
  { methods: ['DELETE'], path: /^\/wallets\/(?!backup$)[A-Za-z0-9_-]{1,128}$/ },
]);

const BS58 = '[1-9A-HJ-NP-Za-km-z]{32,88}';

export const MT_ALLOW = Object.freeze([
  { methods: ['GET', 'HEAD'], path: new RegExp(`^\\/account\\/${BS58}$`) },
  { methods: ['GET', 'HEAD'], path: new RegExp(`^\\/nfts\\/${BS58}$`) },
  { methods: ['GET', 'HEAD'], path: new RegExp(`^\\/explorer\\/txs\\/${BS58}$`) },
  { methods: ['POST'], path: /^\/tx$/ },
  { methods: ['POST'], path: /^\/faucet$/, faucet: true },
]);

export function normalizeProxyPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > 512) return null;
  const noQuery = rawPath.split('#')[0].split('?')[0];
  if (/%2e|%2f|%5c/i.test(noQuery)) return null;
  let path;
  try {
    path = decodeURIComponent(noQuery);
  } catch {
    return null;
  }
  if (path.includes('%') || path.includes('\\') || path.includes('\0')) return null;
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.includes('//')) return null;
  if (path.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  return path;
}

export function extractForwardPath({ url, mount, queryPath }) {
  const rawUrl = String(url || '/');
  let pathname = rawUrl;
  let search = '';
  const q = rawUrl.indexOf('?');
  if (q !== -1) {
    pathname = rawUrl.slice(0, q);
    search = rawUrl.slice(q);
  }
  if (/^https?:\/\//i.test(pathname)) {
    try {
      const parsed = new URL(pathname);
      pathname = parsed.pathname;
      search = parsed.search || search;
    } catch {
      return null;
    }
  }
  const mountIdx = pathname.indexOf(mount);
  let rest = mountIdx === -1 ? null : pathname.slice(mountIdx + mount.length) || '/';
  if ((rest === null || rest === '/' || rest === '') && queryPath != null && queryPath !== '') {
    const segments = Array.isArray(queryPath) ? queryPath : [queryPath];
    if (segments.some((seg) => typeof seg !== 'string' || seg.includes('/') || seg.includes('..') || seg.includes('\\'))) {
      return null;
    }
    rest = `/${segments.join('/')}`;
  }
  if (rest === null) return null;
  const normalized = normalizeProxyPath(rest);
  if (!normalized) return null;
  if (search && search !== '?') return { pathname: normalized, rejectedQuery: true };
  return { pathname: normalized, rejectedQuery: false };
}

export function matchAllowlist(allow, method, pathname, { production = false } = {}) {
  const verb = String(method || '').toUpperCase();
  let sawPath = false;
  for (const rule of allow) {
    if (!rule.path.test(pathname)) continue;
    sawPath = true;
    if (!rule.methods.includes(verb)) continue;
    if (rule.faucet && production) return { ok: false, reason: 'faucet-disabled' };
    return { ok: true, rule };
  }
  return { ok: false, reason: sawPath ? 'method' : 'not-allowed' };
}

function proxyFailure(status, error) {
  return { ok: false, status, error };
}

export function decideProxy({ kind, method, url, env = {}, queryPath } = {}) {
  const mount = kind === 'auth' ? '/api/auth' : kind === 'mt' ? '/api/mt' : null;
  if (!mount) return proxyFailure(404, 'Request path is not allowed');

  const extracted = extractForwardPath({ url, mount, queryPath });
  if (!extracted) return proxyFailure(404, 'Request path is not allowed');
  if (extracted.rejectedQuery) return proxyFailure(400, 'Request path is not allowed');

  const envName = kind === 'auth' ? 'AUTH_TARGET_URL' : 'MT_TARGET_URL';
  const upstream = validateUpstreamUrl(env[envName]);
  if (!upstream.ok) return proxyFailure(503, 'Upstream is not configured');

  const allow = kind === 'auth' ? AUTH_ALLOW : MT_ALLOW;
  const match = matchAllowlist(allow, method, extracted.pathname, {
    production: isProductionEnv(env),
  });
  if (!match.ok) {
    if (match.reason === 'faucet-disabled') return proxyFailure(403, 'Faucet is disabled');
    if (match.reason === 'method') return proxyFailure(405, 'Method is not allowed');
    return proxyFailure(404, 'Request path is not allowed');
  }

  const signingPath = extracted.pathname === '/tx' || extracted.pathname === '/faucet';
  if (isSignInLocked(env) && (kind === 'auth' || signingPath)) {
    return proxyFailure(403, 'Sign-in is locked');
  }

  const basePath = upstream.url.pathname.replace(/\/+$/, '');
  const prefix = basePath && basePath !== '/' ? basePath : '';
  const targetPath = `${prefix}${extracted.pathname}`;
  const targetUrl = `${upstream.url.origin}${targetPath}`;
  let check;
  try {
    check = new URL(targetUrl);
  } catch {
    return proxyFailure(400, 'Request path is not allowed');
  }
  if (check.host !== upstream.url.host || check.protocol !== upstream.url.protocol) {
    return proxyFailure(400, 'Request path is not allowed');
  }
  if (check.pathname !== targetPath || check.search || check.username) {
    return proxyFailure(400, 'Request path is not allowed');
  }

  const verb = String(method || '').toUpperCase();
  return {
    ok: true,
    status: 200,
    method: verb,
    targetUrl,
    forwardBody: verb === 'POST',
    maxBody: MAX_PROXY_BODY_BYTES,
  };
}

const FORWARD_REQUEST_HEADERS = new Set(['accept', 'content-type', 'authorization']);

export function pickForwardHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const entries = typeof headers.entries === 'function' ? [...headers.entries()] : Object.entries(headers);
  for (const [key, value] of entries) {
    const lower = String(key).toLowerCase();
    if (!FORWARD_REQUEST_HEADERS.has(lower) || value == null) continue;
    const joined = (Array.isArray(value) ? value.join(', ') : String(value)).trim();
    if (!joined || /[\r\n]/.test(joined)) continue;
    if (lower === 'authorization' && !/^Bearer\s+\S+$/i.test(joined)) continue;
    if (lower === 'content-type' && !/^application\/json(?:\s*;\s*charset=[A-Za-z0-9._-]+)?$/i.test(joined)) continue;
    if (lower === 'accept' && !/^(?:\*\/\*|application\/json)(?:\s*,\s*(?:\*\/\*|application\/json))*$/i.test(joined)) continue;
    out[lower] = joined;
  }
  return out;
}

export const SOLANA_READ_METHODS = Object.freeze(new Set([
  'getBalance',
  'getAccountInfo',
  'getTokenAccountsByOwner',
  'getTokenAccountBalance',
  'getMultipleAccounts',
  'getSlot',
  'getLatestBlockhash',
  'getEpochInfo',
  'getMinimumBalanceForRentExemption',
]));

export function solanaMethodAllowed(method) {
  return SOLANA_READ_METHODS.has(method);
}

export function decideSolanaRpc({ method, bodyText, upstreamConfigured }) {
  if (!upstreamConfigured) return proxyFailure(503, 'Solana RPC adapter is disabled');
  if (String(method || '').toUpperCase() !== 'POST') return proxyFailure(405, 'Method is not allowed');
  let parsed;
  try {
    parsed = JSON.parse(bodyText || '');
  } catch {
    return proxyFailure(400, 'Invalid request');
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  if (calls.length === 0 || calls.length > 8) return proxyFailure(400, 'Invalid request');
  for (const call of calls) {
    if (!call || typeof call.method !== 'string' || !solanaMethodAllowed(call.method)) {
      return proxyFailure(403, 'RPC method is not allowed');
    }
  }
  return { ok: true, status: 200, calls };
}

const MORALIS_ACCOUNT = /^\/account\/mainnet\/[1-9A-HJ-NP-Za-km-z]{32,88}\/tokens$/;
const MORALIS_PRICE = /^\/token\/mainnet\/[1-9A-HJ-NP-Za-km-z]{32,88}\/price$/;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

export function decideMoralisProxy({ method, url, queryPath, hasApiKey }) {
  if (!hasApiKey) return proxyFailure(503, 'Moralis adapter is disabled');
  if (String(method || '').toUpperCase() !== 'GET' && String(method || '').toUpperCase() !== 'HEAD') {
    return proxyFailure(405, 'Method is not allowed');
  }
  const rawUrl = String(url || '/');
  let pathname = rawUrl;
  let search = '';
  const q = rawUrl.indexOf('?');
  if (q !== -1) {
    pathname = rawUrl.slice(0, q);
    search = rawUrl.slice(q + 1);
  }
  if (/^https?:\/\//i.test(pathname)) {
    try {
      const parsed = new URL(rawUrl);
      pathname = parsed.pathname;
      search = parsed.search.slice(1);
    } catch {
      return proxyFailure(404, 'Request path is not allowed');
    }
  }
  const mount = '/api/moralis';
  const mountIdx = pathname.indexOf(mount);
  let rest = mountIdx === -1 ? null : pathname.slice(mountIdx + mount.length) || '/';
  if ((rest === null || rest === '/' || rest === '') && queryPath) {
    const segments = Array.isArray(queryPath) ? queryPath : [queryPath];
    rest = `/${segments.join('/')}`;
  }
  const normalized = normalizeProxyPath(rest || '');
  if (!normalized) return proxyFailure(404, 'Request path is not allowed');

  const params = new URLSearchParams(search);
  if ([...params.keys()].some((key) => key !== 'tokenAddresses')) {
    return proxyFailure(400, 'Request path is not allowed');
  }

  if (MORALIS_ACCOUNT.test(normalized)) {
    const tokenAddresses = params.get('tokenAddresses');
    if (!tokenAddresses || !MINT.test(tokenAddresses) || params.getAll('tokenAddresses').length !== 1) {
      return proxyFailure(400, 'Request path is not allowed');
    }
    return {
      ok: true,
      status: 200,
      upstreamPath: `${normalized}?tokenAddresses=${encodeURIComponent(tokenAddresses)}`,
    };
  }
  if (MORALIS_PRICE.test(normalized)) {
    if ([...params.keys()].length !== 0) return proxyFailure(400, 'Request path is not allowed');
    return { ok: true, status: 200, upstreamPath: normalized };
  }
  return proxyFailure(404, 'Request path is not allowed');
}

/** Remote swap bytes are not checked against the quote, so signing stays off. */
export const JUPITER_SIGNING_ENABLED = false;

export function assertJupiterSigningAllowed() {
  if (!JUPITER_SIGNING_ENABLED) {
    const error = new Error('Swap signing is disabled until returned transaction bytes are validated');
    error.code = 'SWAP_SIGNING_DISABLED';
    throw error;
  }
}
