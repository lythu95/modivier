import { activeId, notify, setActive, subscribe, hasUnsavedChanges, tabs, type Tab } from '../state'
import { closeTabInteractive, closeOtherTabs, saveTab } from '../files'
import { showTabContextMenu } from './menu'
import { t } from '../i18n'

/** 渲染标题栏中的标签条（含溢出箭头、滚轮滚动、拖拽重排） */
export function setupTabsBar(bar: HTMLElement): void {
  const wrap = bar.parentElement! // #tabs 的父容器（titlebar 内），箭头挂在两侧

  // ── 左右滚动箭头：溢出时显示 ──
  const mkArrow = (dir: -1 | 1) => {
    const b = document.createElement('button')
    b.className = 'tab-scroll-arrow' + (dir === -1 ? ' left' : ' right')
    b.title = dir === -1 ? '‹' : '›'
    b.innerHTML =
      dir === -1
        ? '<svg viewBox="0 0 8 12" width="7" height="11"><path d="M6.5 1L1.5 6l5 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
        : '<svg viewBox="0 0 8 12" width="7" height="11"><path d="M1.5 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
    b.addEventListener('click', () => {
      bar.scrollBy({ left: dir * Math.max(160, bar.clientWidth * 0.6), behavior: 'smooth' })
    })
    return b
  }
  const arrowL = mkArrow(-1)
  const arrowR = mkArrow(1)
  wrap.insertBefore(arrowL, bar)
  wrap.appendChild(arrowR)

  // 溢出检测：滚动/尺寸变化/标签数变化时更新箭头显隐
  const updateArrows = () => {
    const overflow = bar.scrollWidth > bar.clientWidth + 1
    bar.classList.toggle('overflowing', overflow)
    if (overflow) {
      arrowL.classList.toggle('dim', bar.scrollLeft <= 1)
      arrowR.classList.toggle('dim', bar.scrollLeft >= bar.scrollWidth - bar.clientWidth - 1)
    }
  }
  bar.addEventListener('scroll', updateArrows, { passive: true })
  new ResizeObserver(updateArrows).observe(bar)
  new ResizeObserver(updateArrows).observe(wrap)

  // ── 滚轮横向滚动标签栏 ──
  bar.addEventListener(
    'wheel',
    (e) => {
      if (bar.scrollWidth <= bar.clientWidth) return
      // shift+滚轮浏览器默认横向；普通滚轮纵向分量转横向（Chrome/VSCode 惯例）
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (delta !== 0) {
        e.preventDefault()
        bar.scrollLeft += delta
      }
    },
    { passive: false },
  )

  bar.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    if (!el) return
    const id = el.dataset.id!
    // 未保存圆点：点击即保存（Sublime Text 惯例）
    if ((e.target as HTMLElement).closest('.tab-dirty-dot')) {
      const tab = tabs.find((t) => t.id === id)
      if (tab) void saveTab(tab)
      return
    }
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

  // ── 拖拽重排 ──
  const drag = { tabId: '', startX: 0, active: false, el: null as HTMLElement | null }
  bar.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      const el = (e.target as HTMLElement).closest<HTMLElement>('.tab')
      if (!el) return
      drag.tabId = el.dataset.id!
      drag.startX = e.clientX
      drag.active = false
      drag.el = el
    },
    true,
  )
  bar.addEventListener(
    'pointermove',
    (e) => {
      if (!drag.el || drag.tabId !== drag.el.dataset.id) return
      const dx = e.clientX - drag.startX
      if (!drag.active && Math.abs(dx) < 6) return
      if (!drag.active) {
        drag.active = true
        drag.el.classList.add('dragging')
        drag.el.setPointerCapture(e.pointerId)
      }
      drag.el.style.transform = `translateX(${dx}px)`
      // 计算悬停目标标签 → 预览交换位置
      const target = [...bar.querySelectorAll<HTMLElement>('.tab')].find((t) => {
        if (t === drag.el) return false
        const r = t.getBoundingClientRect()
        return e.clientX >= r.left && e.clientX <= r.right
      })
      if (target && target.dataset.id !== drag.tabId) {
        const from = tabs.findIndex((t) => t.id === drag.tabId)
        const to = tabs.findIndex((t) => t.id === target.dataset.id)
        if (from >= 0 && to >= 0) {
          const [moved] = tabs.splice(from, 1)
          tabs.splice(to, 0, moved)
          // 更新基准点，避免位移跳变
          drag.startX = e.clientX
          // 立即按新顺序重排 DOM（保持拖拽态）
          const ids = tabs.map((t) => t.id)
          for (const id of ids) {
            const el2 = bar.querySelector(`.tab[data-id="${id}"]`)
            if (el2) bar.appendChild(el2)
          }
          const self = bar.querySelector(`.tab[data-id="${drag.tabId}"]`) as HTMLElement | null
          if (self) {
            self.classList.add('dragging')
            self.style.transform = ''
            drag.el = self
          }
        }
      }
    },
    true,
  )
  bar.addEventListener(
    'pointerup',
    (e) => {
      if (!drag.active) {
        drag.el = null
        return
      }
      drag.el?.classList.remove('dragging')
      drag.el?.style.removeProperty('transform')
      try {
        drag.el?.releasePointerCapture(e.pointerId)
      } catch {
        /* 已释放 */
      }
      drag.active = false
      drag.el = null
      notify() // 触发重渲染，恢复标签顺序与激活态
    },
    true,
  )
  bar.addEventListener('pointercancel', () => {
    drag.el?.classList.remove('dragging')
    drag.el?.style.removeProperty('transform')
    drag.active = false
    drag.el = null
  })

  const render = () => {
    bar.innerHTML = ''
    for (const tab of tabs) {
      bar.appendChild(renderTab(tab))
    }
    // 标签过多时保持激活标签可见
    const active = bar.querySelector('.tab.active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    updateArrows()
  }

  subscribe(render)
  render()
}

function renderTab(tab: Tab): HTMLElement {
  const dirty = hasUnsavedChanges(tab)
  const el = document.createElement('div')
  el.className = 'tab' + (tab.id === activeId ? ' active' : '') + (dirty ? ' dirty' : '')
  el.dataset.id = tab.id
  el.title = tab.path ?? tab.name

  const title = document.createElement('span')
  title.className = 'tab-title'
  title.textContent = tab.name
  el.appendChild(title)

  // 未保存圆点：占关闭按钮的槽位，悬停标签时让位给 ×（点击圆点=保存）
  if (dirty) {
    const dot = document.createElement('span')
    dot.className = 'tab-dirty-dot'
    dot.title = t('tt.dirtyTab')
    el.appendChild(dot)
  }

  const close = document.createElement('button')
  close.className = 'tab-close'
  close.innerHTML = CLOSE_SVG
  close.title = t('tt.closeTab')
  el.appendChild(close)
  return el
}

const CLOSE_SVG =
  '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

export { closeOtherTabs }
