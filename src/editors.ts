import { getTheme, onThemeChange } from './theme'
import { onLocaleChange, vditorLang } from './i18n'
import { activeId, activeTab, notify, tabs, type Tab } from './state'
import { installImageResolver } from './images'
import { parseOutline, type OutlineNode } from './ui/outline'

const VDITOR_CONTENT_THEME_PATH = '/vditor/dist/css/content-theme'

// CodeMirror 光标/选区变化回调（状态栏订阅）
const cursorListeners = new Set<() => void>()

export function onCursorActivity(fn: () => void): () => void {
  cursorListeners.add(fn)
  return () => cursorListeners.delete(fn)
}

function emitCursor(): void {
  for (const fn of cursorListeners) fn()
}

/* ---------------- 编辑器依赖懒加载 ---------------- */

// vditor（含其样式）与 CodeMirror 全量依赖在首次用到时才加载，
// 启动关键路径只剩轻量外壳，窗口得以先行显示
let vditorCtorP: Promise<typeof import('vditor').default> | null = null

function loadVditorCtor(): Promise<typeof import('vditor').default> {
  vditorCtorP ??= Promise.all([import('vditor'), import('vditor/dist/index.css')]).then(
    ([m]) => m.default,
  )
  return vditorCtorP
}

let cmDepsP: Promise<typeof import('./cm-deps')> | null = null

function loadCmDeps(): Promise<typeof import('./cm-deps')> {
  cmDepsP ??= import('./cm-deps')
  return cmDepsP
}

/** 启动后台预热编辑器大模块（main 在显示窗口后调用） */
export function warmupEditors(): void {
  void loadVditorCtor()
  void loadCmDeps()
}

const vditorLoading = new WeakSet<Tab>()
const cmLoading = new WeakSet<Tab>()

/* ---------------- 公共逻辑 ---------------- */

export function currentContent(tab: Tab): string {
  if (tab.mode === 'source' && tab.cm) return tab.cm.state.doc.toString()
  if (vditorReady(tab)) return tab.vditor!.getValue()
  return tab.content
}

/** Vditor 构造后内部初始化是异步的（需先加载 Lute），完成前实例方法不可用 */
function vditorReady(tab: Tab): boolean {
  return tab.vditor != null && (tab.vditor as unknown as { vditor?: unknown }).vditor != null
}

function vditorOptions(value: string, onInput: (v: string) => void, onReady: () => void): IOptions {
  const dark = getTheme() === 'dark'
  return {
    mode: 'ir',
    lang: vditorLang() as IOptions['lang'],
    // 指向本地 public/vditor（postinstall 从 node_modules 复制），保证懒加载资源离线可用
    cdn: 'vditor',
    value,
    cache: { enable: false },
    height: '100%',
    toolbar: [],
    resize: { enable: false },
    outline: { enable: false, position: 'left' },
    theme: dark ? 'dark' : 'classic',
    preview: {
      theme: {
        current: dark ? 'dark' : 'light',
        path: VDITOR_CONTENT_THEME_PATH,
      },
      hljs: { lineNumber: false, style: dark ? 'github-dark' : 'github' },
      markdown: { sanitize: true },
    },
    input: (v: string) => onInput(v),
    after: onReady,
  }
}

/** 创建标签页的 DOM 容器与两个编辑器宿主（编辑器实例按需延迟创建） */
export function attachTabDom(tab: Tab, parent: HTMLElement): void {
  const root = document.createElement('div')
  root.className = 'tab-editor'
  root.dataset.id = tab.id
  const vdHost = document.createElement('div')
  vdHost.className = 'vd-host'
  const cmHost = document.createElement('div')
  cmHost.className = 'cm-host'
  root.append(vdHost, cmHost)
  parent.appendChild(root)
  tab.root = root
  tab.vdHost = vdHost
  tab.cmHost = cmHost
  installImageResolver(root, () => tab.baseDir)
}

/** 激活标签页时保证编辑器已创建并展示对应模式 */
export function activateEditor(tab: Tab): void {
  if (!tab.vditor && !vditorLoading.has(tab)) {
    vditorLoading.add(tab)
    void loadVditorCtor().then((Vditor) => {
      vditorLoading.delete(tab)
      // 加载期间标签可能已被关闭
      if (!tab.root.isConnected || tab.vditor) return
      tab.vditor = new Vditor(
        tab.vdHost,
        vditorOptions(
          tab.content,
          (v) => {
            tab.content = v
            notify()
          },
          () => {
            // Vditor 初始化时会规范化文本（CRLF 行尾、行尾空白等）。
            // 文件标签若用户尚未做实质编辑（内容仍与保存基准一致），
            // 把规范化结果同步为新的保存基准，避免原样关闭被误报"未保存"
            if (tab.path && vditorReady(tab) && tab.content === tab.savedContent) {
              const normalized = tab.vditor!.getValue()
              if (normalized !== tab.savedContent) {
                tab.content = normalized
                tab.savedContent = normalized
                notify()
              }
            }
            if (tab.id === activeId && tab.mode === 'ir') tab.vditor?.focus()
          },
        ),
      )
      if (tab.id === activeId && tab.mode === 'ir') tab.vditor?.focus()
    })
  }

  const wantSource = tab.mode === 'source'
  if (wantSource && !tab.cm && !cmLoading.has(tab)) {
    cmLoading.add(tab)
    void loadCmDeps().then((m) => {
      cmLoading.delete(tab)
      if (!tab.root.isConnected || tab.cm) return
      tab.cm = m.makeCodeMirror(
        tab.cmHost,
        tab.content,
        (v) => {
          tab.content = v
          notify()
        },
        emitCursor,
      )
      if (tab.id === activeId && tab.mode === 'source') {
        tab.cm.focus()
        emitCursor()
        // 从文档切来时的定位（编辑器实例此时才首次创建）
        const anchor = pendingCmAnchors.get(tab)
        if (anchor) {
          pendingCmAnchors.delete(tab)
          m.scrollCmTo(tab.cm, anchor.line, anchor.ratio)
        }
      }
    })
  }

  tab.vdHost.style.display = wantSource ? 'none' : ''
  tab.cmHost.style.display = wantSource ? '' : 'none'
  if (!wantSource && vditorReady(tab) && tab.vditor!.getValue() !== tab.content) {
    // 在源码模式修改过内容，回 Markdown 模式时同步给 Vditor（清空撤销栈避免跨模式混乱）
    tab.vditor!.setValue(tab.content, true)
  }
  focusActiveEditor()
  emitCursor()
}

export function focusActiveEditor(): void {
  const tab = activeTab()
  if (!tab) return
  if (tab.mode === 'source') tab.cm?.focus()
  else if (vditorReady(tab)) tab.vditor?.focus()
}

/* ---------------- 模式切换滚动定位 ---------------- */

interface ModeAnchor {
  /** 标题序号（DOM/文档顺序，-1 = 附近无标题） */
  order: number
  /** 顶部可见行号（0 起，-1 = 不可用） */
  line: number
  /** 滚动比例兜底（0~1） */
  ratio: number
}

/** 源码模式尚未创建实例时的待应用定位 */
const pendingCmAnchors = new WeakMap<Tab, ModeAnchor>()

/** 标题树按文档顺序摊平（order 即数组下标） */
function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
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

/** IR 滚动容器：从 pre 向上找真正溢出的元素（Vditor 版本间结构有差异） */
function irScroller(tab: Tab, pre: HTMLElement): HTMLElement {
  let el: HTMLElement | null = pre
  while (el && el !== tab.vdHost) {
    if (el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return pre
}

function captureVditorAnchor(tab: Tab): ModeAnchor | null {
  if (!vditorReady(tab)) return null
  const pre = tab.vdHost.querySelector<HTMLElement>('.vditor-ir pre.vditor-reset')
  if (!pre) return null
  const scroller = irScroller(tab, pre)
  const max = scroller.scrollHeight - scroller.clientHeight
  const ratio = max > 0 ? scroller.scrollTop / max : 0
  // 视口顶部往上最近的一个标题（DOM 序号），在目标模式里按同一序号找回
  const preTop = pre.getBoundingClientRect().top
  let order = -1
  pre.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h, i) => {
    if (h.getBoundingClientRect().top - preTop <= 12) order = i
  })
  const line = order >= 0 ? (flattenOutline(parseOutline(tab.content))[order]?.lineNo ?? -1) : -1
  return { order, line, ratio }
}

function captureCmAnchor(tab: Tab): ModeAnchor | null {
  if (!tab.cm) return null
  const cm = tab.cm
  const max = cm.scrollDOM.scrollHeight - cm.scrollDOM.clientHeight
  const ratio = max > 0 ? cm.scrollDOM.scrollTop / max : 0
  const block = cm.lineBlockAtHeight(Math.max(0, cm.scrollDOM.scrollTop))
  const line = cm.state.doc.lineAt(block.from).number - 1
  // 该行上方最近标题（DOM 序号），在 IR 里按同一序号找回
  let order = -1
  for (const h of flattenOutline(parseOutline(tab.content))) {
    if (h.lineNo <= line) order = h.order
  }
  return { order, line, ratio }
}

function applyAnchorToVditor(tab: Tab, anchor: ModeAnchor): void {
  const pre = tab.vdHost.querySelector<HTMLElement>('.vditor-ir pre.vditor-reset')
  if (!pre) return
  if (anchor.order >= 0) {
    const target = pre.querySelectorAll('h1,h2,h3,h4,h5,h6')[anchor.order] as
      | HTMLElement
      | undefined
    if (target) {
      target.scrollIntoView({ block: 'start' })
      return
    }
  }
  const scroller = irScroller(tab, pre)
  const max = scroller.scrollHeight - scroller.clientHeight
  scroller.scrollTop = anchor.ratio * max
}

/** Ctrl+/ 切换模式：切换前把内容同步给目标编辑器，并互相定位滚动位置 */
export function toggleMode(tab: Tab): void {
  tab.content = currentContent(tab)
  const goingSource = tab.mode === 'ir'
  const anchor = goingSource ? captureVditorAnchor(tab) : captureCmAnchor(tab)
  tab.mode = goingSource ? 'source' : 'ir'
  if (goingSource && tab.cm) {
    // 已有 CodeMirror 实例：整体替换为最新内容（清空撤销栈，避免跨模式混乱）
    const cm = tab.cm
    void loadCmDeps().then((m) => {
      if (cm === tab.cm && tab.root.isConnected) {
        m.resetCmDoc(
          cm,
          tab.content,
          (v) => {
            tab.content = v
            notify()
          },
          emitCursor,
        )
        if (anchor) m.scrollCmTo(cm, anchor.line, anchor.ratio)
      }
    })
  } else if (goingSource && anchor) {
    // CodeMirror 首次创建是异步的，定位暂存、创建完成后再应用
    pendingCmAnchors.set(tab, anchor)
  }
  if (tab.id === activeId) activateEditor(tab)
  if (!goingSource && anchor) {
    // 内容有改动时 setValue 会重置 Vditor 滚动，等一帧 DOM 稳定后再定位
    requestAnimationFrame(() => {
      if (tab.root.isConnected && tab.mode === 'ir') applyAnchorToVditor(tab, anchor)
    })
  }
  notify()
}

/** 根据当前激活状态刷新各标签页容器的显示 */
export function updateLayout(editorsRoot: HTMLElement): void {
  for (const tab of tabs) {
    tab.root.classList.toggle('active', tab.id === activeId)
  }
  const tab = activeTab()
  if (tab) {
    delete editorsRoot.dataset.empty
    activateEditor(tab)
  } else {
    editorsRoot.dataset.empty = '1'
  }
}

/** 主题切换时同步所有已创建的编辑器实例 */
export function applyThemeToEditors(): void {
  const dark = getTheme() === 'dark'
  for (const tab of tabs) {
    if (vditorReady(tab)) {
      tab.vditor!.setTheme(
        dark ? 'dark' : 'classic',
        dark ? 'dark' : 'light',
        dark ? 'github-dark' : 'github',
        VDITOR_CONTENT_THEME_PATH,
      )
    }
    if (tab.cm) {
      const cm = tab.cm
      void loadCmDeps().then((m) => m.reconfigureCmTheme(cm, dark))
    }
  }
}

export function destroyTabEditors(tab: Tab): void {
  try {
    tab.vditor?.destroy()
  } catch {
    // dom 已被移除时 destroy 偶发抛错，忽略
  }
  tab.cm?.destroy()
  tab.vditor = null
  tab.cm = null
}

// 主题变化时刷新已存在的编辑器
onThemeChange(applyThemeToEditors)

// 语言切换时重建 Vditor 实例（其界面语言在构造时确定）；内容先取出再重建
onLocaleChange(() => {
  for (const tab of tabs) {
    if (tab.vditor) {
      tab.content = currentContent(tab)
      try {
        tab.vditor.destroy()
      } catch {
        // destroy 偶发抛错，忽略
      }
      tab.vditor = null
    }
  }
  const tab = activeTab()
  if (tab) activateEditor(tab)
})
