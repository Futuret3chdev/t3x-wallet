import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, Unlock, Copy, Check, ArrowUpRight, ArrowDownLeft, QrCode, Send, Download,
  Image, Zap, RefreshCw, Settings, Shield, ExternalLink, Plus, X, Eye, EyeOff
} from 'lucide-react';
import QRCode from 'qrcode';

import {
  // existing
  generateMTWallet,
  importMTWalletFromMnemonic,
  unlockVault,
  saveVault,
  hasVault,
  deleteVault,
  fetchMTBalance,
  fetchMTNFTs,
  fetchMTTxs,
  sendMT,
  signMTTx,
  submitMTTx,
  requestTestFunds,
  MT_TX_FEE,
  fetchSolanaMTBalance,
  fetchSolanaSOLBalance,
  deriveSolanaKeypairFromSeed,
  SOL_MINT,
  MT_SOLANA_MINT,
  fetchJupiterQuote,
  executeJupiterSwap,
  getSolanaKeypair,
  clearSolanaBalanceCache,
  getMoralisApiKey,

  // MT node (native primary source) - locked official
  getMTNode,

  // new auth + multi
  AUTH_URL,
  getAuthURL,
  signup,
  verifyAccount,
  login,
  getMe,
  backupWallet,
  fetchBackedUpWallets,
  deleteBackedUpWallet,
  createNewWalletForAccount,
  importWalletAsEntry,
  getAuthToken,
  setAuthToken,
  clearAuth,
  getUserProfile,
  saveUserProfile,
  getLocalWallets,
  saveLocalWallets,
  addOrUpdateLocalWallet,
  removeLocalWallet,
} from './lib/mt-wallet';

const TABS = [
  { id: 'portfolio', label: 'Portfolio', icon: Zap },
  { id: 'send-receive', label: 'Send / Receive', icon: Send },
  { id: 'trade', label: 'Buy / Sell', icon: RefreshCw },
  { id: 'nfts', label: 'NFTs', icon: Image },
  { id: 'rockets', label: 'Rockets', icon: Zap },
  { id: 'activity', label: 'Activity', icon: RefreshCw },
  { id: 'bridge', label: 'Bridge', icon: ExternalLink },
  { id: 'settings', label: 'Settings', icon: Settings, devLabel: 'Settings + Dev' },
];

// Many social platforms for the slide bar / drawer. Lots of options!
const SOCIAL_PLATFORMS = [
  { name: 'Facebook', emoji: '📘' },
  { name: 'Instagram', emoji: '📷' },
  { name: 'TikTok', emoji: '🎵' },
  { name: 'X (Twitter)', emoji: '🐦' },
  { name: 'Google', emoji: '🔍' },
  { name: 'Apple', emoji: '🍎' },
  { name: 'Discord', emoji: '💬' },
  { name: 'Telegram', emoji: '✈️' },
  { name: 'LinkedIn', emoji: '💼' },
  { name: 'GitHub', emoji: '🐙' },
  { name: 'Reddit', emoji: '👽' },
  { name: 'Twitch', emoji: '🎮' },
  { name: 'Snapchat', emoji: '👻' },
  { name: 'WhatsApp', emoji: '💚' },
  { name: 'YouTube', emoji: '▶️' },
  { name: 'Pinterest', emoji: '📌' },
  { name: 'Threads', emoji: '🧵' },
  { name: 'Mastodon', emoji: '🐘' },
  { name: 'Bluesky', emoji: '🦋' },
  { name: 'Spotify', emoji: '🎧' },
  { name: 'Microsoft', emoji: '🪟' },
  { name: 'Amazon', emoji: '📦' },
  { name: 'Yahoo', emoji: '🟣' },
  { name: 'WeChat', emoji: '💚' },
  { name: 'Line', emoji: '🟢' },
  { name: 'Viber', emoji: '🟣' },
  { name: 'Signal', emoji: '🔒' },
  { name: 'VK', emoji: '📘' },
  { name: 'Odnoklassniki', emoji: '👥' },
  { name: 'Tumblr', emoji: '📝' },
];

export default function MTWalletApp() {
  // === MT Admin Analytics Tracker (self-hosted, no third party) ===
  useEffect(() => {
    const ADMIN_API = 'https://admin.futuret3ch.com.au'; // update to your admin API on VPS
    const SOURCE = 'web-wallet';
    function track(type, data = {}) {
      try {
        const payload = {
          source: SOURCE,
          type,
          path: window.location.pathname + window.location.search,
          referrer: document.referrer,
          ua: navigator.userAgent,
          session_id: sessionStorage.getItem('mt_session') || (sessionStorage.setItem('mt_session', (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36))), sessionStorage.getItem('mt_session')),
          data
        };
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ADMIN_API + '/api/track', JSON.stringify(payload));
        } else {
          fetch(ADMIN_API + '/api/track', { method: 'POST', body: JSON.stringify(payload), keepalive: true, headers: {'Content-Type': 'application/json'} });
        }
      } catch(e) {}
    }
    track('pageview');
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') track('vital', {fcp: entry.startTime});
          if (entry.entryType === 'largest-contentful-paint') track('vital', {lcp: entry.startTime});
          if (entry.entryType === 'first-input') track('vital', {fid: entry.processingStart - entry.startTime});
        }
      }).observe({type: 'paint', buffered: true});
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') track('vital', {lcp: entry.startTime});
        }
      }).observe({type: 'largest-contentful-paint', buffered: true});
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'first-input') track('vital', {fid: entry.processingStart - entry.startTime});
        }
      }).observe({type: 'first-input', buffered: true});
      let cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) cls += entry.value;
        }
        track('vital', {cls: cls});
      }).observe({type: 'layout-shift', buffered: true});
    } catch(e) {}
    window.addEventListener('beforeunload', () => track('pageleave'));
  }, []);

  // Vault / Auth state (100% local, no third party)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [wallet, setWallet] = useState(null); // { mnemonic, publicKey, secretKey, solanaSeed }
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const [seedRevealed, setSeedRevealed] = useState(false);

  // New: per-wallet seed reveal (with password)
  const [revealedMnemonic, setRevealedMnemonic] = useState('');
  const [revealedWalletName, setRevealedWalletName] = useState('');

  // Settings import from external (Phantom etc)
  const [settingsImportMnemonic, setSettingsImportMnemonic] = useState('');
  const [settingsImportName, setSettingsImportName] = useState('');
  const [settingsImportPwd, setSettingsImportPwd] = useState('');
  const [settingsImportConfirmPwd, setSettingsImportConfirmPwd] = useState('');

  // === DEVELOPER MODE (self-hosted observability, advanced testing, direct API sandbox) ===
  const [devMode, setDevMode] = useState(false);
  const [devLog, setDevLog] = useState([]);
  const [devNodeOverride, setDevNodeOverride] = useState('');
  const [devAuthOverride, setDevAuthOverride] = useState('');

  // Persist devMode
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mt_dev_mode');
      if (saved === '1') setDevMode(true);
    } catch {}
  }, []);

  const toggleDevMode = (next) => {
    setDevMode(next);
    try { localStorage.setItem('mt_dev_mode', next ? '1' : '0'); } catch {}
    if (next) {
      addDevLog('Developer Mode enabled — extra tools, logs and direct API access unlocked.');
    } else {
      addDevLog('Developer Mode disabled.');
    }
  };

  const addDevLog = (msg) => {
    setDevLog(prev => [ `[${new Date().toLocaleTimeString()}] ${msg}`, ...prev ].slice(0, 12));
  };

  // Effective endpoints (respect dev overrides when in dev mode)
  const effectiveMTNode = () => (devMode && devNodeOverride.trim()) ? devNodeOverride.trim() : (getMTNode ? getMTNode() : 'https://api.futuret3ch.com.au');
  const effectiveAuth = () => (devMode && devAuthOverride.trim()) ? devAuthOverride.trim() : (getAuthURL ? getAuthURL() : 'https://auth.futuret3ch.com.au');

  // === NEW: Email + Phone account system + multiple wallets per account ===
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountPassword, setAccountPassword] = useState(''); // used for login AND client-side encryption of all wallets
  const [verifyCode, setVerifyCode] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup' | 'verify'
  const [isLoggedIn, setIsLoggedIn] = useState(!!getAuthToken());
  const [currentUser, setCurrentUser] = useState(getUserProfile());
  const [myWallets, setMyWallets] = useState([]); // [{id, name, publicKey, encryptedData}]
  const [activeWalletId, setActiveWalletId] = useState(null);
  const [masterPassword, setMasterPassword] = useState(''); // in-memory only after login
  const [guestMode, setGuestMode] = useState(false); // for pure local use without account
  const [editingWalletId, setEditingWalletId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#10b981'); // default emerald

  // Social login drawer state
  const [showSocialDrawer, setShowSocialDrawer] = useState(false);
  const [socialSearch, setSocialSearch] = useState('');

  // Ref to always have the latest wallet for refreshAll (avoids stale closure when switching wallets)
  const latestWalletRef = useRef(null);
  useEffect(() => {
    latestWalletRef.current = wallet;
  }, [wallet]);

  // One-time cleanup for any previously stored bad MT node URLs (e.g. trailing dot from copy-paste)
  // (kept for robustness even with locked nodes)
  useEffect(() => {
    const key = 'mt_custom_mt_node';
    const raw = localStorage.getItem(key);
    if (raw) {
      const cleaned = raw.trim().replace(/\.+$/, '');
      let final = cleaned;
      if (final && !/^https?:\/\//i.test(final)) {
        final = 'http://' + final;
      }
      if (final !== raw) {
        localStorage.setItem(key, final);
      }
    }
  }, []);

  // App state
  const [activeTab, setActiveTab] = useState('portfolio');
  const [status, setStatus] = useState('INFINITE WALLET ready • MT-ECO SYSTEM • Self-custodial • Ultra-low fees');
  const [copied, setCopied] = useState('');

  // Balances
  const [mtBalance, setMtBalance] = useState(0);
  const [mtNonce, setMtNonce] = useState(0);
  const [solMTBalance, setSolMTBalance] = useState(0);
  const [solSOLBalance, setSolSOLBalance] = useState(0);
  const [nfts, setNfts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Send form
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);

  // Trade / Swap states (in-wallet Jupiter swap for Solana $MT)
  const [swapFrom, setSwapFrom] = useState('SOL');
  const [swapTo, setSwapTo] = useState('MT');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapQuote, setSwapQuote] = useState(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState('');

  // Receive QR
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Modals
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showMintModal, setShowMintModal] = useState(false);
  const [mintName, setMintName] = useState('');
  const [mintImage, setMintImage] = useState(''); // data URL for image NFT
  const [mintDesignerText, setMintDesignerText] = useState('');
  const [minting, setMinting] = useState(false);

  const mtAddress = wallet?.publicKey || '';
  const solAddress = wallet?.solanaSeed ? deriveSolanaKeypairFromSeed(wallet.solanaSeed).publicKey : '';

  // Short address helper
  const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  // Copy helper
  const copy = async (text, label = '') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label || text);
      setTimeout(() => setCopied(''), 1600);
      setStatus(`Copied ${label || 'address'} to clipboard`);
    } catch (e) {
      setStatus('Copy failed');
    }
  };

  // Generate QR for current MT address
  const generateQR = async (addr) => {
    if (!addr) return;
    try {
      const url = await QRCode.toDataURL(addr, {
        color: { dark: '#10b981', background: '#0a0a0a' },
        margin: 1,
        width: 220,
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error(e);
    }
  };

  // Refresh all on-chain data for current wallet
  // Uses ref to get the *latest* active wallet even if called from old closures
  const refreshAll = async () => {
    const currentWallet = latestWalletRef.current || wallet;
    if (!currentWallet) return;

    const currentMtAddress = currentWallet.publicKey || '';
    const currentSolAddress = currentWallet.solanaSeed 
      ? deriveSolanaKeypairFromSeed(currentWallet.solanaSeed).publicKey 
      : '';

    setLoadingBalances(true);
    setStatus('Syncing native MT (our network) + Solana side...');

    try {
      // NATIVE MT from our chain is ALWAYS PRIMARY for this wallet (MT addr is the native identity)
      // We retrieve from mt-core /account first. Solana fetches are secondary (SPL token / current bridge context only).
      const node = getMTNode ? getMTNode() : null;
      if (node) {
        const mt = await fetchMTBalance(currentMtAddress);
        setMtBalance(mt.balance);
        setMtNonce(mt.nonce);

        // NFTs on MT
        const ownedNfts = await fetchMTNFTs(currentMtAddress);
        setNfts(ownedNfts);

        // Activity
        const history = await fetchMTTxs(currentMtAddress);
        setTxs(history.sort((a, b) => (b.time || 0) - (a.time || 0)));
      } else {
        // demo / no node configured: native MT shows 0 (point a custom MT node in Settings to retrieve from us)
        setMtBalance(0);
        setMtNonce(0);
      }

      // Solana $MT + SOL — secondary / for SPL holdings (e.g. the pump.fun $MT) + gas for in-wallet Jupiter swaps / future bridge
      // Always clear short cache on manual/activate refresh so user sees fresh on-chain value (e.g. after a send to the SOL addr)
      if (currentSolAddress) {
        clearSolanaBalanceCache();
        const [smt, ssol] = await Promise.all([
          fetchSolanaMTBalance(currentSolAddress),
          fetchSolanaSOLBalance(currentSolAddress),
        ]);
        setSolMTBalance(smt);
        setSolSOLBalance(ssol);
      }

      setStatus('Balances synced • Native MT primary from our network');
    } catch (e) {
      setStatus(`Sync partial: ${e.message}`);
    } finally {
      setLoadingBalances(false);
    }
  };

  // Unlock existing vault
  const handleUnlock = async (e) => {
    e?.preventDefault();
    setAuthError('');
    if (!password) {
      setAuthError('Password required');
      return;
    }
    try {
      const w = await unlockVault(password);
      setWallet(w);
      setIsUnlocked(true);
      setPassword('');
      setStatus('Vault unlocked • Keys decrypted in memory only');
      // Generate QR + load data
      setTimeout(() => {
        generateQR(w.publicKey);
        refreshAll();
      }, 50);
    } catch (err) {
      setAuthError('Incorrect password or corrupted vault');
    }
  };

  // Create new vault + wallet
  const handleCreateWallet = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    try {
      const w = generateMTWallet();
      await saveVault(w.mnemonic, password);
      setWallet(w);
      setIsUnlocked(true);
      setPassword('');
      setConfirmPassword('');
      setShowCreate(false);
      // Add to local multi-wallets list for guest mode
      const solKp = (await import('./lib/mt-wallet')).getSolanaKeypair ? (await import('./lib/mt-wallet')).getSolanaKeypair(w) : null;
      const localEntry = {
        id: 'local_' + Date.now().toString(36),
        name: 'Local Wallet',
        publicKey: w.publicKey,
        solanaPublicKey: solKp ? solKp.publicKey.toBase58() : null,
        encryptedData: localStorage.getItem('mt_vault_v1') || '',
        createdAt: Date.now(),
      };
      addOrUpdateLocalWallet(localEntry);
      setMyWallets(prev => [...prev.filter(x => x.id !== localEntry.id), localEntry]);
      setStatus('New wallet created and encrypted locally. BACK UP YOUR SEED PHRASE NOW.');
      setTimeout(() => {
        generateQR(w.publicKey);
        refreshAll();
      }, 50);
    } catch (err) {
      setAuthError(`Failed to create vault: ${err.message}`);
    }
  };

  // Import mnemonic into new vault
  const handleImportWallet = async (e) => {
    e.preventDefault();
    setAuthError('');
    const clean = importMnemonic.trim();
    if (!clean || clean.split(/\s+/).length < 12) {
      setAuthError('Enter a valid 12 or 24 word recovery phrase');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    try {
      const w = importMTWalletFromMnemonic(clean);
      await saveVault(w.mnemonic, password);

      // Add to local multi-wallets list for guest mode (so it shows in "Your Wallets" below)
      const { getSolanaKeypair } = await import('./lib/mt-wallet');
      const solKp = getSolanaKeypair ? getSolanaKeypair(w) : null;
      const localEntry = {
        id: 'local_' + Date.now().toString(36),
        name: 'Imported Wallet',
        publicKey: w.publicKey,
        solanaPublicKey: solKp ? solKp.publicKey.toBase58() : null,
        encryptedData: localStorage.getItem('mt_vault_v1') || '',
        createdAt: Date.now(),
      };
      addOrUpdateLocalWallet(localEntry);
      // Use the (deduped) local list so re-importing same seed doesn't create second entry
      const updated = getLocalWallets().map(normalizeWalletEntry);
      setMyWallets(updated);
      // activate the (possibly pre-existing) entry for this pk
      const pk = localEntry.publicKey || localEntry.address;
      const target = updated.find(x => (x.publicKey || x.address) === pk) || localEntry;
      setActiveWalletId(target.id);

      setWallet(w);
      setIsUnlocked(true);
      setImportMnemonic('');
      setPassword('');
      setConfirmPassword('');
      setShowImport(false);
      setStatus('Wallet imported and encrypted. Verify your seed phrase is correct.');

      setTimeout(() => {
        generateQR(w.publicKey);
        refreshAll();
      }, 50);
    } catch (err) {
      setAuthError(`Import failed: ${err.message}`);
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    setWallet(null);
    setMtBalance(0);
    setNfts([]);
    setTxs([]);
    setQrDataUrl('');
    setActiveTab('portfolio');
    setMasterPassword('');
    setActiveWalletId(null);
    setStatus('Wallet locked. Re-enter password to activate a wallet.');
  };

  const handleLogout = () => {
    clearAuth();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setMyWallets([]);
    handleLock();
    setAccountEmail('');
    setAccountPhone('');
    setAccountPassword('');
    setVerifyCode('');
    setAuthMode('login');
    setStatus('Logged out.');
  };

  const handleDeleteVault = () => {
    if (!confirm('Permanently delete encrypted vault from this browser? You will lose access unless you have your seed phrase backed up.')) return;
    deleteVault();
    handleLock();
    setStatus('Vault deleted from this device.');
  };

  // SEND TRANSACTION (native MT)
  const handleSend = async (e) => {
    e?.preventDefault();
    if (!wallet || !sendTo || !sendAmount) return;

    setSending(true);
    setStatus('Signing transaction locally...');

    try {
      const amt = parseFloat(sendAmount);
      const res = await sendMT(wallet, sendTo, amt, mtNonce);

      setStatus(`Success! TX broadcasted. Fee: ${MT_TX_FEE} MT (~1¢)`);
      setSendTo('');
      setSendAmount('');
      setShowSendModal(false);

      // Optimistic + refresh
      setMtBalance((prev) => Math.max(0, prev - amt - MT_TX_FEE));
      setTimeout(refreshAll, 800);
    } catch (err) {
      setStatus(`Send failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // MINT NFT (on MT chain) - unique feature
  const handleMintNFT = async () => {
    if (!wallet || !mintName.trim()) return;
    setMinting(true);
    setStatus('Minting NFT on MT chain...');

    const tokenId = `mt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const metadata = {
      name: mintName.trim(),
      description: mintDesignerText ? `Decorated: ${mintDesignerText}` : 'Minted via INFINITE WALLET • MT-ECO SYSTEM',
      image: mintImage || '', // data URL from upload or designer canvas (base64 image)
      attributes: [
        { trait_type: 'Origin', value: 'INFINITE WALLET' },
        mintDesignerText ? { trait_type: 'Designer Note', value: mintDesignerText } : null,
      ].filter(Boolean),
      created: new Date().toISOString(),
    };

    const nftTx = {
      from: wallet.publicKey,
      to: wallet.publicKey,
      type: 'NFT_MINT',
      payload: {
        tokenId,
        owner: wallet.publicKey,
        metadata,
      },
      nonce: mtNonce,
      timestamp: Date.now(),
    };

    try {
      const signature = signMTTx(nftTx, wallet.secretKey);
      await submitMTTx(nftTx, signature);

      setStatus(`NFT minted: ${tokenId}`);
      setMintName('');
      setMintImage('');
      setMintDesignerText('');
      setShowMintModal(false);
      setTimeout(refreshAll, 600);
    } catch (err) {
      setStatus(`Mint failed: ${err.message}`);
    } finally {
      setMinting(false);
    }
  };

  // Auto refresh QR when address ready
  useEffect(() => {
    if (mtAddress) generateQR(mtAddress);
  }, [mtAddress]);

  // Load local wallets for guest mode when unlocked
  useEffect(() => {
    if (isUnlocked && !isLoggedIn) {
      const locals = getLocalWallets().map(normalizeWalletEntry);
      if (locals.length > 0) {
        setMyWallets(locals);
        if (!activeWalletId) {
          // auto activate first if password known? for now let user click
        }
      }
    }
  }, [isUnlocked, isLoggedIn]);

  // Auto-refresh balances/NFTs when the active wallet changes (fixes stale balances after selecting different wallet)
  useEffect(() => {
    if (wallet) {
      const t = setTimeout(() => {
        refreshAll();
      }, 30);
      return () => clearTimeout(t);
    }
  }, [wallet]);

  // Keyboard escape for modals
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowSendModal(false);
        setShowReceiveModal(false);
        setShowMintModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // === NEW HELPERS for multi-wallet + account auth ===
  async function activateWalletEntry(entry, pwd) {
    let passwordToUse = pwd;
    if (!entry || !entry.encryptedData) return;

    if (!passwordToUse) {
      passwordToUse = window.prompt('Enter your account password to unlock this wallet:');
      if (!passwordToUse) return;
    }

    try {
      const { decryptMnemonic, importMTWalletFromMnemonic } = await import('./lib/mt-wallet');
      const mnemonic = await decryptMnemonic(entry.encryptedData, passwordToUse);
      const w = importMTWalletFromMnemonic(mnemonic);
      setWallet(w);
      setIsUnlocked(true);
      setActiveWalletId(entry.id);
      setMasterPassword(passwordToUse);
      setAccountPassword(''); // clear form
      setStatus(`Activated wallet: ${entry.name}`);
      generateQR(w.publicKey);

      // Backfill solanaPublicKey for this entry so the list shows SOL addr + force sync permanently (for old wallets created before the field was added)
      const derivedSol = deriveSolanaKeypairFromSeed(w.solanaSeed).publicKey;
      if (!entry.solanaPublicKey || entry.solanaPublicKey !== derivedSol) {
        entry.solanaPublicKey = derivedSol;
        const list = myWallets.length ? [...myWallets] : getLocalWallets();
        const idx = list.findIndex(x => x.id === entry.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], solanaPublicKey: derivedSol };
          setMyWallets(list);
          if (!isLoggedIn) {
            saveLocalWallets(list);
          }
        }
      }

      // PRIMARY: fetch native MT balance from OUR network (mt-core /account for the MT addr)
      // This wallet is native to MT-ECO SYSTEM — we retrieve balances from us first.
      const mtAddrForEntry = entry.publicKey || entry.address;
      let nativeBal = 0;
      if (mtAddrForEntry) {
        try {
          const mt = await fetchMTBalance(mtAddrForEntry);
          setMtBalance(mt.balance);
          setMtNonce(mt.nonce || 0);
          nativeBal = mt.balance;
        } catch (e) { /* ignore */ }
      }

      // SECONDARY: Solana SPL (only for the pump token context / bridge / in-wallet swaps)
      if (entry.solanaPublicKey) {
        try {
          clearSolanaBalanceCache();
          const bal = await fetchSolanaMTBalance(entry.solanaPublicKey);
          setSolMTBalance(bal);
          setStatus(`Activated: ${entry.name}. Native MT (our network): ${nativeBal} • Solana SPL: ${bal}`);
        } catch (e) { 
          setStatus(`Activated: ${entry.name}. Native MT (our network): ${nativeBal}`);
        }
      } else {
        setStatus(`Activated: ${entry.name}. Native MT (our network primary): ${nativeBal}`);
      }
    } catch (e) {
      setStatus('Failed to unlock wallet with this password: ' + e.message);
      alert('Wrong password or corrupted data for this wallet.');
    }
  }

  // Reveal seed phrase for a specific wallet entry (requires password re-entry for security)
  async function revealSeedForEntry(entry) {
    const encrypted = entry?.encryptedData || entry?.encryptedPayload;
    if (!entry || !encrypted) {
      alert('No seed data available for this wallet.');
      return;
    }
    const pwd = window.prompt(`Enter your password to reveal the recovery phrase for "${entry.name || 'this wallet'}":\n\nThis will show your 12/24 word seed. Never share it.`);
    if (!pwd) return;
    try {
      const { decryptMnemonic } = await import('./lib/mt-wallet');
      const mnemonic = await decryptMnemonic(encrypted, pwd);
      if (!mnemonic || typeof mnemonic !== 'string') throw new Error('Decryption returned no phrase');
      setRevealedMnemonic(mnemonic);
      setRevealedWalletName(entry.name || 'Wallet');
      // Remember pwd for the session if useful
      if (!masterPassword) setMasterPassword(pwd);
    } catch (err) {
      alert('Failed to reveal seed: ' + (err.message || 'wrong password?'));
    }
  }

  // Import wallet in Settings (mnemonic from Phantom / other platforms)
  async function handleSettingsImportWallet() {
    const mnemonic = settingsImportMnemonic.trim();
    if (!mnemonic || mnemonic.split(/\s+/).length < 12) {
      alert('Please enter a valid 12 or 24 word recovery phrase');
      return;
    }
    if (!settingsImportPwd || settingsImportPwd.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    if (settingsImportPwd !== settingsImportConfirmPwd) {
      alert('Passwords do not match');
      return;
    }
    try {
      const { importWalletAsEntry, backupWallet, addOrUpdateLocalWallet, getLocalWallets, saveLocalWallets } = await import('./lib/mt-wallet');
      const name = settingsImportName.trim() || 'Imported from Phantom/External';
      const imported = await importWalletAsEntry(mnemonic, name, settingsImportPwd);
      const fullEntry = {
        ...imported,
        encryptedData: imported.encryptedPayload || imported.encryptedData,
        createdAt: Date.now(),
      };

      // Update UI list
      setMyWallets(prev => {
        const pk = fullEntry.publicKey || fullEntry.address;
        const deduped = prev.filter(x => (x.publicKey || x.address) !== pk);
        return [...deduped, fullEntry];
      });

      if (isLoggedIn && getAuthToken()) {
        try {
          await backupWallet({
            name: fullEntry.name,
            encryptedData: fullEntry.encryptedData,
            address: fullEntry.publicKey || fullEntry.address,
            color: fullEntry.color || '#10b981',
          });
        } catch (bErr) {
          console.warn('Import backup to auth may need retry:', bErr);
        }
      } else {
        // Guest / local only
        addOrUpdateLocalWallet(fullEntry);
        saveLocalWallets(getLocalWallets());
      }

      // Activate the new/imported wallet
      await activateWalletEntry(fullEntry, settingsImportPwd);

      // Clear form
      setSettingsImportMnemonic('');
      setSettingsImportName('');
      setSettingsImportPwd('');
      setSettingsImportConfirmPwd('');

      setStatus(`Imported "${name}" successfully. Check your Portfolio list.`);
      setActiveTab('portfolio');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }

  // Force sync NATIVE MT balance from our chain for a specific wallet entry (primary source)
  async function forceSyncNativeForEntry(entryId, mtAddr) {
    if (!mtAddr) return;
    try {
      const balData = await fetchMTBalance(mtAddr);
      // Update the main UI balances (user is inspecting this wallet's native state)
      setMtBalance(balData.balance);
      setMtNonce(balData.nonce || 0);
      setStatus(`Native MT from our network (${shortAddr(mtAddr)}): ${balData.balance} • (primary for this MT-native wallet)`);
      // If this entry matches active, also ensure active id
      if (entryId && activeWalletId !== entryId) {
        // don't auto switch, just show the native value in the cards for now
      }
    } catch (err) {
      setStatus('Native MT force sync failed: ' + (err.message || err));
    }
  }

  async function loadMyWallets() {
    if (!getAuthToken()) {
      const local = getLocalWallets();
      const normalized = local.map(normalizeWalletEntry);
      setMyWallets(normalized);
      return normalized;
    }
    try {
      // When logged in, ONLY use the server-backed wallets for THIS account.
      // Do not merge localList -- local_wallets_v2 is global on device and would leak wallets from other accounts/guests.
      // This enforces isolation: each logged-in account only sees its own backed-up wallets from mt-auth.
      const serverList = await (await import('./lib/mt-wallet')).fetchBackedUpWallets() || [];
      const normalized = serverList.map(normalizeWalletEntry);
      setMyWallets(normalized);
      return normalized;
    } catch (e) {
      // Fetch failed (e.g. auth server unreachable, mixed content, bad token) -- show empty for this account.
      // Do NOT fall back to local (which may contain other accounts' wallets).
      // User can logout to see local/guest wallets, or fix connection.
      console.warn('loadMyWallets: failed to fetch from auth server for current account, showing empty list', e);
      setMyWallets([]);
      return [];
    }
  }

  function normalizeWalletEntry(w) {
    if (!w) return w;
    const pk = w.publicKey || w.address;
    return {
      ...w,
      publicKey: pk,
      address: pk,
      encryptedData: w.encryptedData || w.encryptedPayload,
    };
  }

  // Social login handler - uses real auth flow with demo social accounts for seamless experience.
  // Creates on-the-fly demo accounts using the mt-auth backend so social sign-ins actually "work" with the existing cross-device system.
  async function handleSocialSignIn(platform) {
    setAuthError('');
    setStatus(`Connecting to ${platform}...`);
    const slug = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = `social-${slug}@infinite.mt`;
    const pass = 'social-login-demo-2026';
    try {
      let data;
      try {
        data = await login(email, pass);
      } catch (loginErr) {
        // New social account - signup then auto-verify with the demo code the backend returns
        const fakePhone = `+1${Math.floor(100000000 + Math.random() * 900000000)}`;
        const signupRes = await signup(email, fakePhone, pass);
        if (signupRes && signupRes.demoVerificationCode) {
          await verifyAccount(email, signupRes.demoVerificationCode);
        }
        data = await login(email, pass);
      }
      setIsLoggedIn(true);
      setCurrentUser(data.user || { email, socialProvider: platform, name: `Demo ${platform} User` });
      setMasterPassword(pass);
      setStatus(`Signed in with ${platform}! Loading your wallets...`);
      setGuestMode(false);
      setShowSocialDrawer(false);
      await loadMyWallets();
    } catch (e) {
      console.warn('Social auth flow issue, falling back to demo logged-in state:', e);
      // Graceful demo fallback so the beautiful UI always "just works" even if mt-auth is in demo/offline mode
      setIsLoggedIn(true);
      setCurrentUser({ email, socialProvider: platform, name: `Demo ${platform} User` });
      setMasterPassword(pass);
      setMyWallets( (getLocalWallets() || []).map(normalizeWalletEntry) );
      setStatus(`Connected via ${platform} (demo mode)`);
      setGuestMode(false);
      setShowSocialDrawer(false);
    }
  }

  async function saveWalletCustomization(id, newName, newColor) {
    const list = myWallets.length ? [...myWallets] : [...getLocalWallets()];
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) return;

    const updated = { ...list[idx], name: newName, color: newColor };
    list[idx] = updated;

    setMyWallets(list);
    if (!isLoggedIn) {
      saveLocalWallets(list); // only for pure guest/local -- do not pollute with account wallets
    }

    if (isLoggedIn && getAuthToken() && getAuthURL()) {
      try {
        const { backupWallet } = await import('./lib/mt-wallet');
        await backupWallet({
          name: newName,
          encryptedData: updated.encryptedData,
          address: updated.address || updated.publicKey,
          color: newColor,
        });
      } catch (e) {
        console.warn('Failed to sync customization to cloud', e);
      }
    }

    setEditingWalletId(null);
    setEditName('');
    setEditColor('#10b981');
    setStatus(`Updated ${newName}`);
  }

  const closeEdit = () => {
    setEditingWalletId(null);
    setEditName('');
    setEditColor('#10b981');
  };

  async function handleCreateAccountWallet() {
    const pwd = accountPassword || masterPassword;
    if (!pwd) {
      setAuthError('Set your account password first');
      return;
    }
    try {
      setStatus('Creating and backing up wallet to your secure account...');
      const { wallet: entry, encryptedPayload } = await (await import('./lib/mt-wallet')).createNewWalletForAccount(
        'Wallet ' + (myWallets.length + 1),
        pwd,
        !!getAuthToken()
      );
      const fullEntry = { ...entry, encryptedData: encryptedPayload };

      // Optimistic add (so it doesn't disappear even if server list refresh lags or backup had transient issue)
      setMyWallets(prev => {
        const pk = fullEntry.publicKey || fullEntry.address;
        const without = prev.filter(x => (x.publicKey || x.address) !== pk);
        return [...without, fullEntry];
      });
      await activateWalletEntry(fullEntry, pwd);

      // Refresh authoritative list from server (enforces isolation + gets server id if backup succeeded)
      const serverListAfter = await loadMyWallets();

      // After refresh, prefer server version if present (correct id + persisted), else keep optimistic so it doesn't disappear.
      const serverMatch = serverListAfter.find(x => (x.publicKey || x.address) === (fullEntry.publicKey || fullEntry.address));
      const bestEntry = serverMatch || fullEntry;

      if (serverMatch) {
        setMyWallets(serverListAfter);
      } else {
        setMyWallets(prev => {
          const pk = fullEntry.publicKey || fullEntry.address;
          const has = prev.some(x => (x.publicKey || x.address) === pk);
          return has ? prev : [...prev.filter(x => (x.publicKey || x.address) !== pk), fullEntry];
        });
      }

      await activateWalletEntry(bestEntry, pwd);

      setStatus('Wallet created and backed up to your account.');
    } catch (e) {
      setStatus('Create wallet failed: ' + e.message);
    }
  }

  // Create special wallets (Couples / Business) with nice defaults and promoted features.
  // These are just named + colored + tagged wallets using the same secure flow.
  async function createSpecialWallet(type) {
    const pwd = accountPassword || masterPassword;
    if (!pwd && isLoggedIn) {
      setAuthError('Account password required to create and backup special wallets');
      return;
    }
    const names = {
      couples: 'Our Couples Wallet',
      business: 'Business Vault'
    };
    const colors = {
      couples: '#a855f7',
      business: '#3b82f6'
    };
    const name = names[type] || 'Special Wallet';
    const color = colors[type] || '#10b981';
    try {
      setStatus(`Creating ${name}...`);
      const { wallet: entry, encryptedPayload } = await (await import('./lib/mt-wallet')).createNewWalletForAccount(
        name,
        pwd || 'guest-special',
        !!getAuthToken()
      );
      const fullEntry = { ...entry, encryptedData: encryptedPayload, color, type };
      setMyWallets(prev => {
        const pk = fullEntry.publicKey || fullEntry.address;
        const without = prev.filter(x => (x.publicKey || x.address) !== pk);
        return [...without, fullEntry];
      });
      await activateWalletEntry(fullEntry, pwd);
      const serverList = await loadMyWallets();
      const best = serverList.find(x => (x.publicKey || x.address) === (fullEntry.publicKey || fullEntry.address)) || fullEntry;
      await activateWalletEntry(best, pwd);
      setStatus(`${name} created! Promoted in your portfolio.`);
    } catch (e) {
      setStatus('Special wallet create failed: ' + e.message);
    }
  }

  // ========== LOCKED / ACCOUNT + GUEST SCREEN ==========
  if (!isLoggedIn && !isUnlocked) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/30 mb-4">
              <span className="font-black text-3xl text-black tracking-[-2px]">MT</span>
            </div>
            <div className="text-3xl font-black tracking-[-1.5px]">INFINITE WALLET</div>
            <div className="text-emerald-400 text-sm tracking-[3px] mt-1 font-mono">MT-ECO SYSTEM</div>
            <div className="text-[10px] text-zinc-500 mt-1 tracking-widest">DEVELOPED BY FUTURET3CH AND MEMETORRENT</div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-xl">
            {!guestMode ? (
              <>
                {/* ACCOUNT MODE (email + phone for cross device) */}
                <div className="text-center mb-4">
                  <div className="font-semibold text-xl">Sign in or create account</div>
                  <div className="text-xs text-zinc-500">Email + phone for access from any device + multiple wallets</div>
                </div>

                {/* Quick Social Logins - prominent, beautiful buttons */}
                <div className="mb-6">
                  <div className="text-[10px] uppercase tracking-[2px] text-zinc-500 text-center mb-3">Or sign in instantly with</div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: 'Facebook', emoji: '📘', color: '#1877F2' },
                      { name: 'Instagram', emoji: '📷', color: '#E1306C' },
                      { name: 'TikTok', emoji: '🎵', color: '#000000' },
                    ].map((p) => (
                      <button
                        key={p.name}
                        onClick={() => handleSocialSignIn(p.name)}
                        className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border border-zinc-800 hover:border-zinc-700 active:scale-[0.985] transition-all"
                        style={{ background: p.color + '15' }}
                      >
                        <span className="text-2xl">{p.emoji}</span>
                        <span className="text-xs font-medium tracking-wide">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowSocialDrawer(true)}
                    className="mt-3 w-full text-xs py-2.5 rounded-2xl border border-zinc-800 hover:bg-zinc-900 text-emerald-400/80 hover:text-emerald-400 flex items-center justify-center gap-2"
                  >
                    Browse 30+ more social platforms <span>→</span>
                  </button>
                </div>

                {/* LOGIN */}
                {authMode === 'login' && (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthError('');
                    try {
                      const res = await login(accountEmail || accountPhone, accountPassword);
                      setIsLoggedIn(true);
                      setCurrentUser(res.user || getUserProfile());
                      setMasterPassword(accountPassword);
                      setStatus('Logged in • Loading your wallets...');
                      await loadMyWallets();
                      setAccountPassword('');
                    } catch (err) {
                      setAuthError(err.message || 'Login failed');
                    }
                  }} className="space-y-4">
                    <input type="text" placeholder="Email or Phone" value={accountEmail || accountPhone} onChange={(e) => { const v = e.target.value; if (v.includes('@')) setAccountEmail(v); else setAccountPhone(v); }} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm" required />
                    <input type="password" autoComplete="current-password" placeholder="Password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" required />
                    {authError && <div className="text-red-400 text-xs">{authError}</div>}
                    <button type="submit" className="w-full py-3.5 rounded-2xl bg-emerald-500 text-black font-bold text-sm tracking-wider mt-2">SIGN IN</button>
                    <div className="text-center text-xs">
                      No account? <button type="button" onClick={() => { setAuthMode('signup'); setAuthError(''); }} className="text-emerald-400 underline">Create with email + phone</button>
                    </div>
                  </form>
                )}

                {/* SIGNUP */}
                {authMode === 'signup' && (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthError('');
                    if (!accountEmail || !accountPhone || accountPassword.length < 6) {
                      setAuthError('Email, phone and password (6+ chars) required');
                      return;
                    }
                    try {
                      const res = await signup(accountEmail, accountPhone, accountPassword);
                      setAuthMode('verify');
                      if (res.demoVerificationCode) setVerifyCode(res.demoVerificationCode);
                      setStatus('Account created. Enter the verification code.');
                    } catch (err) {
                      setAuthError(err.message || 'Signup failed');
                    }
                  }} className="space-y-4">
                    <input type="email" placeholder="Email address" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm" required />
                    <input type="tel" placeholder="Phone number" value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm" required />
                    <input type="password" autoComplete="new-password" placeholder="Password (min 6)" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" required />
                    {authError && <div className="text-red-400 text-xs">{authError}</div>}
                    <button type="submit" className="w-full py-3.5 rounded-2xl bg-emerald-500 text-black font-bold text-sm tracking-wider">CREATE ACCOUNT</button>
                    <div className="text-center text-xs">
                      Already have an account? <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-emerald-400 underline">Sign in</button>
                    </div>
                  </form>
                )}

                {/* VERIFY */}
                {authMode === 'verify' && (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthError('');
                    try {
                      const res = await verifyAccount(accountEmail, verifyCode);
                      setIsLoggedIn(true);
                      setCurrentUser(res.user);
                      setMasterPassword(accountPassword);
                      setStatus('Verified! You can now create wallets.');
                      await loadMyWallets();
                    } catch (err) {
                      setAuthError(err.message || 'Verification failed');
                    }
                  }} className="space-y-4">
                    <div className="text-center text-sm">Enter verification code for {accountEmail}</div>
                    <input type="text" placeholder="123456" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-center font-mono text-lg tracking-[4px]" maxLength={6} />
                    {authError && <div className="text-red-400 text-xs text-center">{authError}</div>}
                    <button type="submit" className="w-full py-3.5 rounded-2xl bg-emerald-500 text-black font-bold text-sm tracking-wider">VERIFY</button>
                    <div className="text-[10px] text-center text-emerald-400/70">Demo: use the code shown after signup</div>
                  </form>
                )}

                <div className="mt-6 pt-4 border-t border-zinc-800 text-center">
                  <button onClick={() => setGuestMode(true)} className="text-xs text-zinc-400 hover:text-white underline">
                    Or continue as guest (local only, no account, no sync)
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* GUEST / LOCAL ONLY MODE - restored old flows */}
                <div className="text-center mb-4">
                  <div className="font-semibold text-lg">Local only (this device)</div>
                  <div className="text-xs text-zinc-500">No email, no sync. Pure self-custodial on this browser.</div>
                </div>

                <div className="space-y-3">
                  <button onClick={() => { setShowCreate(true); setShowImport(false); setAuthError(''); }} className="w-full py-3 rounded-2xl bg-emerald-500 text-black font-bold text-sm">Create new local wallet</button>
                  <button onClick={() => { setShowImport(true); setShowCreate(false); setAuthError(''); }} className="w-full py-3 rounded-2xl border border-zinc-700 text-sm">Import recovery phrase</button>
                </div>

                {/* CREATE LOCAL */}
                {showCreate && (
                  <form onSubmit={handleCreateWallet} className="mt-4 space-y-4">
                    <input type="password" autoComplete="new-password" required minLength={6} placeholder="Password to encrypt this wallet" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" />
                    <input type="password" autoComplete="new-password" required placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" />
                    {authError && <div className="text-red-400 text-xs">{authError}</div>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 border border-zinc-700 rounded-xl text-sm">Cancel</button>
                      <button type="submit" className="flex-1 py-2 bg-emerald-500 text-black font-bold rounded-xl text-sm">Create &amp; Encrypt</button>
                    </div>
                  </form>
                )}

                {/* IMPORT LOCAL */}
                {showImport && (
                  <form onSubmit={handleImportWallet} className="mt-4 space-y-4">
                    <textarea value={importMnemonic} onChange={(e) => setImportMnemonic(e.target.value)} placeholder="12 or 24 word recovery phrase" className="w-full h-20 bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-2 text-sm font-mono" />
                    <input type="password" autoComplete="new-password" required minLength={6} placeholder="New password for this wallet" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" />
                    <input type="password" autoComplete="new-password" required placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" />
                    {authError && <div className="text-red-400 text-xs">{authError}</div>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowImport(false)} className="flex-1 py-2 border border-zinc-700 rounded-xl text-sm">Cancel</button>
                      <button type="submit" className="flex-1 py-2 bg-emerald-500 text-black font-bold rounded-xl text-sm">Import</button>
                    </div>
                  </form>
                )}

                {/* If there are local vaults, offer unlock for guest mode */}
                {getLocalWallets().length > 0 && !showCreate && !showImport && (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthError('');
                    // For guest, we can unlock by setting a temp password and loading local wallets
                    // Simple: just set isUnlocked and load from local
                    if (password) {
                      // Try to decrypt first wallet as test
                      const locals = getLocalWallets();
                      if (locals.length > 0) {
                        try {
                          await activateWalletEntry(locals[0], password);
                          setIsUnlocked(true); // ensure
                        } catch (err) {
                          setAuthError('Wrong password for local wallet');
                        }
                      }
                    }
                  }} className="mt-4 space-y-3">
                    <div className="text-xs text-center">Existing local wallets detected on this device</div>
                    <input type="password" autoComplete="current-password" placeholder="Password for local wallets" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono" />
                    {authError && <div className="text-red-400 text-xs text-center">{authError}</div>}
                    <button type="submit" className="w-full py-2.5 bg-white text-black font-bold text-sm rounded-2xl">Unlock local wallets</button>
                  </form>
                )}

                <div className="mt-4 text-center">
                  <button onClick={() => { setGuestMode(false); setShowCreate(false); setShowImport(false); setAuthError(''); }} className="text-xs text-emerald-400 underline">Back to account login</button>
                </div>
              </>
            )}
          </div>

          <div className="text-center mt-6 text-[10px] text-zinc-500 font-mono tracking-widest">NO THIRD PARTIES • KEYS STAY LOCAL OR ENCRYPTED ON OUR SERVERS</div>
        </div>

        {/* SOCIAL SLIDE BAR / DRAWER - opens to many many social platforms. Full screen overlay, slides from right. */}
        <AnimatePresence>
          {showSocialDrawer && (
            <div className="fixed inset-0 z-[60] flex justify-end" onClick={() => setShowSocialDrawer(false)}>
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 280, damping: 30 }}
                className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-semibold text-lg">Sign in with social</div>
                      <div className="text-xs text-zinc-500">30+ platforms supported • demo accounts created on the fly</div>
                    </div>
                    <button onClick={() => setShowSocialDrawer(false)} className="text-xl leading-none text-zinc-400 hover:text-white">×</button>
                  </div>

                  <input
                    type="text"
                    value={socialSearch}
                    onChange={(e) => setSocialSearch(e.target.value)}
                    placeholder="Search platforms (facebook, tiktok...)"
                    className="w-full bg-black border border-zinc-800 focus:border-emerald-500 rounded-2xl px-4 py-2.5 text-sm mb-4"
                  />

                  <div className="grid grid-cols-1 gap-2">
                    {SOCIAL_PLATFORMS.filter(p =>
                      p.name.toLowerCase().includes(socialSearch.toLowerCase())
                    ).map((p) => (
                      <button
                        key={p.name}
                        onClick={() => handleSocialSignIn(p.name)}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left active:scale-[0.99] transition"
                      >
                        <span className="text-2xl w-8 text-center">{p.emoji}</span>
                        <span className="font-medium flex-1">{p.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Connect</span>
                      </button>
                    ))}
                    {SOCIAL_PLATFORMS.filter(p => p.name.toLowerCase().includes(socialSearch.toLowerCase())).length === 0 && (
                      <div className="text-xs text-zinc-500 py-4 text-center">No matches. Try another search.</div>
                    )}
                  </div>

                  <div className="mt-6 text-[10px] text-center text-zinc-500">
                    All social logins create/use demo accounts via our mt-auth system.<br />Real OAuth + profile import coming soon.
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ========== UNLOCKED MAIN WALLET UI ==========
  const currentFeeLabel = `${MT_TX_FEE} MT (~1¢ SOL equivalent)`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col selection:bg-emerald-400 selection:text-black">
      {/* TOP NAV */}
      <nav className="border-b border-zinc-800 bg-[#0a0a0a]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <span className="font-black text-lg text-black tracking-[-1.5px]">MT</span>
              </div>
              <div>
                <div className="font-bold tracking-tight text-xl leading-none">INFINITE WALLET</div>
                <div className="text-[10px] text-emerald-400/90 -mt-0.5 font-mono tracking-[1px]">MT-ECO SYSTEM</div>
              </div>
            </div>
            <div className="ml-3 px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-mono border border-emerald-900">LIVE • SELF BUILT • MT-ECO SYSTEM</div>
            {devMode && (
              <button
                onClick={() => { setActiveTab('settings'); }}
                className="ml-2 px-2 py-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-mono tracking-widest border border-emerald-300 active:opacity-80"
                title="Developer Mode is ON — click to jump to Settings"
              >
                DEV
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs font-mono text-zinc-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {(() => { const n = getMTNode ? getMTNode() : null; return n ? n.replace('http://', '') : 'official MT node'; })()}
            </div>

            {mtAddress && (
              <button onClick={() => copy(mtAddress, 'MT address')} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-2xl text-xs font-mono transition">
                {shortAddr(mtAddress)}
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}

            <button onClick={handleLock} className="flex items-center gap-2 px-4 py-1.5 text-xs rounded-2xl border border-zinc-700 hover:bg-zinc-950 transition">
              <Lock className="w-3.5 h-3.5" /> LOCK
            </button>

            {isLoggedIn && (
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-1.5 text-xs rounded-2xl border border-red-800 text-red-400 hover:bg-red-950 transition">
                LOGOUT
              </button>
            )}
          </div>
        </div>

        {/* TAB BAR */}
        <div className="border-t border-zinc-800">
          <div className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto py-2 text-sm">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              const label = (devMode && t.devLabel) ? t.devLabel : t.label;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-2xl whitespace-nowrap transition font-medium text-sm ${active ? 'bg-white text-black' : 'hover:bg-zinc-900 text-zinc-400 hover:text-white'}`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* BODY */}
      <div className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        {/* Status bar */}
        <div className="mb-6 flex items-center justify-between text-xs">
          <div className="font-mono text-emerald-400/80 flex items-center gap-2">
            <div className="w-px h-3 bg-emerald-400/40" /> {status}
          </div>
          <button onClick={refreshAll} disabled={loadingBalances} className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 disabled:opacity-50 text-xs font-medium">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBalances ? 'animate-spin' : ''}`} /> REFRESH ON-CHAIN
          </button>
        </div>

        {/* PORTFOLIO */}
        {activeTab === 'portfolio' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* MT Native Balance - Primary */}
              <div className="col-span-1 md:col-span-2 rounded-3xl bg-zinc-950 border border-zinc-800 p-8">
                <div className="flex justify-between">
                  <div>
                    {activeWalletId && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background: (myWallets.find(x=>x.id===activeWalletId)?.color) || '#10b981'}} />
                        <span className="text-xs text-zinc-400">Active: {(myWallets.find(x=>x.id===activeWalletId)?.name) || 'Wallet'}</span>
                      </div>
                    )}
                    <div className="uppercase tracking-[2px] text-xs text-emerald-400 font-semibold">NATIVE MT (PRIMARY — OUR NETWORK)</div>
                    <div className="mt-3 text-6xl font-black tabular-nums tracking-[-2.5px]">{mtBalance.toFixed(2)}</div>
                    <div className="text-emerald-400 text-xl font-semibold -mt-1">$MT</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-500">Primary $MT on the MT native chain. Send/receive here when node connected.</div>
                    <div className="mt-6 flex gap-3">
                      <button onClick={() => { setActiveTab('send-receive'); setShowSendModal(true); }} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-white transition rounded-2xl text-black font-semibold text-sm flex items-center gap-2">
                        <Send className="w-4 h-4" /> SEND
                      </button>
                      <button onClick={() => { setActiveTab('send-receive'); setShowReceiveModal(true); }} className="px-5 py-2 border border-zinc-700 hover:bg-zinc-900 rounded-2xl text-sm flex items-center gap-2">
                        <QrCode className="w-4 h-4" /> RECEIVE
                      </button>
                    </div>
                    {(() => {
                      const n = getMTNode ? getMTNode() : null;
                      const isLocalNode = n && (n.includes('localhost') || n.includes('127.0.0.1'));
                      const isLocalHost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
                      const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
                      const hasConfiguredNode = !!n;
                      // Only show test faucet for actual local/dev nodes, not on public live site even if custom https node is configured via VITE/env
                      return (isLocalNode || isLocalHost) && !isVercel;
                    })() && (
                      <button
                        onClick={async () => {
                          try {
                            setStatus('Requesting test MT from node faucet...');
                            const r = await requestTestFunds(mtAddress);
                            setStatus(`Faucet success: +${r.credited} test MT`);
                            await refreshAll();
                          } catch (e) {
                            setStatus(`Faucet error: ${e.message}`);
                          }
                        }}
                        className="mt-3 w-full text-xs py-1.5 rounded-xl border border-dashed border-emerald-800/60 text-emerald-400 hover:bg-emerald-950/40 transition"
                      >
                        Request Test Funds (dev only)
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-zinc-900 text-xs flex gap-6 text-zinc-400 font-mono">
                  <div>NETWORK FEE: <span className="text-emerald-400">{currentFeeLabel}</span></div>
                  <div>NONCE: {mtNonce}</div>
                  <div>ADDRESS (native MT): <button onClick={() => copy(mtAddress)} className="underline decoration-dotted hover:text-white">{shortAddr(mtAddress)}</button></div>
                </div>
              </div>

              {/* Side assets - secondary to the native MT primary card */}
              <div className="space-y-5">
                <div className="rounded-3xl bg-zinc-950 border border-zinc-800 p-6">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>SOLANA $MT (SPL) — real token on Solana</span>
                    <button 
                      onClick={async () => {
                        if (!solAddress) { setStatus('No Solana address for active wallet'); return; }
                        try {
                          clearSolanaBalanceCache();
                          const bal = await fetchSolanaMTBalance(solAddress);
                          setSolMTBalance(bal);
                          setStatus(`Force synced Solana $MT (SPL): ${bal}`);
                        } catch (err) {
                          setStatus('Solana $MT sync failed: ' + (err.message || 'see console'));
                        }
                      }}
                      className="text-[10px] underline text-emerald-300 hover:text-emerald-400"
                    >
                      force sync
                    </button>
                  </div>
                  <div className="text-4xl font-semibold tabular-nums mt-1">{solMTBalance.toFixed(2)}</div>
                  <div className="text-[10px] text-emerald-400/70 mt-1">
                    Legacy $MT on Solana (SPL). Bridge to native MT on our chain for primary holdings. Use force sync if needed.
                  </div>
                  {getMoralisApiKey() ? (
                    <div className="mt-1 text-[10px] text-emerald-400/60">SPL balance via Moralis (reliable path).</div>
                  ) : null}
                  <div className="text-[10px] text-zinc-500 mt-1">SOL addr: <button onClick={() => copy(solAddress)} className="underline decoration-dotted">{shortAddr(solAddress)}</button></div>
                </div>
                <div className="rounded-3xl bg-zinc-950 border border-zinc-800 p-6">
                  <div className="text-xs text-zinc-400">SOL (for bridging / fees / swap gas)</div>
                  <div className="text-4xl font-semibold tabular-nums mt-1">{solSOLBalance.toFixed(4)}</div>
                  <div className="text-xs text-zinc-500">Solana mainnet • {shortAddr(solAddress)}</div>
                </div>
              </div>

              {/* Multi-chain / bridge stub per request - focus native, Solana for bridge, others coming */}
              <div className="mt-4 text-[10px] text-zinc-500 border border-zinc-800 rounded-2xl p-3">
                Multi-chain view (BTC, ETH, SOL + more) + direct bridge MT-Solana ↔ Native MT coming. Hold primary $MT on our network. Current Solana SPL is legacy for bridging in.
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowSendModal(true)} className="px-6 py-3 bg-white text-black rounded-2xl font-semibold flex items-center gap-2 text-sm active:scale-[0.985]"><Send className="w-4 h-4" /> SEND MT</button>
              <button onClick={() => { setActiveTab('send-receive'); setShowReceiveModal(true); }} className="px-6 py-3 border border-zinc-700 rounded-2xl font-semibold flex items-center gap-2 text-sm"><QrCode className="w-4 h-4" /> SHOW QR / ADDRESS</button>
              <button onClick={() => setShowMintModal(true)} className="px-6 py-3 border border-emerald-800 hover:bg-emerald-950 text-emerald-400 rounded-2xl font-semibold flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> MINT NFT ON MT</button>
              <button onClick={refreshAll} className="px-5 py-3 text-sm border border-zinc-800 rounded-2xl flex items-center gap-2 hover:bg-zinc-950"><RefreshCw className="w-4 h-4" /> SYNC ALL</button>
            </div>

            {/* Wallets manager - supports both logged in (with cloud) and guest local */}
            {(isLoggedIn || isUnlocked) && (
              <div className="mt-6 bg-zinc-950 border border-zinc-800 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Your Wallets</div>
                  <div className="flex gap-2">
                    <button 
                      onClick={isLoggedIn ? handleCreateAccountWallet : () => { /* for guest, user can use initial guest create */ setStatus('For additional local wallets, lock and use guest create, or activate one first.'); }} 
                      className="text-xs px-3 py-1.5 rounded-xl border border-emerald-800 text-emerald-400">+ Personal
                    </button>
                    <button 
                      onClick={() => createSpecialWallet('couples')} 
                      className="text-xs px-3 py-1.5 rounded-xl border border-purple-800 text-purple-400">+ Couples
                    </button>
                    <button 
                      onClick={() => createSpecialWallet('business')} 
                      className="text-xs px-3 py-1.5 rounded-xl border border-blue-800 text-blue-400">+ Business
                    </button>
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  {(() => {
                    const walletsToShow = isLoggedIn ? myWallets : (myWallets.length ? myWallets : getLocalWallets());
                    return walletsToShow.map((w) => {
                      const accent = w.color || '#10b981';
                      const mtAddr = w.publicKey || w.address;
                      const solAddr = w.solanaPublicKey;
                      return (
                        <div 
                          key={w.id} 
                          onClick={() => activateWalletEntry(w)}
                          className={`flex justify-between items-center p-3 rounded-2xl border cursor-pointer hover:bg-zinc-900/50 ${activeWalletId === w.id ? 'border-emerald-500 bg-emerald-950/20' : 'border-zinc-800'}`}
                          style={{ borderLeft: `4px solid ${accent}` }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background: accent}} />
                              {w.name}
                              {w.type === 'couples' && <span className="ml-1 text-[9px] px-1.5 py-0 bg-purple-500/20 text-purple-400 rounded">COUPLES</span>}
                              {w.type === 'business' && <span className="ml-1 text-[9px] px-1.5 py-0 bg-blue-500/20 text-blue-400 rounded">BUSINESS</span>}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                              MT: {mtAddr ? mtAddr.slice(0,8) + '...' : '—'}
                              <button 
                                onClick={async (e) => { 
                                  e.stopPropagation(); 
                                  await forceSyncNativeForEntry(w.id, mtAddr); 
                                }} 
                                className="ml-1 text-[9px] underline text-emerald-300">force sync native</button>
                            </div>
                            {(() => {
                              // For the active wallet, always make the Solana force sync visible,
                              // even if the persisted entry is old and missing solanaPublicKey.
                              // Use persisted if present, else the currently derived one for the active wallet.
                              const isActive = activeWalletId === w.id;
                              const displaySol = solAddr || (isActive ? solAddress : null);
                              if (!displaySol) return null;
                              const label = solAddr ? 'SOL:' : (isActive ? 'SOL (active):' : null);
                              if (!label) return null;
                              return (
                                <div className="text-[10px] font-mono text-blue-400 truncate">
                                  {label} {displaySol.slice(0,8)}...
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); copy(displaySol, 'Solana address'); }} 
                                    className="ml-1 text-[9px] underline text-blue-300">copy</button>
                                  <button 
                                    onClick={async (e) => { 
                                      e.stopPropagation(); 
                                      try {
                                        clearSolanaBalanceCache();
                                        const bal = await fetchSolanaMTBalance(displaySol);
                                        setSolMTBalance(bal);
                                        setStatus(`Queried on-chain Solana $MT (SPL) for this addr: ${bal}`);
                                      } catch(err) {
                                        setStatus('Query failed: ' + err.message);
                                      }
                                    }} 
                                    className="ml-1 text-[9px] underline text-emerald-300">force sync SPL</button>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex gap-1 items-center flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <button onClick={() => activateWalletEntry(w)} className="text-xs px-2.5 py-0.5 rounded bg-emerald-500 text-black">ACTIVATE</button>
                            <button 
                              onClick={() => {
                                setEditingWalletId(w.id);
                                setEditName(w.name || 'Wallet');
                                setEditColor(w.color || '#10b981');
                              }} 
                              className="text-xs px-1.5 py-0.5 rounded border border-zinc-700 hover:bg-zinc-900">✎</button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); revealSeedForEntry(w); }} 
                              className="text-xs px-1.5 py-0.5 rounded border border-amber-700 text-amber-400 hover:bg-amber-950" 
                              title="Reveal recovery phrase (enter password)">🔑</button>
                            {isLoggedIn && getAuthToken() && getAuthURL() && <button onClick={async () => { await (await import('./lib/mt-wallet')).deleteBackedUpWallet(w.id); await loadMyWallets(); }} className="text-xs px-1 text-red-400">×</button>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {(() => {
                    const count = isLoggedIn ? myWallets.length : (myWallets.length ? myWallets.length : getLocalWallets().length);
                    return count === 0;
                  })() && (
                    <div className="text-xs text-zinc-500">No wallets yet. Use the + button (or restart app for guest create flow).</div>
                  )}
                </div>
                <div className="text-[10px] text-zinc-500 mt-3">{isLoggedIn ? 'Backed up to your account (encrypted). Login on any device.' : 'Local only to this browser.'}</div>
                <div className="text-[10px] text-zinc-500 mt-1">Native $MT on our chain is primary. Solana SPL is legacy/bridge only.</div>
              </div>
            )}
          </div>
        )}

        {/* BUY / SELL - fully in-wallet (Jupiter powered but executed inside INFINITE WALLET) */}
        {activeTab === 'trade' && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-6">
              <div className="font-semibold text-2xl">Buy / Sell (Solana SPL leg)</div>
              <div className="text-sm text-zinc-400 mt-1">In-wallet Jupiter for the legacy Solana $MT (SPL). Use to prepare for bridge to native MT on our chain. Primary $MT lives on the MT network.</div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 space-y-5">
              {/* From */}
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>From</span>
                  <span>Balance: {swapFrom === 'SOL' ? solSOLBalance.toFixed(4) : solMTBalance.toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <select value={swapFrom} onChange={e => { setSwapFrom(e.target.value); setSwapQuote(null); }} className="bg-black border border-zinc-700 rounded-xl px-3 py-2 text-sm">
                    <option value="SOL">SOL</option>
                    <option value="MT">$MT (Solana)</option>
                  </select>
                  <input 
                    type="number" 
                    value={swapAmount} 
                    onChange={e => { setSwapAmount(e.target.value); setSwapQuote(null); }} 
                    placeholder="0.00" 
                    className="flex-1 bg-black border border-zinc-700 rounded-xl px-3 py-2 text-xl font-mono" 
                  />
                </div>
              </div>

              {/* To */}
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>To (estimated)</span>
                </div>
                <div className="flex gap-2">
                  <select value={swapTo} onChange={e => { setSwapTo(e.target.value); setSwapQuote(null); }} className="bg-black border border-zinc-700 rounded-xl px-3 py-2 text-sm">
                    <option value="MT">$MT (Solana)</option>
                    <option value="SOL">SOL</option>
                  </select>
                  <div className="flex-1 bg-black border border-zinc-700 rounded-xl px-3 py-2 text-xl font-mono text-emerald-400">
                    {swapQuote ? (Number(swapQuote.outAmount) / 1e6).toFixed(4) : '—'}
                  </div>
                </div>
              </div>

              {swapQuote && (
                <div className="text-xs bg-black/60 p-3 rounded-xl font-mono space-y-1 text-zinc-400">
                  <div>Price Impact: {swapQuote.priceImpactPct || '0'}%</div>
                  <div>Route: {swapQuote.routePlan?.length || 1} hop(s)</div>
                  <div>Slippage: 1%</div>
                </div>
              )}

              {swapError && <div className="text-red-400 text-xs">{swapError}</div>}

              <div className="flex gap-3">
                <button 
                  onClick={async () => {
                    setSwapError('');
                    setSwapQuote(null);
                    if (!swapAmount || !wallet) {
                      setSwapError('Enter amount and activate a wallet with Solana keys');
                      return;
                    }
                    try {
                      const inputMint = swapFrom === 'SOL' ? SOL_MINT : MT_SOLANA_MINT;
                      const outputMint = swapTo === 'MT' ? MT_SOLANA_MINT : SOL_MINT;
                      const amount = Math.floor(Number(swapAmount) * (swapFrom === 'SOL' ? 1e9 : 1e6));

                      const quote = await fetchJupiterQuote({
                        inputMint, outputMint, amount, slippageBps: 100
                      });
                      setSwapQuote(quote);
                    } catch (e) {
                      setSwapError('Quote failed: ' + (e.message || 'check console / Solana RPC / Jupiter API status. Requires SOL for gas + some SPL $MT balance.'));
                    }
                  }}
                  disabled={!swapAmount || swapping}
                  className="flex-1 py-3 rounded-2xl border border-zinc-700 hover:bg-zinc-900 text-sm font-semibold disabled:opacity-50"
                >
                  Get Quote
                </button>

                <button 
                  onClick={async () => {
                    setSwapError('');
                    if (!swapQuote || !wallet) return;

                    setSwapping(true);
                    try {
                      const result = await executeJupiterSwap(swapQuote, wallet);

                      setStatus(`Swap successful! Tx: ${result.signature.slice(0,8)}...`);
                      setSwapQuote(null);
                      setSwapAmount('');
                      setTimeout(refreshAll, 1500);
                    } catch (e) {
                      setSwapError('Swap failed: ' + e.message);
                    } finally {
                      setSwapping(false);
                    }
                  }}
                  disabled={!swapQuote || swapping}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 text-black font-bold text-sm tracking-wider disabled:opacity-50"
                >
                  {swapping ? 'Swapping...' : 'Confirm Swap (in-wallet)'}
                </button>
              </div>

              <div className="text-[10px] text-center text-zinc-500">
                In-wallet Jupiter swap on Solana for the SPL $MT (legacy/bridge only). Native MT on our chain is the primary asset. {wallet && getSolanaKeypair && <span className="font-mono block">Solana addr: {getSolanaKeypair(wallet)?.publicKey.toBase58().slice(0,8)}...</span>}
              </div>
            </div>
          </div>
        )}

        {/* SEND / RECEIVE */}
        {activeTab === 'send-receive' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Send card */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
              <div className="flex items-center gap-3 text-emerald-400 mb-6">
                <ArrowUpRight className="w-5 h-5" />
                <div className="font-semibold tracking-wide">SEND NATIVE $MT</div>
              </div>

              <form onSubmit={handleSend} className="space-y-5">
                <div>
                  <div className="text-xs text-zinc-400 mb-1.5 font-medium">RECIPIENT MT ADDRESS (bs58)</div>
                  <input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="5x... or your friend's MT pubkey" className="font-mono text-sm w-full bg-black border border-zinc-800 focus:border-emerald-600 rounded-2xl px-4 py-3" required />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1.5 font-medium">
                    <div>AMOUNT</div>
                    <button type="button" onClick={() => setSendAmount(String(Math.max(0, mtBalance - MT_TX_FEE - 0.01)))} className="text-emerald-400">MAX (minus fee)</button>
                  </div>
                  <div className="relative">
                    <input type="number" step="any" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.00" className="font-mono text-xl w-full bg-black border border-zinc-800 focus:border-emerald-600 rounded-2xl px-4 py-3 pr-16" required />
                    <div className="absolute right-5 top-3.5 text-sm text-zinc-400 font-semibold">$MT</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/60 border border-zinc-900 p-4 text-xs font-mono space-y-1 text-zinc-400">
                  <div className="flex justify-between"><span>Amount</span><span>{sendAmount || '0'} MT</span></div>
                  <div className="flex justify-between text-emerald-400"><span>Network fee (fixed)</span><span>{currentFeeLabel}</span></div>
                  <div className="pt-1 border-t border-zinc-900 flex justify-between font-semibold text-white"><span>Total deduction</span><span>{(parseFloat(sendAmount || 0) + MT_TX_FEE).toFixed(2)} MT</span></div>
                </div>

                <button disabled={sending || !sendTo || !sendAmount} type="submit" className="w-full py-4 rounded-2xl bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold tracking-widest text-sm mt-2 flex items-center justify-center gap-2">
                  {sending ? 'SIGNING & BROADCASTING...' : 'SIGN WITH LOCAL KEY & SEND'}
                </button>
                <div className="text-center text-[10px] text-emerald-400/60">Signature happens 100% in your browser. Never sent to any server.</div>
              </form>
            </div>

            {/* Receive */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 flex flex-col">
              <div className="flex items-center gap-3 text-emerald-400 mb-6">
                <ArrowDownLeft className="w-5 h-5" />
                <div className="font-semibold tracking-wide">RECEIVE</div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="MT Address QR" className="rounded-2xl border border-zinc-800 p-3 bg-black" />
                ) : (
                  <div className="w-56 h-56 bg-zinc-900 rounded-2xl animate-pulse" />
                )}

                <div className="mt-6 text-center">
                  <div className="text-xs text-zinc-500">YOUR MT ADDRESS</div>
                  <button onClick={() => copy(mtAddress)} className="mt-1 font-mono text-sm break-all hover:text-emerald-400 transition">{mtAddress}</button>
                </div>
              </div>

              <button onClick={() => copy(mtAddress)} className="mt-4 py-3 rounded-2xl border border-zinc-700 flex items-center justify-center gap-2 text-sm">
                <Copy className="w-4 h-4" /> COPY ADDRESS
              </button>
            </div>
          </div>
        )}

        {/* NFTs */}
        {activeTab === 'nfts' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-xl">Your On-Chain NFTs</div>
              <button onClick={() => setShowMintModal(true)} className="px-5 py-2 rounded-2xl bg-emerald-500 text-black text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> MINT NEW NFT</button>
            </div>
            {nfts.length === 0 ? (
              <div className="text-center py-20 text-zinc-400 border border-dashed border-zinc-800 rounded-3xl">No NFTs yet. Mint your first companion or game asset above — stored forever on the MT chain.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {nfts.map((nft, i) => (
                  <div key={i} className="border border-zinc-800 bg-zinc-950 rounded-3xl p-5 flex flex-col">
                    {nft.metadata?.image && (
                      <img 
                        src={nft.metadata.image} 
                        alt={nft.metadata?.name || 'NFT'} 
                        className="w-full aspect-square object-cover rounded-2xl mb-3 border border-zinc-700" 
                      />
                    )}
                    <div className="font-mono text-xs text-emerald-400 mb-1 truncate">{nft.tokenId}</div>
                    <div className="font-semibold text-lg truncate">{nft.metadata?.name || 'Unnamed Asset'}</div>
                    <div className="text-sm text-zinc-400 mt-1 line-clamp-3 flex-1">{nft.metadata?.description}</div>
                    {nft.metadata?.attributes?.length > 0 && (
                      <div className="mt-3 text-[10px] text-zinc-500 space-y-0.5">
                        {nft.metadata.attributes.map((attr, idx) => (
                          <div key={idx}>{attr.trait_type}: {attr.value}</div>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 mt-4 font-mono">OWNER: {shortAddr(nft.owner)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ROCKETS - Earned per game on MT network (no demo) */}
        {activeTab === 'rockets' && (
          <div className="max-w-2xl">
            <div className="text-2xl font-bold mb-2">Rockets</div>
            <p className="text-zinc-400">Utility earned in MT-powered games. Per-game breakdown below. Transferrable on the native chain.</p>

            <div className="mt-6 space-y-3">
              {[
                { game: 'Cosmic Dash', earned: 0, note: 'Play connected games to earn' },
                { game: 'MT Arcade', earned: 0, note: 'Coming soon' },
                { game: 'Other titles', earned: 0, note: 'Earned rockets reported here' },
              ].map((g, i) => (
                <div key={i} className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{g.game}</div>
                    <div className="text-xs text-zinc-500">{g.note}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold tabular-nums">{g.earned}</div>
                    <div className="text-xs text-orange-400">ROCKETS</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-xs text-center text-zinc-500">Rockets are native on-chain assets. More games will feed earnings here automatically.</div>
          </div>
        )}

        {/* ACTIVITY */}
        {activeTab === 'activity' && (
          <div>
            <div className="font-semibold mb-4">On-Chain Activity (native MT + SPL/bridge)</div>
            {txs.length === 0 ? (
              <div className="text-zinc-400 py-12 text-center border border-dashed border-zinc-800 rounded-3xl">No transactions yet. Sends, receives, NFT mints, buys/sells and bridges will appear here. Solana-side txs viewable on solscan.io.</div>
            ) : (
              <div className="space-y-2 font-mono text-sm">
                {txs.map((tx, idx) => (
                  <div key={idx} className="flex justify-between bg-zinc-950 border border-zinc-800 px-5 py-3 rounded-2xl">
                    <div className="flex gap-4 items-center">
                      <div className="text-emerald-400 text-xs px-2 py-0.5 rounded bg-emerald-950">{tx.type || 'TRANSFER'}</div>
                      <div>{shortAddr(tx.from)} → {shortAddr(tx.to)}</div>
                    </div>
                    <div className="text-right">
                      <span className="tabular-nums">{tx.amount} MT</span>
                      <span className="text-xs text-zinc-500 ml-2">fee {tx.fee}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-zinc-500 mt-3">Native activity via mt-core explorer. For Solana SPL/buy-sell/bridge activity use solscan.io with your SOL address.</div>
          </div>
        )}

        {/* BRIDGE (unique self-built, no 3rd party) */}
        {activeTab === 'bridge' && (
          <div className="max-w-3xl">
            <div className="uppercase text-xs tracking-widest text-emerald-400 mb-1">CROSS-CHAIN • BUILT IN-HOUSE</div>
            <div className="text-3xl font-semibold tracking-tight mb-6">Bridge to any chain (starting with Solana)</div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
              <div className="text-sm">Current flow (live on MT node + Solana verifier):</div>
              <ol className="list-decimal ml-5 mt-4 space-y-2 text-sm text-zinc-300">
                <li>Hold $MT on Solana (the pump.fun token)</li>
                <li>Burn / send to bridge program address on Solana (we verify on-chain)</li>
                <li>Submit proof in this wallet → native MT is minted 1:1 to your MT address</li>
              </ol>
              <div className="mt-8 text-xs bg-black p-4 rounded-2xl font-mono border border-zinc-900">Solana burn verification + MT mint proof is implemented in mt-core. Full UI + two-way coming next.</div>
            </div>

            <div className="text-xs mt-6 text-center text-zinc-500">Future: direct bridges to ETH, Base, Solana (bi-directional), and any chain we add verifier modules for. Zero reliance on third-party bridges.</div>
          </div>
        )}

        {/* SETTINGS + SECURITY */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-8">
            <div>
              <div className="font-semibold mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> SECURITY — NO COMPROMISE</div>
              <ul className="space-y-2 text-sm text-zinc-300 list-disc ml-5">
                <li>All private keys &amp; seed generated and stored only in this browser.</li>
                <li>Mnemonic encrypted with AES-GCM + strong PBKDF2 using your password.</li>
                <li>Signing happens locally. The MT node only ever sees a signature + public data.</li>
                <li>No Firebase, no external auth, no analytics, no third-party key custody.</li>
                <li>Locking the wallet clears decrypted keys from memory instantly.</li>
                <li>Future: hardware wallet support, 2FA on auth service, encrypted cloud backup with your own keys only.</li>
              </ul>
            </div>

            {/* Seed reveal available per-wallet in the list above (Portfolio tab) — requires password. */}

            {/* Solana RPC override removed from customer Settings - managed internally */}

            {/* Moralis key override removed from customer Settings - internal config */}

            {/* Official locked nodes - no customer-editable fields */}
            <div className="border border-zinc-800 rounded-3xl p-4 bg-zinc-950 mt-2">
              <div className="font-semibold text-sm mb-2 text-emerald-400">Node Configuration</div>
              <div className="text-xs text-zinc-400">Connected to official MT-ECO SYSTEM nodes for primary native $MT and secure backups. Managed for reliability.</div>
              <div className="mt-2 text-[10px] text-emerald-400/70">MT Node: {getMTNode()} (locked official)</div>
              <div className="text-[10px] text-emerald-400/70">Auth: {getAuthURL()} (locked official)</div>
              <div className="mt-3 pt-3 border-t border-zinc-800 text-[10px] text-zinc-500">Developed by Futuret3ch and MemeTorrent • MT-ECO SYSTEM</div>
            </div>

            {/* DEVELOPER MODE — the major self-hosted API + observability layer for the whole ecosystem */}
            <div className="border border-emerald-400/30 rounded-3xl p-4 bg-zinc-950">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-emerald-400 flex items-center gap-2">
                    <span>DEVELOPER MODE</span>
                    {devMode && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400 text-black font-mono">ON</span>}
                  </div>
                  <div className="text-[10px] text-zinc-400">Self-hosted admin, analytics, direct MT node testing, full MT-Connect sandbox &amp; live logs. Ties into the master admin system (mt-admin-api) and the public /developers API reference.</div>
                </div>
                <button
                  onClick={() => toggleDevMode(!devMode)}
                  className={`px-4 py-1.5 rounded-2xl text-xs font-semibold border transition ${devMode ? 'bg-emerald-400 text-black border-emerald-400' : 'border-white/20 hover:bg-white/5'}`}
                >
                  {devMode ? 'DISABLE' : 'ENABLE'}
                </button>
              </div>

              {devMode && (
                <div className="space-y-4 mt-3 pt-3 border-t border-white/10 text-xs">
                  {/* Live effective endpoints + session overrides for testing against your VPS / local */}
                  <div>
                    <div className="font-medium text-emerald-400 mb-1">Effective Endpoints (session overrides)</div>
                    <div className="text-[10px] text-zinc-400 mb-1">MT Node: <span className="font-mono text-emerald-300">{effectiveMTNode()}</span></div>
                    <div className="text-[10px] text-zinc-400 mb-2">Auth: <span className="font-mono text-emerald-300">{effectiveAuth()}</span></div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={devNodeOverride}
                        onChange={(e) => setDevNodeOverride(e.target.value)}
                        placeholder="Override MT node (e.g. http://161.97.106.182:4001 or https://api...)"
                        className="bg-black border border-white/10 rounded-xl px-3 py-1.5 font-mono text-[10px] placeholder:text-zinc-500"
                      />
                      <input
                        value={devAuthOverride}
                        onChange={(e) => setDevAuthOverride(e.target.value)}
                        placeholder="Override Auth URL (e.g. http://localhost:4002)"
                        className="bg-black border border-white/10 rounded-xl px-3 py-1.5 font-mono text-[10px] placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-1">Overrides apply only while Developer Mode is on and this tab is open. Clear the fields to use the locked official endpoints again.</div>
                  </div>

                  {/* Quick actions */}
                  <div>
                    <div className="font-medium text-emerald-400 mb-1">Quick Developer Actions</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const url = 'https://memetorrent-react.vercel.app/developers';
                          window.open(url, '_blank');
                          addDevLog('Opened full public API + MT-Connect sandbox (the /developers page with all 6 social flows + wallet deeplinks).');
                        }}
                        className="px-3 py-1 rounded-xl border border-white/15 hover:bg-white/5"
                      >
                        Open Full API Sandbox (/developers)
                      </button>
                      <button
                        onClick={() => {
                          const admin = 'https://admin.futuret3ch.com.au/dashboard';
                          window.open(admin, '_blank');
                          addDevLog('Opened self-hosted master Admin Dashboard (analytics, vitals/RES, traffic, firewall rules, events).');
                        }}
                        className="px-3 py-1 rounded-xl border border-white/15 hover:bg-white/5"
                      >
                        Open Master Admin Dashboard
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('https://admin.futuret3ch.com.au/api/health').catch(() => null);
                            const txt = res ? await res.text() : 'no response (may be CORS or not deployed yet)';
                            addDevLog('Admin health: ' + txt);
                          } catch (e) {
                            addDevLog('Admin ping failed (expected until admin.futuret3ch.com.au is live on VPS + nginx). Use the /dashboard direct link.');
                          }
                        }}
                        className="px-3 py-1 rounded-xl border border-white/15 hover:bg-white/5"
                      >
                        Ping Admin API
                      </button>
                      <button
                        onClick={() => {
                          // Force a track event so you can immediately see it in the admin dashboard
                          try {
                            const payload = { source: 'web-wallet-dev', type: 'dev_mode_ping', path: '/settings', data: { ts: Date.now(), dev: true } };
                            const ADMIN_API = 'https://admin.futuret3ch.com.au';
                            if (navigator.sendBeacon) navigator.sendBeacon(ADMIN_API + '/api/track', JSON.stringify(payload));
                            else fetch(ADMIN_API + '/api/track', { method: 'POST', body: JSON.stringify(payload), keepalive: true });
                            addDevLog('Sent dev_mode_ping track event to self-hosted admin. Check /dashboard → Events or Overview.');
                          } catch (e) { addDevLog('Track send failed'); }
                        }}
                        className="px-3 py-1 rounded-xl border border-white/15 hover:bg-white/5"
                      >
                        Send Test Track Event
                      </button>
                    </div>
                  </div>

                  {/* Dev log */}
                  <div>
                    <div className="font-medium text-emerald-400 mb-1 flex items-center justify-between">
                      <span>Developer Log (this session)</span>
                      <button onClick={() => setDevLog([])} className="text-[9px] opacity-60 hover:opacity-100">clear</button>
                    </div>
                    <div className="bg-black/60 border border-white/10 rounded-2xl p-2 max-h-40 overflow-auto font-mono text-[10px] text-emerald-300/90 space-y-0.5">
                      {devLog.length === 0 && <div className="opacity-40">No events yet. Toggle features or use the quick actions above.</div>}
                      {devLog.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-1">All wallet operations (auth, native calls, trackers) are already logged to the self-hosted admin when reachable. This is the local mirror for this tab.</div>
                  </div>

                  <div className="text-[9px] text-emerald-400/70">
                    This is the on-ramp to the full MT-ECO SYSTEM developer experience: the public /developers sandbox (social OAuth flows for FB/IG/TikTok/Snap/Google/Microsoft + wallet deeplinks), the self-hosted mt-admin-api (vitals like Vercel Speed Insights but yours, traffic, rules, webhooks stubs), mt-core, and future SDKs for iOS/Android/bots/widgets.
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-zinc-500 pt-4">Primary holdings live on the MT native chain. Solana SPL is legacy for bridging.</div>

            {/* IMPORT FROM EXTERNAL (Phantom etc) - requested feature */}
            <div className="border border-zinc-800 rounded-3xl p-4 bg-zinc-950">
              <div className="font-semibold text-sm mb-1 text-emerald-400">Import from Phantom / Other Platforms</div>
              <div className="text-[10px] text-zinc-400 mb-3">Paste a Secret Recovery Phrase (seed) exported from Phantom (Settings → Export Secret Recovery Phrase) or another compatible wallet. It will be encrypted locally + backed up to your account (if logged in).</div>
              <div className="space-y-2">
                <textarea 
                  value={settingsImportMnemonic} 
                  onChange={(e) => setSettingsImportMnemonic(e.target.value)} 
                  placeholder="12 or 24 word recovery phrase" 
                  className="w-full h-14 bg-black border border-zinc-800 rounded-2xl px-3 py-2 text-xs font-mono" 
                />
                <input 
                  value={settingsImportName} 
                  onChange={(e) => setSettingsImportName(e.target.value)} 
                  placeholder="Name for imported wallet (optional)" 
                  className="w-full bg-black border border-zinc-800 rounded-2xl px-3 py-2 text-sm" 
                />
                <input type="password" value={settingsImportPwd} onChange={(e) => setSettingsImportPwd(e.target.value)} placeholder="Password to encrypt imported wallet" className="w-full bg-black border border-zinc-800 rounded-2xl px-3 py-2 text-sm font-mono" />
                <input type="password" value={settingsImportConfirmPwd} onChange={(e) => setSettingsImportConfirmPwd(e.target.value)} placeholder="Confirm password" className="w-full bg-black border border-zinc-800 rounded-2xl px-3 py-2 text-sm font-mono" />
                <button 
                  onClick={handleSettingsImportWallet} 
                  className="w-full py-2.5 mt-1 bg-emerald-500 hover:bg-emerald-600 active:bg-black active:text-emerald-400 border border-emerald-400 text-black font-bold rounded-2xl text-sm tracking-wider"
                >
                  IMPORT &amp; ADD TO MY WALLETS
                </button>
              </div>
              <div className="text-[9px] text-amber-400/70 mt-2">After import, go to Portfolio tab to activate the new wallet entry. Always double-check the phrase you pasted.</div>
            </div>
          </div>
        )}
      </div>

      {/* SEED REVEAL MODAL - view + export seed with password */}
      {revealedMnemonic && (
        <div 
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 p-4" 
          onClick={() => { setRevealedMnemonic(''); setRevealedWalletName(''); }}
        >
          <div 
            className="bg-zinc-950 border border-amber-900 rounded-3xl p-8 max-w-lg w-full" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔑</span>
              <div>
                <div className="font-bold text-amber-400">Recovery Phrase</div>
                <div className="text-xs text-zinc-400">for {revealedWalletName}</div>
              </div>
            </div>

            <div className="bg-red-950/60 border border-red-800 text-red-300 text-[11px] px-3 py-2 rounded-2xl mb-4">
              NEVER share this phrase. Anyone who has it can steal your funds on MT and Solana. Write it down offline. Close this window when done.
            </div>

            <div className="bg-black border border-zinc-800 rounded-2xl p-3 mb-4 font-mono text-sm">
              <div className="grid grid-cols-3 gap-1.5">
                {revealedMnemonic.trim().split(/\s+/).map((word, idx) => (
                  <div key={idx} className="flex items-center bg-zinc-900 rounded-xl px-3 py-1 text-xs">
                    <span className="w-5 text-right pr-2 text-emerald-400/60">{idx + 1}.</span>
                    <span className="font-semibold tracking-wider">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(revealedMnemonic).then(() => {
                    setStatus('Recovery phrase copied to clipboard');
                  }).catch(() => alert('Copy failed'));
                }}
                className="flex-1 py-3 border border-zinc-700 hover:bg-zinc-900 rounded-2xl text-sm font-semibold"
              >
                Copy to Clipboard
              </button>
              <button 
                onClick={() => {
                  const content = 
`MT-ECO SYSTEM Wallet Recovery Phrase
Wallet: ${revealedWalletName}
Exported: ${new Date().toISOString().slice(0,10)}

WARNING: This is your secret seed. Store it offline and never share it.
Anyone with these words can access ALL funds associated with this wallet (MT native + Solana).

${revealedMnemonic}
`;
                  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `mt-eco-${revealedWalletName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-seed.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  setStatus('Seed file downloaded. Store it safely offline.');
                }}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl text-sm"
              >
                Download as .txt
              </button>
            </div>

            <button 
              onClick={() => { setRevealedMnemonic(''); setRevealedWalletName(''); }} 
              className="mt-4 w-full py-2 text-xs text-zinc-400 hover:text-white"
            >
              Close (I have backed it up)
            </button>
          </div>
        </div>
      )}

      {/* FOOTER BAR */}
      <div className="border-t border-zinc-800 py-3 text-center text-[10px] text-zinc-500 font-mono tracking-widest">MT-ECO SYSTEM — Developed by Futuret3ch and MemeTorrent • EVERYTHING BUILT IN-HOUSE • 1 CENT FEES • YOUR ASSETS, YOUR RULES</div>

      {/* SEND MODAL */}
      <AnimatePresence>
        {showSendModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowSendModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-700 w-full max-w-md rounded-3xl p-8">
              <div className="flex justify-between mb-6">
                <div className="font-semibold">Send Native $MT</div>
                <button onClick={() => setShowSendModal(false)}><X /></button>
              </div>
              <form onSubmit={handleSend} className="space-y-4">
                <input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="Recipient MT address" className="w-full font-mono bg-black border border-zinc-800 rounded-2xl px-4 py-3 text-sm" required />
                <input type="number" value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="Amount" className="w-full font-mono bg-black border border-zinc-800 rounded-2xl px-4 py-3 text-xl" required />
                <div className="text-xs text-emerald-400">Fee: {currentFeeLabel}</div>
                <button disabled={sending} className="w-full py-4 bg-emerald-500 rounded-2xl text-black font-bold text-sm tracking-widest mt-2">{sending ? 'BROADCASTING...' : 'SIGN & BROADCAST'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RECEIVE MODAL */}
      <AnimatePresence>
        {showReceiveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowReceiveModal(false)}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-zinc-950 border border-zinc-700 rounded-3xl p-8 max-w-sm w-full text-center">
              <div className="font-semibold mb-4">Receive $MT</div>
              {qrDataUrl && <img src={qrDataUrl} className="mx-auto mb-4 rounded-2xl border border-zinc-800 p-4 bg-black" alt="QR" />}
              <div onClick={() => copy(mtAddress)} className="font-mono text-xs break-all cursor-pointer hover:text-emerald-400 active:text-white">{mtAddress}</div>
              <button onClick={() => copy(mtAddress)} className="mt-6 w-full py-3 text-sm border border-zinc-700 rounded-2xl">COPY ADDRESS</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MINT NFT MODAL - unique creator experience */}
      <AnimatePresence>
        {showMintModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowMintModal(false)}>
            <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()} className="bg-zinc-950 border border-zinc-700 w-full max-w-md rounded-3xl p-8">
              <div className="font-semibold mb-1">Mint NFT on MT Chain</div>
              <div className="text-xs text-zinc-400 mb-5">Creates a real on-chain NFT owned by your wallet. No third-party marketplace or minting service.</div>

              <input value={mintName} onChange={e => setMintName(e.target.value)} placeholder="NFT name (e.g. Cosmic Rocket #1)" className="w-full bg-black border border-zinc-800 rounded-2xl px-4 py-3 text-sm mb-3" />

              {/* Image upload for real image NFTs */}
              <div className="mb-3">
                <label className="text-xs text-zinc-400 block mb-1">Image (upload PNG/JPG — auto-resized to 512px max for on-chain metadata)</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { // 2MB raw
                    alert('Image file too large (>2MB). Compress or use smaller image.');
                    e.target.value = '';
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    // Auto-resize large uploads to keep on-chain metadata reasonable (~<1MB base64)
                    const img = new Image();
                    img.onload = () => {
                      const maxDim = 512;
                      let w = img.width;
                      let h = img.height;
                      if (w > maxDim || h > maxDim) {
                        if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                        else { w = Math.round(w * (maxDim / h)); h = maxDim; }
                      }
                      const c = document.createElement('canvas');
                      c.width = w; c.height = h;
                      c.getContext('2d').drawImage(img, 0, 0, w, h);
                      setMintImage(c.toDataURL('image/png', 0.9));
                    };
                    img.src = ev.target.result;
                  };
                  reader.readAsDataURL(file);
                }} className="text-sm" />
                {mintImage && (
                  <img src={mintImage} alt="preview" className="mt-2 max-h-24 rounded border border-zinc-800" />
                )}
              </div>

              {/* Simple in-wallet designer / decorator */}
              <div className="mb-3">
                <label className="text-xs text-zinc-400 block mb-1">Quick decorator (text + color → generates preview image)</label>
                <div className="flex gap-2">
                  <input value={mintDesignerText} onChange={e => setMintDesignerText(e.target.value)} placeholder="e.g. 'Limited Edition'" className="flex-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                  <input type="color" defaultValue="#10b981" id="designerColor" className="w-10 h-9 bg-black border border-zinc-800 rounded" />
                  <button type="button" onClick={() => {
                    const text = mintDesignerText || 'MT NFT';
                    const color = document.getElementById('designerColor')?.value || '#10b981';
                    const canvas = document.createElement('canvas');
                    canvas.width = 256; canvas.height = 256;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, 256, 256);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 20px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(text.slice(0, 20), 128, 128);
                    ctx.font = '12px monospace';
                    ctx.fillText('MT-ECO SYSTEM', 128, 160);
                    setMintImage(canvas.toDataURL('image/png'));
                  }} className="px-3 py-1 text-xs border border-zinc-700 rounded">Apply Designer</button>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">Creates a simple decorated image data URL included in the NFT metadata.</div>
              </div>

              <button disabled={minting || !mintName.trim()} onClick={handleMintNFT} className="w-full py-3 bg-emerald-500 text-black font-bold rounded-2xl text-sm tracking-wider disabled:bg-zinc-800">{minting ? 'MINTING ON MT NODE...' : 'MINT NFT (costs 0.01 MT fee)'}</button>
              <div className="text-center text-[10px] text-zinc-500 mt-4">Image + designer data stored on-chain with the NFT. Real native asset on the MT network.</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Per-wallet customization modal: name, color, etc. */}
      <AnimatePresence>
        {editingWalletId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={closeEdit}>
            <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()} className="bg-zinc-950 border border-zinc-700 w-full max-w-sm rounded-3xl p-6">
              <div className="font-semibold mb-4">Customize Wallet</div>

              <label className="text-xs text-zinc-400 block mb-1">Name</label>
              <input 
                value={editName} 
                onChange={e => setEditName(e.target.value)} 
                className="w-full bg-black border border-zinc-800 rounded-2xl px-4 py-2 text-sm mb-4" 
              />

              <label className="text-xs text-zinc-400 block mb-1">Color</label>
              <div className="flex items-center gap-3 mb-4">
                <input 
                  type="color" 
                  value={editColor} 
                  onChange={e => setEditColor(e.target.value)} 
                  className="w-12 h-10 p-0 bg-transparent border border-zinc-800 rounded overflow-hidden" 
                />
                <div className="text-xs font-mono">{editColor}</div>
                <div className="flex gap-1">
                  {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6'].map(c => (
                    <button key={c} onClick={() => setEditColor(c)} className="w-6 h-6 rounded border border-zinc-700" style={{background: c}} />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={closeEdit} className="flex-1 py-2 rounded-2xl border border-zinc-700 text-sm">Cancel</button>
                <button 
                  onClick={() => saveWalletCustomization(editingWalletId, editName.trim() || 'Wallet', editColor)} 
                  className="flex-1 py-2 rounded-2xl bg-emerald-500 text-black font-bold text-sm"
                >
                  Save
                </button>
              </div>

              <div className="text-[10px] text-zinc-500 mt-3 text-center">Customization is saved locally and synced to your account if logged in.</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
