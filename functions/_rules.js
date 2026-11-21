// Turncoat rules engine: pure functions, no I/O. The API (functions/api) stores state in D1 and calls these.
//
// A game: lobby -> night 1 -> day 1 -> night 2 -> ... -> over.
// Night: living turncoats pick a loyal to take out. Day: everyone alive votes to banish one player.
// Loyals win when no turncoat is alive; turncoats win when they are at least as many as the loyals.

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 30;
export const PACES = {
  // daily: the night ends at morning_hour, the vote closes at vote_hour (group's time zone).
  daily: { label: 'One round a day' },
  // quick: fixed-length phases, for playing in one evening.
  quick: { label: 'Quick game tonight', night: 5 * 60, day: 10 * 60 },
};
export const MIN_PHASE = 2 * 3600; // a daily-pace phase is never shorter than 2 hours

export function turncoatCount(n) {
  if (n < MIN_PLAYERS) return 0;
  if (n <= 7) return 1;
  if (n <= 11) return 2;
  return 3;
}

// Fisher-Yates with an injected random source (crypto in production, seeded in tests).
export function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns Map(playerId -> 'turncoat' | 'loyal').
export function assignRoles(ids, rand) {
  const k = turncoatCount(ids.length);
  const order = shuffle(ids, rand);
  return new Map(order.map((id, i) => [id, i < k ? 'turncoat' : 'loyal']));
}

// Plurality count. votes: [{voter, target}]. Returns { top: [ids with max], counts: Map }.
export function tally(votes) {
  const counts = new Map();
  for (const v of votes) counts.set(v.target, (counts.get(v.target) || 0) + 1);
  let max = 0;
  for (const n of counts.values()) max = Math.max(max, n);
  const top = max ? [...counts.entries()].filter(([, n]) => n === max).map(([id]) => id).sort((a, b) => a - b) : [];
  return { top, counts };
}

// Only votes from living eligible voters for living eligible targets count.
export function validVotes(votes, players, phase) {
  const alive = new Map(players.filter((p) => p.alive).map((p) => [p.id, p]));
  return votes.filter((v) => {
    const voter = alive.get(v.voter);
    const target = alive.get(v.target);
    if (!voter || !target || v.voter === v.target) return false;
    if (phase === 'night') return voter.role === 'turncoat' && target.role === 'loyal';
    return true;
  });
}

// Night: the turncoats' most-picked loyal is taken out; a tie is broken at random; no picks = quiet night.
export function resolveNight(votes, players, rand) {
  const { top } = tally(validVotes(votes, players, 'night'));
  if (!top.length) return { kind: 'quiet' };
  return { kind: 'murder', target: top.length === 1 ? top[0] : top[Math.floor(rand() * top.length)] };
}

// Day: the most-voted player is banished and their role revealed; a tie or no votes = nobody leaves.
export function resolveDay(votes, players) {
  const valid = validVotes(votes, players, 'day');
  const { top, counts } = tally(valid);
  const breakdown = [...counts.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id - b.id);
  if (top.length !== 1) return { kind: top.length ? 'tie' : 'novotes', tied: top, breakdown };
  return { kind: 'banish', target: top[0], breakdown };
}

export function winner(players) {
  const alive = players.filter((p) => p.alive);
  const t = alive.filter((p) => p.role === 'turncoat').length;
  const l = alive.length - t;
  if (t === 0) return 'loyal';
  if (t >= l) return 'turncoat';
  return null;
}

// The phase ends early once everyone who can act has acted.
export function everyoneActed(phase, votes, players) {
  const alive = players.filter((p) => p.alive);
  const need = phase === 'night' ? alive.filter((p) => p.role === 'turncoat') : alive;
  const voted = new Set(validVotes(votes, players, phase).map((v) => v.voter));
  return need.length > 0 && need.every((p) => voted.has(p.id));
}

// Local wall-clock seconds since midnight at unix time t in time zone tz.
export function localSeconds(t, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t * 1000));
  const get = (k) => Number(parts.find((p) => p.type === k).value);
  return get('hour') * 3600 + get('minute') * 60 + get('second');
}

// Next time it is hour:00 in tz, at least minGap seconds after t.
export function nextLocalHour(t, tz, hour, minGap = MIN_PHASE) {
  const now = localSeconds(t, tz);
  let delta = (hour * 3600 - now + 86400) % 86400;
  if (delta === 0) delta = 86400;
  while (delta < minGap) delta += 86400;
  return t + delta;
}

// When the phase that starts at time t ends.
export function phaseEnd(phase, t, game) {
  if (game.pace === 'quick') return t + PACES.quick[phase];
  return phase === 'night' ? nextLocalHour(t, game.tz, game.morning_hour) : nextLocalHour(t, game.tz, game.vote_hour);
}

export function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return typeof tz === 'string' && tz.length < 64;
  } catch {
    return false;
  }
}

// Seeded PRNG (mulberry32) for tests and deterministic replays.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
