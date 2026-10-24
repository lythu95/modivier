import { getTheme, toggleTheme } from '../theme'
import { activeTab, type Tab } from '../state'
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../app-info'
import { LANGUAGES, getLocale, setLocale, t } from '../i18n'
import { closeTabInteractive, closeOtherTabs, newUntitledTab, openViaDialog, saveTab } from '../files'
import { toggleMode } from '../editors'
import { toggleOutline } from './outline'
import { invoke, isTauri, revealInDir } from '../lib/tauri'
import { showAppDialog } from './dialog'

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

/** 关闭同级其他子菜单，保留 belongTo 项的 */
function closeSubs(pop: HTMLElement, belongTo?: HTMLElement): void {
  pop.querySelectorAll<HTMLElement>(':scope > .menu-item > .menu-pop').forEach((el) => {
    if (el.parentElement !== belongTo) el.remove()
  })
}

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
  return pop
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
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('keydown', onEsc, true)
}

/** 左上角主菜单 */
export function showAppMenu(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  showMenu(
    rect.left,
    rect.bottom + 4,
    [
      { label: t('menu.open'), kbd: 'Ctrl+O', action: openViaDialog },
      { label: t('menu.newFile'), kbd: 'Ctrl+N', action: newUntitledTab },
      { separator: true },
      { label: t('menu.save'), kbd: 'Ctrl+S', action: () => onSave(false) },
      { label: t('menu.saveAs'), kbd: 'Ctrl+Shift+S', action: () => onSave(true) },
      {
        label: t('menu.toggleMode'),
        kbd: 'Ctrl+/',
        action: () => {
          const tab = activeTab()
          if (tab) toggleMode(tab)
        },
      },
      { label: t('menu.outline'), kbd: 'Ctrl+Shift+O', action: toggleOutline },
      { separator: true },
      {
        label: getTheme() === 'dark' ? t('menu.themeLight') : t('menu.themeDark'),
        action: toggleTheme,
      },
      {
        label: t('menu.language'),
        children: LANGUAGES.map((l) => ({
          label: l.label,
          checked: getLocale() === l.value,
          action: () => setLocale(l.value),
        })),
      },
      // 便携单文件场景下方便用户把应用挂进系统“打开方式”列表
      ...(isTauri ? [{ label: t('menu.associate'), action: registerAssociation }] : []),
      { separator: true },
      { label: t('menu.closeTab'), kbd: 'Ctrl+W', action: onCloseActive },
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

function showAbout(): void {
  void showAppDialog({
    title: t('dlg.aboutTitle'),
    message: `${APP_NAME} —— ${APP_TAGLINE}\n\n${t('dlg.version', { v: APP_VERSION })}\nTauri 2 · Vditor · CodeMirror 6`,
    buttons: [{ label: t('dlg.ok'), value: 'ok', kind: 'primary' }],
    cancelValue: 'ok',
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
