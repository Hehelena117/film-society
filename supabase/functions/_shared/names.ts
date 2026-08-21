/**
 * Reading Open Library's names without ending up with a script you cannot read.
 *
 * Their records are not consistent about this, and the inconsistency is per
 * work rather than per author. Searching for The Brothers Karamazov returns,
 * in one response:
 *
 *   "Братья Карамазовы"      author_name: ["Fyodor Dostoyevsky"]
 *   "Brothers Karamazov"      author_name: ["Фёдор Михайлович Достоевский"]
 *   "The Brothers Karamazov"  author_name: ["Фёдор Михайлович Достоевский",
 *                                           "Constance Garrett"]
 *
 * So the readable title and the readable author sit on different records, and
 * choosing one record gives you one or the other. Hence choosing them
 * separately.
 *
 * That last record is also the reason another record's author cannot simply be
 * borrowed on sight: Constance Garnett translated Dostoevsky, she did not
 * write him, and a rule that grabs any readable name nearby will happily print
 * the translator as the author.
 */

/** Strips accents and punctuation so two spellings can be compared. */
export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Written in an alphabet this app's readers can be expected to read?
 *
 * Latin letters, at least one, and none from a script they almost certainly
 * cannot. Accented Latin is fine — Zafón and Høeg are perfectly readable.
 */
export const isLatin = (s: string) =>
  /\p{Script=Latin}/u.test(s) &&
  !/[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Arabic}\p{Script=Greek}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
    s,
  )

/** One candidate record, reduced to the fields that matter here. */
export interface NameSource {
  author_name?: string[]
  /** Parallel to author_name. Stable ids, so the same person can be recognised
   *  across records that spell them in different alphabets. */
  author_key?: string[]
  author_alternative_name?: string[]
  ratings_count?: number
}

/**
 * Library cataloguing into something a person would say aloud.
 *
 * Open Library's alternative spellings come straight out of library records,
 * so they arrive as "Tolstoy, Leo, graf, 1828-1910". The life dates and the
 * inherited title are cataloguer's apparatus, and the surname-first order is
 * for a card index, not a shelf label.
 */
export function tidyName(name: string): string {
  let s = name
    // Life dates, in any of the forms records use.
    .replace(/,?\s*\(?\d{3,4}\s*[-–]\s*(\d{3,4})?\)?\.?$/, '')
    // Ranks and honorifics that trail the name in catalogue order.
    .replace(/,\s*(graf|grāfs|conde|count|sir|dame|jr|sr|prince|princess|baron)\.?$/i, '')
    .replace(/\s*,\s*$/, '')
    .trim()

  // "Tolstoy, Leo" is a card index talking. Exactly one comma with something
  // either side of it: read it back the way it is spoken.
  const parts = s.split(',').map((p) => p.trim())
  if (parts.length === 2 && parts[0] && parts[1]) s = `${parts[1]} ${parts[0]}`

  return s.replace(/\s+/g, ' ').trim()
}

/** Same person, allowing for transliteration wandering about. */
function sameName(a: string, b: string): boolean {
  const [x, y] = [normalise(a), normalise(b)]
  if (!x || !y) return false
  if (x.includes(y) || y.includes(x)) return true

  // Surnames survive transliteration better than given names, and the first
  // few letters survive best of all — Dostoevsky, Dostoyevsky, Dostoievski.
  const surnames = (s: string) => s.split(' ').filter((w) => w.length >= 5)
  return surnames(x).some((w) => surnames(y).some((v) => v.slice(0, 5) === w.slice(0, 5)))
}

/**
 * The most readable form of the author's name available.
 *
 * In order:
 *   1. a readable name on the chosen record
 *   2. a readable name on another record from the same search that is
 *      recognisably the SAME person — this is what rescues Dostoevsky
 *   3. the name that was asked for, when there was one and it agrees
 *   4. a readable alternative spelling from the chosen record — these are
 *      transliterations of the same author, of varying quality, which beats
 *      an alphabet the reader cannot read
 *   5. whatever the record says, rather than nothing at all
 *
 * Steps 2 and 3 both require agreement with something already known, so a
 * translator listed beside the author can never be promoted into their place.
 */
export function pickAuthor(
  chosen: NameSource,
  others: NameSource[] = [],
  asked: string | null = null,
): string | null {
  const own = chosen.author_name ?? []

  /**
   * Who among this record's authors is the one that matters, and how is their
   * name spelled where it is readable?
   *
   * Both questions are answered by author_key, which is the same identifier
   * whatever alphabet a given record happens to spell the person in. Searching
   * "Crime and Punishment" returns, among others:
   *
   *   "Преступление и наказание"  156 ratings  ["Fyodor Dostoyevsky"]
   *   "Crime and Punishment"        0 ratings  ["Michael R. Katz",
   *                                             "Фёдор Михайлович Достоевский"]
   *
   * The English-titled record is the one worth showing, and Open Library lists
   * its translator first. But Dostoevsky is on it too, and his key also sits on
   * the record with 156 ratings — where he is spelled readably.
   *
   * So: among this record's authors, the one carrying the most weight across
   * the whole result set wins. An author recurs; a translator appears once.
   * Then their name is taken from wherever it is legible.
   */
  const weight = new Map<string, number>()
  const spellings = new Map<string, string[]>()

  for (const record of [chosen, ...others]) {
    const keys = record.author_key ?? []
    const names = record.author_name ?? []
    // Plus one so an unrated record still counts for something — otherwise
    // every author on a set of unrated books ties at zero.
    const w = (record.ratings_count ?? 0) + 1

    keys.forEach((key, i) => {
      weight.set(key, (weight.get(key) ?? 0) + w)
      if (names[i]) spellings.set(key, [...(spellings.get(key) ?? []), names[i]])
    })
  }

  const ownKeys = chosen.author_key ?? []
  if (ownKeys.length) {
    const principal = ownKeys.reduce((a, b) =>
      (weight.get(b) ?? 0) > (weight.get(a) ?? 0) ? b : a,
    )
    const readable = (spellings.get(principal) ?? []).find(isLatin)
    if (readable) return readable
  }

  // No keys to go on. Position 0 only, then — everything after it is a
  // collaborator, and reaching past an unreadable name to the first readable
  // one below is how this said "by Constance Garrett" for a while.
  if (own[0] && isLatin(own[0])) return own[0]

  // Records with no author_key at all. Fall back to matching by spelling:
  // what the unreadable name transliterates to, in this record's own words,
  // used to recognise the same person on a neighbouring record.
  const transliterations = [
    ...(chosen.author_alternative_name ?? []).filter(isLatin),
    ...(asked && isLatin(asked) ? [asked] : []),
  ]

  if (transliterations.length) {
    for (const other of others) {
      const match = (other.author_name ?? []).find(
        (n) => isLatin(n) && transliterations.some((s) => sameName(n, s)),
      )
      if (match) return match
    }
  }

  if (asked && isLatin(asked) && transliterations.some((s) => sameName(asked, s))) return asked

  const alt = (chosen.author_alternative_name ?? []).find(isLatin)
  if (alt) return alt

  return own[0] ?? null
}
