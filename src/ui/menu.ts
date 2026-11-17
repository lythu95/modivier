import { getTheme, toggleTheme } from '../theme'
import { activeTab, type Tab } from '../state'
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../app-info'
import { LANGUAGES, getLocale, setLocale, t } from '../i18n'
import { closeTabInteractive, closeOtherTabs, newUntitledTab, openViaDialog, saveTab } from '../files'
import { toggleMode } from '../editors'
import { toggleOutline } from './outline'
import { rememberPositions, toggleRememberPositions } from '../positions'
import { pickSourceFont } from '../font-setting'
import { invoke, desktopPlatform, isTauri, openExternal, revealInDir } from '../lib/tauri'
import { showAppDialog, showLightDialog } from './dialog'

export interface MenuItem {
  label?: string
  kbd?: string
  danger?: boolean
  separator?: boolean
  disabled?: boolean
  /** 子菜单（hover 展开） */
  children?: MenuItem[]
  /** 勾选标记（用于单选语言这类状态） */
  checked?: boolean
  action?: () => void | Promise<void>
}

let openPopup: HTMLElement | null = null

/** 键盘导航层级栈：每层记录弹出层元素、可导航项与当前高亮序号 */
interface KbLevel {
  pop: HTMLElement
  nav: { item: MenuItem; el: HTMLElement }[]
  index: number
}
let kbStack: KbLevel[] = []

function closePopup(): void {
  openPopup?.remove()
  openPopup = null
  kbStack = []
  window.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onMenuKey, true)
}

function onOutside(e: Event): void {
  if (openPopup && !openPopup.contains(e.target as Node)) closePopup()
}

function closeSubs(pop: HTMLElement, belongTo?: HTMLElement): void {
  pop.querySelectorAll<HTMLElement>(':scope > .menu-item > .menu-pop').forEach((el) => {
    if (el.parentElement !== belongTo) {
      // 同步键盘层级栈（鼠标移入会收起键盘展开的子菜单）
      const idx = kbStack.findIndex((l) => l.pop === el)
      if (idx >= 0) kbStack.splice(idx)
      el.remove()
    }
  })
}

const itemOfEl = new WeakMap<HTMLElement, MenuItem>()

function buildPop(items: MenuItem[]): HTMLElement {
  const pop = document.createElement('div')
  pop.className = 'menu-pop'
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div')
      sep.className = 'menu-sep'
      pop.appendChild(sep)
      continue
    }

    // 菜单项用 div 而非 button：有子菜单时内部还要嵌套菜单（button 内不允许交互元素）
    const btn = document.createElement('div')
    btn.className = 'menu-item' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '')
    btn.setAttribute('role', 'menuitem')
    itemOfEl.set(btn, item)

    const labelWrap = document.createElement('span')
    labelWrap.className = 'menu-label'
    if (item.checked !== undefined) {
      const check = document.createElement('span')
      check.className = 'menu-check'
      check.textContent = item.checked ? '✓' : ''
      labelWrap.appendChild(check)
    }
    const label = document.createElement('span')
    label.textContent = item.label ?? ''
    labelWrap.appendChild(label)
    btn.appendChild(labelWrap)

    if (item.kbd) {
      const kbd = document.createElement('span')
      kbd.className = 'menu-kbd'
      kbd.textContent = item.kbd
      btn.appendChild(kbd)
    }

    if (item.children) {
      const arrow = document.createElement('span')
      arrow.className = 'menu-arrow'
      arrow.textContent = '›'
      btn.appendChild(arrow)
      btn.addEventListener('mouseenter', () => {
        closeSubs(pop, btn)
        if (!btn.querySelector(':scope > .menu-pop')) {
          const sub = buildPop(item.children!)
          sub.classList.add('sub')
          btn.appendChild(sub)
        }
      })
    } else {
      btn.addEventListener('mouseenter', () => closeSubs(pop))
    }

    if (!item.children) {
      btn.addEventListener('click', () => {
        closePopup()
        void item.action?.()
      })
    }

    pop.appendChild(btn)
  }
  // 鼠标进入本层时清除键盘高亮（两套指示不并存）
  kbClearOnHover(pop)
  return pop
}

/* ---------------- 菜单键盘导航 ---------------- */

/** 收集弹出层内可键盘导航的项（跳过分隔线与禁用项） */
function navItemsOf(pop: HTMLElement): { item: MenuItem; el: HTMLElement }[] {
  return [...pop.querySelectorAll<HTMLElement>(':scope > .menu-item')]
    .map((el) => ({ item: itemOfEl.get(el)!, el }))
    .filter((n) => n.item && !n.item.disabled)
}

/** 设置某层的高亮项（清除本层其他项，滚动保持可见） */
function kbHighlight(level: KbLevel, index: number): void {
  level.index = index
  level.nav.forEach((n, i) => n.el.classList.toggle('kb-active', i === index))
  level.nav[index]?.el.scrollIntoView({ block: 'nearest' })
}

function kbClearHighlight(level: KbLevel): void {
  level.nav.forEach((n) => n.el.classList.remove('kb-active'))
}

/** 展开当前高亮项的子菜单并进入（键盘 → 或 Enter） */
function kbOpenSubmenu(): void {
  const level = kbStack[kbStack.length - 1]
  const nav = level.nav[level.index]
  if (!nav?.item.children) return
  closeSubs(level.pop, nav.el)
  let sub = nav.el.querySelector<HTMLElement>(':scope > .menu-pop')
  if (!sub) {
    sub = buildPop(nav.item.children)
    sub.classList.add('sub')
    nav.el.appendChild(sub)
  }
  kbStack.push({ pop: sub, nav: navItemsOf(sub), index: -1 })
  kbMove(1)
}

/** 收起当前层级（子层收起回到父层；顶层关闭整个菜单）。返回是否还有层级 */
function kbPopLevel(): boolean {
  if (kbStack.length > 1) {
    const level = kbStack.pop()!
    level.pop.remove()
    // 子菜单内部的子层也要清
    level.pop.querySelectorAll(':scope .menu-pop').forEach((p) => p.remove())
    return true
  }
  closePopup()
  return false
}

function kbMove(dir: 1 | -1): void {
  const level = kbStack[kbStack.length - 1]
  if (!level || level.nav.length === 0) return
  kbHighlight(level, (level.index + dir + level.nav.length) % level.nav.length)
}

/** 菜单打开期间的统一键盘处理（方向键 / Enter / Space / Esc / Home / End） */
function onMenuKey(e: KeyboardEvent): void {
  const level = kbStack[kbStack.length - 1]
  if (!level) return
  const nav = level.nav[level.index]
  const navItem = nav?.item

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      e.preventDefault()
      e.stopPropagation()
      kbMove(e.key === 'ArrowDown' ? 1 : -1)
      break
    }
    case 'ArrowRight': {
      e.preventDefault()
      e.stopPropagation()
      if (navItem?.children) kbOpenSubmenu()
      break
    }
    case 'ArrowLeft': {
      e.preventDefault()
      e.stopPropagation()
      if (kbStack.length > 1) kbPopLevel()
      break
    }
    case 'Enter':
    case ' ': {
      e.preventDefault()
      e.stopPropagation()
      if (navItem?.children) kbOpenSubmenu()
      else if (navItem && !navItem.disabled) {
        closePopup()
        void navItem.action?.()
      }
      break
    }
    case 'Escape': {
      e.preventDefault()
      e.stopPropagation()
      kbPopLevel()
      break
    }
    case 'Home':
    case 'End': {
      e.preventDefault()
      e.stopPropagation()
      kbHighlight(level, e.key === 'Home' ? 0 : level.nav.length - 1)
      break
    }
  }
}

/** 鼠标移入时清除该层键盘高亮（避免两种指示并存） */
function kbClearOnHover(pop: HTMLElement): void {
  pop.addEventListener('mouseenter', () => {
    const level = kbStack[kbStack.length - 1]
    if (level && level.pop === pop) kbClearHighlight(level)
  }, true)
}

export function showMenu(
  x: number,
  y: number,
  items: MenuItem[],
  placement: 'bottom-left' | 'cursor' = 'cursor',
): void {
  closePopup()
  const pop = buildPop(items)
  document.body.appendChild(pop)
  // 先挂载后测量，保证弹出位置不越界
  const rect = pop.getBoundingClientRect()
  const left = Math.min(x, window.innerWidth - rect.width - 8)
  const top = placement === 'bottom-left' ? y : Math.min(y, window.innerHeight - rect.height - 8)
  pop.style.left = `${Math.max(8, left)}px`
  pop.style.top = `${Math.max(8, top)}px`
  openPopup = pop
  kbStack = [{ pop, nav: navItemsOf(pop), index: -1 }]
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('keydown', onMenuKey, true)
}

/** 左上角主菜单：文件 → 关闭 → 视图 → 偏好设置 → 关于 */
export function showAppMenu(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  showMenu(
    rect.left,
    rect.bottom + 4,
    [
      // 文件操作
      { label: t('menu.open'), kbd: 'Ctrl+O', action: openViaDialog },
      { label: t('menu.newFile'), kbd: 'Ctrl+N', action: newUntitledTab },
      { separator: true },
      { label: t('menu.save'), kbd: 'Ctrl+S', action: () => onSave(false) },
      { label: t('menu.saveAs'), kbd: 'Ctrl+Shift+S', action: () => onSave(true) },
      { separator: true },
      { label: t('menu.closeTab'), kbd: 'Ctrl+W', action: onCloseActive },
      { separator: true },
      // 视图
      {
        label: t('menu.toggleMode'),
        kbd: 'Ctrl+/',
        action: () => {
          const tab = activeTab()
          if (tab) toggleMode(tab)
        },
      },
      { label: t('menu.outline'), kbd: 'Ctrl+Shift+O', action: toggleOutline },
      {
        label: getTheme() === 'dark' ? t('menu.themeLight') : t('menu.themeDark'),
        action: toggleTheme,
      },
      { separator: true },
      // 偏好设置
      { label: t('menu.font'), action: () => void pickSourceFont() },
      {
        label: t('menu.rememberPos'),
        checked: rememberPositions(),
        action: () => {
          toggleRememberPositions()
        },
      },
      {
        label: t('menu.language'),
        children: LANGUAGES.map((l) => ({
          label: l.label,
          checked: getLocale() === l.value,
          action: () => setLocale(l.value),
        })),
      },
      // 运行时注册“打开方式”仅 Windows 有意义（写注册表，便携单文件场景）；
      // macOS / Linux 由安装包完成：Info.plist（CFBundleDocumentTypes）/ deb·rpm 的 desktop 项
      ...(isTauri && desktopPlatform() === 'windows'
        ? [{ label: t('menu.associate'), action: registerAssociation }]
        : []),
      { separator: true },
      { label: t('menu.about', { name: APP_NAME }), action: showAbout },
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

async function registerAssociation(): Promise<void> {
  try {
    await invoke<void>('register_file_association')
    await showAppDialog({
      title: t('dlg.assocTitle'),
      message: t('dlg.assocOk'),
      buttons: [{ label: t('dlg.ok'), value: 'ok', kind: 'primary' }],
      cancelValue: 'ok',
    })
  } catch (e) {
    await showAppDialog({
      title: t('dlg.assocTitle'),
      message: String(e),
      buttons: [{ label: t('dlg.ok'), value: 'ok', kind: 'primary' }],
      cancelValue: 'ok',
    })
  }
}

const APP_REPO = 'https://github.com/lythu95/modivier'

function showAbout(): void {
  showLightDialog((card, close) => {
    card.classList.add('about-card')

    // 右上角浅色小叉，替代确认按钮
    const closeBtn = document.createElement('button')
    closeBtn.className = 'dialog-close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.innerHTML =
      '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>'
    closeBtn.addEventListener('click', close)
    card.appendChild(closeBtn)

    // 与欢迎页同构的居中 logo
    const logo = document.createElement('div')
    logo.className = 'welcome-logo about-logo'
    logo.innerHTML = '<span>M</span><i></i>'

    const name = document.createElement('div')
    name.className = 'about-name'
    name.textContent = APP_NAME

    const tagline = document.createElement('div')
    tagline.className = 'about-tagline'
    tagline.textContent = APP_TAGLINE

    const version = document.createElement('div')
    version.className = 'about-version'
    version.textContent = t('dlg.version', { v: APP_VERSION })

    const link = document.createElement('a')
    link.className = 'about-link'
    link.href = APP_REPO
    link.textContent = APP_REPO
    link.title = APP_REPO
    link.addEventListener('click', (e) => {
      e.preventDefault()
      void openExternal(APP_REPO)
    })

    card.append(logo, name, tagline, version, link)
  })
}

/** 标签页右键菜单 */
export function showTabContextMenu(x: number, y: number, tab: Tab): void {
  showMenu(x, y, [
    { label: t('ctx.closeTab'), action: () => void closeTabInteractive(tab) },
    { label: t('ctx.closeOthers'), action: () => void closeOtherTabs(tab) },
    { separator: true },
    {
      label: t('ctx.copyPath'),
      disabled: !tab.path,
      action: async () => {
        if (tab.path) await navigator.clipboard.writeText(tab.path)
      },
    },
    {
      label: t('ctx.reveal'),
      disabled: !tab.path,
      action: async () => {
        if (tab.path) await revealInDir(tab.path)
      },
    },
  ])
}
