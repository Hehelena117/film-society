import type { Recommendation, Title } from '@/types'

/**
 * Placeholder programme for design review.
 *
 * Poster URLs are null on purpose: we have no TMDB key yet, so PosterFrame
 * renders its designed letterpress fallback. When the key is wired up these
 * become real TMDB image URLs and nothing else changes.
 */
const SEED: Array<Omit<Title, 'id' | 'tmdbId' | 'posterUrl'> & { reason: string }> = [
  {
    name: 'In the Mood for Love',
    year: 2000,
    mediaType: 'movie',
    runtimeMinutes: 98,
    seasons: null,
    genres: ['Drama', 'Romance'],
    director: 'Wong Kar-wai',
    certification: '12',
    reason: 'Because you rated Past Lives 9 — restrained longing, and every frame composed.',
  },
  {
    name: 'Paper Moon',
    year: 1973,
    mediaType: 'movie',
    runtimeMinutes: 102,
    seasons: null,
    genres: ['Comedy', 'Drama'],
    director: 'Peter Bogdanovich',
    certification: 'A',
    reason: 'You own it on DVD and never logged it. Black-and-white, and a con artist with a kid.',
  },
  {
    name: 'The Third Man',
    year: 1949,
    mediaType: 'movie',
    runtimeMinutes: 104,
    seasons: null,
    genres: ['Film-noir', 'Thriller'],
    director: 'Carol Reed',
    certification: 'PG',
    reason: 'Because you rated The Shining 9 — dread built from architecture and shadow.',
  },
  {
    name: 'Cinema Paradiso',
    year: 1988,
    mediaType: 'movie',
    runtimeMinutes: 155,
    seasons: null,
    genres: ['Drama'],
    director: 'Giuseppe Tornatore',
    certification: '11',
    reason: 'A projectionist, a boy, and a reel of censored kisses. This one is about you.',
  },
  {
    name: 'Portrait of a Lady on Fire',
    year: 2019,
    mediaType: 'movie',
    runtimeMinutes: 122,
    seasons: null,
    genres: ['Drama', 'Romance'],
    director: 'Céline Sciamma',
    certification: '15',
    reason: 'Because you rated Pride & Prejudice 8 — held glances, and painting as looking.',
  },
  {
    name: 'The Apartment',
    year: 1960,
    mediaType: 'movie',
    runtimeMinutes: 125,
    seasons: null,
    genres: ['Comedy', 'Drama', 'Romance'],
    director: 'Billy Wilder',
    certification: 'A',
    reason: 'Because you rated Good Will Hunting 9 — funny until it is suddenly not.',
  },
  {
    name: 'Fishing with John',
    year: 1991,
    mediaType: 'tv',
    runtimeMinutes: null,
    seasons: 1,
    genres: ['Comedy', 'Documentary'],
    director: 'John Lurie',
    certification: '12',
    reason: 'Six episodes, no fish caught. You liked deadpan in The Truman Show.',
  },
  {
    name: 'Night on Earth',
    year: 1991,
    mediaType: 'movie',
    runtimeMinutes: 129,
    seasons: null,
    genres: ['Comedy', 'Drama'],
    director: 'Jim Jarmusch',
    certification: '15',
    reason: 'Five cabs, five cities, one night. Because you rated Juno 8.',
  },
  {
    name: 'Chungking Express',
    year: 1994,
    mediaType: 'movie',
    runtimeMinutes: 102,
    seasons: null,
    genres: ['Comedy', 'Drama', 'Romance'],
    director: 'Wong Kar-wai',
    certification: '12',
    reason: 'Because you rated La La Land 9 — heartbreak at neon speed.',
  },
  {
    name: 'The Red Shoes',
    year: 1948,
    mediaType: 'movie',
    runtimeMinutes: 135,
    seasons: null,
    genres: ['Drama', 'Music'],
    director: 'Michael Powell',
    certification: 'A',
    reason: 'Technicolor so saturated it hurts. Because you rated Black Swan 8.',
  },
  {
    name: 'Fleabag',
    year: 2016,
    mediaType: 'tv',
    runtimeMinutes: null,
    seasons: 2,
    genres: ['Comedy', 'Drama'],
    director: 'Harry Bradbeer',
    certification: '15',
    reason: 'Because you rated The Edge of Seventeen 8 — armour made of jokes.',
  },
  {
    name: 'Le Samouraï',
    year: 1967,
    mediaType: 'movie',
    runtimeMinutes: 105,
    seasons: null,
    genres: ['Crime', 'Drama'],
    director: 'Jean-Pierre Melville',
    certification: '15',
    reason: 'Because you rated Kill Bill 9 — every hitman since has copied this coat.',
  },
]

/**
 * Returns a page of recommendations. Deterministic per page so the wall does
 * not reshuffle when React re-renders.
 */
export function getMockPage(page: number, pageSize = 6): Recommendation[] {
  return Array.from({ length: pageSize }, (_, i) => {
    const seed = SEED[(page * pageSize + i) % SEED.length]
    return {
      title: {
        ...seed,
        id: `mock-${page}-${i}`,
        tmdbId: null,
        posterUrl: null,
      },
      reason: seed.reason,
    }
  })
}
