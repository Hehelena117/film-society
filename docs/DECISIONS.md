# Decisions

Locked choices and the reasoning behind them. Update this when a decision changes.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Vite + React 19 + TypeScript | Fast, and the same codebase wraps into iOS/Android via Capacitor later |
| Styling | Tailwind CSS v4 | Design tokens live in `src/index.css` under `@theme` |
| Hosting | GitHub Pages | Free, static, already where the repo lives |
| Backend | Supabase | Postgres + auth + realtime + storage on one free tier that scales with paid usage |
| Secrets | Supabase Edge Functions | GitHub Pages is static and cannot hold a secret |
| Mobile | Capacitor (later) | ~90% code reuse vs. a React Native rewrite |
| i18n | i18next — English, Danish, Spanish | |

---

## AI firewall (important)

TMDB's API Terms of Use explicitly prohibit:

> "Use the TMDB APIs **in connection with**, including for training, a machine learning (ML) or **artificial intelligence (AI) based Application**."

> "Make **derivatives** of the TMDB APIs or TMDB Content."

> "**Cache, for longer than 6 months**, any information obtained through or from TMDB."

> "The license ... does not permit any **commercial use**."

We still want an AI recommender. The agreed mitigation is to keep TMDB content
strictly out of the model, so that TMDB is only ever a display layer.

### The rule

**TMDB content never enters a prompt. Model output never claims to be TMDB data.**

```
        ┌─ user's own ratings (title, year, score 1–10) ─┐
        │  user's own filters (genre, streaming service) │
        └────────────────────────┬───────────────────────┘
                                 │   ← ONLY this crosses into the model
                          ┌──────▼──────┐
                          │  OpenRouter │
                          └──────┬──────┘
                                 │   ← titles + reasons, from model knowledge
                    ┌────────────▼────────────┐
                    │  TMDB search (resolve)  │  ← display only
                    └────────────┬────────────┘
                                 │
                          posters, runtime,
                          cast, certification
```

**Never sent to the model:** TMDB overviews, keywords, cast lists, crew, poster
URLs, TMDB IDs, or any other field returned by the TMDB API.

**Sent to the model:** only the user's own title/year/rating triples and the
filters they picked in the UI.

Enforced in `supabase/functions/recommend/index.ts`.

### Residual risk

"In connection with" is broad. This architecture is defensible but not
risk-free, and it does **not** solve the commercial-use prohibition.

**Outstanding action for the repo owner:** contact TMDB via
<https://www.themoviedb.org/api-for-business> for a written agreement covering
AI use and commercial use **before public launch**. Until that exists, this app
must not be monetised.

---

## Translation

We do **not** machine-translate TMDB text — that would be a derivative work.

Instead we request TMDB's own community translations with the `language`
parameter (`en-US` / `da-DK` / `es-ES`). TMDB falls back to English when a title
has no translation in that language, which is exactly the requested behaviour.

Our **own** UI strings in `src/locales/` are ours to translate freely.

---

## Attribution (required, not yet implemented)

TMDB requires the TMDB logo plus this wording:

> "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or
> otherwise approved by TMDB."

Watch-provider data additionally requires attributing **JustWatch** as the
source. TMDB does not return deep links to Netflix/Disney+ etc. — only which
services carry a title, plus a TMDB `/watch` link.

**To do:** add an attribution footer before any public deployment.

---

## Themes

All four themes ship as a **user setting**, not a build-time choice.

| id | Name | Ground |
| --- | --- | --- |
| `lobby` | Lobby | Warm paper `#f4eddf` |
| `marquee` | Marquee | Paper ground, oxblood bands |
| `velvet` | Velvet | Deep red `#2a0a0f`, brass accent |
| `night` | Night | Near-black `#141013`, velvet red accent |

**Token split.** `ground`, `ink` and `band` swap per theme. `frame`, `plate`
and `bulb` stay constant, so a poster is presented identically against every
wall — dark surround, cream marquee plates, warm bulbs. That constant is what
makes the four read as rooms in one cinema rather than four different apps.

Do not reintroduce a token that means both "text colour" and "frame colour";
that conflation is what the split exists to prevent.

Themes are `[data-theme]` blocks overriding the custom properties Tailwind v4
already emits as `var()` references, so switching costs one attribute change —
no rebuild, no flash. First run follows `prefers-color-scheme` (dark → Velvet).

**To do:** once accounts exist, mirror the choice onto the user's profile row
so it follows them between devices. Currently `localStorage` only.

---

## Product rules

- Ratings are whole numbers, 1–10.
- Rewatches are supported — one film can have several logged entries.
- Notes are **always private**.
- **Watch dates are private.** `log_entries` is owner-only. Profiles read the
  `public_ratings` and `public_watch_counts` views, which expose the latest
  rating per title plus a count — never `watched_on`, `season_number` or
  `created_at`. Those views are deliberately `security_invoker = false`: that
  is what lets them be the one controlled window onto an owner-only table.
  **Do not add date columns to them.** Column-level grants cannot substitute
  here — they are per-role, so hiding a column from the public would also hide
  it from its owner.
- TV is tracked at **season** granularity, never episodes.
- Swipe match: **2 people = unanimous**, **3+ = majority**.
- Activity feed exists **only inside a group**, never globally.
- Parental data is **age certification only** — the detailed IMDb-style severity
  breakdown is a paid licence and is out of scope.

---

## Caching

TMDB data must not be cached longer than **6 months**. Every table storing TMDB
fields carries a `fetched_at` column, and `purge_stale_tmdb_cache()` clears
anything older.

That function empties the content columns but **keeps the title row and its
`tmdb_id`**. Deleting rows would cascade into `log_entries`, `watchlist_items`
and `favourites` — destroying users' own data to satisfy a restriction on
TMDB's. The next read repopulates.

**To do:** schedule it once pg_cron is enabled —
`select cron.schedule('purge-tmdb-cache', '0 4 * * *', $$select public.purge_stale_tmdb_cache()$$);`
