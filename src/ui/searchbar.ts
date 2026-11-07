import { activeTab } from '../state'
import { t } from '../i18n'

/**
 * 所见即所得模式的查找条（源码模式由 CodeMirror 自带 Ctrl+F 处理）。
 * 用 window.find 在渲染文本中定位，不触碰编辑器 DOM。
 */
let bar: HTMLElement | null = null
let input: HTMLInputElement | null = null
let countEl: HTMLElement | null = null
let current = 0
let total = 0

export function isSearchBarOpen(): boolean {
  return bar != null
}

function countMatches(term: string): number {
  if (!term) return 0
  const tab = activeTab()
  const pre = tab?.mode === 'ir' ? tab.vdHost?.querySelector('.vditor-ir pre.vditor-reset') : null
  const text = pre?.textContent ?? ''
  return term ? text.split(term).length - 1 : 0
}

function findNext(backwards: boolean): void {
  const term = input?.value ?? ''
  if (!term) {
    if (countEl) countEl.textContent = ''
    return
  }
  const w = window as unknown as {
    find?: (
      s: string,
      caseSensitive?: boolean,
      backwards?: boolean,
      wrap?: boolean,
    ) => boolean
  }
  // Chromium 专有 API：从当前选区续查（wrap 自动回绕渲染文本）
  const ok = w.find?.(term, false, backwards, true) ?? false
  if (ok) {
    if (backwards) current = current > 1 ? current - 1 : total
    else current = current < total ? current + 1 : 1
  }
  if (countEl) countEl.textContent = `${ok ? current : 0}/${total}`
}

function resetFromTop(): void {
  // 新词从头找：选区收到文档顶部，重置计数
  window.getSelection()?.collapse(document.body, 0)
  current = 0
  total = countMatches(input?.value ?? '')
}

export function toggleSearchBar(): void {
  if (bar) {
    closeSearchBar()
    return
  }
  bar = document.createElement('div')
  bar.id = 'search-bar'

  input = document.createElement('input')
  input.id = 'search-input'
  input.type = 'text'
  input.placeholder = t('search.placeholder')
  input.spellcheck = false
  input.addEventListener('input', () => {
    resetFromTop()
    findNext(false)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      findNext(e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchBar()
    }
  })
  bar.appendChild(input)

  countEl = document.createElement('span')
  countEl.id = 'search-count'
  bar.appendChild(countEl)

  const mkBtn = (label: string, title: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.title = title
    b.addEventListener('click', onClick)
    return b
  }
  bar.appendChild(mkBtn('↑', t('search.prev'), () => findNext(true)))
  bar.appendChild(mkBtn('↓', t('search.next'), () => findNext(false)))
  bar.appendChild(mkBtn('✕', t('search.close'), () => closeSearchBar()))

  document.body.appendChild(bar)
  input.focus()
}

export function closeSearchBar(): void {
  bar?.remove()
  bar = null
  input = null
  countEl = null
  current = 0
  total = 0
  window.getSelection()?.removeAllRanges()
  activeTab()?.vditor?.focus()
}
