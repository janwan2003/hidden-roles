// Shared D1 helpers for the API and the link-preview page.
import { phaseEnd, resolveNight, resolveDay, winner, everyoneActed, assignRoles } from './_rules.js';

export const now = () => Math.floor(Date.now() / 1000);
export const ID_RE = /^[A-Za-z0-9]{6,16}$/;

export function cryptoRand() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 4294967296;
}

export function randomId(len = 10) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadGame(env, id) {
  if (!ID_RE.test(id || '')) return null;
  return env.DB.prepare('SELECT * FROM games WHERE id = ?1').bind(id).first();
}

export async function loadPlayers(env, gameId) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, role, alive, out_day, out_how, joined_at FROM players WHERE game_id = ?1 ORDER BY id'
  ).bind(gameId).all();
  return results.map((p) => ({ ...p, alive: !!p.alive }));
}

export async function loadVotes(env, game) {
  const phase = game.state;
  if (phase !== 'night' && phase !== 'day') return [];
  const { results } = await env.DB.prepare(
    'SELECT voter_id AS voter, target_id AS target, at FROM votes WHERE game_id = ?1 AND day = ?2 AND phase = ?3'
  ).bind(game.id, game.day, phase).all();
  return results;
}

export function event(env, game, day, kind, data = {}) {
  return env.DB.prepare('INSERT INTO events (game_id, day, kind, data, at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(game.id, day, kind, JSON.stringify(data), now());
}

// Moves the game to a new phase only if nobody else did first (optimistic lock on state + day).
async function claim(env, game, next) {
  const r = await env.DB.prepare(
    `UPDATE games SET state = ?1, day = ?2, phase_ends_at = ?3, winner = ?4, active_at = ?5
     WHERE id = ?6 AND state = ?7 AND day = ?8`
  ).bind(next.state, next.day, next.phase_ends_at ?? null, next.winner ?? null, now(), game.id, game.state, game.day).run();
  if (!r.meta || r.meta.changes !== 1) return false;
  Object.assign(game, next);
  return true;
}

function overEvent(env, game, players, win, day) {
  return event(env, game, day, 'over', {
    winner: win,
    roles: players.map((p) => ({ id: p.id, name: p.name, role: p.role })),
  });
}

export async function startGame(env, game, players) {
  const roles = assignRoles(players.map((p) => p.id), cryptoRand);
  const t = now();
  const ends = phaseEnd('night', t, game);
  const prev = { ...game };
  if (!(await claim(env, game, { state: 'night', day: 1, phase_ends_at: ends, winner: null }))) return false;
  await env.DB.batch([
    ...players.map((p) => env.DB.prepare('UPDATE players SET role = ?1 WHERE id = ?2').bind(roles.get(p.id), p.id)),
    event(env, prev, 1, 'start', { players: players.length, turncoats: [...roles.values()].filter((r) => r === 'turncoat').length }),
  ]);
  return true;
}

// Resolves the current phase (deadline passed, everyone acted, or the host forced it).
export async function resolvePhase(env, game, players, votes) {
  const t = now();
  const prev = { ...game };
  const nameOf = (id) => (players.find((p) => p.id === id) || {}).name || 'Someone';
  if (game.state === 'night') {
    const r = resolveNight(votes, players, cryptoRand);
    const after = players.map((p) => (r.kind === 'murder' && p.id === r.target ? { ...p, alive: false } : p));
    const win = winner(after);
    const next = win ? { state: 'over', day: game.day, phase_ends_at: null, winner: win }
      : { state: 'day', day: game.day, phase_ends_at: phaseEnd('day', t, game), winner: null };
    if (!(await claim(env, game, next))) return false;
    const stmts = [];
    if (r.kind === 'murder') {
      stmts.push(env.DB.prepare("UPDATE players SET alive = 0, out_day = ?1, out_how = 'murder' WHERE id = ?2").bind(prev.day, r.target));
      stmts.push(event(env, prev, prev.day, 'murder', { target: r.target, name: nameOf(r.target), role: 'loyal' }));
    } else stmts.push(event(env, prev, prev.day, 'quiet', {}));
    if (win) stmts.push(overEvent(env, prev, after, win, prev.day));
    await env.DB.batch(stmts);
    players.splice(0, players.length, ...after);
    return true;
  }
  if (game.state === 'day') {
    const r = resolveDay(votes, players);
    const after = players.map((p) => (r.kind === 'banish' && p.id === r.target ? { ...p, alive: false } : p));
    const win = winner(after);
    const next = win ? { state: 'over', day: game.day, phase_ends_at: null, winner: win }
      : { state: 'night', day: game.day + 1, phase_ends_at: phaseEnd('night', t, game), winner: null };
    if (!(await claim(env, game, next))) return false;
    const ballots = votes.filter((v) => players.some((p) => p.id === v.voter && p.alive))
      .map((v) => ({ by: v.voter, byName: nameOf(v.voter), for: v.target, forName: nameOf(v.target) }));
    const breakdown = r.breakdown.map((b) => ({ ...b, name: nameOf(b.id) }));
    const stmts = [];
    if (r.kind === 'banish') {
      const role = players.find((p) => p.id === r.target).role;
      stmts.push(env.DB.prepare("UPDATE players SET alive = 0, out_day = ?1, out_how = 'banish' WHERE id = ?2").bind(prev.day, r.target));
      stmts.push(event(env, prev, prev.day, 'banish', { target: r.target, name: nameOf(r.target), role, breakdown, ballots }));
    } else stmts.push(event(env, prev, prev.day, r.kind, { breakdown, ballots, tied: r.tied.map(nameOf) }));
    if (win) stmts.push(overEvent(env, prev, after, win, prev.day));
    await env.DB.batch(stmts);
    players.splice(0, players.length, ...after);
    return true;
  }
  return false;
}

// Lazy game clock: called on every read and write. Resolves any phase whose deadline has passed
// or where everyone has acted. Loops because a long-idle game may owe several phases.
export async function tick(env, game, players) {
  for (let i = 0; i < 20 && (game.state === 'night' || game.state === 'day'); i++) {
    const votes = await loadVotes(env, game);
    const due = now() >= game.phase_ends_at || everyoneActed(game.state, votes, players);
    if (!due) break;
    if (!(await resolvePhase(env, game, players, votes))) {
      Object.assign(game, await loadGame(env, game.id));
      players.splice(0, players.length, ...(await loadPlayers(env, game.id)));
    }
  }
}

export async function endEarly(env, game, players) {
  const prev = { ...game };
  if (!(await claim(env, game, { state: 'over', day: game.day, phase_ends_at: null, winner: 'none' }))) return false;
  await env.DB.batch([overEvent(env, prev, players, 'none', prev.day)]);
  return true;
}
