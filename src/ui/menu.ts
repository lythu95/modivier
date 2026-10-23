import { getTheme, toggleTheme } from '../theme'
import { activeTab, type Tab } from '../state'
import { closeTabInteractive, closeOtherTabs, newUntitledTab, openViaDialog, saveTab } from '../files'
import { toggleMode } from '../editors'
import { revealInDir } from '../lib/tauri'

export interface MenuItem {
  label?: string
  kbd?: string
  danger?: boolean
  separator?: boolean
  disabled?: boolean
  action?: () => void | Promise<void>
}

let openPopup: HTMLElement | null = null

function closePopup(): void {
  openPopup?.remove()
  openPopup = null
  window.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onEsc, true)
}

function onOutside(e: Event): void {
  if (openPopup && !openPopup.contains(e.target as Node)) closePopup()
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') closePopup()
}

export function showMenu(x: number, y: number, items: MenuItem[], placement: 'bottom-left' | 'cursor' = 'cursor'): void {
  closePopup()
  const pop = document.createElement('div')
  pop.className = 'menu-pop'
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div')
      sep.className = 'menu-sep'
      pop.appendChild(sep)
      continue
    }
    const btn = document.createElement('button')
    btn.className = 'menu-item' + (item.danger ? ' danger' : '')
    btn.disabled = item.disabled ?? false
    const label = document.createElement('span')
    label.textContent = item.label ?? ''
    btn.appendChild(label)
    if (item.kbd) {
      const kbd = document.createElement('span')
      kbd.className = 'menu-kbd'
      kbd.textContent = item.kbd
      btn.appendChild(kbd)
    }
    btn.addEventListener('click', () => {
      closePopup()
      void item.action?.()
    })
    pop.appendChild(btn)
  }
  document.body.appendChild(pop)
  // 先挂载后测量，保证弹出位置不越界
  const rect = pop.getBoundingClientRect()
  const left = Math.min(x, window.innerWidth - rect.width - 8)
  const top = placement === 'bottom-left' ? y : Math.min(y, window.innerHeight - rect.height - 8)
  pop.style.left = `${Math.max(8, left)}px`
  pop.style.top = `${Math.max(8, top)}px`
  openPopup = pop
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('keydown', onEsc, true)
}

/** 左上角主菜单 */
export function showAppMenu(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const dark = getTheme() === 'dark'
  showMenu(
    rect.left,
    rect.bottom + 4,
    [
      { label: '打开文件…', kbd: 'Ctrl+O', action: openViaDialog },
      { label: '新建标签页', kbd: 'Ctrl+T', action: newUntitledTab },
      { separator: true },
      { label: '保存', kbd: 'Ctrl+S', action: () => onSave(false) },
      { label: '另存为…', kbd: 'Ctrl+Shift+S', action: () => onSave(true) },
      {
        label: '切换 源码 / 所见即所得',
        kbd: 'Ctrl+/',
        action: () => {
          const tab = activeTab()
          if (tab) toggleMode(tab)
        },
      },
      { separator: true },
      { label: dark ? '浅色主题' : '深色主题', action: toggleTheme },
      { separator: true },
      { label: '关闭标签页', kbd: 'Ctrl+W', action: onCloseActive },
    ],
    'bottom-left',
  )
}

function onSave(as: boolean): void {
  const tab = activeTab()
  if (tab) void saveTab(tab, as)
}

function onCloseActive(): void {
  const tab = activeTab()
  if (tab) void closeTabInteractive(tab)
}

/** 标签页右键菜单 */
export function showTabContextMenu(x: number, y: number, tab: Tab): void {
  showMenu(x, y, [
    { label: '关闭标签页', action: () => void closeTabInteractive(tab) },
    { label: '关闭其他标签页', action: () => void closeOtherTabs(tab) },
    { separator: true },
    {
      label: '复制文件路径',
      disabled: !tab.path,
      action: async () => {
        if (tab.path) await navigator.clipboard.writeText(tab.path)
      },
    },
    {
      label: '在资源管理器中显示',
      disabled: !tab.path,
      action: async () => {
        if (tab.path) await revealInDir(tab.path)
      },
    },
  ])
}
