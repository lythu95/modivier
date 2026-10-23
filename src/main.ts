import './app.css'
import 'vditor/dist/index.css'

import { apply as applyTheme } from './theme'
import {
  activeTab,
  hasDirtyTabs,
  notify,
  setActive,
  subscribe,
  tabs,
} from './state'
import { focusActiveEditor, toggleMode, updateLayout } from './editors'
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
import {
  ask,
  invoke,
  isTauri,
  nativeWindow,
  onDragDrop,
  onOpenFiles,
  openExternal,
} from './lib/tauri'

const APP_TITLE = 'MD Editor'

const TEMPLATE = `
  <header id="titlebar">
    <button id="menu-btn" title="菜单" aria-label="菜单">
      <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 3.5h12M2 8h12M2 12.5h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
    <div id="tabs"></div>
    <button id="new-tab-btn" title="新建标签页 (Ctrl+T)">
      <svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <div id="drag-region" data-tauri-drag-region></div>
    <div id="win-controls">
      <button id="win-min" title="最小化">
        <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 5h10" stroke="currentColor"/></svg>
      </button>
      <button id="win-max" title="最大化"></button>
      <button id="win-close" title="关闭">
        <svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 0l10 10M10 0l-10 10" stroke="currentColor"/></svg>
      </button>
    </div>
  </header>
  <main id="content">
    <div id="editors"></div>
    <div id="welcome">
      <div class="welcome-logo">M↓</div>
      <div class="welcome-title">MD Editor</div>
      <div class="welcome-sub">轻量 Markdown 阅读与编辑</div>
      <div class="welcome-actions">
        <button id="welcome-open" class="btn primary">打开文件</button>
        <button id="welcome-new" class="btn">新建标签页</button>
      </div>
      <div class="welcome-hints">
        <span>拖入 .md 文件即可打开</span>
        <span>Ctrl+/ 切换源码模式</span>
      </div>
    </div>
  </main>
`

async function main(): Promise<void> {
  applyTheme()

  const app = document.getElementById('app')!
  app.innerHTML = TEMPLATE

  const titlebar = document.getElementById('titlebar')!
  const tabsBar = document.getElementById('tabs')!
  const editors = document.getElementById('editors')!
  const welcome = document.getElementById('welcome')!

  await setupTitlebar(titlebar)
  setupTabsBar(tabsBar)
  initFileActions(editors)

  // 状态变化 → 布局、欢迎页、标题
  subscribe(() => {
    updateLayout(editors)
    welcome.style.display = tabs.length === 0 ? '' : 'none'
    const tab = activeTab()
    document.title = tab ? `${tab.name}${tab.content !== tab.savedContent ? ' *' : ''} - ${APP_TITLE}` : APP_TITLE
    if (isTauri) {
      void nativeWindow().then((w) => w?.setTitle(document.title))
    }
  })

  document.getElementById('new-tab-btn')!.addEventListener('click', () => newUntitledTab())
  document.getElementById('welcome-open')!.addEventListener('click', () => void openViaDialog())
  document.getElementById('welcome-new')!.addEventListener('click', () => newUntitledTab())

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
      /* 忽略启动参数读取失败 */
    }
  }

  // 窗口关闭前确认未保存修改
  const win = await nativeWindow()
  await win?.onCloseRequested(async () => {
    if (!hasDirtyTabs()) {
      await win.destroy()
      return
    }
    const ok = await ask('有标签页尚未保存，退出将丢失这些修改。确定退出吗？', '未保存的修改')
    if (ok) await win.destroy()
  })

  notify()
}

function setupShortcuts(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      const key = e.key.toLowerCase()

      if (key === 'o') {
        e.preventDefault()
        void openViaDialog()
      } else if (key === 't') {
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
