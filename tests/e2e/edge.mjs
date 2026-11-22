// End-to-end test of the paths the main game test does not walk, in real Chromium:
// - a visitor without a seat watching every phase (lobby, night, day, over);
// - the personal link (#k=token) signing in a new device and leaving the address bar clean;
// - leaving the lobby, and the host removing a player (who is told);
// - a turncoat win; a quiet night and a tied vote ended by the host; the host ending a game early;
// - the 404 game page, the privacy page and the landing page anchors.
// Setup moves (joins, votes) go through the API to keep it fast; every screen checked is the real UI.
// Usage: BASE=http://127.0.0.1:8841 node tests/e2e/edge.mjs   (screenshots go to shots/)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8841';
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 } };
const errors = [];
const leaks = [];
const created = []; // [id, hostToken] to delete at the end
const browser = await chromium.launch({ executablePath: findChrome() });
const step = (s) => console.log('·', s);

async function api(method, p, body, token) {
  const res = await fetch(`${BASE}/api/${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function checkLeak(label, s) {
  if (!s || !s.players) return;
  const over = s.game.state === 'over';
  for (const p of s.players) {
    if (p.role && !over && p.alive && (!s.me || p.id !== s.me.id)) leaks.push(`${label} saw role of ${p.name}`);
  }
  if ((!s.me || s.me.role !== 'turncoat') && (s.turncoats || s.picks || s.chat)) leaks.push(`${label} got turncoat-only data`);
}

async function page(label, opts, expected = []) {
  const ctx = await browser.newContext(opts);
  const pg = await ctx.newPage();
  pg.on('console', (m) => {
    if (m.type() === 'error' && !expected.some((re) => re.test(m.text()))) errors.push(`${label}: ${m.text()}`);
  });
  pg.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  pg.on('dialog', (d) => d.accept());
  pg.on('response', async (r) => {
    if (r.request().method() === 'GET' && /\/api\/games\/[A-Za-z0-9]+$/.test(r.url()) && r.ok()) {
      try { checkLeak(label, await r.json()); } catch {}
    }
  });
  return pg;
}
const shot = (pg, name) => pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });

// A game with a host and players made through the API. Returns { id, seats: {name: {token, id}} }.
async function makeGame(gameName, names, pace = 'quick') {
  const c = await api('POST', 'games', { name: gameName, nick: names[0], pace, tz: 'Europe/Warsaw' });
  assert.equal(c.status, 201, 'create');
  const id = c.data.id;
  created.push([id, c.data.token]);
  const seats = { [names[0]]: { token: c.data.token } };
  for (const n of names.slice(1)) {
    const j = await api('POST', `games/${id}/join`, { nick: n });
    assert.equal(j.status, 201, 'join ' + n);
    seats[n] = { token: j.data.token };
  }
  for (const n of names) {
    const s = await api('GET', `games/${id}`, null, seats[n].token);
    seats[n].id = s.data.me.id;
  }
  return { id, seats, host: names[0] };
}
const stateAs = async (g, n) => (await api('GET', `games/${g.id}`, null, n ? g.seats[n].token : null)).data;
const voteAs = (g, n, target) => api('POST', `games/${g.id}/vote`, { target: g.seats[target].id }, g.seats[n].token);

try {
  // ---- Landing, privacy, 404 ----
  const land = await page('landing', PHONE);
  await land.goto(BASE + '/');
  await land.click('a[href="#how"]');
  await land.locator('#how h2').waitFor();
  const priv = await land.goto(BASE + '/privacy');
  assert.equal(priv.status(), 200, 'privacy page');
  await land.locator('h1').waitFor();
  const lost = await page('404', PHONE, [/404/]);
  const r404 = await lost.goto(BASE + '/g/doesnotexist1');
  assert.equal(r404.status(), 404);
  await lost.getByText('Game not found').waitFor();
  step('landing anchor, privacy 200, unknown game shows "Game not found" (404)');

  // ---- Game A: lobby moves, spectator, turncoat win ----
  const A = await makeGame('Edge Turncoat Win', ['Hana', 'Ivo', 'Jo', 'Kai', 'Lu']);
  // Host opens the personal link on a new device: signed in, token gone from the address bar.
  const host = await page('Hana', DESKTOP);
  await host.goto(`${BASE}/g/${A.id}#k=${A.seats.Hana.token}`);
  await host.locator('#whoami', { hasText: 'Hana' }).waitFor();
  assert.equal(new URL(host.url()).hash, '', 'personal-link token removed from the address bar');
  assert.equal(await host.evaluate((id) => localStorage.getItem('turncoat:' + id), A.id), A.seats.Hana.token);
  step('personal link signs in a new device and clears the hash');

  // Spectator in the lobby: join form, no invite button competing with it.
  const spec = await page('spectator', PHONE);
  await spec.goto(`${BASE}/g/${A.id}`);
  await spec.locator('#join').waitFor();
  assert.equal(await spec.locator('[data-invite]').count(), 0, 'no invite button before joining');
  await shot(spec, 'edge-lobby-visitor-phone');

  // Gus joins in the browser and leaves; Max joins and the host removes him.
  const gus = await page('Gus', PHONE);
  await gus.goto(`${BASE}/g/${A.id}`);
  await gus.fill('#jnick', 'Gus');
  await gus.click('#join button');
  await gus.locator('#whoami', { hasText: 'Gus' }).waitFor();
  await gus.click('[data-leave]');
  await gus.locator('#join').waitFor();
  assert.equal(await gus.textContent('#whoami'), '', 'left the game');
  const max = await page('Max', PHONE);
  await max.goto(`${BASE}/g/${A.id}`);
  await max.fill('#jnick', 'Max');
  await max.click('#join button');
  await max.locator('#whoami', { hasText: 'Max' }).waitFor();
  await host.reload();
  await host.locator('[aria-label="Remove Max"]').click();
  await host.locator('#players', { hasText: 'Max' }).waitFor({ state: 'detached' }).catch(() => {});
  assert.doesNotMatch(await host.textContent('#players'), /Max/, 'Max removed');
  await max.reload(); // a poll would do the same within 4 s
  await max.locator('#join').waitFor();
  assert.equal(await max.textContent('#whoami'), '', 'removed player is signed out');
  step('leave and kick work; 5 players remain');

  // Start: 5 players, 1 turncoat.
  await host.click('[data-start]');
  await host.locator('#head', { hasText: 'Night 1' }).waitFor();
  const roles = {};
  for (const n of Object.keys(A.seats)) roles[n] = (await stateAs(A, n)).me.role;
  const T = Object.keys(roles).find((n) => roles[n] === 'turncoat');
  const L = Object.keys(roles).filter((n) => roles[n] === 'loyal');
  assert.equal(L.length, 4);

  // Spectator at night: no crash, "under way" card, no roles.
  await spec.reload();
  await spec.locator('#main', { hasText: 'This game is under way' }).waitFor();
  assert.equal(await spec.locator('#join').isVisible(), false);
  await shot(spec, 'edge-night-visitor-phone');
  step(`spectator sees night 1 without errors (turncoat is ${T})`);

  // Night 1: turncoat takes L[0]. Day 1: everyone banishes L[1]. Night 2: L[2] -> 1 v 1, turncoats win.
  assert.equal((await voteAs(A, T, L[0])).status, 200);
  await spec.reload();
  await spec.locator('#head', { hasText: 'Day 1' }).waitFor();
  await spec.locator('#main', { hasText: 'have voted today' }).waitFor();
  const day1 = [T, ...L.slice(1)];
  for (const n of day1) assert.equal((await voteAs(A, n, n === L[1] ? L[2] : L[1])).status, 200, 'day vote ' + n);
  assert.equal((await voteAs(A, T, L[2])).status, 200, 'night 2 pick');
  const end = await stateAs(A, null);
  assert.equal(end.game.state, 'over');
  assert.equal(end.game.winner, 'turncoat');

  const tp = await page(T, PHONE);
  await tp.goto(`${BASE}/g/${A.id}#k=${A.seats[T].token}`);
  await tp.locator('.banner', { hasText: 'The turncoats win' }).waitFor();
  await tp.getByText('You won.').waitFor();
  assert.equal(await tp.locator('[data-hide-role]').count(), 0, 'no Hide button after the end');
  await shot(tp, 'edge-turncoat-win-phone');
  await spec.reload();
  await spec.locator('.banner', { hasText: 'The turncoats win' }).waitFor();
  await spec.getByText(`The turncoat was ${T}`).waitFor();
  assert.equal(end.players.filter((p) => p.role).length, 5, 'all roles revealed');
  const og = await (await fetch(`${BASE}/g/${A.id}`)).text();
  assert.match(og, /Game over on day 2: the turncoats won/);
  step('turncoat win: banner, "You won", spectator sees the reveal, preview updated');

  // ---- Game B: host ends a quiet night, a tied vote, then ends the game early ----
  const B = await makeGame('Edge Host Controls', ['Nia', 'Oto', 'Pia', 'Rex', 'Sol', 'Tam']);
  const nia = await page('Nia', PHONE);
  await nia.goto(`${BASE}/g/${B.id}#k=${B.seats.Nia.token}`);
  await nia.locator('[data-start]').click();
  await nia.locator('#head', { hasText: 'Night 1' }).waitFor();
  await nia.click('[data-advance]');
  await nia.locator('#head', { hasText: 'Day 1' }).waitFor();
  await nia.locator('#main', { hasText: 'A quiet night. Nobody was taken.' }).waitFor();
  // Two votes for different people, then the host closes the vote: a tie, nobody banished.
  assert.equal((await voteAs(B, 'Oto', 'Pia')).status, 200);
  assert.equal((await voteAs(B, 'Pia', 'Oto')).status, 200);
  await nia.reload();
  await nia.click('[data-advance]');
  await nia.locator('#head', { hasText: 'Night 2' }).waitFor();
  await nia.locator('#news', { hasText: 'The vote was tied' }).waitFor();
  await nia.click('[data-end]');
  await nia.locator('.banner', { hasText: 'Game ended' }).waitFor();
  const bs = await stateAs(B, 'Oto');
  assert.equal(bs.game.winner, 'none');
  assert.equal(bs.players.filter((p) => p.role).length, 6, 'roles revealed after ending early');
  assert.match(await (await fetch(`${BASE}/g/${B.id}`)).text(), /ended early/);
  await shot(nia, 'edge-ended-early-phone');
  step('host: quiet night, tied vote, end early');

  assert.deepEqual(leaks, [], 'no role leaks');
  assert.deepEqual(errors, [], 'no console errors');
  console.log('PASS: edge paths (spectator, personal link, leave/kick, turncoat win, host controls, 404, privacy)');
} catch (e) {
  console.error('FAIL', e);
  console.error({ leaks, errors });
  process.exitCode = 1;
} finally {
  for (const [id, token] of created) await api('POST', `games/${id}/delete`, {}, token).catch(() => {});
  await browser.close();
}
