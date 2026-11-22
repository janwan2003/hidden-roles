// Game page: renders the state from /api/games/<id> and polls while the page is open.
(() => {
  const { api, esc, avatar, toast, share, copy, store } = TC;
  const gameId = location.pathname.split('/').filter(Boolean)[1] || '';
  const $ = (id) => document.getElementById(id);

  // A personal link (#k=token) signs this device in; the token is then removed from the address bar.
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('k')) {
    store.set(gameId, hash.get('k'));
    history.replaceState(null, '', location.pathname);
  }
  let token = store.get(gameId);
  let S = null; // last state
  let skew = 0; // server time minus local time
  let pollTimer = null;
  let roleShown = false;
  const last = {};

  const set = (id, html) => {
    const el = $(id);
    if (html === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (last[id] !== html) { el.innerHTML = html; last[id] = html; }
  };
  const nowS = () => Math.floor(Date.now() / 1000) + skew;
  const inviteUrl = () => `${location.origin}/g/${gameId}`;
  const nameOf = (id) => (S.players.find((p) => p.id === id) || {}).name || 'Someone';

  function fmtTime(t) {
    try {
      return new Date(t * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: S.game.tz });
    } catch { return new Date(t * 1000).toLocaleString(); }
  }
  function left(t) {
    const s = Math.max(0, t - nowS());
    if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
    if (s >= 60) return `${Math.floor(s / 60)} min ${s % 60} s`;
    return `${s} s`;
  }
  const countdown = () => (S && S.game.phase_ends_at ? `<span data-countdown>${left(S.game.phase_ends_at)}</span>` : '');

  async function load() {
    try {
      const s = await api('games/' + gameId, { token });
      skew = s.now - Math.floor(Date.now() / 1000);
      if (token && !s.me) {
        store.del(gameId); token = null;
        if (S && S.me) toast(s.game.state === 'lobby' ? 'The host removed you from this game.' : 'This device is no longer signed in to the game.');
      }
      S = s;
      render();
    } catch (e) {
      $('loading').classList.remove('hidden');
      $('loading').innerHTML = e.status === 404
        ? '<h2>Game not found</h2><p class="muted">This game does not exist or was deleted.</p><a class="btn" href="/">Start a new game</a>'
        : `<p class="err">${esc(e.message)}</p><button class="btn ghost" onclick="location.reload()">Try again</button>`;
      if (e.status === 404) return;
    }
    schedule();
  }
  function schedule() {
    clearTimeout(pollTimer);
    if (!S) return;
    let wait = S.game.pace === 'quick' || S.game.state === 'lobby' ? 4000 : 15000;
    if (S.game.state === 'over') wait = 30000;
    if (S.game.phase_ends_at) wait = Math.min(wait, Math.max(1000, (S.game.phase_ends_at - nowS() + 1) * 1000));
    pollTimer = setTimeout(() => { if (!document.hidden) load(); else schedule(); }, wait);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => {
    if (!S || !S.game.phase_ends_at) return;
    for (const el of document.querySelectorAll('[data-countdown]')) el.textContent = left(S.game.phase_ends_at);
  }, 1000);

  async function act(path, body = {}, okMsg, reload = true) {
    try {
      const r = await api(`games/${gameId}/${path}`, { method: 'POST', body, token });
      if (okMsg) toast(okMsg);
      if (reload) await load();
      return r;
    } catch (e) {
      toast(e.message);
      for (const k of Object.keys(last)) delete last[k]; // re-enable buttons disabled for this action
      if (S) render();
      if (e.status === 401) { store.del(gameId); token = null; load(); }
      return null;
    }
  }

  // ---------- render ----------
  function render() {
    $('loading').classList.add('hidden');
    const { game, me } = S;
    document.title = `${game.name} · Turncoat`;
    $('whoami').textContent = me ? `You: ${me.name}` : '';
    renderHead();
    // Join form: only before the start, only without a seat.
    if (!me && game.state === 'lobby') {
      $('join').classList.remove('hidden');
      $('join-sub').textContent = `${S.players.length} ${S.players.length === 1 ? 'player has' : 'players have'} joined so far. Pick the name your group knows you by.`;
    } else $('join').classList.add('hidden');
    renderRole();
    renderMain();
    renderChat();
    renderNews();
    renderPlayers();
    renderTools();
  }

  function renderHead() {
    const g = S.game;
    const alive = S.players.filter((p) => p.alive).length;
    let icon = '🕯️', title = 'Waiting for players', when = '';
    if (g.state === 'lobby') {
      const need = Math.max(0, g.min_players - S.players.length);
      when = need ? `${S.players.length} joined · ${need} more to start` : `${S.players.length} joined · ready when the host is`;
    } else if (g.state === 'night') {
      icon = '🌙'; title = `Night ${g.day}`;
      when = g.pace === 'quick' ? `${alive} still in · night ends in ${countdown()}` : `${alive} still in · morning news ${fmtTime(g.phase_ends_at)} (in ${countdown()})`;
    } else if (g.state === 'day') {
      icon = '☀️'; title = `Day ${g.day}`;
      when = g.pace === 'quick' ? `${alive} still in · vote closes in ${countdown()}` : `${alive} still in · vote closes ${fmtTime(g.phase_ends_at)} (in ${countdown()})`;
    } else {
      icon = '🏁'; title = 'Game over';
      when = g.winner === 'loyal' ? 'The loyals won' : g.winner === 'turncoat' ? 'The turncoats won' : 'The host ended the game early';
    }
    set('head', `<div class="phase"><span class="icon" aria-hidden="true">${icon}</span><div><h1 class="gname">${esc(g.name)}</h1>
      <div><b>${title}</b> <span class="when">· ${when}</span></div></div></div>`);
  }

  function renderRole() {
    const me = S.me;
    if (!me || !me.role) return set('role', null);
    const el = $('role');
    el.className = `card role ${me.role}${roleShown || S.game.state === 'over' ? ' shown' : ''}`;
    const mates = (S.turncoats || []).filter((t) => t.id !== me.id);
    const over = S.game.state === 'over';
    const body = over ? '' : me.role === 'turncoat'
      ? `<p class="muted">Take out the loyals one by one at night, and stay hidden in the vote.</p>
         ${mates.length ? `<p>Your fellow turncoat${mates.length > 1 ? 's' : ''}: <b>${mates.map((m) => esc(m.name) + (m.alive ? '' : ' (out)')).join(', ')}</b></p>` : '<p>You are the only turncoat. Good luck.</p>'}`
      : `<p class="muted">Find the turncoat${S.game.turncoats > 1 ? 's' : ''} hiding in your group and vote them out before they outnumber you.</p>`;
    set('role', `<span class="pill">${over ? 'You played as' : me.alive ? 'Your secret role' : 'Your role (you are out)'}</span>
      <div class="face">${me.role === 'turncoat' ? '🗡️ Turncoat' : '🛡️ Loyal'}</div>${body}
      ${over ? '' : '<button class="btn ghost small hide-role" data-hide-role>Hide</button>'}
      <button class="cover" data-show-role><span style="font-size:2rem">🃏</span><span>Tap to see your secret role</span><span class="small muted">Check nobody is looking</span></button>`);
  }
  $('role').addEventListener('click', (e) => {
    if (e.target.closest('[data-show-role]')) { roleShown = true; $('role').classList.add('shown'); }
    if (e.target.closest('[data-hide-role]')) { roleShown = false; $('role').classList.remove('shown'); }
  });

  function pickList(cands, selected, kind) {
    return `<div class="picks">${cands.map((p) => `<button class="pick${selected === p.id ? ' sel' : ''}" data-${kind}="${p.id}" aria-pressed="${selected === p.id}">
      ${avatar(p)}<span class="nm">${esc(p.name)}</span>${p.tag ? `<span class="tag">${p.tag}</span>` : ''}</button>`).join('')}</div>`;
  }

  function lastNews(kinds) {
    for (let i = S.events.length - 1; i >= 0; i--) if (kinds.includes(S.events[i].kind)) return S.events[i];
    return null;
  }

  function renderMain() {
    const { game, me } = S;
    let html = '';
    if (game.state === 'lobby') {
      const need = Math.max(0, game.min_players - S.players.length);
      const pct = Math.min(100, Math.round((S.players.length / game.min_players) * 100));
      html += `<div class="card glow"><h2>${need ? `Invite ${need} more to start` : 'Ready to start'}</h2>
        <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <p class="muted">Send the link to your group chat. Anyone who opens it can join with a nickname until the host starts.
        ${S.players.length >= game.min_players ? `With ${S.players.length} players there will be <b>${game.turncoats} turncoat${game.turncoats > 1 ? 's' : ''}</b>.` : `You need at least ${game.min_players} players.`}</p>
        ${me ? '<div class="row"><button class="btn grow" data-invite>Invite your group</button></div>' : ''}
        ${me && me.host ? `<div class="row" style="margin-top:10px"><button class="btn ghost grow" data-start ${need ? 'disabled' : ''}>Deal the roles and start</button></div>
          <p class="hint">${game.pace === 'quick' ? 'Quick game: 5-minute nights, 10-minute days.' : 'One round a day: night ends at 8 am, the vote closes at 8 pm.'} Nobody can join after the start.</p>` : me ? '<p class="hint">The host starts the game once everyone is in.</p>' : ''}</div>`;
    } else if (game.state === 'night') {
      if (me && me.alive && me.role === 'turncoat') {
        const mine = (S.picks || []).find((p) => p.by === me.id);
        const loyals = S.players.filter((p) => p.alive && p.id !== me.id && !(S.turncoats || []).some((t) => t.id === p.id))
          .map((p) => ({ ...p, tag: (S.picks || []).filter((x) => x.target === p.id).map((x) => nameOf(x.by)).join(', ') }));
        const tcs = (S.turncoats || []).filter((t) => t.alive);
        const waiting = tcs.filter((t) => !(S.picks || []).some((x) => x.by === t.id)).map((t) => (t.id === me.id ? 'you' : esc(t.name)));
        html += `<div class="card glow"><h2>🗡️ Who do you take out tonight?</h2>
          <p class="muted">Only turncoats see this. ${tcs.length > 1 ? 'The most-picked name goes; a tie is settled at random. ' : ''}You can change your pick until morning.</p>
          ${pickList(loyals, mine ? mine.target : null, 'night')}
          <p class="small muted">${waiting.length ? `Still to pick: ${waiting.join(', ')}.` : 'Everyone has picked. Morning comes now.'}</p></div>`;
      } else if (me && me.alive) {
        html += `<div class="card"><h2>🌙 Night falls</h2><p class="muted">The turncoats are choosing someone to take out. Act normal in the chat. You will find out in the morning.</p></div>`;
      } else if (me) {
        html += outCard();
      }
    } else if (game.state === 'day') {
      const news = lastNews(['murder', 'quiet']);
      if (news) html += `<div class="card"><span class="pill gold">Morning news · Day ${news.day}</span><h2 style="margin-top:8px">${newsTitle(news)}</h2><p class="muted">${newsLine(news)}</p></div>`;
      if (me && me.alive) {
        const cands = S.players.filter((p) => p.alive && p.id !== me.id).map((p) => ({ ...p, tag: p.voted ? 'voted' : '' }));
        html += `<div class="card glow"><h2>🗳️ The vote</h2>
          <p class="muted">Talk it over in your group chat, then vote for who you think is a turncoat. Most votes is banished and their role revealed; a tie banishes nobody. Votes stay secret until the vote closes, and you can change yours until then.</p>
          ${pickList(cands, S.vote.mine, 'day')}
          <p class="small muted"><b>${S.vote.voted} of ${S.vote.of}</b> have voted. ${S.vote.mine ? `You voted for <b>${esc(nameOf(S.vote.mine))}</b>.` : 'You have not voted yet.'}</p></div>`;
      } else if (me) html += outCard();
      else html += `<div class="card"><p class="muted"><b>${S.vote.voted} of ${S.vote.of}</b> have voted today.</p></div>`;
    } else if (game.state === 'over') {
      html += overCard();
    }
    if (!me && game.state !== 'lobby' && game.state !== 'over') {
      html += `<div class="card"><h2>This game is under way</h2><p class="muted">New players can't join after the start. You can follow the news below, or start a game for your own group.</p><a class="btn" href="/">Start your own game</a></div>`;
    }
    set('main', html);
  }

  function outCard() {
    const how = S.me.alive ? '' : S.players.find((p) => p.id === S.me.id).out_how === 'murder' ? 'You were taken out in the night.' : 'You were banished by the vote.';
    return `<div class="card"><h2>👻 You are out</h2><p class="muted">${how} You can't vote any more, but you can watch how it ends. No hints in the group chat!</p></div>`;
  }

  function newsTitle(e) {
    if (e.kind === 'murder') return `${esc(e.name)} was taken out in the night.`;
    if (e.kind === 'quiet') return 'A quiet night. Nobody was taken.';
    if (e.kind === 'banish') return `${esc(e.name)} was banished. They were ${e.role === 'turncoat' ? 'a <span style="color:var(--red)">turncoat</span>' : '<span style="color:var(--green)">loyal</span>'}.`;
    if (e.kind === 'tie') return `The vote was tied (${e.tied.map(esc).join(' vs ')}). Nobody was banished.`;
    if (e.kind === 'novotes') return 'Nobody voted. Nobody was banished.';
    if (e.kind === 'start') return `The roles are dealt: ${e.players} players, ${e.turncoats} turncoat${e.turncoats > 1 ? 's' : ''}.`;
    if (e.kind === 'over') return e.winner === 'loyal' ? 'The loyals win!' : e.winner === 'turncoat' ? 'The turncoats win!' : 'The host ended the game.';
    return '';
  }
  function newsLine(e) {
    if (e.kind === 'murder') return `${esc(e.name)} was loyal. The turncoats are still among you.`;
    if (e.kind === 'quiet') return 'The turncoats did not agree on anyone. Stay alert.';
    return '';
  }
  function ballotsLine(e) {
    if (!e.ballots || !e.ballots.length) return '';
    return `<div class="ballots">${e.ballots.map((b) => `${esc(b.byName)} → ${esc(b.forName)}`).join(' · ')}</div>`;
  }

  function overCard() {
    const g = S.game, me = S.me;
    const cls = g.winner === 'loyal' ? 'loyal' : g.winner === 'turncoat' ? 'turncoat' : '';
    const big = g.winner === 'loyal' ? 'The loyals win' : g.winner === 'turncoat' ? 'The turncoats win' : 'Game ended';
    const tcs = S.players.filter((p) => p.role === 'turncoat');
    const youWon = me && me.role && g.winner === me.role;
    let html = `<div class="card glow banner ${cls}"><span class="pill">Day ${g.day}</span><div class="big">${big}</div>
      <p>The turncoat${tcs.length > 1 ? 's were' : ' was'} <b>${tcs.map((p) => esc(p.name)).join(' and ')}</b>.</p>
      ${me && me.role && g.winner !== 'none' ? `<p class="muted">${youWon ? 'You won. 🎉' : 'You lost this one.'}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:12px">`;
    if (g.next_id) html += `<a class="btn" href="/g/${esc(g.next_id)}" data-next>${me ? 'Go to the next game' : 'See the next game'}</a>`;
    else if (me && me.host) html += `<button class="btn" data-again>Play again with this group</button>`;
    html += `<button class="btn ghost" data-share-result>Share the result</button></div>
      ${!g.next_id && me && !me.host ? '<p class="hint">The host can start a rematch with new roles.</p>' : ''}</div>
      <div class="card center"><h3>Got another group?</h3><p class="muted">Family, friends, work: every chat has a turncoat.</p><a class="btn ghost" href="/">Start a game for another group</a></div>`;
    return html;
  }

  function resultText() {
    const g = S.game;
    const tcs = S.players.filter((p) => p.role === 'turncoat').map((p) => p.name).join(' and ');
    const lines = [`🕯️ Turncoat: "${g.name}"`];
    lines.push(g.winner === 'loyal' ? `🛡️ The loyals won on day ${g.day}!` : g.winner === 'turncoat' ? `🗡️ The turncoats won on day ${g.day}!` : `Ended on day ${g.day}.`);
    lines.push(`The turncoat${tcs.includes(' and ') ? 's were' : ' was'}: ${tcs}`);
    for (const e of S.events) {
      if (e.kind === 'murder') lines.push(`🌙 Night ${e.day}: ${e.name} taken out`);
      if (e.kind === 'banish') lines.push(`☀️ Day ${e.day}: ${e.name} banished (${e.role})`);
    }
    lines.push('Play one with your group:');
    return lines.join('\n');
  }

  function renderChat() {
    const el = $('chat');
    if (!S.me || S.me.role !== 'turncoat' || S.game.state === 'lobby') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('chatform').classList.toggle('hidden', S.game.state === 'over');
    const log = $('chatlog');
    const html = (S.chat || []).length
      ? S.chat.map((m) => `<div class="msg"><b>${esc(nameOf(m.player_id))}</b><div>${esc(m.text)}</div></div>`).join('')
      : '<p class="small muted">No messages yet. Plan your nights here, away from the group chat.</p>';
    if (last.chatlog !== html) {
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.innerHTML = html; last.chatlog = html;
      if (atBottom) log.scrollTop = log.scrollHeight;
    }
  }
  $('chatform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chattext');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const r = await act('chat', { text });
    if (!r) input.value = text;
    else $('chatlog').scrollTop = $('chatlog').scrollHeight;
  });

  function renderNews() {
    const ev = S.events.filter((e) => e.kind !== 'start' || S.game.state !== 'lobby');
    if (!ev.length) return set('news', null);
    const items = ev.slice().reverse().map((e) => {
      const label = e.kind === 'murder' || e.kind === 'quiet' ? `Night ${e.day}` : e.kind === 'start' ? 'Start' : e.kind === 'over' ? 'The end' : `Day ${e.day} vote`;
      return `<li><div class="d">${label}</div><div>${newsTitle(e)}</div>${ballotsLine(e)}</li>`;
    });
    set('news', `<h3>What happened</h3><ul class="news">${items.join('')}</ul>`);
  }

  function renderPlayers() {
    const { game, me } = S;
    const items = S.players.map((p) => {
      let tag = '';
      const shownRole = !p.alive || game.state === 'over' ? p.role : null;
      if (shownRole) tag = `<small title="${p.alive ? shownRole : p.out_how === 'murder' ? `taken out on night ${p.out_day}` : `banished on day ${p.out_day}`}" class="${shownRole === 'turncoat' ? 'red' : 'green'}">${shownRole}${p.alive ? '' : p.out_how === 'murder' ? ` · 🌙 ${p.out_day}` : ` · 🗳️ ${p.out_day}`}</small>`;
      else if (p.id === game.host_id) tag = '<small>host</small>';
      const kick = game.state === 'lobby' && me && me.host && p.id !== me.id
        ? `<button class="btn ghost small kick" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>` : '';
      return `<li class="${p.alive ? '' : 'out'}">${avatar(p)}<span class="nm"><span>${esc(p.name)}${me && p.id === me.id ? ' (you)' : ''}</span>${tag}</span>${kick}</li>`;
    });
    const alive = S.players.filter((p) => p.alive).length;
    set('players', `<h3>Players <span class="muted small">${game.state === 'lobby' ? S.players.length : `${alive} of ${S.players.length} still in`}</span></h3><ul class="players">${items.join('')}</ul>`);
  }

  function renderTools() {
    const { game, me } = S;
    if (!me) return set('tools', null);
    let html = `<h3>Your seat</h3><p class="small muted">To play on another phone or computer, open your personal link there. Don't share it: it shows your role.</p>
      <div class="row"><button class="btn ghost" data-personal>Copy my personal link</button>`;
    if (game.state !== 'lobby') html += `<button class="btn ghost" data-invite>Copy the game link</button>`;
    if (game.state === 'lobby' && !me.host) html += `<button class="btn danger" data-leave>Leave the game</button>`;
    html += '</div>';
    if (me.host) {
      html += `<h3 style="margin-top:18px">Host controls</h3><div class="row">`;
      if (game.state === 'night' || game.state === 'day') {
        html += `<button class="btn ghost" data-advance>End this ${game.state === 'night' ? 'night' : 'vote'} now</button>
          <button class="btn danger" data-end>End the game and reveal roles</button>`;
      }
      html += `<button class="btn danger" data-delete>Delete the game</button></div>`;
    }
    set('tools', html);
  }

  // ---------- events ----------
  document.getElementById('app').addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t || !S) return;
    if (t.dataset.invite !== undefined) {
      const need = Math.max(0, S.game.min_players - S.players.length);
      await share({ title: S.game.name, text: S.game.state === 'lobby'
        ? `Join our game of Turncoat, "${S.game.name}". One of us will secretly be a turncoat… ${need ? `We need ${need} more to start.` : ''}`.trim()
        : `Follow our game of Turncoat, "${S.game.name}":`, url: inviteUrl() });
    } else if (t.dataset.personal !== undefined) {
      if (await copy(`${inviteUrl()}#k=${token}`)) toast('Personal link copied. Open it on your other device.');
    } else if (t.dataset.start !== undefined) {
      if (!confirm(`Deal the roles to ${S.players.length} players and start? Nobody can join after this.`)) return;
      t.disabled = true; await act('start', {}, 'The roles are dealt. Check your card.');
    } else if (t.dataset.night) {
      t.disabled = true; await act('vote', { target: Number(t.dataset.night) });
    } else if (t.dataset.day) {
      t.disabled = true; await act('vote', { target: Number(t.dataset.day) }, `You voted for ${nameOf(Number(t.dataset.day))}.`);
    } else if (t.dataset.advance !== undefined) {
      if (!confirm(`End the ${S.game.state === 'night' ? 'night' : 'vote'} now? It resolves with the votes cast so far.`)) return;
      await act('advance', { day: S.game.day, state: S.game.state });
    } else if (t.dataset.end !== undefined) {
      if (!confirm('End the game now and reveal every role? Nobody wins.')) return;
      await act('end');
    } else if (t.dataset.delete !== undefined) {
      if (!confirm('Delete this game for everyone? This cannot be undone.')) return;
      clearTimeout(pollTimer);
      if (await act('delete', {}, null, false)) { store.del(gameId); location.href = '/'; }
    } else if (t.dataset.leave !== undefined) {
      if (!confirm('Leave this game?')) return;
      if (await act('leave', {}, null, false)) { store.del(gameId); token = null; load(); }
    } else if (t.dataset.kick) {
      const n = nameOf(Number(t.dataset.kick));
      if (!confirm(`Remove ${n} from the game?`)) return;
      await act('kick', { id: Number(t.dataset.kick) }, `${n} was removed.`);
    } else if (t.dataset.again !== undefined) {
      t.disabled = true;
      const r = await act('again', {}, null, false);
      if (r && r.id) { store.set(r.id, token); location.href = '/g/' + r.id; }
    } else if (t.dataset.next !== undefined) {
      if (token) store.set(S.game.next_id, token); // same seat in the rematch
    } else if (t.dataset.shareResult !== undefined) {
      await share({ title: 'Turncoat result', text: resultText(), url: location.origin + '/' });
    }
  });

  $('join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nick = $('jnick');
    $('join-err').textContent = '';
    if (!nick.value.trim()) { $('join-err').textContent = 'Pick a nickname.'; nick.focus(); return; }
    const btn = $('join').querySelector('button');
    btn.disabled = true;
    try {
      const r = await api(`games/${gameId}/join`, { method: 'POST', body: { nick: nick.value } });
      token = r.token; store.set(gameId, token);
      await load();
      toast("You're in. Wait for the host to deal the roles.");
    } catch (x) {
      $('join-err').textContent = x.message;
    }
    btn.disabled = false;
  });

  load();
})();
