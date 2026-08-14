# Film Society

Track what you watch, rate it out of ten, keep private notes, build watchlists —
alone or shared — and settle on tonight's film by swiping together.

Old-cinema design language: oxblood lobby walls, marquee bulbs, red velvet,
black-and-white tile.

---

## Run it on this PC

The project lives at `C:\Users\helen\Projects\film-society`.

**Do not move it into OneDrive.** OneDrive's Files On-Demand converts new
folders into cloud placeholders (reparse points) while a tool is still writing
to them. That breaks the Supabase CLI outright — `AlreadyExists:
FileSystem.makeDirectory` — and causes constant sync churn against
`node_modules`. GitHub is the backup for this project, and is better suited to
code than OneDrive is.

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

On Windows PowerShell, if `npm` or `npx` is blocked with *"running scripts is
disabled on this system"*, use `npm.cmd` / `npx.cmd`, or allow local scripts
once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

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

**Current milestone: wiring the app to real data.** The Lobby still renders
mock recommendations; everything behind it is now live.

- [x] Build environment, TypeScript, Tailwind v4 design tokens
- [x] The Lobby — infinite-scrolling recommendation poster wall
- [x] Four themes as a user setting — Lobby, Marquee, Velvet, Night
- [x] GitHub Pages deployment workflow
- [x] Database schema + row-level security — applied and verified live
- [x] Edge Functions deployed
- [x] Supabase client + auth provider
- [ ] `TMDB_API_KEY` and `OPENROUTER_API_KEY` set as Supabase secrets
- [ ] `.env` created locally
- [ ] Auth screens
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
