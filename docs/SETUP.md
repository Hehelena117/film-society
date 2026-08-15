# Setup — accounts and keys

Things only you can do. I cannot create accounts or complete browser logins.

---

## 1. GitHub — authenticate the CLI

Open a **new** terminal (so it picks up the newly installed tools) and run:

```bash
gh auth login
```

Choose **GitHub.com → HTTPS → Login with a web browser** and follow the prompts.

Then set your commit identity:

```bash
git config --global user.name "Hehelena117"
git config --global user.email "you@example.com"
```

---

## 2. TMDB — API key

1. Create an account at <https://www.themoviedb.org/signup>
2. Go to <https://www.themoviedb.org/settings/api>
3. Request an API key — choose **Developer**
4. Copy the **API Key (v3 auth)**

**Also do this:** email TMDB via <https://www.themoviedb.org/api-for-business>
and ask for written permission covering **AI-assisted recommendations** and
**commercial use**. Their standard terms prohibit both. See
[DECISIONS.md](DECISIONS.md).

---

## 3. Supabase — project

1. Sign up at <https://supabase.com/dashboard>
2. **New project** — pick the EU (Frankfurt) region if most users are in Europe
3. Save the database password somewhere safe
4. From **Project Settings → API**, copy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

Put both in a local `.env` (copy `.env.example`), and add them as GitHub repo
secrets under **Settings → Secrets and variables → Actions** so the deploy
workflow can build with them.

> The anon key is *designed* to be public. Row-level security is what protects
> the data — we will set that up with the schema.

---

## 4. Secrets that must never reach the browser

These go into Supabase, not `.env`:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>

supabase secrets set TMDB_API_KEY=<your tmdb key>
supabase secrets set OPENROUTER_API_KEY=<your openrouter key>

supabase functions deploy tmdb
supabase functions deploy recommend
```

---

## 5. Turn on GitHub Pages

In the repo: **Settings → Pages → Source → GitHub Actions**.

The workflow in `.github/workflows/deploy.yml` publishes on every push to
`main`.

---

## 6. Building for iOS and Android

Capacitor is configured and both native projects exist in `android/` and
`ios/`. Neither can be built yet — that needs tooling this PC does not have.

**Always build with `build:native`, never plain `build`.** The web build
prefixes assets with `/film-society/` for GitHub Pages; inside a native shell
they are read from the filesystem, and that prefix gives a white screen on
device.

```bash
npm run sync:native     # builds with the right base path, then copies into both projects
```

### Android — possible on this PC

1. Install [Android Studio](https://developer.android.com/studio) (includes
   the SDK and a JDK).
2. `npx cap open android`
3. Run on an emulator or a connected phone from Android Studio.

To publish: a Google Play developer account is **$25 once**.

### iOS — needs a Mac

Xcode is macOS-only, so an iOS build cannot be produced from Windows at all.
The `ios/` project is committed and ready; it needs a Mac to open it.

1. On a Mac: `npx cap open ios`
2. Run on a simulator or device from Xcode.

To publish: an Apple Developer account is **$99/year**.

### After changing any web code

```bash
npm run sync:native
```

`cap sync` also reinstalls native plugins, so run it after adding any
Capacitor plugin rather than just copying assets.

---

## Checklist

- [ ] `gh auth login` done
- [ ] git `user.name` / `user.email` set
- [ ] TMDB API key obtained
- [ ] TMDB contacted about AI + commercial use
- [ ] Supabase project created
- [ ] `.env` filled in locally
- [ ] GitHub Actions secrets added
- [ ] Supabase secrets set and functions deployed
- [ ] GitHub Pages source set to GitHub Actions
