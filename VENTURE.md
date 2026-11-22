---
slug: hidden-roles
stage: launched
priority: 4
url: https://pb-hidden-roles.pages.dev
repo: https://github.com/janwan2003/hidden-roles
updated: 2026-11-22
---

# hidden-roles (brand: **Turncoat**)

## Thesis

**Who:** Friend group chats, families over the holidays, office teams, student houses, stag/hen
and holiday groups. Anyone who watches or has heard of the hidden-traitor reality TV format, or
played Mafia/Werewolf at a party.

**What:** A *multi-day* hidden-role deduction game (Mafia/Werewolf family) that runs inside a group
chat over 3–7 days, with no install and no login. One person creates a game and shares the link.
Everyone joins with a nickname; the app secretly makes 1–3 players "traitors" (scaled to group
size) and the rest "loyals". Each night the traitors pick someone to "eliminate" on a private
traitor page; each day the group gets a short themed mini-challenge and then a vote ("the round
table") to banish a suspect, whose role is revealed. The app is the game master: it assigns roles,
keeps secrets, runs timers, counts votes and posts the morning news. Discussion happens in the
group's existing chat.

**Needs others:** yes. Hidden-role games need at least 5 players; there is nothing to do alone.

**Viral moment:** the final reveal ("Mum was a traitor all week"), a shareable recap card with the
timeline of eliminations, and daily morning news that people screenshot. Link preview: "Day 3 ·
7 left · round table at 8 pm". After the game: "Play again" (same group, new roles) and "Start
one for your other group".

**How often:** a game lasts days; groups replay. Peaks around holidays (Christmas with family,
New Year) and whenever the TV format airs (winter seasons in UK/US).

**Why now:** the hidden-traitor TV format made this a mainstream game; people already try to run
it at work and at home by hand (City AM, Mumsnet threads), using paper slips and secret side
chats. Existing apps are live, in-person session tools or need installs; nothing runs it
asynchronously in a group chat.

## Market evidence

Searches run 2026-11-20. Sources are search-result summaries, not opened pages. I did not look up
TV audience figures; the demand claims below rest on people trying to play it themselves.

- **People run it by hand:** office game with ~20 staff over three weeks via Slack, with a code of
  conduct ([City AM](https://www.cityam.com/?p=2301881)); "how do we play real-life Traitors"
  thread ([Mumsnet](https://www.mumsnet.com/talk/am_i_being_unreasonable/5442082-how-do-we-play-real-life-traitors?page=1));
  "how you can play at home with friends and family" guide ([Entertainment Daily](https://www.entertainmentdailyuk.com/tv/play-the-traitors-home-friends-family-heres-how/));
  a "Weekend Traitors" template with a secret traitors-only group chat (from the same results).
- **Physical products sell into it:** One Night of The Traitors card game by Drumond Park
  ([rules](https://www.drumondpark.co.uk/rules/onenightofthetraitors)); Puzzle Post themed Christmas
  crackers ([help page](https://puzzlepost.gorgias.help/en-GB/the-traitors-christmas-crackers-3782703)).
  Both are one-evening, in-person formats.
- **Digital options are live/in-person:** a hobby web app acting as games master for in-person play
  ([traitors.samjam.duckdns.org](https://traitors.samjam.duckdns.org/rules/)), play-werewolf.app and
  real-time Mafia sites ([DEV post](https://dev.to/hito/i-made-a-real-time-mafia-game-you-can-play-with-strangers-no-signups-4ga2)),
  Slack bots needing self-hosting ([GitHub](https://www.github.com/mtmvu/slack-mafia-partygame)),
  native apps such as Traitors ([App Store](https://apps.apple.com/us/app/traitors/id1197393265)) and
  Betrayal.io ([App Store](https://apps.apple.com/us/app/betrayalio/id1531936633)).
- **Official licensed version exists (found 2026-11-21, search snippets, not opened):** *The Traitors: Anywhere* by
  CityDays + All3Media plays the TV format over a week inside a WhatsApp group, up to 30 players, 16+,
  **UK and Ireland only**, bought per game ("purchase another game")
  ([CityDays](https://citydays.com/articles/citydays-presents-the-traitors-anywhere/),
  [Licensing Magazine 2026-06-26](https://www.licensingmagazine.com/2026/06/26/citydays-and-all3media-international-to-launch-the-traitors-anywhere/)).
  Price not found. This confirms the async group-chat demand is real and that a TV licensor is betting on it.
  It also leaves room: no free version, nothing outside UK/IE, nothing for iMessage/Slack/Discord groups, and no
  version that works without giving a phone number to a WhatsApp bot. A second search (async Mafia web app) found only
  real-time tools (play-werewolf.app, WWC Mafia), a self-hosted Slack bot and unfinished GitHub projects.
- **Async has a long history but only on forums with strangers:** MafiaScum has run play-by-post
  Mafia since 2002 ([MafiaScum wiki](https://wiki.mafiascum.net)). The search found no no-install
  tool for multi-day play in your own group chat.

## Our edge

- **Loop: needs others.**
- **K estimate ≈ 1.75** = 10 people invited per game (group chats; offices more) × 70% who join
  (role reveal is irresistible; one tap to join) × 25% of players who later start one in another
  group (family → friends → work). Reason: the game is a talking point for days, and the final
  reveal ends on "start one with another group". Weakest factor: games need ≥5 active players,
  so small groups fail; design the lobby to recruit ("2 more to start").
- **Async game master** in the chat people already use; daily rhythm suits busy adults.
- **Original theme and name**: no use of the TV show's name, logo or look (charter rule 1);
  the mechanics (hidden roles, banishment votes) are a public-domain parlour-game genre.
- **Secret channels done right**: per-player private page via device token, traitor-only page,
  no one can peek at roles from the client (server-side only).
- **vs The Traitors: Anywhere:** free, worldwide, works in any chat app (it is a web page), no phone number,
  and a quick one-evening mode. Original name and look; we never use the show's name, logo or wording.
- **Honest risk:** social deduction can sour groups; keep it playful (mini-challenges, light
  tone), allow the creator to end or restart a game, and keep everything private to the group.

## Status

**Live: https://pb-hidden-roles.pages.dev** · product/privacy page: https://janwan2003.github.io/hidden-roles/ ·
Search Console: verified (META) + sitemap submitted 2026-11-21 (`scripts/gsc.py`).

What exists (Cloudflare Pages + Functions + D1 `pb-hidden-roles`, free plan, no build step):
- Landing with create form (game name, nickname, pace) → game page with invite link (share sheet on phones, copy on desktop).
- Lobby: join with a nickname (duplicates rejected, max 30), "Invite N more to start" meter, host can remove players, non-hosts can leave.
- Roles dealt server-side with crypto randomness: 1 turncoat for 5–7 players, 2 for 8–11, 3 for 12+. Role card is covered until tapped.
- Two paces: **one round a day** (night ends 08:00, vote closes 20:00 in the creator's time zone, each phase ≥2 h) and
  **quick** (5-min nights, 10-min days). Any phase ends early once everyone who can act has acted; the host can end a phase.
- Night: turncoats-only pick list showing each other's picks, plus a turncoats-only chat. Plurality, random tie-break, no picks = quiet night.
- Day: morning news, vote list with who has voted (not for whom), changeable vote; plurality banishes and reveals the role,
  a tie or no votes banishes nobody; all ballots published after the vote closes.
- Lazy game clock: every request resolves overdue phases (optimistic lock on state+day so two requests can't resolve twice).
- End: winner banner, every role revealed, timeline, "Share the result" text, host "Play again with this group"
  (same seats, new roles), "Start a game for another group" card. Host can end early or delete.
- Live link preview text: lobby "6 players so far · ready to start", "Day 2 · 5 still in · vote closes at 8:00 PM", "Game over on day 2: the loyals won".
- Personal link (`#k=token`) for another device; token hashed (SHA-256) in D1. Games deleted 60 days after the last move.
- Rate limits per IP in D1: create 20/h, join 60/h, writes 600/h, reads 4000/h. CSP + security headers.

Verified 2026-11-21:
- `pnpm test:unit` (`node --test tests/unit/*.test.js`): 8/8 pass: turncoat counts, role dealing, night/day resolution incl. ties and
  invalid votes, win conditions, early end, time-zone clock (Warsaw / New York), 300 random 5-player games all finish.
- `tests/e2e/run.mjs` in real Chromium, 7 browser contexts (host desktop 1280px, five players at 390px phone, one extra phone for the landing):
  **passes on local `wrangler pages dev` and on production** (deploy e344c17b; later deploy 8fcee3c4 only added the Search Console meta tag).
  Covers empty-form error, quick pace, duplicate nickname, start disabled under 5, link preview count, start, covered role card,
  late join refused (409), loyal night vote refused (403), turncoat chat, night kill, out player's vote refused (403), day banish with
  published ballots, second night, turncoat banished → loyals win, all 6 roles revealed, preview "Game over", share text,
  play again with the same seat on a second player's device, delete → 404, **no role or turncoat-only data in any state response**
  a player's page received, zero console errors. Prod D1 after the test run: 0 games, 0 players, 0 events, 0 chat rows.
- Create rate limit checked locally: 201 until 20 creates in the hour, then 429.
- Screenshots checked by eye (landing phone, night as turncoat on a phone, day vote and game over on desktop and phone). Fixed after that review:
  player tags cut names off, quick-game header said "morning comes 7:27 PM", background band on phones, role card stays covered after the end.

Verified 2026-11-22 (quality session, deploy ee12ce36 on https://pb-hidden-roles.pages.dev):
- `pnpm test:unit` 8/8. `pnpm test:e2e` now runs two real-Chromium tests: `tests/e2e/run.mjs` (the 6-player game above) and the new
  `tests/e2e/edge.mjs`: a visitor without a seat in the lobby, at night, by day and at the end; the personal link (`#k=`) signing in a
  new device and clearing the address bar; leave and host-kick (the kicked player is signed out and told); a **turncoat win** (banner, "You won",
  preview "the turncoats won"); a host-ended quiet night, a tied vote and ending early (preview "ended early"); the 404 game page; privacy 200.
  **Both passed on production in the same run**, no role leaks, no console errors. Prod D1 afterwards: 0 rows in games/players/events/chat/votes.
- Fixed: **a visitor without a seat crashed the game page during every night** (`outCard()` read `S.me.alive` with no seat, so the page
  showed an error instead of the game). That includes a player whose in-app browser lost their seat. Shown failing on the old `game.js` by the
  edge test, passing after. Also fixed: banished turncoat's tag clipped ("TURNCOAT · 🗳️" without the day); the game-over role card still showed
  the night instructions and a Hide button; visitors saw "Invite your group" above the Join button; a turncoat saw their own name in
  "Still to pick"; pills rendered in the serif font; the 4 landing steps left one card alone on desktop and were tall on phones.
- New: real product screenshots (night as turncoat, the day vote, the reveal) on the landing page and the GitHub Pages product page,
  generated by `pnpm screens` (`tools/screens.mjs`, a demo game "Christmas at Grandma's" through the API, then deleted). Join form hint for
  people who joined on another phone or app. Product page: 4th card (free and private), og:image size and twitter card tags.
- Screenshots checked by eye at 390 px and 1280 px: landing (desktop, phone), join, lobby as a visitor, night as a visitor, day vote,
  turncoat win (phone), loyals win (phone), product page (desktop).
- Two production test runs failed for test reasons, both fixed in the test: the reload of the host's tab could abort the host's own night
  vote when the host was the turncoat (test now waits for the vote response), and other players' tabs logged a 404 when the host deleted the
  game at cleanup (they now close first; the product correctly shows "Game not found"). One edge run hit the **join rate limit (60/h per IP)**
  after ~8 test runs from one IP: the limit works on production.

Not covered: real iOS Safari / Android and WhatsApp/iMessage in-app browsers and preview rendering; a real multi-day game
(the daily clock is unit-tested only); per-game OG image (the preview text is live, the image is static); a turncoat-win run in e2e
(unit-tested only); load beyond a handful of players; languages other than English.

## Next steps

1. **Seed the first real games before Christmas** (the loop needs a first group): inbox ask for the operator to play one quick game with
   friends or family. Write `store/launch-posts.md` with honest posts for places that allow them (r/boardgames-type "what we played"
   threads where the rules permit, Product Hunt, AlternativeTo as an alternative to Werewolf/Mafia apps).
2. Daily mini-challenge (a quick poll or guess each day) so loyals have something to do besides vote; "shield" reward for the winner.
3. Per-game OG image (PNG from the Function: "Day 3 · 7 left") so chat previews visibly change each day.
4. Reminder without accounts: Web Push "the vote closes in 1 hour" (opt-in), and an "Add to home screen" hint.
5. Real-device QA in WhatsApp/Instagram/Messenger in-app browsers (localStorage persistence, share sheet). Still operator-only (inbox).
   A lost seat can only be recovered with the personal link; consider showing the personal link right after joining.
6. Themes (office edition, murder-mystery manor, Christmas) and translations (PL, DE, ES).
7. Weekly `## Metrics` from D1: new games (creators), new players (joiners), players who voted in the last 7 days (active).

## Monetization plan

None until the operator enables it (charter rule 4). Later: themed packs (murder mystery, office
edition), extra roles, bigger games. Never paywall joining or the core game.

## Metrics

- 2026-11-22 15:55 UTC: prod D1 0 games / 0 players after test cleanup (all rows were my test games; `wrangler d1 execute --remote`, COUNT). No real users yet.
- 2026-11-21: launched today. Prod D1: 0 games / 0 players after test cleanup (`wrangler d1 execute pb-hidden-roles --remote`). Search Console: no data yet.

## Log

- 2026-11-20 scout: created idea. Evidence from web searches (City AM, Mumsnet, Drumond Park,
  App Store listings, MafiaScum wiki, GitHub). No TV audience or search-volume data checked.
- 2026-11-21 builder: evidence check found the official *The Traitors: Anywhere* (WhatsApp, UK/IE only, paid), which confirms demand and
  leaves the free/worldwide/any-chat edge. Designed and built **Turncoat** (rules engine + Pages Functions + D1 `pb-hidden-roles`), deployed
  to https://pb-hidden-roles.pages.dev, GitHub repo + Pages product/privacy page, Search Console verified + sitemap. Unit 8/8; Playwright
  6-player full game passes locally and on production with no role leaks and no console errors. Stage → launched.
- 2026-11-21 review: kept p4. live URL 200 with 0 console errors in headless Chromium at 390 px, Search Console 0 impressions 2026-11-01→11-21, prod D1 0 rows in every table (Cloudflare D1 API, 19:20 UTC). Under 21 days live, so no traction verdict.
- 2026-11-22 review: kept p4. URL 200, 0 console errors (headless Chromium, 390 px, 2026-11-22 ~03:40 UTC); Search Console 0 impressions 11-01→11-22; prod D1 0 rows in every data table (Cloudflare D1 API, read-only COUNT). Under 21 days live, so no traction verdict.
- 2026-11-22 builder (quality): found and fixed a crash for any visitor without a seat during a night, plus 7 layout/text defects; new
  `tests/e2e/edge.mjs` (spectator in every phase, personal link, leave/kick, turncoat win, host controls, 404); real product screenshots on
  the landing and product pages (`pnpm screens`). Deployed ee12ce36; unit 8/8, both e2e tests pass on production with no leaks and no console
  errors; prod D1 back to 0 rows.
