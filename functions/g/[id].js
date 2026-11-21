// Serves the game page with a live link preview: "Day 3 · 7 still in · vote closes 8 pm".
import { MIN_PLAYERS } from '../_rules.js';
import { ID_RE } from '../_db.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (t, tz) => {
  try { return new Date(t * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return ''; }
};

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL('/g', url.origin));
  let html = await page.text();
  let title = 'Join my game of Turncoat';
  let status = 200;
  let desc = 'A traitor game for your group chat. Secret roles, a vote every day. No app, no sign-up.';
  try {
    const id = String(params.id || '');
    const g = ID_RE.test(id) && await env.DB.prepare('SELECT id, name, tz, state, day, phase_ends_at, winner FROM games WHERE id = ?1').bind(id).first();
    if (g) {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(alive) AS alive FROM players WHERE game_id = ?1').bind(g.id).first();
      title = `${g.name} · Turncoat`;
      if (g.state === 'lobby') {
        const need = Math.max(0, MIN_PLAYERS - row.n);
        desc = `${row.n} ${row.n === 1 ? 'player' : 'players'} so far${need ? ` · ${need} more to start` : ' · ready to start'}. Tap to join with a nickname: one of you will secretly be a turncoat.`;
      } else if (g.state === 'night') {
        desc = `Night ${g.day} · ${row.alive} still in · morning news at ${clock(g.phase_ends_at, g.tz)}. Who will the turncoats take?`;
      } else if (g.state === 'day') {
        desc = `Day ${g.day} · ${row.alive} still in · vote closes at ${clock(g.phase_ends_at, g.tz)}. Who is the turncoat?`;
      } else {
        desc = `Game over on day ${g.day}: ${g.winner === 'loyal' ? 'the loyals won' : g.winner === 'turncoat' ? 'the turncoats won' : 'ended early'}. See who was who.`;
      }
    } else if (id) {
      title = 'Turncoat · game not found';
      status = 404;
    }
  } catch (e) {
    console.error(e);
  }
  const meta = `<title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Turncoat">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${url.origin}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${esc(url.origin + url.pathname)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="noindex">`;
  html = html.replace('<!--META-->', meta);
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
