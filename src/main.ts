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
import { EditorView } from '@codemirror/view'
import { parseOutline, type OutlineNode } from './ui/outline'
import {
  checkExternalChange,
  closeActiveTab,
  initFileActions,
  MD_EXT,
  newUntitledTab,
  openPath,
  openPaths,
  openViaDialog,
  saveTab,
} from './files'
import { savePosition } from './positions'
import { joinPath } from './images'
import { openLocal } from './lib/tauri'
import { toggleSearchBar } from './ui/searchbar'
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
  onFocusChanged,
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
  // 源码模式的链接点击复用同一套分流逻辑（cm-deps 是懒加载 chunk，动态注入避免主包引用）
  void import('./cm-deps').then((m) => m.setLinkOpener((url) => void dispatchLinkHref(url)))

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
  setupCodeCopy(app)

  // 外部修改检测：窗口聚焦 / 标签切换 / 定时轮询（3s）核对激活标签的磁盘 mtime
  const onExternalCheck = () => {
    const tab = activeTab()
    if (tab) void checkExternalChange(tab)
  }
  await onFocusChanged((focused) => {
    if (focused) onExternalCheck()
  })
  subscribe(() => {
    onExternalCheck()
  })
  window.setInterval(onExternalCheck, 3000)

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
      tabs.forEach(savePosition)
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
    if (action === 'quit') {
      tabs.forEach(savePosition)
      await win.destroy()
    }
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
      // Ctrl+F 在源码模式下放行给 CodeMirror 自带搜索（不拦截），IR 模式在下方分支处理
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
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
      } else if (key === 'f') {
        // Ctrl+F：所见即所得模式用查找条；源码模式放行给 CodeMirror 自带搜索
        const tab = activeTab()
        if (tab && tab.mode === 'ir') {
          e.preventDefault()
          toggleSearchBar()
        }
      } else if (key === 'f') {
        // Ctrl+F：所见即所得模式用查找条；源码模式放行给 CodeMirror 自带搜索
        const tab = activeTab()
        if (tab && tab.mode === 'ir') {
          e.preventDefault()
          toggleSearchBar()
        }
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

/** 标题树按文档顺序摊平（order 即数组下标） */
function flattenOutlineNodes(nodes: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = []
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 链接分流：外链 → 浏览器、锚点 → 标题跳转、相对路径 → 本地文件；返回是否已接管 */
function dispatchLinkHref(href: string): boolean {
  if (/^(https?:|mailto:)/i.test(href)) {
    void openExternal(href)
    return true
  }
  if (href.startsWith('#')) {
    jumpToAnchor(null, href)
    return true
  }
  if (/^(data:|blob:|asset\.localhost|tauri:|about:|\/)/i.test(href)) return false
  const tab = activeTab()
  if (!isTauri || !tab?.baseDir) return false
  const path = joinPath(tab.baseDir, decodeURIComponent(href.split('#')[0]))
  if (MD_EXT.test(path)) {
    void openPath(path)
  } else {
    void openLocal(path)
  }
  return true
}

/** 链接/任务列表/代码块复制的编辑器内点击委托 */
function setupLinkHandling(root: HTMLElement): void {
  // 任务项 checkbox：mousedown 捕获阶段记录原始状态（此时任何激活翻转都未发生）
  let taskClick: { input: HTMLInputElement; before: boolean } | null = null
  root.addEventListener(
    'mousedown',
    (e) => {
      const cb = (e.target as HTMLElement).closest?.<HTMLInputElement>('input[type=checkbox]')
      taskClick = cb && cb.closest('li.vditor-task') ? { input: cb, before: cb.checked } : null
    },
    true,
  )

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // 任务列表：点击 checkbox 翻转勾选并回写源码态。
    // 合成/真实点击的激活行为时序不一致（pre-click 可能在 dispatch 前就翻转），
    // 因此以 mousedown 记录的原始状态为基准，preventDefault 后在 setTimeout 中
    // 强制归位到相反状态（最后一步，确定性收敛），再经 DOM2Md 反推回写源码
    const checkbox = target.closest<HTMLInputElement>('input[type=checkbox]')
    if (checkbox && checkbox.closest('li.vditor-task')) {
      e.preventDefault()
      const before = taskClick?.input === checkbox ? taskClick.before : !checkbox.checked
      window.setTimeout(() => {
        const want = !before
        if (checkbox.checked !== want) checkbox.checked = want
        // innerHTML 序列化读 attribute，property 与 attribute 同步才能被 DOM2Md 反推
        if (want) checkbox.setAttribute('checked', '')
        else checkbox.removeAttribute('checked')
        const tab = activeTab()
        if (tab?.vditor) {
          tab.content = tab.vditor.getValue()
          notify()
        }
      }, 0)
      return
    }

    // IR 所见即所得：链接以 span[data-type=a] 呈现（非真 <a>），URL 在 marker--link 文本里
    const irLink = target.closest<HTMLElement>('span[data-type="a"]')
    if (irLink) {
      const urlEl = irLink.querySelector<HTMLElement>('.vditor-ir__marker--link')
      const url = (urlEl?.textContent ?? '').replace(/^[<(]|[)>]$/g, '').trim()
      if (url && dispatchLinkHref(url)) {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }

    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    if (!href) return
    if (dispatchLinkHref(href)) {
      e.preventDefault()
      e.stopPropagation()
    }
  })
}

/** GFM 锚点 slug：小写、剔除标点、空白转连字符（与 lute 的 heading id 同规） */
function gfmSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .replace(/\s+/g, '-')
}

/** 目录内锚点跳转：优先 lute 生成的 heading id，其次按标题文本 slug 兜底（源码模式传 cm 行号跳转） */
function jumpToAnchor(anchor: HTMLAnchorElement | null, href: string): void {
  const tab = activeTab()
  if (!tab) return
  const slug = decodeURIComponent(href.slice(1)).trim().toLowerCase()
  if (tab.mode === 'source' && tab.cm) {
    // 源码模式：把锚点还原成 markdown 标题文本，在源码里找该行
    const headings = flattenOutlineNodes(parseOutline(tab.content))
    const hit = headings.find((h) => gfmSlug(h.text) === slug)
    if (hit) {
      const doc = tab.cm.state.doc
      const line = doc.line(Math.min(hit.lineNo + 1, doc.lines))
      tab.cm.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
      })
      tab.cm.focus()
    }
    return
  }
  if (tab.mode !== 'ir') return
  const pre = tab.vdHost?.querySelector('.vditor-ir pre.vditor-reset')
  if (!pre) return
  let target: HTMLElement | null = null
  const headings = pre.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')
  for (const h of headings) {
    if (h.id.toLowerCase() === slug) {
      target = h
      break
    }
  }
  if (!target) {
    for (const h of headings) {
      // IR 渲染里标题文本带 "# " 标记前缀，slug 前先剥掉
      if (gfmSlug((h.textContent ?? '').replace(/^#+\s*/, '')) === slug) {
        target = h
        break
      }
    }
  }
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  void anchor
}

/** 代码块 hover 复制按钮：悬浮层挂在 body，不污染编辑器 DOM（IR 的源码由 DOM 反推） */
function setupCodeCopy(root: HTMLElement): void {
  let btn: HTMLButtonElement | null = null
  let hideTimer: number | undefined
  let currentPre: HTMLElement | null = null

  const ensureBtn = (): HTMLButtonElement => {
    if (btn) return btn
    btn = document.createElement('button')
    btn.id = 'code-copy-btn'
    btn.addEventListener('click', () => {
      const code = currentPre?.querySelector('code')
      const text = (code ?? currentPre)?.textContent ?? ''
      void navigator.clipboard.writeText(text).then(() => {
        btn!.textContent = t('code.copied')
        window.setTimeout(() => {
          if (btn) btn.textContent = t('code.copy')
        }, 1200)
      })
    })
    document.body.appendChild(btn)
    return btn
  }

  const hide = () => {
    hideTimer = window.setTimeout(() => {
      btn?.remove()
      btn = null
      currentPre = null
    }, 150)
  }

  root.addEventListener('mouseover', (e) => {
    const pre = (e.target as HTMLElement).closest?.('pre')
    if (!pre || pre.classList.contains('vditor-ir__marker--pre')) return
    const code = pre.querySelector('code')
    if (!code) return
    // 排除主编辑区（其父为 ir/wysiwyg 容器本身）
    const parent = pre.parentElement
    if (!parent || parent.classList.contains('vditor-ir') || parent.classList.contains('vditor-wysiwyg')) return
    window.clearTimeout(hideTimer)
    currentPre = pre
    const b = ensureBtn()
    b.textContent = t('code.copy')
    const rect = pre.getBoundingClientRect()
    const maxRight = document.documentElement.clientWidth
    b.style.top = `${Math.max(4, rect.top + 4)}px`
    b.style.left = `${Math.min(rect.right - 46, maxRight - 52)}px`
  })
  root.addEventListener('mouseout', (e) => {
    if ((e.target as HTMLElement).closest?.('pre')) hide()
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
        mode: "ir" as const,
        diskMtime: null,
        pendingRestore: null,
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
