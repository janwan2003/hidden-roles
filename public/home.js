const form = document.getElementById('create');
const errEl = document.getElementById('err');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const name = document.getElementById('gname');
  const nick = document.getElementById('nick');
  for (const el of [name, nick]) {
    if (!el.value.trim()) { el.setAttribute('aria-invalid', 'true'); el.focus(); errEl.textContent = el === name ? 'Give the game a name.' : 'Pick a nickname.'; return; }
    el.removeAttribute('aria-invalid');
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const pace = form.querySelector('input[name=pace]:checked').value;
    const r = await TC.api('games', { method: 'POST', body: { name: name.value, nick: nick.value, pace, tz: TC.tz() } });
    TC.store.set(r.id, r.token);
    location.href = '/g/' + r.id;
  } catch (x) {
    errEl.textContent = x.message;
    btn.disabled = false;
  }
});
