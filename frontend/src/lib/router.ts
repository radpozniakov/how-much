// A minimal client-side router on the History API — no dependency (D-37). The
// app has exactly two routes: `/` (create/join) and `/room/:code` (the room),
// matching the backend's shareable link `{base}/room/{code}` (D-30).
//
// This file exports only hooks/helpers (no component), so the react-refresh lint
// rule stays clean.
import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

// The browser fires `popstate` on back/forward but NOT on pushState, so
// navigate() notifies subscribers itself.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify)
}

/** Navigate to an in-app path, updating history and re-rendering subscribers. */
export function navigate(to: string): void {
  if (to === window.location.pathname) return
  window.history.pushState({}, '', to)
  notify()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): string {
  return window.location.pathname
}

/** Current pathname; re-renders on navigate() and browser back/forward. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** The room code for a `/room/:code` path, else null. */
export function matchRoom(path: string): string | null {
  const match = /^\/room\/([^/]+)\/?$/.exec(path)
  if (!match) return null
  const code = decodeURIComponent(match[1]).trim()
  return code.length > 0 ? code : null
}
