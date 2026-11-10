import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authMayUseDemoFallback,
  decryptMnemonic,
  encryptMnemonic,
  executeJupiterSwap,
  getDefaultMoralisApiKey,
  getMoralisApiKey,
  requestTestFunds,
  signInIsLocked,
  submitMTTx,
} from '../src/lib/mt-wallet.js';

test('auth demo fallback and sign-in lock default closed outside localhost', () => {
  assert.equal(authMayUseDemoFallback('localhost'), true);
  assert.equal(authMayUseDemoFallback('t3x-wallet.vercel.app'), false);
  assert.equal(authMayUseDemoFallback(''), false);
  assert.equal(signInIsLocked(), true);
});

test('provider helpers no longer expose a client credential', () => {
  assert.equal(getDefaultMoralisApiKey(), null);
  assert.equal(getMoralisApiKey(), null);
});

test('broadcast, faucet, and swap signing fail before any network call', async () => {
  await assert.rejects(() => submitMTTx({ type: 'TRANSFER' }, 'sig'), /locked/i);
  await assert.rejects(() => requestTestFunds('addr'), /locked|disabled/i);
  await assert.rejects(() => executeJupiterSwap({}, { solanaSeed: new Uint8Array(32) }), /validated/i);
});

test('legacy vault ciphertext still round-trips with the same passphrase', async () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const payload = await encryptMnemonic(phrase, 'local-vault-passphrase');
  const parsed = JSON.parse(payload);
  assert.equal(parsed.v, 1);
  assert.equal(typeof parsed.salt, 'string');
  assert.equal(typeof parsed.iv, 'string');
  assert.equal(typeof parsed.ct, 'string');
  assert.equal(await decryptMnemonic(payload, 'local-vault-passphrase'), phrase);
  await assert.rejects(() => decryptMnemonic(payload, 'different-passphrase'));
});
