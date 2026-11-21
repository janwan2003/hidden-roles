import { MIN_PLAYERS, MAX_PLAYERS, PACES, validTz, turncoatCount } from '../_rules.js';
import {
  now, randomId, sha256, loadGame, loadPlayers, loadVotes, tick, startGame, resolvePhase, endEarly, event,
} from '../_db.js';

const LIMITS = {
  create: [20, 3600], // new games per IP per hour
  join: [60, 3600],
  write: [600, 3600], // votes, chat and host actions
  read: [4000, 3600], // the game page polls
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const err = (status, message) => json({ error: message }, status);

function clean(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}
const cleanName = (v) => clean(v, 20).replace(/\s+/g, ' ');

async function rateLimited(env, request, action) {
  const [max, windowSec] = LIMITS[action];
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN reset_at < ?3 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
     RETURNING n`
  ).bind(action + ':' + ip, t + windowSec, t).first();
  return row && row.n > max;
}

// Games idle for 60 days are deleted with everything in them.
async function cleanup(env) {
  const t = now();
  const old = t - 60 * 86400;
  const sub = 'SELECT id FROM games WHERE active_at < ?1';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM votes WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare(`DELETE FROM events WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare(`DELETE FROM chat WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare(`DELETE FROM players WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare('DELETE FROM games WHERE active_at < ?1').bind(old),
    env.DB.prepare('DELETE FROM rate WHERE reset_at < ?1').bind(t),
  ]);
}

async function body(request) {
  try {
    const text = await request.text();
    if (text.length > 4000) return null;
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

async function me(env, request, gameId) {
  const token = request.headers.get('x-token');
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  return env.DB.prepare('SELECT id, name, role, alive FROM players WHERE token_hash = ?1 AND game_id = ?2')
    .bind(hash, gameId).first();
}

const hour = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 23 ? v : d);

async function createGame(env, input) {
  const name = clean(input.name, 40).replace(/\s+/g, ' ');
  const nick = cleanName(input.nick);
  if (!name) return err(400, 'Give the game a name.');
  if (!nick) return err(400, 'Pick a nickname.');
  const pace = PACES[input.pace] ? input.pace : 'daily';
  const tz = validTz(input.tz) ? input.tz : 'UTC';
  const vote = hour(input.vote_hour, 20);
  const morning = hour(input.morning_hour, 8);
  if (vote === morning) return err(400, 'The vote and the morning need different times.');
  const id = randomId(10);
  const token = randomId(24);
  const t = now();
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT INTO games (id, name, tz, pace, vote_hour, morning_hour, created_at, active_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`).bind(id, name, tz, pace, vote, morning, t),
    env.DB.prepare('INSERT INTO players (game_id, name, token_hash, joined_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
      .bind(id, nick, await sha256(token), t),
  ]);
  const hostId = res[1].results[0].id;
  await env.DB.prepare('UPDATE games SET host_id = ?1 WHERE id = ?2').bind(hostId, id).run();
  return json({ id, token }, 201);
}

async function join(env, game, input) {
  if (game.state !== 'lobby') return err(409, 'This game has already started. Ask the host to add you to the next one.');
  const nick = cleanName(input.nick);
  if (!nick) return err(400, 'Pick a nickname.');
  const players = await loadPlayers(env, game.id);
  if (players.length >= MAX_PLAYERS) return err(409, `This game is full (${MAX_PLAYERS} players).`);
  if (players.some((p) => p.name.toLowerCase() === nick.toLowerCase())) return err(409, `Someone is already called ${nick}. Pick another name.`);
  const token = randomId(24);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (game_id, name, token_hash, joined_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(game.id, nick, await sha256(token), now()),
    env.DB.prepare('UPDATE games SET active_at = ?1 WHERE id = ?2').bind(now(), game.id),
  ]);
  return json({ token }, 201);
}

// Everything a player may see. Roles of others stay server-side until they are out or the game ends.
async function stateFor(env, game, self) {
  const players = await loadPlayers(env, game.id);
  await tick(env, game, players);
  const meP = self && players.find((p) => p.id === self.id);
  const over = game.state === 'over';
  const isTurncoat = meP && meP.role === 'turncoat';
  const votes = await loadVotes(env, game);
  const livingIds = new Set(players.filter((p) => p.alive).map((p) => p.id));
  const dayVoters = game.state === 'day' ? new Set(votes.filter((v) => livingIds.has(v.voter)).map((v) => v.voter)) : new Set();
  const { results: evRows } = await env.DB.prepare('SELECT id, day, kind, data, at FROM events WHERE game_id = ?1 ORDER BY id').bind(game.id).all();
  const out = {
    now: now(),
    game: {
      id: game.id, name: game.name, state: game.state, day: game.day, pace: game.pace, tz: game.tz,
      vote_hour: game.vote_hour, morning_hour: game.morning_hour, phase_ends_at: game.phase_ends_at,
      winner: game.winner, next_id: game.next_id, host_id: game.host_id,
      min_players: MIN_PLAYERS, max_players: MAX_PLAYERS, turncoats: turncoatCount(players.length),
    },
    me: meP ? { id: meP.id, name: meP.name, role: meP.role, alive: meP.alive, host: meP.id === game.host_id } : null,
    players: players.map((p) => ({
      id: p.id, name: p.name, alive: p.alive, out_day: p.out_day, out_how: p.out_how,
      role: over || !p.alive || (meP && p.id === meP.id) ? p.role : null,
      voted: dayVoters.has(p.id),
    })),
    events: evRows.map((e) => ({ id: e.id, day: e.day, kind: e.kind, at: e.at, ...JSON.parse(e.data) })),
  };
  if (game.state === 'day') {
    out.vote = { voted: dayVoters.size, of: livingIds.size, mine: meP ? (votes.find((v) => v.voter === meP.id) || {}).target ?? null : null };
  }
  if (isTurncoat) {
    out.turncoats = players.filter((p) => p.role === 'turncoat').map((p) => ({ id: p.id, name: p.name, alive: p.alive }));
    if (game.state === 'night') out.picks = votes.map((v) => ({ by: v.voter, target: v.target }));
    const { results: chat } = await env.DB.prepare(
      'SELECT id, player_id, text, at FROM chat WHERE game_id = ?1 ORDER BY id DESC LIMIT 100'
    ).bind(game.id).all();
    out.chat = chat.reverse();
  }
  if (game.state === 'night' && meP && !isTurncoat) delete out.picks;
  return out;
}

async function vote(env, game, self, input) {
  const players = await loadPlayers(env, game.id);
  await tick(env, game, players);
  const meP = players.find((p) => p.id === self.id);
  if (game.state !== 'night' && game.state !== 'day') return err(409, 'There is nothing to vote on right now.');
  if (!meP.alive) return err(403, 'You are out of the game, so you cannot vote. You can still watch.');
  if (game.state === 'night' && meP.role !== 'turncoat') return err(403, 'Only the turncoats act at night.');
  const target = players.find((p) => p.id === input.target);
  if (!target || !target.alive) return err(400, 'Pick someone who is still in the game.');
  if (target.id === meP.id) return err(400, 'You cannot vote for yourself.');
  if (game.state === 'night' && target.role === 'turncoat') return err(400, 'Pick a loyal, not a fellow turncoat.');
  await env.DB.prepare(
    `INSERT INTO votes (game_id, day, phase, voter_id, target_id, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(game_id, day, phase, voter_id) DO UPDATE SET target_id = excluded.target_id, at = excluded.at`
  ).bind(game.id, game.day, game.state, meP.id, target.id, now()).run();
  await tick(env, game, players);
  return json({ ok: true });
}

async function playAgain(env, game, self) {
  if (game.next_id) return json({ id: game.next_id });
  const id = randomId(10);
  const t = now();
  const { results: rows } = await env.DB.prepare('SELECT id, name, token_hash FROM players WHERE game_id = ?1 ORDER BY id').bind(game.id).all();
  const claimed = await env.DB.prepare('UPDATE games SET next_id = ?1 WHERE id = ?2 AND next_id IS NULL').bind(id, game.id).run();
  if (claimed.meta.changes !== 1) return json({ id: (await loadGame(env, game.id)).next_id });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO games (id, name, tz, pace, vote_hour, morning_hour, created_at, active_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`).bind(id, game.name, game.tz, game.pace, game.vote_hour, game.morning_hour, t),
    ...rows.map((r) => env.DB.prepare('INSERT INTO players (game_id, name, token_hash, joined_at) VALUES (?1, ?2, ?3, ?4)').bind(id, r.name, r.token_hash, t)),
  ]);
  const self2 = await env.DB.prepare('SELECT p2.id FROM players p1 JOIN players p2 ON p2.token_hash = p1.token_hash AND p2.game_id = ?1 WHERE p1.id = ?2')
    .bind(id, self.id).first();
  await env.DB.prepare('UPDATE games SET host_id = ?1 WHERE id = ?2').bind(self2.id, id).run();
  return json({ id }, 201);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  try {
    if (Math.random() < 0.02) await cleanup(env);
    if (parts[0] !== 'games') return err(404, 'Not found');

    if (parts.length === 1 && method === 'POST') {
      if (await rateLimited(env, request, 'create')) return err(429, 'Too many new games from here. Try again in an hour.');
      const input = await body(request);
      if (!input) return err(400, 'Bad request');
      return createGame(env, input);
    }

    const game = await loadGame(env, parts[1]);
    if (!game) return err(404, 'This game does not exist or was deleted.');
    const action = parts[2] || '';

    if (method === 'GET' && !action) {
      if (await rateLimited(env, request, 'read')) return err(429, 'Too many requests. Wait a minute.');
      const self = await me(env, request, game.id);
      return json(await stateFor(env, game, self));
    }
    if (method !== 'POST') return err(405, 'Method not allowed');
    const input = await body(request);
    if (!input) return err(400, 'Bad request');

    if (action === 'join') {
      if (await rateLimited(env, request, 'join')) return err(429, 'Too many joins from here. Try again later.');
      return join(env, game, input);
    }
    if (await rateLimited(env, request, 'write')) return err(429, 'Too many requests. Wait a minute.');
    const self = await me(env, request, game.id);
    if (!self) return err(401, 'Join the game first.');
    const isHost = self.id === game.host_id;

    switch (action) {
      case 'vote':
        return vote(env, game, self, input);
      case 'chat': {
        if (self.role !== 'turncoat') return err(403, 'Only turncoats can use this chat.');
        if (game.state === 'over') return err(409, 'The game is over.');
        const text = clean(input.text, 280);
        if (!text) return err(400, 'Write something first.');
        await env.DB.prepare('INSERT INTO chat (game_id, player_id, text, at) VALUES (?1, ?2, ?3, ?4)').bind(game.id, self.id, text, now()).run();
        return json({ ok: true }, 201);
      }
      case 'start': {
        if (!isHost) return err(403, 'Only the host can start the game.');
        if (game.state !== 'lobby') return err(409, 'The game has already started.');
        const players = await loadPlayers(env, game.id);
        if (players.length < MIN_PLAYERS) return err(409, `You need at least ${MIN_PLAYERS} players.`);
        await startGame(env, game, players);
        return json({ ok: true });
      }
      case 'advance': {
        if (!isHost) return err(403, 'Only the host can do that.');
        const players = await loadPlayers(env, game.id);
        await tick(env, game, players);
        if (game.state !== 'night' && game.state !== 'day') return err(409, 'There is no phase to end.');
        if (Number(input.day) !== game.day || input.state !== game.state) return json({ ok: true }); // already moved on
        await resolvePhase(env, game, players, await loadVotes(env, game));
        return json({ ok: true });
      }
      case 'end': {
        if (!isHost) return err(403, 'Only the host can end the game.');
        if (game.state === 'over') return json({ ok: true });
        if (game.state === 'lobby') return err(409, 'The game has not started yet.');
        await endEarly(env, game, await loadPlayers(env, game.id));
        return json({ ok: true });
      }
      case 'again': {
        if (!isHost) return err(403, 'Only the host can start the next game.');
        if (game.state !== 'over') return err(409, 'Finish this game first.');
        return playAgain(env, game, self);
      }
      case 'leave': {
        if (game.state !== 'lobby') return err(409, 'You cannot leave once the game has started.');
        if (isHost) return err(409, 'The host cannot leave. Delete the game instead.');
        await env.DB.prepare('DELETE FROM players WHERE id = ?1').bind(self.id).run();
        return json({ ok: true });
      }
      case 'kick': {
        if (!isHost) return err(403, 'Only the host can remove players.');
        if (game.state !== 'lobby') return err(409, 'Players can only be removed before the start.');
        if (input.id === self.id) return err(400, 'You cannot remove yourself.');
        await env.DB.prepare('DELETE FROM players WHERE id = ?1 AND game_id = ?2').bind(input.id, game.id).run();
        return json({ ok: true });
      }
      case 'delete': {
        if (!isHost) return err(403, 'Only the host can delete the game.');
        await env.DB.batch([
          env.DB.prepare('DELETE FROM votes WHERE game_id = ?1').bind(game.id),
          env.DB.prepare('DELETE FROM events WHERE game_id = ?1').bind(game.id),
          env.DB.prepare('DELETE FROM chat WHERE game_id = ?1').bind(game.id),
          env.DB.prepare('DELETE FROM players WHERE game_id = ?1').bind(game.id),
          env.DB.prepare('DELETE FROM games WHERE id = ?1').bind(game.id),
        ]);
        return json({ ok: true });
      }
      default:
        return err(404, 'Not found');
    }
  } catch (e) {
    console.error(e);
    return err(500, 'Something went wrong on our side. Try again.');
  }
}
