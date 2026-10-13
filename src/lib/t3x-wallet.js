/**
 * T3X Wallet core — based on the production Infinite Wallet engine (mt-wallet.js)
 * Same security model: BIP39 + ed25519 + AES-GCM vault + local signing.
 * Extended with native T3X staking and user coin minting transaction types.
 */

import * as bip39 from 'bip39';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

export const T3X_TX_FEE = 0.01;

export function generateT3XWallet() {
  const mnemonic = bip39.generateMnemonic(128);
  return createT3XWalletFromMnemonic(mnemonic);
}

export function createT3XWalletFromMnemonic(mnemonic) {
  if (!bip39.validateMnemonic(mnemonic)) throw new Error('Invalid mnemonic');
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const secretKey = seed.slice(0, 32);
  const keypair = nacl.sign.keyPair.fromSeed(secretKey);
  return {
    mnemonic,
    publicKey: bs58.encode(keypair.publicKey),
    secretKey: bs58.encode(keypair.secretKey),
  };
}

export function signT3XTx(tx, secretKey58) {
  const secretKey = bs58.decode(secretKey58);
  const message = Buffer.from(JSON.stringify(tx));
  const signature = nacl.sign.detached(message, secretKey);
  return bs58.encode(signature);
}

export function verifyT3XTx(tx, signature58, publicKey58) {
  const message = Buffer.from(JSON.stringify(tx));
  return nacl.sign.detached.verify(
    message,
    bs58.decode(signature58),
    bs58.decode(publicKey58)
  );
}

// Staking transaction builder (signed locally, submitted to node)
export function buildStakeTx(fromWallet, amount, nonce) {
  return {
    from: fromWallet.publicKey,
    amount: Number(amount),
    nonce,
    type: 'STAKE',
    fee: T3X_TX_FEE,
    timestamp: Date.now(),
  };
}

// User coin mint transaction (creates a new asset on the network)
export function buildMintCoinTx(fromWallet, name, symbol, supply, nonce) {
  return {
    from: fromWallet.publicKey,
    name,
    symbol,
    supply: Number(supply),
    nonce,
    type: 'MINT_COIN',
    fee: T3X_TX_FEE,
    timestamp: Date.now(),
  };
}

// Genesis block helper (real hash)
export async function createGenesisHash(data) {
  const enc = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
