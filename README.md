# Turncoat (hidden-roles)

The traitor game for your group chat. One link, nicknames, secret roles; turncoats take someone out each night and the group votes to banish a suspect each day. Plays over a few days ("one round a day") or in one evening ("quick game").

- Live: https://pb-hidden-roles.pages.dev
- Product page: https://janwan2003.github.io/hidden-roles/

Stack: Cloudflare Pages (static `public/`) + Pages Functions (`functions/`) + D1 (`pb-hidden-roles`, schema in `schema.sql`). No build step.
Rules engine (pure functions) in `functions/_rules.js`; the game clock is lazy: every request resolves any phase whose deadline passed or where everyone has acted (`tick` in `functions/_db.js`).

```
pnpm install
npx wrangler d1 execute pb-hidden-roles --local --file schema.sql
pnpm dev                                   # http://127.0.0.1:8841
pnpm test:unit
BASE=http://127.0.0.1:8841 pnpm test:e2e   # 6 browsers play a full game; screenshots in shots/
node tools/render-images.mjs               # og.png + icons
```
