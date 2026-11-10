import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_ALLOW,
  JUPITER_SIGNING_ENABLED,
  SECURITY_HEADERS,
  assertJupiterSigningAllowed,
  buildLoginRequest,
  buildSignupRequest,
  coerceServiceUrl,
  decideMoralisProxy,
  decideProxy,
  decideSolanaRpc,
  demoAuthAllowed,
  isSignInLocked,
  matchAllowlist,
  normalizeProxyPath,
  pickForwardHeaders,
  resolveAuthTransport,
  solanaMethodAllowed,
  validateUpstreamUrl,
} from '../shared/security-policy.js';

const ADDR = '1'.repeat(44);
const ENV = {
  AUTH_TARGET_URL: 'https://auth.example.com',
  MT_TARGET_URL: 'https://api.example.com',
  SIGNIN_LOCK: 'off',
  VERCEL_ENV: 'development',
  NODE_ENV: 'development',
};

test('demo auth is limited to localhost', () => {
  assert.equal(demoAuthAllowed('localhost'), true);
  assert.equal(demoAuthAllowed('127.0.0.1'), true);
  assert.equal(demoAuthAllowed('::1'), true);
  assert.equal(demoAuthAllowed('t3x-wallet.vercel.app'), false);
  assert.equal(demoAuthAllowed('wallet.futuret3ch.com.au'), false);
  assert.equal(demoAuthAllowed(''), false);
  assert.equal(resolveAuthTransport('t3x-wallet.vercel.app', true), 'remote-or-fail');
  assert.equal(resolveAuthTransport('t3x-wallet.vercel.app', false), 'fail');
  assert.equal(resolveAuthTransport('localhost', false), 'demo');
  assert.equal(resolveAuthTransport('localhost', true), 'remote-or-demo');
});

test('sign-in stays locked unless the flag is explicitly off', () => {
  assert.equal(isSignInLocked({}), true);
  assert.equal(isSignInLocked({ SIGNIN_LOCK: '' }), true);
  assert.equal(isSignInLocked({ VITE_SIGNIN_LOCK: 'yes' }), true);
  assert.equal(isSignInLocked({ SIGNIN_LOCK: 'off' }), false);
  assert.equal(isSignInLocked({ VITE_SIGNIN_LOCK: 'false' }), false);
  assert.equal(isSignInLocked({ VITE_SIGNIN_LOCK: '0' }), false);
});

test('upstreams must be https except localhost', () => {
  assert.equal(validateUpstreamUrl('').ok, false);
  assert.equal(validateUpstreamUrl('http://203.0.113.10:4001').ok, false);
  assert.equal(validateUpstreamUrl('http://example.com').ok, false);
  assert.equal(validateUpstreamUrl('https://user:pass@example.com').ok, false);
  assert.equal(validateUpstreamUrl('https://example.com/path?x=1').ok, false);
  assert.equal(validateUpstreamUrl('https://auth.example.com').ok, true);
  assert.equal(validateUpstreamUrl('http://127.0.0.1:4002').ok, true);
  assert.equal(validateUpstreamUrl('http://localhost:4001').ok, true);
  assert.equal(coerceServiceUrl('http://203.0.113.10:4001'), null);
  assert.equal(coerceServiceUrl('/api/mt'), '/api/mt');
  assert.equal(coerceServiceUrl('localhost:4000'), 'http://localhost:4000');
  assert.equal(coerceServiceUrl('api.example.com'), 'https://api.example.com');
});

test('auth and node proxies allow only known routes and methods', () => {
  const login = decideProxy({
    kind: 'auth',
    method: 'POST',
    url: '/api/auth/login',
    env: ENV,
  });
  assert.equal(login.ok, true);
  assert.equal(login.targetUrl, 'https://auth.example.com/login');
  assert.equal(login.forwardBody, true);

  const missing = decideProxy({
    kind: 'auth',
    method: 'POST',
    url: '/api/auth/login',
    env: { SIGNIN_LOCK: 'off' },
  });
  assert.equal(missing.status, 503);

  const cleartext = decideProxy({
    kind: 'mt',
    method: 'POST',
    url: '/api/mt/tx',
    env: { ...ENV, MT_TARGET_URL: 'http://203.0.113.10:4001' },
  });
  assert.equal(cleartext.status, 503);

  const tx = decideProxy({
    kind: 'mt',
    method: 'POST',
    url: '/api/mt/tx',
    env: ENV,
  });
  assert.equal(tx.ok, true);
  assert.equal(tx.targetUrl, 'https://api.example.com/tx');

  const read = decideProxy({
    kind: 'mt',
    method: 'GET',
    url: `/api/mt/account/${ADDR}`,
    env: { ...ENV, SIGNIN_LOCK: '' },
  });
  assert.equal(read.ok, true);

  assert.equal(decideProxy({ kind: 'mt', method: 'POST', url: '/api/mt/admin', env: ENV }).status, 404);
  assert.equal(decideProxy({ kind: 'mt', method: 'GET', url: '/api/mt/tx', env: ENV }).status, 405);
  assert.equal(decideProxy({ kind: 'auth', method: 'POST', url: '/api/auth/login?next=https://evil.test', env: ENV }).status, 400);
  assert.equal(decideProxy({ kind: 'mt', method: 'GET', url: '/api/mt/account/../../etc', env: ENV }).status, 404);
  assert.equal(decideProxy({ kind: 'auth', method: 'DELETE', url: '/api/auth/wallets/backup', env: ENV }).status, 405);
  assert.equal(decideProxy({ kind: 'auth', method: 'DELETE', url: '/api/auth/wallets/wallet_123', env: ENV }).ok, true);

  const lockedTx = decideProxy({
    kind: 'mt',
    method: 'POST',
    url: '/api/mt/tx',
    env: { ...ENV, SIGNIN_LOCK: undefined, VITE_SIGNIN_LOCK: undefined },
  });
  assert.equal(lockedTx.status, 403);

  const lockedLogin = decideProxy({
    kind: 'auth',
    method: 'POST',
    url: '/api/auth/login',
    env: { AUTH_TARGET_URL: ENV.AUTH_TARGET_URL },
  });
  assert.equal(lockedLogin.status, 403);
});

test('faucet is excluded in production and while sign-in is locked', () => {
  const open = decideProxy({
    kind: 'mt',
    method: 'POST',
    url: '/api/mt/faucet',
    env: ENV,
  });
  assert.equal(open.ok, true);

  const production = decideProxy({
    kind: 'mt',
    method: 'POST',
    url: '/api/mt/faucet',
    env: { ...ENV, VERCEL_ENV: 'production' },
  });
  assert.equal(production.status, 403);
  assert.equal(production.error, 'Faucet is disabled');

  const nodeProd = decideProxy({
    kind: 'mt',
    method: 'POST',
    url: '/api/mt/faucet',
    env: { ...ENV, NODE_ENV: 'production', VERCEL_ENV: 'preview' },
  });
  assert.equal(nodeProd.status, 403);

  assert.equal(matchAllowlist(AUTH_ALLOW, 'PUT', '/login').reason, 'method');
  assert.equal(matchAllowlist(AUTH_ALLOW, 'GET', '/not-a-route').reason, 'not-allowed');
});

test('request headers are an allowlist', () => {
  const headers = pickForwardHeaders({
    Host: 'wallet.example',
    Cookie: 'session=secret',
    'X-Api-Key': 'nope',
    Authorization: 'Bearer local-token',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Forwarded-For': '203.0.113.8',
  });
  assert.deepEqual(headers, {
    authorization: 'Bearer local-token',
    'content-type': 'application/json',
    accept: 'application/json',
  });
  assert.deepEqual(pickForwardHeaders({ Authorization: 'Basic abc' }), {});
  assert.deepEqual(pickForwardHeaders({ Authorization: 'Bearer bad\nvalue' }), {});
});

test('solana adapter is disabled without config and rejects writes', () => {
  assert.equal(decideSolanaRpc({ method: 'POST', bodyText: '{}', upstreamConfigured: false }).status, 503);
  const ok = decideSolanaRpc({
    method: 'POST',
    upstreamConfigured: true,
    bodyText: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [ADDR] }),
  });
  assert.equal(ok.ok, true);
  const send = decideSolanaRpc({
    method: 'POST',
    upstreamConfigured: true,
    bodyText: JSON.stringify({ method: 'sendTransaction', params: [] }),
  });
  assert.equal(send.status, 403);
  assert.equal(solanaMethodAllowed('requestAirdrop'), false);
  assert.equal(decideSolanaRpc({ method: 'GET', upstreamConfigured: true, bodyText: '{}' }).status, 405);
});

test('moralis adapter is disabled without a server key and only allows reads', () => {
  const mint = 'ELywDcVX2WumHm4xEfqF8NdEKaeGCAaq9JmwtjE8pump';
  assert.equal(decideMoralisProxy({ method: 'GET', url: `/api/moralis/token/mainnet/${mint}/price`, hasApiKey: false }).status, 503);
  const price = decideMoralisProxy({
    method: 'GET',
    url: `/api/moralis/token/mainnet/${mint}/price`,
    hasApiKey: true,
  });
  assert.equal(price.ok, true);
  assert.equal(price.upstreamPath, `/token/mainnet/${mint}/price`);
  const balance = decideMoralisProxy({
    method: 'GET',
    url: `/api/moralis/account/mainnet/${ADDR}/tokens?tokenAddresses=${mint}`,
    hasApiKey: true,
  });
  assert.equal(balance.ok, true);
  assert.equal(decideMoralisProxy({
    method: 'POST',
    url: `/api/moralis/token/mainnet/${mint}/price`,
    hasApiKey: true,
  }).status, 405);
  assert.equal(decideMoralisProxy({
    method: 'GET',
    url: `/api/moralis/account/mainnet/${ADDR}/tokens?tokenAddresses=${mint}&apiKey=nope`,
    hasApiKey: true,
  }).status, 400);
  assert.equal(normalizeProxyPath('/../auth'), null);
});

test('auth request bodies do not grow a vault-passphrase field', () => {
  assert.deepEqual(Object.keys(buildLoginRequest('a@b.c', 'account-secret')), ['emailOrPhone', 'password']);
  assert.deepEqual(Object.keys(buildSignupRequest('a@b.c', '+100', 'account-secret')), ['email', 'phone', 'password']);
  assert.equal(buildLoginRequest.length, 2);
  assert.equal(buildSignupRequest.length, 3);
});

test('jupiter signing stays disabled and responses deny framing', () => {
  assert.equal(JUPITER_SIGNING_ENABLED, false);
  assert.throws(() => assertJupiterSigningAllowed(), /validated/);
  assert.match(SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(SECURITY_HEADERS['Content-Security-Policy'], /script-src 'self'/);
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
});
