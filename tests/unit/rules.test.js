import test from 'node:test';
import assert from 'node:assert/strict';
import {
  turncoatCount, assignRoles, seeded, resolveNight, resolveDay, winner, everyoneActed, validVotes,
  nextLocalHour, localSeconds, phaseEnd, MIN_PHASE,
} from '../../functions/_rules.js';

const P = (id, role, alive = true) => ({ id, role, alive });
const game = () => [P(1, 'turncoat'), P(2, 'loyal'), P(3, 'loyal'), P(4, 'loyal'), P(5, 'loyal'), P(6, 'turncoat'), P(7, 'loyal'), P(8, 'loyal')];

test('turncoat count scales with group size', () => {
  assert.deepEqual([4, 5, 7, 8, 11, 12, 30].map(turncoatCount), [0, 1, 1, 2, 2, 3, 3]);
});

test('roles: right count, every player gets one, random source decides who', () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const a = assignRoles(ids, seeded(1));
  assert.equal(a.size, 9);
  assert.equal([...a.values()].filter((r) => r === 'turncoat').length, 2);
  const seen = new Set();
  for (let s = 0; s < 200; s++) for (const [id, r] of assignRoles(ids, seeded(s))) if (r === 'turncoat') seen.add(id);
  assert.equal(seen.size, 9, 'every player can be a turncoat');
});

test('night: plurality of living turncoats picks a living loyal; invalid picks ignored', () => {
  const ps = game();
  assert.deepEqual(resolveNight([{ voter: 1, target: 3 }, { voter: 6, target: 3 }], ps, seeded(1)), { kind: 'murder', target: 3 });
  // loyal voting at night, a turncoat targeting a turncoat, a dead target: all ignored
  const bad = [{ voter: 2, target: 4 }, { voter: 1, target: 6 }, { voter: 6, target: 9 }];
  assert.deepEqual(resolveNight(bad, ps, seeded(1)), { kind: 'quiet' });
  const tie = new Set();
  for (let s = 0; s < 50; s++) tie.add(resolveNight([{ voter: 1, target: 3 }, { voter: 6, target: 4 }], ps, seeded(s)).target);
  assert.deepEqual([...tie].sort(), [3, 4], 'tie broken at random between the two');
});

test('day: plurality banishes, tie and no votes banish nobody, dead voters do not count', () => {
  const ps = game();
  ps[6].alive = false; // 7 is out
  const r = resolveDay([{ voter: 2, target: 1 }, { voter: 3, target: 1 }, { voter: 1, target: 2 }, { voter: 7, target: 2 }, { voter: 7, target: 2 }], ps);
  assert.equal(r.kind, 'banish');
  assert.equal(r.target, 1);
  assert.deepEqual(r.breakdown, [{ id: 1, n: 2 }, { id: 2, n: 1 }]);
  assert.equal(resolveDay([{ voter: 2, target: 1 }, { voter: 1, target: 2 }], ps).kind, 'tie');
  assert.equal(resolveDay([], ps).kind, 'novotes');
  assert.equal(validVotes([{ voter: 2, target: 2 }], ps, 'day').length, 0, 'no self votes');
});

test('win conditions', () => {
  assert.equal(winner(game()), null);
  assert.equal(winner([P(1, 'turncoat', false), P(2, 'loyal')]), 'loyal');
  assert.equal(winner([P(1, 'turncoat'), P(2, 'loyal'), P(3, 'loyal', false)]), 'turncoat');
  assert.equal(winner([P(1, 'turncoat'), P(6, 'turncoat'), P(2, 'loyal'), P(3, 'loyal'), P(4, 'loyal')]), null);
});

test('phase ends early once everyone who can act has acted', () => {
  const ps = game();
  assert.equal(everyoneActed('night', [{ voter: 1, target: 2 }], ps), false);
  assert.equal(everyoneActed('night', [{ voter: 1, target: 2 }, { voter: 6, target: 3 }], ps), true);
  ps[5].alive = false;
  assert.equal(everyoneActed('night', [{ voter: 1, target: 2 }], ps), true, 'dead turncoat not needed');
  const alive = ps.filter((p) => p.alive);
  assert.equal(everyoneActed('day', alive.slice(1).map((p) => ({ voter: p.id, target: 1 })), ps), false);
  assert.equal(everyoneActed('day', alive.map((p) => ({ voter: p.id, target: p.id === 1 ? 2 : 1 })), ps), true);
});

test('daily clock: next local hour, at least 2 hours away, in the group time zone', () => {
  const t = Date.UTC(2026, 10, 21, 18, 30) / 1000; // 18:30 UTC = 19:30 in Warsaw (UTC+1)
  assert.equal(localSeconds(t, 'Europe/Warsaw'), 19.5 * 3600);
  // vote at 20:00 Warsaw is only 30 min away -> next day
  assert.equal(nextLocalHour(t, 'Europe/Warsaw', 20) - t, 86400 + 1800);
  // morning 08:00 Warsaw is 12.5 h away
  assert.equal(nextLocalHour(t, 'Europe/Warsaw', 8) - t, 12.5 * 3600);
  assert.equal(nextLocalHour(t, 'America/New_York', 20) - t, 6.5 * 3600); // 13:30 NY -> 20:00
  const g = { pace: 'daily', tz: 'UTC', vote_hour: 20, morning_hour: 8 };
  assert.ok(phaseEnd('day', t, g) - t >= MIN_PHASE);
  assert.equal(phaseEnd('night', t, { ...g, pace: 'quick' }) - t, 300);
});

test('a 5-player game can always finish', () => {
  // simulate random play many times: every game ends within 10 days
  for (let s = 0; s < 300; s++) {
    const rand = seeded(s);
    const roles = assignRoles([1, 2, 3, 4, 5], rand);
    let ps = [...roles].map(([id, role]) => P(id, role));
    let w = null;
    for (let day = 1; day < 10 && !w; day++) {
      const tc = ps.filter((p) => p.alive && p.role === 'turncoat');
      const loyals = ps.filter((p) => p.alive && p.role === 'loyal');
      const n = resolveNight(tc.map((p) => ({ voter: p.id, target: loyals[0].id })), ps, rand);
      ps = ps.map((p) => (p.id === n.target ? { ...p, alive: false } : p));
      if ((w = winner(ps))) break;
      const alive = ps.filter((p) => p.alive);
      const pick = alive[Math.floor(rand() * alive.length)];
      const d = resolveDay(alive.filter((p) => p.id !== pick.id).map((p) => ({ voter: p.id, target: pick.id })), ps);
      ps = ps.map((p) => (p.id === d.target ? { ...p, alive: false } : p));
      w = winner(ps);
    }
    assert.ok(w, 'game ended');
  }
});
