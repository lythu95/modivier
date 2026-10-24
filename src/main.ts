import './app.css'

import { APP_NAME, APP_TAGLINE, APP_VERSION } from './app-info'
import { apply as applyTheme } from './theme'
import { initLocale, onLocaleChange, t } from './i18n'
import { applySourceFont } from './font-setting'
import {
  activeTab,
  anyUnsavedChanges,
  hasUnsavedChanges,
  notify,
  setActive,
  subscribe,
  tabs,
} from './state'
import { focusActiveEditor, toggleMode, updateLayout, warmupEditors } from './editors'
import {
  closeActiveTab,
  initFileActions,
  newUntitledTab,
  openPaths,
  openViaDialog,
  saveTab,
} from './files'
import { setupTabsBar } from './ui/tabs'
import { setupTitlebar } from './ui/titlebar'
import { setupStatusbar } from './ui/statusbar'
import { isDialogOpen, showAppDialog } from './ui/dialog'
import { setupOutline, toggleOutline } from './ui/outline'
import {
  invoke,
  isTauri,
  nativeWindow,
  onDragDrop,
  onOpenFiles,
  openExternal,
} from './lib/tauri'

const APP_TITLE = APP_NAME

const TEMPLATE = `
  <header id="titlebar">
    <button id="menu-btn" title="" aria-label="menu">
      <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 3.5h12M2 8h12M2 12.5h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
    <div id="tabs"></div>
    <button id="new-tab-btn" title="">
      <svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <div id="drag-region" data-tauri-drag-region></div>
    <div id="win-controls">
      <button id="win-min">
        <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 5h10" stroke="currentColor"/></svg>
      </button>
      <button id="win-max"></button>
      <button id="win-close">
        <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 0l10 10M10 0l-10 10" stroke="currentColor"/></svg>
      </button>
    </div>
  </header>
  <main id="content">
    <div id="sidebar">
      <div id="sidebar-panel">
        <div id="sidebar-header">
          <span id="outline-title"></span>
        </div>
        <div id="outline-tree"></div>
      </div>
      <div id="sidebar-resize"></div>
    </div>
    <button id="outline-opener" title="">
      <svg viewBox="0 0 10 10" width="11" height="11"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
    <div id="main-area">
      <div id="editors"></div>
      <div id="welcome"></div>
    </div>
  </main>
  <footer id="statusbar"></footer>
`

/** 欢迎页内容（语言切换时整体重建） */
function renderWelcome(welcome: HTMLElement): void {
  welcome.innerHTML = `
    <div class="welcome-logo"><span>M</span><i></i></div>
    <h1 class="welcome-name">${APP_NAME}</h1>
    <p class="welcome-tagline">${APP_TAGLINE}</p>
    <div class="welcome-actions">
      <button id="welcome-open" class="btn primary">${t('common.open')}</button>
      <button id="welcome-new" class="btn">${t('common.newFile')}</button>
    </div>
    <ul class="welcome-hints">
      <li>${t('welcome.dropHint')}</li>
      <li><kbd>Ctrl</kbd> + <kbd>/</kbd> ${t('welcome.modeHint')}</li>
      <li><kbd>Ctrl</kbd> + <kbd>N</kbd> ${t('welcome.newHint')}</li>
    </ul>
    <p class="welcome-version">v${APP_VERSION}`
  welcome.querySelector('#welcome-open')?.addEventListener('click', () => void openViaDialog())
  welcome.querySelector('#welcome-new')?.addEventListener('click', () => newUntitledTab())
}

async function main(): Promise<void> {
  // 窗口以隐藏状态创建（见 tauri.conf.json），插件恢复几何后立即显示，
  // 避免"默认尺寸闪现 → 跳变为记忆尺寸"的观感
  if (isTauri) {
    void nativeWindow()
      .then((w) => w?.show())
      .catch((e) => console.error('窗口显示失败：', e))
  }

  initLocale()
  applyTheme()
  applySourceFont()

  // 后台预热编辑器大模块（vditor / CodeMirror 已按需分包），
  // 窗口先显示，首次打开文件时模块已就绪
  warmupEditors()

  const app = document.getElementById('app')!
  app.innerHTML = TEMPLATE

  const titlebar = document.getElementById('titlebar')!
  const tabsBar = document.getElementById('tabs')!
  const editors = document.getElementById('editors')!
  const welcome = document.getElementById('welcome')!
  const statusbar = document.getElementById('statusbar')!
  const newTabBtn = document.getElementById('new-tab-btn')!
  const sidebar = document.getElementById('sidebar')!
  const outlineTree = document.getElementById('outline-tree')!

  await setupTitlebar(titlebar)
  setupTabsBar(tabsBar)
  setupStatusbar(statusbar)
  setupOutline(sidebar, outlineTree)
  initFileActions(editors)

  renderWelcome(welcome)
  const applyChromeTexts = () => {
    newTabBtn.title = t('tt.newFile')
  }
  applyChromeTexts()

  // 状态变化 → 布局、欢迎页、标题
  subscribe(() => {
    updateLayout(editors)
    welcome.style.display = tabs.length === 0 ? '' : 'none'
    const tab = activeTab()
    document.title = tab
      ? `${tab.name}${hasUnsavedChanges(tab) ? ' *' : ''} - ${APP_TITLE}`
      : APP_TITLE
    if (isTauri) {
      void nativeWindow().then((w) => w?.setTitle(document.title))
    }
  })

  newTabBtn.addEventListener('click', () => newUntitledTab())

  setupShortcuts()
  setupLinkHandling(app)

  // 文件来源一：拖放
  await onDragDrop((paths) => void openPaths(paths))
  setupHtml5DropFallback(app)

  // 文件来源二：单实例转发（资源管理器“打开方式”再次启动）
  await onOpenFiles((paths) => void openPaths(paths))

  // 文件来源三：本次进程启动参数（双击文件 / 命令行）
  if (isTauri) {
    try {
      const args = await invoke<string[]>('get_launch_args')
      await openPaths(args)
    } catch {
      // 忽略启动参数读取失败
    }
  }

  // 窗口关闭前确认未保存修改（应用内对话框）
  const win = await nativeWindow()
  await win?.onCloseRequested(async () => {
    // 已有对话框打开时忽略本次关闭请求，避免对话框叠加
    if (isDialogOpen()) return
    if (!anyUnsavedChanges()) {
      await win.destroy()
      return
    }
    const action = await showAppDialog({
      title: t('dlg.unsavedTitle'),
      message: t('dlg.unsavedExit'),
      buttons: [
        { label: t('dlg.discardExit'), value: 'quit', kind: 'danger' },
        { label: t('dlg.cancel'), value: 'cancel' },
      ],
      cancelValue: 'cancel',
    })
    if (action === 'quit') await win.destroy()
  })

  onLocaleChange(() => {
    renderWelcome(welcome)
    applyChromeTexts()
    // 触发标签条/状态栏等重渲染
    notify()
  })

  notify()
}

function setupShortcuts(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      // 对话框打开期间屏蔽应用快捷键（对话框自己处理 Esc/Tab/Enter）
      if (isDialogOpen()) return
      if (!e.ctrlKey && !e.metaKey) return
      const key = e.key.toLowerCase()

      if (key === 'o' && e.shiftKey) {
        // Ctrl+Shift+O 大纲
        e.preventDefault()
        toggleOutline()
      } else if (key === 'o') {
        e.preventDefault()
        void openViaDialog()
      } else if (key === 'n' || key === 't') {
        // Ctrl+N 新建文件；保留 Ctrl+T 作为习惯性别名
        e.preventDefault()
        newUntitledTab()
      } else if (key === 's') {
        e.preventDefault()
        const tab = activeTab()
        if (tab) void saveTab(tab, e.shiftKey)
      } else if (key === '/') {
        e.preventDefault()
        const tab = activeTab()
        if (tab) toggleMode(tab)
      } else if (key === 'w') {
        e.preventDefault()
        void closeActiveTab()
      } else if (key === 'tab') {
        if (tabs.length < 2) return
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.id === (activeTab()?.id ?? ''))
        const next = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length
        setActive(tabs[next].id)
        focusActiveEditor()
      } else if (/^[1-9]$/.test(key)) {
        const n = Number(key)
        if (n <= tabs.length) {
          e.preventDefault()
          setActive(tabs[n - 1].id)
          focusActiveEditor()
        }
      }
    },
    true, // 捕获阶段，优先于编辑器内部处理
  )
}

/** Ctrl+点击 外部链接时用系统浏览器打开，并阻止 webview 内部跳转 */
function setupLinkHandling(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href)) {
      e.preventDefault()
      e.stopPropagation()
      void openExternal(href)
    }
  })
}

/** 浏览器调试模式下的 HTML5 拖放回退（Tauri 下原生拖放会拦截这些事件） */
function setupHtml5DropFallback(root: HTMLElement): void {
  root.addEventListener('dragover', (e) => e.preventDefault())
  root.addEventListener('drop', async (e) => {
    if (isTauri) return
    e.preventDefault()
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
    for (const f of files) {
      const text = await f.text()
      // 浏览器调试无法拿到绝对路径，直接按未命名内容打开
      const { registerTab } = await import('./state')
      const { attachTabDom } = await import('./editors')
      const tab = {
        id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        path: null,
        name: f.name,
        mode: 'ir' as const,
        savedContent: text,
        content: text,
        encoding: 'utf-8',
        baseDir: null,
        root: null as unknown as HTMLElement,
        vdHost: null as unknown as HTMLElement,
        cmHost: null as unknown as HTMLElement,
        vditor: null,
        cm: null,
      }
      attachTabDom(tab, document.getElementById('editors')!)
      registerTab(tab)
    }
  })
}

main().catch(console.error)
