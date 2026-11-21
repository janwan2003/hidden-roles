// End-to-end test in real Chromium: six people in separate browser contexts play a full quick game.
// Ann creates it on the landing page (desktop), five friends join from the link (phones). The test plays
// night and day through the real UI until the loyals win, checks that no API response leaks a role to
// someone who should not see it, then plays "Play again" and deletes both games.
// Usage: BASE=http://127.0.0.1:8841 node tests/e2e/run.mjs   (screenshots go to shots/)
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
const browser = await chromium.launch({ executablePath: findChrome() });
const step = (s) => console.log('·', s);
let gameId;
const people = [];

// Every state response a player's page receives is checked for leaks.
function checkLeak(label, s) {
  if (!s || !s.players) return;
  const me = s.me;
  const over = s.game.state === 'over';
  for (const p of s.players) {
    if (p.role && !over && p.alive && (!me || p.id !== me.id)) leaks.push(`${label} saw role of ${p.name}`);
  }
  if ((!me || me.role !== 'turncoat') && (s.turncoats || s.picks || s.chat)) leaks.push(`${label} got turncoat-only data`);
}

async function person(label, opts, expected = []) {
  const ctx = await browser.newContext(opts);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected.some((re) => re.test(m.text()))) errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  page.on('response', async (r) => {
    if (r.request().method() === 'GET' && /\/api\/games\/[A-Za-z0-9]+$/.test(r.url()) && r.ok()) {
      try { checkLeak(label, await r.json()); } catch {}
    }
  });
  const p = { label, ctx, page };
  people.push(p);
  return p;
}
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
const token = (p, id = gameId) => p.page.evaluate((id) => localStorage.getItem('turncoat:' + id), id);
async function apiAs(p, method, sub = '', body) {
  const t = await token(p);
  const res = await fetch(`${BASE}/api/games/${gameId}${sub}`, {
    method, headers: { 'content-type': 'application/json', ...(t ? { 'x-token': t } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const stateOf = async (p) => (await apiAs(p, 'GET')).data;
const reload = (p) => p.page.reload();

try {
  // 1. Landing + create
  const ann = await person('Ann', DESKTOP);
  await ann.page.goto(BASE + '/');
  await shot(ann, 'landing-desktop');
  await ann.page.click('#create button[type=submit]');
  assert.match(await ann.page.textContent('#err'), /name/i, 'empty form shows an error');
  await ann.page.fill('#gname', 'E2E Family Weekend');
  await ann.page.fill('#nick', 'Ann');
  await ann.page.getByText('Quick game tonight').click();
  assert.equal(await ann.page.isChecked('input[value=quick]'), true);
  await ann.page.click('#create button[type=submit]');
  await ann.page.waitForURL(/\/g\/[A-Za-z0-9]+$/);
  gameId = ann.page.url().split('/g/')[1];
  await ann.page.getByText('Invite 4 more to start').waitFor();
  assert.equal(await ann.page.locator('[data-start]').isDisabled(), true, 'cannot start with 1 player');
  step('Ann created ' + gameId);

  // 2. Five friends join from the link on phones
  const names = ['Ben', 'Cat', 'Dan', 'Eve', 'Fay'];
  for (const n of names) {
    const p = await person(n, PHONE, n === 'Fay' ? [/409/] : []);
    await p.page.goto(`${BASE}/g/${gameId}`);
    if (n === 'Ben') await shot(p, 'join-phone');
    if (n === 'Fay') { // duplicate name first
      await p.page.fill('#jnick', 'ben');
      await p.page.click('#join button');
      await p.page.getByText('Someone is already called ben').waitFor();
    }
    await p.page.fill('#jnick', n);
    await p.page.click('#join button');
    await p.page.locator('#whoami', { hasText: n }).waitFor();
  }
  step('5 joined');
  const html = await (await fetch(`${BASE}/g/${gameId}`)).text();
  assert.match(html, /6 players so far · ready to start/, 'link preview shows the lobby count');
  await ann.page.getByText('Ready to start').waitFor();
  await ann.page.getByText('1 turncoat').waitFor();
  await shot(ann, 'lobby-desktop');

  // 3. Start; each player sees their own role only
  await ann.page.click('[data-start]');
  await ann.page.locator('#head', { hasText: 'Night 1' }).waitFor();
  const all = people;
  const roles = {};
  for (const p of all) {
    if (p !== ann) await reload(p);
    const s = await stateOf(p);
    roles[p.label] = s.me.role;
    checkLeak(p.label, s);
  }
  const turncoats = all.filter((p) => roles[p.label] === 'turncoat');
  const loyals = all.filter((p) => roles[p.label] === 'loyal');
  assert.equal(turncoats.length, 1, 'one turncoat for 6 players');
  const T = turncoats[0];
  step(`roles dealt; turncoat is ${T.label}`);
  // role card is covered until tapped
  await T.page.locator('[data-show-role]').click();
  await T.page.locator('#role .face', { hasText: 'Turncoat' }).waitFor();
  const L0 = loyals.find((p) => p !== ann);
  await L0.page.locator('[data-show-role]').click();
  await L0.page.locator('#role .face', { hasText: 'Loyal' }).waitFor();
  await shot(L0, 'night-loyal-phone');
  // late join and loyal night vote are refused
  const late = await fetch(`${BASE}/api/games/${gameId}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"nick":"Zed"}' });
  assert.equal(late.status, 409, 'no joining after start');
  assert.equal((await apiAs(L0, 'POST', '/vote', { target: 1 })).status, 403, 'loyals cannot act at night');

  // victims: loyals other than Ann (Ann hosts), in a fixed order
  const victims = loyals.filter((p) => p !== ann);
  const idOf = async (p) => (await stateOf(p)).me.id;
  const ids = {};
  for (const p of all) ids[p.label] = await idOf(p);

  async function nightKill(victim) {
    await T.page.reload();
    await T.page.locator('#chattext').fill(`Going for ${victim.label}`);
    await T.page.locator('#chatform button').click();
    await T.page.locator('#chatlog', { hasText: `Going for ${victim.label}` }).waitFor();
    if (victim === victims[0]) await shot(T, 'night-turncoat-phone');
    await T.page.locator(`[data-night="${ids[victim.label]}"]`).click();
  }
  async function dayVote(target, voters) {
    for (const p of voters) {
      await p.page.reload();
      await p.page.locator('#main', { hasText: 'The vote' }).waitFor();
      const t = p === target ? all.find((q) => q !== p && voters.includes(q)) : target; // nobody votes for themself
      await p.page.locator(`[data-day="${ids[t.label]}"]`).click();
      await p.page.getByText('You voted for').first().waitFor().catch(() => {});
    }
  }
  const alive = new Set(all);

  // Night 1: turncoat takes out victim 0
  await nightKill(victims[0]);
  alive.delete(victims[0]);
  await ann.page.reload();
  await ann.page.locator('#main', { hasText: `${victims[0].label} was taken out in the night` }).waitFor();
  step(`night 1: ${victims[0].label} out`);
  // the dead cannot vote
  assert.equal((await apiAs(victims[0], 'POST', '/vote', { target: ids[T.label] })).status, 403, 'the out player cannot vote');

  // Day 1: everyone votes for victim 1 (a loyal) -> banished as loyal
  const v1 = victims[1];
  const L1 = [...alive].find((p) => p !== v1);
  await L1.page.reload();
  await L1.page.locator('#main', { hasText: 'The vote' }).waitFor();
  await shot(L1, 'day-vote-phone');
  await dayVote(v1, [...alive]);
  alive.delete(v1);
  await ann.page.reload();
  await ann.page.locator('#news', { hasText: `${v1.label} was banished. They were loyal` }).waitFor();
  assert.match(await ann.page.textContent('#news'), new RegExp(`${T.label} → ${v1.label}`), 'ballots are published after the vote');
  step(`day 1: ${v1.label} banished (loyal)`);

  // Night 2: victim 2
  await nightKill(victims[2]);
  alive.delete(victims[2]);
  step(`night 2: ${victims[2].label} out`);

  // Day 2: everyone votes for the turncoat -> loyals win
  await dayVote(T, [...alive]);
  await ann.page.reload();
  await ann.page.locator('.banner', { hasText: 'The loyals win' }).waitFor();
  await ann.page.getByText(`The turncoat was ${T.label}`).waitFor();
  await shot(ann, 'over-desktop');
  await L0.page.reload();
  await L0.page.locator('.banner', { hasText: 'The loyals win' }).waitFor();
  await shot(L0, 'over-phone');
  const over = await stateOf(L0);
  assert.equal(over.players.filter((p) => p.role).length, 6, 'all roles revealed at the end');
  const og = await (await fetch(`${BASE}/g/${gameId}`)).text();
  assert.match(og, /Game over on day 2: the loyals won/);
  step('day 2: turncoat banished, loyals win');

  // Share result text
  await ann.page.click('[data-share-result]');
  const clip = await ann.page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /The loyals won on day 2/);
  assert.match(clip, new RegExp(`Night 1: ${victims[0].label} taken out`));

  // 4. Play again: Ann starts a rematch, Ben follows with the same seat
  const oldId = gameId;
  await ann.page.click('[data-again]');
  await ann.page.waitForURL((u) => !u.pathname.endsWith(oldId));
  const newId = ann.page.url().split('/g/')[1];
  await ann.page.getByText('Ready to start').waitFor();
  const ben = all.find((p) => p.label === 'Ben');
  await ben.page.goto(`${BASE}/g/${oldId}`);
  await ben.page.click('[data-next]');
  await ben.page.waitForURL(new RegExp(newId));
  await ben.page.locator('#whoami', { hasText: 'Ben' }).waitFor();
  step('play again: same 6 players in ' + newId);

  // 5. Cleanup: delete both games through the UI
  await ann.page.click('[data-delete]');
  await ann.page.waitForURL(BASE + '/');
  gameId = oldId;
  const del = await apiAs(ann, 'POST', '/delete');
  assert.equal(del.status, 200);
  assert.equal((await fetch(`${BASE}/g/${oldId}`)).status, 404, 'deleted game is gone');

  // Phone landing screenshot
  const phone = await person('Phone', PHONE);
  await phone.page.goto(BASE + '/');
  await shot(phone, 'landing-phone');

  assert.deepEqual(leaks, [], 'no role leaks');
  assert.deepEqual(errors, [], 'no console errors');
  console.log(`PASS: full 6-player game, ${people.length} browser contexts, no leaks, no console errors`);
} catch (e) {
  console.error('FAIL', e);
  console.error({ leaks, errors });
  process.exitCode = 1;
} finally {
  await browser.close();
}
