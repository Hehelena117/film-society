# Film Society

Track what you watch, rate it out of ten, keep private notes, build watchlists —
alone or shared — and settle on tonight's film by swiping together.

Old-cinema design language: oxblood lobby walls, marquee bulbs, red velvet,
black-and-white tile.

---

## Run it on this PC

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

The dev server also binds to your LAN, so you can open the same URL on your
phone (swap `localhost` for your PC's local IP) to check the mobile layout on
a real device.

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript only, no build |

---

## Status

**Current milestone: design review.** The Lobby screen is built against mock
data so the look can be approved before the rest is built.

- [x] Build environment, TypeScript, Tailwind v4 design tokens
- [x] The Lobby — infinite-scrolling recommendation poster wall
- [x] Four themes as a user setting — Lobby, Marquee, Velvet, Night
- [x] Edge Functions for TMDB + OpenRouter written (not yet deployed)
- [x] GitHub Pages deployment workflow
- [ ] Supabase project, schema, auth
- [ ] Real TMDB data
- [ ] Logging, ratings, notes
- [ ] Watchlists, groups, swipe-to-decide
- [ ] Profiles, follow, group activity feed
- [ ] TMDB + JustWatch attribution footer *(required before public deploy)*
- [ ] Capacitor iOS/Android wrap

---

## Layout

```
src/
  index.css          design tokens — colours, type, cinema textures
  types.ts
  lib/i18n.ts        English / Danish / Spanish
  locales/           our UI strings (safe to translate)
  components/        PosterFrame — the bulb-lit lobby frame
  screens/Lobby.tsx  the recommendation wall
  data/              mock data for design review
supabase/functions/
  tmdb/              keeps TMDB_API_KEY off the client
  recommend/         the AI recommender — read the firewall notes first
docs/
  DECISIONS.md       locked decisions and the licensing constraints
  SETUP.md           accounts and keys you need to create
```

---

## Before doing anything with the data layer

Read [docs/DECISIONS.md](docs/DECISIONS.md). TMDB's terms prohibit AI use,
derivative works, commercial use, and caching beyond six months. The
architecture works around the first two; **the commercial-use prohibition is
unresolved and blocks monetisation.**
