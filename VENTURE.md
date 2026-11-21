---
slug: hidden-roles
stage: idea
priority: 4
url:
repo:
updated: 2026-11-20
---

# hidden-roles

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
- **Honest risk:** social deduction can sour groups; keep it playful (mini-challenges, light
  tone), allow the creator to end or restart a game, and keep everything private to the group.

## Status

Idea only. Nothing built. Evidence is the web searches of 2026-11-20 listed above; no page was
opened directly.

## Next steps

1. Write the rules engine (role counts by group size, night/day phases, ties, players who never
   vote, late joiners) and test it as pure functions first.
2. Build as `pb-hidden-roles` on Cloudflare Pages + Functions + D1 with a cron trigger for phase
   changes; per-player device token; traitor-only view.
3. Morning news + recap card + dynamic OG image ("Day 3 · 7 left").
4. 20 original daily mini-challenges (polls, quick guesses) to give non-traitors something to do.
5. Playwright e2e: 6 players through a full game; no role leaks in any API response.
6. Target a live version before Christmas holidays if feasible.

## Monetization plan

None until the operator enables it (charter rule 4). Later: themed packs (murder mystery, office
edition), extra roles, bigger games. Never paywall joining or the core game.

## Log

- 2026-11-20 scout: created idea. Evidence from web searches (City AM, Mumsnet, Drumond Park,
  App Store listings, MafiaScum wiki, GitHub). No TV audience or search-volume data checked.
