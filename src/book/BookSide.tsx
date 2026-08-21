import { lazy, useState } from 'react'

import { BookNav, type BookView } from '@/book/BookNav'
import { KeepAlive } from '@/components/KeepAlive'
import { Screen } from '@/components/Screen'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import type { CachedBook } from '@/lib/books'

const Shelf = lazy(() => import('@/book/Shelf').then((m) => ({ default: m.Shelf })))
const BookDetail = lazy(() => import('@/book/BookDetail').then((m) => ({ default: m.BookDetail })))
const LogReading = lazy(() => import('@/book/LogReading').then((m) => ({ default: m.LogReading })))
const MyShelf = lazy(() => import('@/book/MyShelf').then((m) => ({ default: m.MyShelf })))
const ReadingLists = lazy(() =>
  import('@/book/ReadingLists').then((m) => ({ default: m.ReadingLists })),
)
const BookGroups = lazy(() => import('@/book/BookGroups').then((m) => ({ default: m.BookGroups })))
const BookSwipe = lazy(() => import('@/book/BookSwipe').then((m) => ({ default: m.BookSwipe })))

/**
 * The book half. Everything here reads `books`; nothing here knows about films.
 *
 * Structured like the film side on purpose, including the two things that cost
 * real bugs there: the shelf stays MOUNTED and is only hidden, so coming back
 * from a book's page does not rebuild it and spend another model call — and the
 * overlay chain is ordered by what was opened last, so a tapped cover can never
 * change state while the screen stays put.
 */
export function BookSide({
  onSwitchSide,
  onFrontDoor,
}: {
  onSwitchSide: () => void
  onFrontDoor: () => void
}) {
  const [view, setView] = useState<BookView>('shelf')
  const [openBook, setOpenBook] = useState<string | null>(null)
  const [swipeSession, setSwipeSession] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<CachedBook | null>(null)

  const overlay = swipeSession ? (
    // A session takes over the screen: leaving mid-decision would leave the
    // others waiting on a vote that never arrives.
    <BookSwipe sessionId={swipeSession} onExit={() => setSwipeSession(null)} />
  ) : openBook ? (
    <BookDetail
      olKey={openBook}
      onBack={() => setOpenBook(null)}
      onLog={(book) => {
        setPrefill(book)
        setOpenBook(null)
        setView('log')
      }}
    />
  ) : null

  return (
    <>
      <KeepAlive active={view === 'shelf' && !overlay}>
        <Screen>
          <Shelf onOpenBook={(hit) => setOpenBook(hit.olKey)} />
        </Screen>
      </KeepAlive>

      {overlay && <Screen>{overlay}</Screen>}

      {!overlay && (
        <Screen>
          {view === 'lists' && (
            <ReadingLists onOpenBook={setOpenBook} onStartSwipe={setSwipeSession} />
          )}
          {view === 'groups' && <BookGroups onJoinSwipe={setSwipeSession} />}
          {view === 'me' && (
            <MyShelf
              onOpenBook={setOpenBook}
              onSwitchSide={onSwitchSide}
              onFrontDoor={onFrontDoor}
            />
          )}
          {view === 'log' && (
            <LogReading
              prefill={prefill}
              onOpenBook={setOpenBook}
              onDone={() => {
                setPrefill(null)
                setView('shelf')
              }}
            />
          )}
        </Screen>
      )}

      {!overlay && (
        <BookNav
          current={view}
          onNavigate={(next) => {
            if (next !== 'log') setPrefill(null)
            setView(next)
          }}
        />
      )}
      {!overlay && <ThemeSwitcher side="book" />}
    </>
  )
}
