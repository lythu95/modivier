export type Theme = 'light' | 'dark'

const KEY = 'modivier:theme'
const listeners = new Set<() => void>()

function initial(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let current: Theme = initial()

export function getTheme(): Theme {
  return current
}

export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setTheme(theme: Theme): void {
  if (theme === current) return
  current = theme
  localStorage.setItem(KEY, theme)
  apply()
  for (const fn of listeners) fn()
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

export function apply(): void {
  document.documentElement.dataset.theme = current
}
