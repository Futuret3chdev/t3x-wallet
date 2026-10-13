# T3X Wallet

Production clone of the Infinite Wallet (from `Futuret3chdev/mt-ecosystem/infinite-wallet`).

Original systems left completely untouched so you can always revert.

This repo is the development base for:
- Native T3X coin
- Staking through the existing secure wallet model
- User coin minting onto the network
- Genesis and transaction flows

Built on the real security model:
- BIP39 mnemonic → ed25519 (tweetnacl)
- AES-GCM + PBKDF2 encrypted vault
- Local signing only
- Compatible with mt-core style node

## Source
Copied from the production Infinite Wallet tree. Do not modify the original `mt-ecosystem` repo.
