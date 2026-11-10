import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx|json|html|css|md|example)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

test('source no longer contains embedded provider credentials or fixed wallet passwords', () => {
  const files = walk(root).filter((file) => !file.includes(`${path.sep}test${path.sep}`));
  const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(combined, /api-key=/i);
  assert.doesNotMatch(combined, /quiknode\.pro/i);
  assert.doesNotMatch(combined, /eyJ[A-Za-z0-9_-]{10,}\./);
  assert.doesNotMatch(combined, /social-login-demo/);
  assert.doesNotMatch(combined, /guest-special/);
  assert.doesNotMatch(combined, /http:\/\/\d{1,3}(?:\.\d{1,3}){3}/);
  assert.doesNotMatch(combined, /setMasterPassword\(accountPassword\)/);
  assert.doesNotMatch(combined, /setMasterPassword\(pass\)/);
});

test('the coming-soon lock is still the default screen', () => {
  const app = read('src/App.jsx');
  const wallet = read('src/lib/mt-wallet.js');
  assert.match(app, /COMING SOON/);
  assert.match(app, /signInLocked &&/);
  assert.match(app, /Social login is disabled until a real OAuth provider is connected/);
  assert.match(wallet, /resolveAuthTransport/);
  assert.match(wallet, /iterations:\s*210000/);
  assert.match(wallet, /name:\s*'AES-GCM'/);
});

test('deployment headers deny framing', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const headers = vercel.headers?.[0]?.headers || [];
  const csp = headers.find((header) => header.key === 'Content-Security-Policy')?.value || '';
  const frame = headers.find((header) => header.key === 'X-Frame-Options')?.value;
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.equal(frame, 'DENY');
  assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), true);
  assert.equal(fs.existsSync(path.join(root, '.gitignore')), true);
});
