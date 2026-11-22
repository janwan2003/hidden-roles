// Product screenshots for the landing page and the GitHub Pages product page.
// Plays a demo game through the API with friendly names, captures three phone screens in real Chromium
// (turncoat's night, the day vote, game over), writes WebP files to public/screens and docs/screens,
// then deletes the demo game.
// Usage: BASE=http://127.0.0.1:8841 node tools/screens.mjs   (needs python3 with Pillow for WebP)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8841';
const root = path.join(os.homedir(), '.cache/ms-playwright');
const dir = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()[0];
const browser = await chromium.launch({ executablePath: path.join(root, dir, 'chrome-linux64/chrome') });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-screens-'));

async function api(method, p, body, token) {
  const r = await fetch(`${BASE}/api/${p}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${p}: ${r.status} ${data.error}`);
  return data;
}

const names = ['Mum', 'Dad', 'Priya', 'Leo', 'Nana', 'Sam'];
const c = await api('POST', 'games', { name: "Christmas at Grandma's", nick: names[0], pace: 'daily', tz: 'Europe/London' });
const id = c.id;
const seat = { Mum: { token: c.token } };
try {
  for (const n of names.slice(1)) seat[n] = { token: (await api('POST', `games/${id}/join`, { nick: n })).token };
  await api('POST', `games/${id}/start`, {}, seat.Mum.token);
  for (const n of names) {
    const s = await api('GET', `games/${id}`, null, seat[n].token);
    Object.assign(seat[n], { id: s.me.id, role: s.me.role });
  }
  const T = names.find((n) => seat[n].role === 'turncoat');
  const loyals = names.filter((n) => n !== T);
  const vote = (by, target) => api('POST', `games/${id}/vote`, { target: seat[target].id }, seat[by].token);

  async function capture(who, file, before) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/g/${id}#k=${seat[who].token}`);
    await page.locator('#head .phase').waitFor();
    if (before) await before(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(tmp, file + '.png') });
    await ctx.close();
  }

  // 1. Night 1, the turncoat's screen: role shown, pick list, chat line.
  await api('POST', `games/${id}/chat`, { text: `Not ${loyals[0]}, too obvious.` }, seat[T].token);
  await capture(T, 'night', async (p) => { await p.click('[data-show-role]'); });

  // 2. Day 1: the turncoat picks, three people have voted, a loyal looks at the vote.
  const victim = loyals[1];
  await vote(T, victim);
  const voter = loyals[0];
  const alive = names.filter((n) => n !== victim);
  await vote(alive.find((n) => n !== voter && n !== T), T); // "first" below
  await vote(T, voter);
  await vote(voter, T);
  await capture(voter, 'vote', async (p) => {
    await p.evaluate(() => document.getElementById('role').classList.add('hidden'));
  });

  // 3. Everyone else votes for the turncoat: loyals win. Screen of a loyal.
  const first = alive.find((n) => n !== voter && n !== T); // already voted above
  for (const n of alive) if (![T, voter, first].includes(n)) await vote(n, T);
  const s = await api('GET', `games/${id}`);
  if (s.game.state !== 'over') throw new Error('demo game did not end: ' + s.game.state);
  await capture(voter, 'over');

  for (const out of ['public/screens', 'docs/screens']) fs.mkdirSync(out, { recursive: true });
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
src, outs = sys.argv[1], sys.argv[2:]
for name in ('night', 'vote', 'over'):
    im = Image.open(f'{src}/{name}.png').convert('RGB')
    im = im.resize((540, round(im.height * 540 / im.width)), Image.LANCZOS)
    for o in outs:
        im.save(f'{o}/{name}.webp', 'WEBP', quality=80, method=6)
`, tmp, 'public/screens', 'docs/screens']);
  console.log('wrote public/screens and docs/screens: night, vote, over');
} finally {
  await api('POST', `games/${id}/delete`, {}, seat.Mum.token).catch(() => {});
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
