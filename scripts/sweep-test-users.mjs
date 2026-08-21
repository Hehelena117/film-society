/**
 * Deletes accounts left behind by a verification run that crashed.
 *
 * Every suite here creates throwaway users and deletes them in a `finally`,
 * but a run killed part-way — or one that throws before the browser opens —
 * skips that. The accounts then sit in the real members list, which is not a
 * test-only problem: they turned up on the People screen as "new members".
 *
 * Run standalone with `npm run sweep`, and imported by each suite so a stale
 * account survives at most until the next run.
 *
 * Deliberately narrow. It matches only the generated shapes below, all of them
 * @example.com, so it can never touch a real account however it is invoked.
 */
const THROWAWAY = /^(fs-(test|lobby|notes|fb|prof)|shot|probe)-[a-z0-9-]+@example\.com$/i

export async function sweepTestUsers(admin, { quiet = true } = {}) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (error) {
    if (!quiet) console.error('sweep: could not list users —', error.message)
    return 0
  }

  const stale = (data?.users ?? []).filter((u) => THROWAWAY.test(u.email ?? ''))
  for (const user of stale) await admin.auth.admin.deleteUser(user.id)

  if (stale.length && !quiet) {
    console.log(`swept ${stale.length} leftover test account(s): ${stale.map((u) => u.email).join(', ')}`)
  }
  return stale.length
}

// Standalone: node scripts/sweep-test-users.mjs
//
// pathToFileURL rather than string-building the URL: on Windows a path is
// C:\... and the hand-rolled comparison silently never matched, so the script
// did nothing at all and said nothing about it.
const { pathToFileURL } = await import('node:url')
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createClient } = await import('@supabase/supabase-js')
  const { readFileSync } = await import('node:fs')

  const fromEnvFile = (key) =>
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim()

  const admin = createClient(
    process.env.VITE_SUPABASE_URL ?? fromEnvFile('VITE_SUPABASE_URL'),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  const swept = await sweepTestUsers(admin, { quiet: false })
  if (!swept) console.log('nothing to sweep')
}
