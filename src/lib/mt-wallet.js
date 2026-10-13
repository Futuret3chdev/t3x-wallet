/**
 * INFINITE WALLET - Secure client-side wallet engine for MT-ECO SYSTEM (developed by Futuret3ch and MemeTorrent)
 * - Zero third-party auth (local only)
 * - Keys NEVER leave the browser
 * - Compatible with mt-core (ed25519 + tweetnacl + bs58 + JSON tx)
 * - Uses BIP39 mnemonic for recovery
 * - Encrypted at rest with user password (Web Crypto AES-GCM + PBKDF2)
 */

import * as bip39 from 'bip39';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// MT Node (local dev by default - later configurable / prod endpoint)
// On Vercel/live we default to null (no public node), but user can set a custom one in Settings
// (e.g. their deployed mt-core on Render/Railway, or localhost when testing locally).
// NOTE: always use getMTNode() at call time so custom settings + VITE_MT_NODE_URL apply without reload.
// The old MT_NODE const is kept for a few legacy references but getMTNode() is the source of truth.
export const MT_NODE = (() => {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const local = localStorage.getItem('mt_custom_mt_node');
  if (local) return local;
  // Also respect build-time default here for the const
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MT_NODE_URL) {
      return import.meta.env.VITE_MT_NODE_URL;
    }
  } catch (_) {}
  if (window.location.hostname.includes('vercel.app')) return null;
  return 'http://localhost:4000';
})();

export function getDefaultMTNode() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.VITE_MT_NODE_URL || null;
    }
  } catch (_) {}
  return null;
}

export function getDefaultAuthURL() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.VITE_AUTH_URL || null;
    }
  } catch (_) {}
  return null;
}

export function getMTNode() {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const fromEnv = getDefaultMTNode();
  // Respect VITE_MT_NODE_URL even if relative (e.g. /api/mt for Vercel serverless proxy fallback)
  // or http/https. This allows documented use of VITE=/api/mt (shows in UI, routes via vercel fn)
  // while still defaulting to direct https subdomains on prod hosts when no VITE is set.
  if (fromEnv) {
    if (fromEnv.startsWith('/')) return fromEnv; // relative base like /api/mt
    if (/^https?:\/\//i.test(fromEnv)) {
      // Safety: never let MT node point at the auth subdomain (common misconfig of VITE vars)
      if (fromEnv.includes('auth.futuret3ch.com.au')) {
        console.error('[mt-wallet] VITE_MT_NODE_URL is pointing at auth subdomain! Forcing correct api. Fix your Vercel env var.');
        return 'https://api.futuret3ch.com.au';
      }
      return fromEnv;
    }
    // bare host? prefix http for safety
    return 'http://' + fromEnv;
  }
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isVercelOrCustom = hostname.includes('vercel.app') || hostname.endsWith('futuret3ch.com.au');
  // On production (Vercel or our custom domains for the *wallet*), default to the co-located Vercel
  // serverless proxy (/api/mt). This is the key for "sign in and everything works when launching
  // the wallet from the marketing site". No separate api subdomain or mixed content issues.
  // The /api/mt function (in this same Vercel project) forwards to your live mt-core.
  // Override by setting VITE_MT_NODE_URL (full https://... or /api/mt) in Vercel, or use Settings/localStorage.
  if (isVercelOrCustom) {
    return '/api/mt'; // same-origin Vercel function proxy -> VPS mt-core (no mixed content, sign-in ready)
  }
  let local = localStorage.getItem('mt_custom_mt_node');
  if (local) {
    local = local.trim().replace(/\.+$/, '');
    if (local && !/^https?:\/\//i.test(local)) {
      local = 'http://' + local;
    }
    if (local !== localStorage.getItem('mt_custom_mt_node')) {
      // clean up storage
      localStorage.setItem('mt_custom_mt_node', local);
    }
    return local;
  }
  return 'http://localhost:4000';
}

export function setMTNode(url) {
  if (typeof window === 'undefined') return;
  let trimmed = (url || '').trim().replace(/\.+$/, ''); // strip trailing dots (common copy-paste error)
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  if (trimmed) {
    localStorage.setItem('mt_custom_mt_node', trimmed);
  } else {
    localStorage.removeItem('mt_custom_mt_node');
  }
}

// Auth service (for email/phone accounts + cross-device encrypted wallet backup)
// Supports custom URL via localStorage 'mt_custom_auth_url' (for local dev pointing to remote mt-auth)
export function getAuthURL() {
  if (typeof window === 'undefined') return 'http://localhost:4001';
  const fromEnv = getDefaultAuthURL();
  // Respect VITE_AUTH_URL even if relative (e.g. /api/auth) or http/https.
  if (fromEnv) {
    if (fromEnv.startsWith('/')) return fromEnv;
    if (/^https?:\/\//i.test(fromEnv)) {
      // Safety: never let auth URL point at the api (MT) subdomain
      if (fromEnv.includes('api.futuret3ch.com.au')) {
        console.error('[mt-wallet] VITE_AUTH_URL is pointing at api subdomain! Forcing correct auth. Fix your Vercel env var.');
        return 'https://auth.futuret3ch.com.au';
      }
      return fromEnv;
    }
    return 'http://' + fromEnv;
  }
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isVercelOrCustom = hostname.includes('vercel.app') || hostname.endsWith('futuret3ch.com.au');
  // On production (Vercel or our custom domains for the *wallet*), default to the co-located Vercel
  // serverless proxy (/api/auth). This makes email/phone sign-in (signup, login, verify, cross-device
  // encrypted wallet restore) work immediately for visitors arriving from the marketing site links.
  // Override via VITE_AUTH_URL=https://... in the Vercel infinite-wallet project (or localStorage in Settings).
  if (isVercelOrCustom) {
    return '/api/auth'; // same-origin Vercel function proxy -> VPS mt-auth (no mixed content, sign-in ready)
  }
  let local = localStorage.getItem('mt_custom_auth_url');
  if (local) {
    local = local.trim().replace(/\.+$/, '');
    if (local) {
      if (!/^https?:\/\//i.test(local)) local = 'http://' + local;
      if (local !== localStorage.getItem('mt_custom_auth_url')) {
        localStorage.setItem('mt_custom_auth_url', local);
      }
    }
    return local;
  }
  return 'http://localhost:4001';
}

export function setAuthURL(url) {
  if (typeof window === 'undefined') return;
  let trimmed = (url || '').trim().replace(/\.+$/, ''); // strip trailing dots
  if (trimmed) {
    localStorage.setItem('mt_custom_auth_url', trimmed);
  } else {
    localStorage.removeItem('mt_custom_auth_url');
  }
}

// Legacy const for any old references (uses getter)
export const AUTH_URL = getAuthURL();

// Fixed ultra-low fee (marketed as ~1 cent SOL equivalent)
export const MT_TX_FEE = 0.01;

// Derive MT keypair from 32-byte seed (mnemonic -> seed[0:32])
export function deriveMTKeypairFromSeed(seed) {
  const secretKey = seed.slice(0, 32);
  const keypair = nacl.sign.keyPair.fromSeed(secretKey);
  return {
    publicKey: bs58.encode(keypair.publicKey),
    secretKey: bs58.encode(keypair.secretKey),
  };
}

// Full wallet creation from mnemonic
export function createMTWalletFromMnemonic(mnemonic) {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic');
  }
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const kp = deriveMTKeypairFromSeed(seed);
  return {
    mnemonic,
    ...kp,
    // Also expose a Solana-compatible view (same curve, first 32 seed)
    solanaSeed: seed.slice(0, 32),
  };
}

// Generate fresh secure mnemonic + wallet
export function generateMTWallet() {
  const mnemonic = bip39.generateMnemonic(128); // 12 words
  return createMTWalletFromMnemonic(mnemonic);
}

// Import from mnemonic phrase
export function importMTWalletFromMnemonic(mnemonic) {
  const clean = mnemonic.trim().toLowerCase();
  return createMTWalletFromMnemonic(clean);
}

// Sign any tx object (must match server verify: JSON.stringify(tx) )
export function signMTTx(tx, secretKey58) {
  const secretKey = bs58.decode(secretKey58);
  const message = Buffer.from(JSON.stringify(tx));
  const signature = nacl.sign.detached(message, secretKey);
  return bs58.encode(signature);
}

// Verify locally (for UI preview)
export function verifyMTTx(tx, signature58, publicKey58) {
  const message = Buffer.from(JSON.stringify(tx));
  return nacl.sign.detached.verify(
    message,
    bs58.decode(signature58),
    bs58.decode(publicKey58)
  );
}

/**
 * Secure Vault (localStorage encrypted)
 * We only persist: { version:1, salt, iv, ciphertext } where ciphertext = AES-GCM( mnemonic )
 * The password is never stored. User must remember it to unlock.
 */
const VAULT_KEY = 'mt_vault_v1';

export async function hasVault() {
  return !!localStorage.getItem(VAULT_KEY);
}

function getRandomBytes(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 210000, // strong
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMnemonic(mnemonic, password) {
  const enc = new TextEncoder();
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(mnemonic)
  );

  const payload = {
    v: 1,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
  return JSON.stringify(payload);
}

export async function decryptMnemonic(encryptedPayload, password) {
  const { salt, iv, ct } = JSON.parse(encryptedPayload);
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const ctBytes = Uint8Array.from(atob(ct), c => c.charCodeAt(0));

  const key = await deriveKey(password, saltBytes);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ctBytes
  );
  return new TextDecoder().decode(plain);
}

export async function saveVault(mnemonic, password) {
  const encrypted = await encryptMnemonic(mnemonic, password);
  localStorage.setItem(VAULT_KEY, encrypted);
}

export async function unlockVault(password) {
  const payload = localStorage.getItem(VAULT_KEY);
  if (!payload) throw new Error('No vault found');
  const mnemonic = await decryptMnemonic(payload, password);
  return importMTWalletFromMnemonic(mnemonic);
}

export function lockVault() {
  // Just clear in-memory; vault stays on disk
  // Caller should clear any decrypted state
}

export function deleteVault() {
  localStorage.removeItem(VAULT_KEY);
}

/**
 * Node API helpers (MT native chain)
 */
export async function fetchMTBalance(address) {
  let node = getMTNode();
  if (!node) return { balance: 0, nonce: 0 };
  // ensure clean URL (defensive)
  node = node.replace(/\.+$/, '').replace(/\/+$/, '');
  try {
    const res = await fetch(`${node}/account/${address}`);
    if (!res.ok) return { balance: 0, nonce: 0 };
    const data = await res.json();
    return { balance: Number(data.balance || 0), nonce: Number(data.nonce || 0) };
  } catch (e) {
    console.warn('MT node unavailable, using 0', e);
    return { balance: 0, nonce: 0 };
  }
}

export async function fetchMTNFTs(owner) {
  let node = getMTNode();
  if (!node) return [];
  node = node.replace(/\.+$/, '').replace(/\/+$/, '');
  try {
    const res = await fetch(`${node}/nfts/${owner}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchMTTxs(address) {
  let node = getMTNode();
  if (!node) return [];
  node = node.replace(/\.+$/, '').replace(/\/+$/, '');
  try {
    const res = await fetch(`${node}/explorer/txs/${address}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Submit signed MT transaction
 */
export async function submitMTTx(unsignedTx, signature) {
  let node = getMTNode();
  if (!node) throw new Error('Native MT node not configured (demo mode)');
  node = node.replace(/\.+$/, '').replace(/\/+$/, '');
  const body = { ...unsignedTx, signature };
  const res = await fetch(`${node}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Safe parse: detect HTML (SPA index.html or nginx error page) which produces the "Unexpected token '<'" error on mint
  const text = await res.text();
  let json = null;
  const ct = (res.headers.get && res.headers.get('content-type')) || '';
  const trimmed = (text || '').trim();
  if (ct.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { json = JSON.parse(text); } catch (_) { json = null; }
  }
  if (!res.ok || (json && json.error)) {
    const errDetail = (json && json.error) ||
      (res.status === 413
        ? `Payload too large (413). The NFT metadata (especially the image data URL) is too big for the server limit. Use a smaller image (the designer produces tiny ones; uploads limited to ~500KB in UI). Or increase client_max_body_size in nginx and bodyParser limit in mt-core.`
        : (trimmed.startsWith('<!') || trimmed.startsWith('<html')
            ? `server at ${node} returned HTML (status ${res.status}) instead of JSON. This usually means the fetch URL resolved to the wallet frontend (SPA catch-all) or a misconfigured proxy instead of the MT core API. Check: 1) VITE_MT_NODE_URL in Vercel is set to https://api.futuret3ch.com.au (or /api/mt), 2) curl -v https://api.futuret3ch.com.au/tx or /health returns JSON (not 403/404/HTML), 3) nginx on VPS has active api.futuret3ch.com.au block proxying to correct mt-core port.`
            : (text || 'Transaction failed')));
    throw new Error(errDetail);
  }
  return json || { ok: true };
}

/**
 * Request test MT from the configured node faucet (your own node).
 * Gives the wallet 1000 MT instantly so you can test sends, NFT mints, etc.
 */
export async function requestTestFunds(address) {
  if (!address) throw new Error('No address');
  let node = getMTNode();
  if (!node) throw new Error('Faucet only available when a MT node is configured in Settings');
  node = node.replace(/\.+$/, '').replace(/\/+$/, '');
  const res = await fetch(`${node}/faucet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const text = await res.text();
  let json = null;
  const ct = (res.headers.get && res.headers.get('content-type')) || '';
  const trimmed = (text || '').trim();
  if (ct.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { json = JSON.parse(text); } catch (_) { json = null; }
  }
  if (!res.ok || (json && json.error)) {
    const errDetail = (json && json.error) ||
      (trimmed.startsWith('<!') || trimmed.startsWith('<html')
        ? `server at ${node} returned HTML (status ${res.status}) instead of JSON (faucet). Check VITE_MT_NODE_URL and that the MT API host serves JSON (see submitMTTx for debug steps).`
        : (text || 'Faucet request failed'));
    throw new Error(errDetail);
  }
  return json || { ok: true };
}

/**
 * Helper to build + sign + submit a transfer
 */
export async function sendMT(fromWallet, toAddress, amount, currentNonce) {
  if (!fromWallet || !fromWallet.secretKey) throw new Error('Wallet not unlocked');
  if (!toAddress || amount <= 0) throw new Error('Invalid send params');

  const tx = {
    from: fromWallet.publicKey,
    to: toAddress.trim(),
    amount: Number(amount),
    nonce: currentNonce,
    type: 'TRANSFER',
    fee: MT_TX_FEE,
    timestamp: Date.now(),
  };

  const signature = signMTTx(tx, fromWallet.secretKey);
  // Verify locally before submit (defense in depth)
  const ok = verifyMTTx(tx, signature, fromWallet.publicKey);
  if (!ok) throw new Error('Local signature verification failed');

  return submitMTTx(tx, signature);
}

/**
 * Solana $MT (SPL) helpers - for current holdings + future bridge
 */
import { 
  Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, 
  VersionedTransaction, Transaction 
} from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

// Prioritized Solana mainnet RPCs for reliable $MT (SPL) and SOL balance reads + swaps.
// Exactly the ones the user provided (Helius first, then QuickNode, then public mainnet).
// Custom RPC in Settings (or VITE_SOLANA_RPC_URL build-time default) overrides the entire list.
// We intentionally avoid flaky public endpoints that can return ERR_CERT_AUTHORITY_INVALID.
// Updated to ensure live site uses reliable paths for the funded wallet 63NQwG9Y...
const SOLANA_RPCS = [
  'https://mainnet.helius-rpc.com/?api-key=61a3cb76-ffd8-4dde-bb49-35cae29566c8', // Helius first (user's working key)
  'https://billowing-multi-grass.solana-mainnet.quiknode.pro/aa4bc2cb96a4abb5cc363c8bbeec7f8ebde29dce', // user's QuickNode
  'https://api.mainnet-beta.solana.com', // public last resort
];

// Domains known to cause ERR_CERT_AUTHORITY_INVALID in some browsers/networks.
// We filter them out at runtime to prevent repeated failed requests and console spam.
const BAD_RPC_DOMAINS = ['solana.public-rpc.com', 'public-rpc.com'];

function getUsableRpcs() {
  const custom = getCustomSolanaRpc();
  if (custom) {
    return [custom];
  }
  return SOLANA_RPCS.filter(rpc => !BAD_RPC_DOMAINS.some(bad => rpc.includes(bad)));
}

const SOL_MT_MINT = new PublicKey('ELywDcVX2WumHm4xEfqF8NdEKaeGCAaq9JmwtjE8pump');

let _solConnection = null;
let _currentRpcIndex = 0;

// Simple in-memory cache for Solana balances to avoid hammering RPCs (keyed by address)
const _solBalanceCache = new Map(); // addr -> {balance, ts}
const CACHE_TTL_MS = 15000; // 15s cache for balances

// Prevent log spam on repeated failures for the same address
const _lastWarnTime = new Map(); // addr -> timestamp
const WARN_COOLDOWN_MS = 30000; // only warn once every 30s per address

export function clearSolanaBalanceCache() {
  _solBalanceCache.clear();
}

export function getSolConnection() {
  const usable = getUsableRpcs();
  const custom = getCustomSolanaRpc();
  let rpc;
  if (custom) {
    rpc = custom;
  } else {
    // make sure index is within usable
    const idx = Math.min(_currentRpcIndex, usable.length - 1);
    rpc = usable[idx] || usable[0];
  }
  if (!_solConnection || _solConnection.rpcEndpoint !== rpc) {
    _solConnection = new Connection(rpc, 'confirmed');
  }
  return _solConnection;
}

function switchToNextSolanaRpc() {
  if (getCustomSolanaRpc()) {
    // if user set custom (or VITE_SOLANA_RPC_URL default), don't auto-switch the list
    return;
  }
  const usable = getUsableRpcs();
  _currentRpcIndex = (_currentRpcIndex + 1) % usable.length;
  _solConnection = null; // force recreate
  // Only log switch at warn level occasionally to avoid console spam
  console.warn('Switched Solana RPC due to error, now using', usable[_currentRpcIndex]);
}

export function getDefaultSolanaRpc() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.VITE_SOLANA_RPC_URL || null;
    }
  } catch (_) {}
  return null;
}

export function getCustomSolanaRpc() {
  if (typeof window === 'undefined') return null;
  const local = localStorage.getItem('mt_custom_solana_rpc');
  if (local) return local;
  return getDefaultSolanaRpc();
}

export function setCustomSolanaRpc(url) {
  if (typeof window === 'undefined') return;
  const trimmed = (url || '').trim();
  if (trimmed) {
    localStorage.setItem('mt_custom_solana_rpc', trimmed);
  } else {
    localStorage.removeItem('mt_custom_solana_rpc');
  }
  _solConnection = null; // force new connection on next use
  _currentRpcIndex = 0;
}

// Moralis integration for reliable Solana $MT balances and price (user's bot key works well)
// 
// The key can be provided in two ways:
// 1. Build-time (recommended for live public site): set VITE_MORALIS_API_KEY env var on your hosting platform (Vercel etc).
//    It gets baked into the client bundle (visible to anyone who inspects the JS — same exposure as before).
// 2. Per-browser override: user pastes in Settings → saved to localStorage.
//
// getMoralisApiKey() always returns the effective key (local override wins, else the build-time default).
// WARNING: exposing API key in client is not ideal for prod (rate limits, security). 
// Prefer a backend proxy + your own endpoint for real production.
export function getDefaultMoralisApiKey() {
  try {
    // Vite statically replaces import.meta.env.VITE_* at build time for the client bundle.
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const fromEnv = import.meta.env.VITE_MORALIS_API_KEY;
      if (fromEnv) return fromEnv;
    }
  } catch (_) {}
  // Hardcoded fallback using the user's working key so the live demo site always has reliable $MT SPL balance
  // (same key that makes the game display work). This is public in the bundle for demo purposes.
  return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6Ijg0NGJkOGI0LTUxNzItNDkxNy05ZjY1LTkwMzUzOTQ3OWYwZiIsIm9yZ0lkIjoiNDY0NjAwIiwidXNlcklkIjoiNDc3OTc2IiwidHlwZUlkIjoiZGUyM2Y5NWYtMTgzOS00N2M2LTg0ZWEtNzUxMDM3YmYxMjMyIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ5Mzc4MzUsImV4cCI6NDkxMDY5NzgzNX0.ALS9nRVEt8sI2WWiSnSf7aj63McPfxDSTnrJXPEcS_A";
}

export function getMoralisApiKey() {
  if (typeof window === 'undefined') return null;
  const local = localStorage.getItem('mt_moralis_api_key');
  if (local) return local;
  return getDefaultMoralisApiKey();
}

export function setMoralisApiKey(key) {
  if (typeof window === 'undefined') return;
  const trimmed = (key || '').trim();
  if (trimmed) {
    localStorage.setItem('mt_moralis_api_key', trimmed);
  } else {
    localStorage.removeItem('mt_moralis_api_key');
  }
}

const MORALIS_SOLANA_GATEWAY = 'https://solana-gateway.moralis.io';
const MORALIS_DEEP_INDEX = 'https://deep-index.moralis.io/api/v2.2';

export async function fetchSolanaMTBalanceMoralis(solanaPublicKeyStr, moralisKey) {
  if (!moralisKey) return null;
  try {
    const url = `${MORALIS_SOLANA_GATEWAY}/account/mainnet/${solanaPublicKeyStr}/tokens?tokenAddresses=${SOL_MT_MINT.toBase58()}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Api-Key': moralisKey }
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('Moralis balance error', res.status, text);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const token = data[0];
      // Moralis response uses "amount" / "amountRaw" (not "balance") in recent API.
      // Fall back to "balance" for compatibility. Use amountRaw when present for precision.
      const raw = token.amountRaw || token.balance || token.amount || '0';
      const dec = token.decimals || 6;
      return Number(raw) / Math.pow(10, dec);
    }
    return 0;
  } catch (e) {
    console.warn('Moralis balance fetch failed', e.message);
    return null;
  }
}

export async function fetchTokenPriceMoralis(moralisKey) {
  if (!moralisKey) return null;
  try {
    const url = `${MORALIS_SOLANA_GATEWAY}/token/mainnet/${SOL_MT_MINT.toBase58()}/price`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Api-Key': moralisKey }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      price: parseFloat(data.usdPrice || 0),
      name: data.name,
      symbol: data.symbol,
    };
  } catch (e) {
    console.warn('Moralis price fetch failed', e.message);
    return null;
  }
}

export async function fetchSolanaMTBalance(solanaPublicKeyStr) {
  // Check cache first
  const cached = _solBalanceCache.get(solanaPublicKeyStr);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return cached.balance;
  }

  const moralisKey = getMoralisApiKey();
  if (moralisKey) {
    const bal = await fetchSolanaMTBalanceMoralis(solanaPublicKeyStr, moralisKey);
    if (bal !== null) {
      _solBalanceCache.set(solanaPublicKeyStr, { balance: bal, ts: Date.now() });
      return bal;
    }
    // fall through to RPC if Moralis failed
  }

  // Try RPCs in priority order. Switch on ANY error (403, rate limit, cert issues, network, "failed to fetch", etc.)
  // This prevents hammering a single bad/flaky RPC (e.g. ones that throw ERR_CERT_AUTHORITY_INVALID).
  const usableRpcsForLoop = getUsableRpcs();
  for (let rpcAttempt = 0; rpcAttempt < usableRpcsForLoop.length; rpcAttempt++) {
    try {
      const conn = getSolConnection();
      const owner = new PublicKey(solanaPublicKeyStr);
      const ata = await getAssociatedTokenAddress(SOL_MT_MINT, owner);
      const account = await getAccount(conn, ata);
      const decimals = 6;
      const balance = Number(account.amount) / 10 ** decimals;
      _solBalanceCache.set(solanaPublicKeyStr, { balance, ts: Date.now() });
      return balance;
    } catch (e) {
      const msg = (e.message || '').toLowerCase() + ' ' + (e.toString?.() || '');
      const shouldSwitch = msg.includes('403') || msg.includes('forbidden') || msg.includes('api key') ||
                           msg.includes('failed to fetch') || msg.includes('network') || msg.includes('cert') ||
                           msg.includes('timeout') || msg.includes('invalid') || msg.includes('abort');

      if (shouldSwitch && !getCustomSolanaRpc()) {
        switchToNextSolanaRpc();
      }

      // Fallback to getTokenAccountsByOwner (useful when ATA doesn't exist yet or for some RPCs)
      try {
        const conn = getSolConnection();
        const owner = new PublicKey(solanaPublicKeyStr);
        const res = await conn.getTokenAccountsByOwner(owner, { mint: SOL_MT_MINT });
        if (res.value.length > 0) {
          const pubkey = res.value[0].pubkey;
          const account = await getAccount(conn, pubkey);
          const decimals = 6;
          const balance = Number(account.amount) / 10 ** decimals;
          _solBalanceCache.set(solanaPublicKeyStr, { balance, ts: Date.now() });
          return balance;
        }
        // No token account = 0 balance for this mint
        return 0;
      } catch (e2) {
        if (!getCustomSolanaRpc()) {
          switchToNextSolanaRpc();
        }
        const now = Date.now();
        const last = _lastWarnTime.get(solanaPublicKeyStr) || 0;
        if (now - last > WARN_COOLDOWN_MS) {
          _lastWarnTime.set(solanaPublicKeyStr, now);
          console.warn('Solana $MT balance fetch failed for', solanaPublicKeyStr, e2.message || e.message);
        }
      }
    }
  }
  return 0;
}

export async function fetchSolanaSOLBalance(solanaPublicKeyStr) {
  const cacheKey = 'sol:' + solanaPublicKeyStr;
  const cached = _solBalanceCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return cached.balance;
  }

  const usableRpcsForLoop = getUsableRpcs();
  for (let rpcAttempt = 0; rpcAttempt < usableRpcsForLoop.length; rpcAttempt++) {
    try {
      const conn = getSolConnection();
      const lamports = await conn.getBalance(new PublicKey(solanaPublicKeyStr));
      const bal = lamports / LAMPORTS_PER_SOL;
      _solBalanceCache.set(cacheKey, { balance: bal, ts: Date.now() });
      return bal;
    } catch (e) {
      const msg = (e.message || '').toLowerCase() + ' ' + (e.toString?.() || '');
      const shouldSwitch = msg.includes('403') || msg.includes('forbidden') || msg.includes('api key') ||
                           msg.includes('failed to fetch') || msg.includes('network') || msg.includes('cert') ||
                           msg.includes('timeout') || msg.includes('invalid');

      if (shouldSwitch && !getCustomSolanaRpc()) {
        switchToNextSolanaRpc();
      }
      // continue to try next RPC instead of immediately returning 0
    }
  }
  return 0;
}

// Derive Solana Keypair (and address) from the same seed used for MT
export function deriveSolanaKeypairFromSeed(seed32) {
  const kp = Keypair.fromSeed(seed32);
  return {
    publicKey: kp.publicKey.toBase58(),
    keypair: kp, // only for advanced signing if needed in future
  };
}

/**
 * ============================================
 * AUTH + MULTI-WALLET (email/phone accounts + cross device)
 * ============================================
 * - Signup with email + phone + password
 * - Login anywhere
 * - Multiple wallets per account
 * - Encrypted backups stored on our self-built auth service
 * - Client always decrypts with the user's password
 */

const AUTH_TOKEN_KEY = 'mt_auth_token';
const USER_PROFILE_KEY = 'mt_user_profile';
const LOCAL_WALLETS_KEY = 'mt_local_wallets_v2'; // supports multiple

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_PROFILE_KEY);
  // keep local wallets or clear? keep for offline
}

export function getUserProfile() {
  try {
    return JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveUserProfile(profile) {
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Local multi-wallet storage (encrypted blobs)
 */
export function getLocalWallets() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_WALLETS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalWallets(wallets) {
  localStorage.setItem(LOCAL_WALLETS_KEY, JSON.stringify(wallets));
}

export function addOrUpdateLocalWallet(walletEntry) {
  const list = getLocalWallets();
  let idx = list.findIndex(w => w.id === walletEntry.id);
  if (idx < 0 && walletEntry.publicKey) {
    // Dedup by address too (prevents duplicate entries when re-importing the same seed/account)
    idx = list.findIndex(w => w.publicKey === walletEntry.publicKey || w.address === walletEntry.publicKey);
  }
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...walletEntry };
  } else {
    list.push(walletEntry);
  }
  saveLocalWallets(list);
  return list;
}

export function removeLocalWallet(id) {
  const list = getLocalWallets().filter(w => w.id !== id);
  saveLocalWallets(list);
  return list;
}

/**
 * AUTH API CALLS
 */
async function authFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let authBase = getAuthURL();

  // Handle vercel proxy base (relative /api/auth)
  if (authBase && authBase.startsWith('/')) {
    const origin = (typeof window !== 'undefined' && window.location.origin) || 'https://wallet.futuret3ch.com.au';
    authBase = origin + authBase;
  }

  if (!authBase) {
    return getDemoAuthResponse(path, options);
  }

  try {
    const res = await fetch(`${authBase}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Auth request failed');
    return data;
  } catch (e) {
    const isProdTarget = typeof authBase === 'string' && (authBase.includes('futuret3ch.com.au') || authBase.includes('https://'));
    if (isProdTarget) {
      // On production custom domain or any https target, never silently fall back to browser-local demo data.
      // Doing so would hide the user's real per-userId encrypted wallets from mt-auth.
      // Let the caller (loadMyWallets etc) surface the failure cleanly (sets [] + warning).
      console.error('Prod auth call failed, NOT falling back to demo (wallets would appear to disappear):', authBase, e?.message || e);
      throw e;
    }
    // Only demo for true local/dev cases where no real authBase was configured.
    return getDemoAuthResponse(path, options);
  }
}

function getDemoAuthResponse(path, options) {
  // DEMO FALLBACK only for local/dev or when no real auth target is configured (see authFetch guards).
  // On any prod target (futuret3ch / https) we intentionally do NOT call this on fetch failure — prevents "wallets disappearing".
  if (path === '/signup') {
    const { email, phone } = JSON.parse(options.body || '{}');
    const demoCode = '123456'; // always works in demo
    return { ok: true, message: 'Demo account created', demoVerificationCode: demoCode, needsVerification: true };
  }
  if (path === '/verify') {
    const demoToken = 'demo_' + Date.now();
    const demoUser = { id: 'demo', email: 'demo@mt', phone: '+10000000000' };
    return { ok: true, token: demoToken, user: demoUser };
  }
  if (path === '/login') {
    const demoToken = 'demo_' + Date.now();
    const demoUser = { id: 'demo', email: 'demo@mt', phone: '+10000000000' };
    return { ok: true, token: demoToken, user: demoUser };
  }
  if (path === '/me') {
    return { id: 'demo', email: 'demo@mt.local', phone: '+10000000000' };
  }
  if (path === '/wallets') {
    const key = 'demo_wallets_v2';
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) { return []; }
  }
  if (path === '/wallets/backup') {
    const body = JSON.parse(options.body || '{}');
    const key = 'demo_wallets_v2';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    const existingIdx = list.findIndex(w => w.name === body.name && w.address === body.address);
    const entry = {
      id: 'demo_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      name: body.name,
      encryptedData: body.encryptedData,
      address: body.address || null,
      solanaPublicKey: body.solanaPublicKey || null,
      color: body.color || '#10b981',
      createdAt: Date.now(),
    };
    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }
    localStorage.setItem(key, JSON.stringify(list));
    return { ok: true, wallet: entry };
  }
  if (path.startsWith('/wallets/') && options.method === 'DELETE') {
    const id = path.split('/').pop();
    const key = 'demo_wallets_v2';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    const filtered = list.filter(w => w.id !== id);
    localStorage.setItem(key, JSON.stringify(filtered));
    return { ok: true };
  }
  // For other in demo, succeed
  return { ok: true };
}

export async function signup(email, phone, password) {
  return authFetch('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, phone, password }),
  });
}

export async function verifyAccount(email, code) {
  const data = await authFetch('/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  if (data.token) {
    setAuthToken(data.token);
    if (data.user) saveUserProfile(data.user);
  }
  return data;
}

export async function login(emailOrPhone, password) {
  const data = await authFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrPhone, password }),
  });
  if (data.token) {
    setAuthToken(data.token);
    if (data.user) saveUserProfile(data.user);
  }
  return data;
}

export async function getMe() {
  return authFetch('/me');
}

/**
 * Backup current encrypted wallet data to the server (cross-device)
 * Supports extra metadata like color for customization.
 */
export async function backupWallet({ name, encryptedData, address, color }) {
  return authFetch('/wallets/backup', {
    method: 'POST',
    body: JSON.stringify({ name, encryptedData, address, color }),
  });
}

/**
 * Fetch all backed up wallets for the logged in user
 */
export async function fetchBackedUpWallets() {
  return authFetch('/wallets');
}

/**
 * Delete a backed up wallet
 */
export async function deleteBackedUpWallet(id) {
  return authFetch(`/wallets/${id}`, { method: 'DELETE' });
}

/**
 * Create a new wallet (mnemonic) and optionally back it up.
 * password = the user's login password (used for client-side encryption)
 */
export async function createNewWalletForAccount(name = 'Main Wallet', password, backupToCloud = true) {
  if (!password) throw new Error('Password required to encrypt new wallet');
  const w = generateMTWallet();
  const encryptedPayload = await encryptMnemonic(w.mnemonic, password);

  const solKp = Keypair.fromSeed(w.solanaSeed);
  const solanaPublicKey = solKp.publicKey.toBase58();

  const entry = {
    id: 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    name,
    publicKey: w.publicKey,           // MT native address
    solanaPublicKey,                  // Solana address for real $MT / SOL
    createdAt: Date.now(),
  };

  if (backupToCloud && getAuthToken()) {
    try {
      const backupRes = await backupWallet({
        name,
        encryptedData: encryptedPayload,
        address: w.publicKey,  // MT address
        solanaPublicKey,       // important for real $MT balance display and queries
        color: '#10b981'
      });
      if (backupRes && backupRes.wallet && backupRes.wallet.id) {
        entry.id = backupRes.wallet.id; // use the canonical server id (uuid) so lists match after loadMyWallets
      }
    } catch (e) {
      console.warn('Cloud backup failed (will retry later or on refresh)', e);
    }
  }

  return { wallet: entry, encryptedPayload };
}

// Helper to import a mnemonic as a new wallet entry (client encrypted)
export async function importWalletAsEntry(mnemonic, name = 'Imported Wallet', password) {
  if (!password) throw new Error('Password required to encrypt imported wallet');
  if (!bip39.validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
  const w = importMTWalletFromMnemonic(mnemonic);
  const encryptedPayload = await encryptMnemonic(mnemonic, password);

  const solKp = Keypair.fromSeed(w.solanaSeed);
  const solanaPublicKey = solKp.publicKey.toBase58();

  return {
    id: 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    name,
    publicKey: w.publicKey,
    solanaPublicKey,
    encryptedPayload,
    createdAt: Date.now(),
  };
}

/**
 * Solana $MT Buy/Sell using Jupiter (executed inside the wallet)
 * We use Jupiter API for quotes and tx construction, but signing and sending
 * happens 100% inside this wallet with the user's Solana keypair.
 * This keeps the UX "within the wallet" without redirecting the user.
 */
export const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
export const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const MT_SOLANA_MINT = 'ELywDcVX2WumHm4xEfqF8NdEKaeGCAaq9JmwtjE8pump';

export async function fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps = 100 }) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: 'false',
  });
  const res = await fetch(`${JUPITER_QUOTE_API}?${params}`);
  if (!res.ok) throw new Error('Failed to get quote from Jupiter');
  return res.json();
}

export async function fetchJupiterSwapTransaction(quoteResponse, userPublicKey) {
  const res = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: userPublicKey.toString(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get swap transaction');
  }
  return res.json();
}

export async function executeJupiterSwap(quoteResponse, wallet, connection = null) {
  if (!wallet || !wallet.solanaSeed) {
    throw new Error('No Solana key available in active wallet');
  }

  const solKeypair = Keypair.fromSeed(wallet.solanaSeed);
  const userPublicKey = solKeypair.publicKey;

  const swapResponse = await fetchJupiterSwapTransaction(quoteResponse, userPublicKey);

  const { swapTransaction } = swapResponse;

  const txBuffer = Buffer.from(swapTransaction, 'base64');

  let transaction;
  try {
    transaction = VersionedTransaction.deserialize(txBuffer);
  } catch (e) {
    // fallback for legacy
    transaction = Transaction.from(txBuffer);
  }

  // Sign the transaction
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([solKeypair]);
  } else {
    transaction.sign(solKeypair);
  }

  const conn = connection || getSolConnection();

  // Send and confirm
  const signature = await conn.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  await conn.confirmTransaction(signature, 'confirmed');

  return { signature, swapResponse };
}

export function getSolanaKeypair(wallet) {
  if (!wallet || !wallet.solanaSeed) return null;
  return Keypair.fromSeed(wallet.solanaSeed);
}
