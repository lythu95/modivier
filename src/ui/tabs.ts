import { setActive, subscribe, isDirty, tabs, activeId, type Tab } from '../state'
import { closeTabInteractive, closeOtherTabs } from '../files'
import { showTabContextMenu } from './menu'

/** 渲染标题栏中的标签条 */
export function setupTabsBar(bar: HTMLElement): void {
  bar.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    if (!el) return
    const id = el.dataset.id!
    if ((e.target as HTMLElement).closest('.tab-close')) {
      const tab = tabs.find((t) => t.id === id)
      if (tab) void closeTabInteractive(tab)
      return
    }
    setActive(id)
  })

  // 中键关闭
  bar.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    if (!el) return
    const tab = tabs.find((t) => t.id === el.dataset.id)
    if (tab) void closeTabInteractive(tab)
  })

  bar.addEventListener('contextmenu', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    if (!el) return
    e.preventDefault()
    const tab = tabs.find((t) => t.id === el.dataset.id)
    if (tab) showTabContextMenu(e.clientX, e.clientY, tab)
  })

  const render = () => {
    bar.innerHTML = ''
    for (const tab of tabs) {
      bar.appendChild(renderTab(tab))
    }
    // 标签过多时保持激活标签可见
    const active = bar.querySelector('.tab.active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  subscribe(render)
  render()
}

function renderTab(tab: Tab): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tab' + (tab.id === activeId ? ' active' : '')
  el.dataset.id = tab.id
  el.title = tab.path ?? tab.name

  const title = document.createElement('span')
  title.className = 'tab-title'
  title.textContent = tab.name
  el.appendChild(title)

  if (isDirty(tab)) {
    const dot = document.createElement('span')
    dot.className = 'tab-dirty'
    dot.textContent = '●'
    el.appendChild(dot)
  }

  const close = document.createElement('button')
  close.className = 'tab-close'
  close.innerHTML = CLOSE_SVG
  close.title = '关闭 (Ctrl+W)'
  el.appendChild(close)
  return el
}

const CLOSE_SVG =
  '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

export { closeOtherTabs }
