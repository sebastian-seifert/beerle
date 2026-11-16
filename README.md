# 🍺 Beerle — Deutsches Bier Wordle (Discord Activity)

A Wordle-like Discord Activity built with TypeScript, Vite, `@discord/embedded-app-sdk`, and a **$0 Cloudflare Workers + D1 + Durable Objects** backend, where every daily puzzle is a German beer brand or traditional beer style.

## Features
- **Dynamic $N \times 6$ Grid ($4 \le N \le 10$):** Adapts automatically to the daily German beer's length (*Jever*, *Kölsch*, *Paulaner*, *Augustiner*, *Krombacher*, etc.).
- **German `QWERTZ` Keyboard & Normalization:** Native single-tile `Ä`, `Ö`, `Ü` keys, automatic `ß -> SS` normalization, and punctuation/apostrophe stripping (*Beck's* -> `BECKS`).
- **Two-Tier Dictionary:** Recognizes beer brands & brewing terms (rewarded with a `🍺` row badge) alongside standard German $N$-letter words so players are never deadlocked on early guesses.
- **Exact Wordle Mechanics:** Two-pass duplicate-letter evaluation, Hard Mode enforcement, Dark/Light/High-Contrast themes, `PopIn`, `Shake`, staggered 3D `FlipIn`, and victory `Bounce` animations.
- **Digitaler Bierdeckel:** Post-game brewery profile card (origin, style, founding year, ABV, trivia), 1–6 guess distribution chart, UTC countdown timer, and Discord channel result sharing.
- **Spoiler-Free Co-Presence:** Real-time Durable Object WebSocket room (`instanceId`) showing friends' color-only mini-grids and typing progress without leaking letters.

## Local Development
```bash
npm install
npm test          # Run all 32 Vitest unit & DOM tests
npm run typecheck # Run tsc --noEmit
npm run build     # Build production dist/ bundle
```

### Testing Inside Discord (Free Tunnel)
1. Start the Vite dev server (`npm run dev`) and local Worker (`npx wrangler dev --port 8787`).
2. Expose port `5173` over HTTPS: `cloudflared tunnel --url http://localhost:5173`.
3. In the **Discord Developer Portal -> Activities -> URL Mappings**, map `/` to your `*.trycloudflare.com` hostname.

## $0 Production Deployment (Cloudflare Workers + D1)
1. Create a free D1 database: `npx wrangler d1 create beerle-db` and add the `d1_databases` binding to `wrangler.jsonc`.
2. Apply schema: `npx wrangler d1 execute beerle-db --remote --file=src/server/schema.sql`.
3. Set secrets:
   - `npx wrangler secret put DISCORD_CLIENT_ID`
   - `npx wrangler secret put DISCORD_CLIENT_SECRET`
   - `npx wrangler secret put JWT_SECRET`
   - *(Optional, for automated channel posts)* `npx wrangler secret put DISCORD_BOT_TOKEN`
4. Build and deploy: `npm run build && npx wrangler deploy`.
5. In **Discord Developer Portal -> Activities -> URL Mappings**, map `/` to `<your-worker>.<subdomain>.workers.dev`.
