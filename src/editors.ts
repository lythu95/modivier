import { getTheme, onThemeChange } from './theme'
import { onLocaleChange, vditorLang } from './i18n'
import { activeId, activeTab, notify, tabs, type Tab } from './state'
import { installImageResolver } from './images'

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
  if (vditorReady(tab)) {
    try {
      return tab.vditor!.getValue()
    } catch {
      // lute 尚未就绪等瞬态：退回已知内容
    }
  }
  return tab.content
}

/** Vditor 构造后内部初始化是异步的（需先加载 Lute），完成前实例方法不可用 */
function vditorReady(tab: Tab): boolean {
  const v = tab.vditor as unknown as { vditor?: { currentMode?: unknown; lute?: unknown } } | null
  if (tab.vditor == null || v == null) return false
  // lute 在内部 init()（wasm 加载）完成后才赋值，此前 getValue 等会抛错
  return v.vditor != null && v.vditor.currentMode != null && v.vditor.lute != null
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
            if (tab.id === activeId && tab.mode === 'ir') {
        try {
          tab.vditor?.focus()
        } catch {
          // 同上：内部状态竞态防御
        }
      }
          },
        ),
      )
      if (tab.id === activeId && tab.mode === 'ir') {
        try {
          tab.vditor?.focus()
        } catch {
          // 同上：内部状态竞态防御
        }
      }
      // 恢复上次浏览位置（打开文件时挂到 pendingRestore）
      const restore = tab.pendingRestore
      if (restore) {
        tab.pendingRestore = null
        requestAnimationFrame(() => {
          const pre = tab.vdHost?.querySelector('.vditor-ir pre.vditor-reset') as HTMLElement | null
          let el: HTMLElement | null = pre
          while (el && el !== tab.vdHost) {
            if (el.scrollHeight > el.clientHeight + 1) break
            el = el.parentElement
          }
          const target = el ?? pre
          if (target) target.scrollTop = restore.ir
        })
      }
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
          m.scrollCmTo(tab.cm, anchor.line, anchor.ratio, anchor.vpRatio)
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

/** 外部修改重载：用磁盘内容整体替换源码模式文档（保留实例与撤销栈重置语义） */
export function resetCmForReload(tab: Tab, content: string): void {
  if (!tab.cm) return
  void loadCmDeps().then((m) => {
    if (tab.cm && tab.root.isConnected) {
      m.resetCmDoc(
        tab.cm,
        content,
        (v) => {
          tab.content = v
          notify()
        },
        emitCursor,
      )
    }
  })
}

export function focusActiveEditor(): void {
  const tab = activeTab()
  if (!tab) return
  if (tab.mode === 'source') tab.cm?.focus()
  else if (vditorReady(tab)) {
    try {
      tab.vditor?.focus()
    } catch {
      // vditor 内部状态竞态（如初始化中途被 destroy），忽略聚焦失败
    }
  }
}

/* ---------------- 模式切换滚动定位 ---------------- */

/**
 * 内容锚方案：以「块文本」为锚在两种表示间互查（IR 非活动块显示的就是源码文本），
 * 避免比例锚在两种渲染高度不一致时反复切换的累积漂移。
 * - 光标在视口内：锚定光标所在块/行（编辑连续性）
 * - 光标不在视口（纯浏览）：锚定视口中线所在块/行（注意力位置）
 */
interface ModeAnchor {
  /** 源码行号（0 起，-1 = 未能定位） */
  line: number
  /** 内容锚：目标块清洗后的文本前缀（≥8 字符才启用） */
  needle: string
  /** 比例兜底（0~1） */
  ratio: number
  /** 锚定时光标是否在视口内（切换后光标保持闪烁） */
  hasCursor: boolean
  /** 锚点在视口内的相对位置（0=顶 1=底），应用时恢复到同一位置保证不漂移 */
  vpRatio: number
}

/** 源码模式尚未创建实例时的待应用定位 */
const pendingCmAnchors = new WeakMap<Tab, ModeAnchor>()

/** IR 滚动容器：从 pre 向上找真正溢出的元素（Vditor 版本间结构有差异） */
function irScroller(tab: Tab, pre: HTMLElement): HTMLElement {
  let el: HTMLElement | null = pre
  while (el && el !== tab.vdHost) {
    if (el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return pre
}

/** 匹配归一：剥掉 markdown 前缀标记与行内强调符号，只留文本 */
function normalizeForMatch(s: string): string {
  return s
    .replace(/\u200b/g, '')
    .replace(/^(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)/g, (m) => m.replace(/!|\[|\]|\([^)]*\)/g, ''))
    .replace(/[*_~`=|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 取块元素的内容锚文本（剔除 IR 源码标记与 checkbox，剩纯文本） */
function blockNeedle(block: HTMLElement): string {
  const clone = block.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('.vditor-ir__marker, input[type=checkbox], .vditor-task__marker')
    .forEach((m) => m.remove())
  return normalizeForMatch(clone.textContent ?? '').slice(0, 24)
}

/** 光标是否落在元素的视口可见范围内 */
function visibleInView(el: HTMLElement, scroller: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.top >= scroller.getBoundingClientRect().top - 4 && r.bottom <= scroller.getBoundingClientRect().bottom + 4
}

/** 视口中线覆盖的顶层块（注意力位置） */
function middleBlock(pre: HTMLElement): HTMLElement | null {
  const rect = pre.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  let best: HTMLElement | null = null
  for (const child of Array.from(pre.children)) {
    if (!(child instanceof HTMLElement)) continue
    const r = child.getBoundingClientRect()
    if (r.top <= midY && r.bottom >= midY) return child
    if (r.top < midY) best = child
  }
  return best
}

/** 光标所在的顶层块（编辑态） */
function caretBlock(pre: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null
  if (!pre.contains(sel.anchorNode)) return null
  let node: Node | null = sel.anchorNode
  while (node && node !== pre) {
    if (node instanceof HTMLElement) {
      const b = node.closest<HTMLElement>('[data-block="0"]')
      if (b && pre.contains(b)) return b
    }
    node = node.parentNode
  }
  return null
}

/** 内容锚 → 源码行号：找第一处归一后以前缀开头的行 */
function findLineByNeedle(content: string, needle: string): number {
  if (needle.length < 8) return -1
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).startsWith(needle)) return i
  }
  // 宽松一次：needle 作为子串出现
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).includes(needle)) return i
  }
  return -1
}

function captureVditorAnchor(tab: Tab): ModeAnchor {
  const fallback: ModeAnchor = { line: -1, needle: '', ratio: 0, hasCursor: false, vpRatio: 0.5 }
  if (!vditorReady(tab)) return fallback
  const pre = tab.vdHost.querySelector<HTMLElement>('.vditor-ir pre.vditor-reset')
  if (!pre) return fallback
  const scroller = irScroller(tab, pre)
  const max = scroller.scrollHeight - scroller.clientHeight
  const ratio = max > 0 ? scroller.scrollTop / max : 0

  const caret = caretBlock(pre)
  const inView = caret && visibleInView(caret, scroller)
  const block = (caret && inView ? caret : null) ?? middleBlock(pre)
  const needle = block ? blockNeedle(block) : ''
  const line = needle ? findLineByNeedle(tab.content, needle) : -1
  // 锚块在视口内的相对位置（应用侧恢复到同一位置，消除往返漂移）
  const sRect = scroller.getBoundingClientRect()
  let vpRatio = 0.5
  if (block) {
    const bRect = block.getBoundingClientRect()
    if (scroller.clientHeight > 0) {
      vpRatio = Math.min(1, Math.max(0, (bRect.top - sRect.top) / scroller.clientHeight))
    }
  }
  return { line, needle, ratio, hasCursor: !!(caret && inView), vpRatio }
}

function captureCmAnchor(tab: Tab): ModeAnchor {
  const fallback: ModeAnchor = { line: -1, needle: '', ratio: 0, hasCursor: false, vpRatio: 0.5 }
  if (!tab.cm) return fallback
  const cm = tab.cm
  const max = cm.scrollDOM.scrollHeight - cm.scrollDOM.clientHeight
  const ratio = max > 0 ? cm.scrollDOM.scrollTop / max : 0

  const head = cm.state.selection.main.head
  const headRect = cm.coordsAtPos(head)
  const sr = cm.scrollDOM.getBoundingClientRect()
  const cursorVisible = !!headRect && headRect.top >= sr.top - 4 && headRect.bottom <= sr.bottom + 4

  let line: number
  let hasCursor: boolean
  let anchorRect: { top: number } | null = null
  if (cursorVisible) {
    line = cm.state.doc.lineAt(head).number - 1
    hasCursor = true
    anchorRect = headRect
  } else {
    const block = cm.lineBlockAtHeight(Math.max(0, cm.scrollDOM.scrollTop + cm.scrollDOM.clientHeight * 0.5))
    line = cm.state.doc.lineAt(block.from).number - 1
    hasCursor = false
    anchorRect = cm.coordsAtPos(block.from)
  }
  const vpRatio =
    anchorRect && sr.height > 0
      ? Math.min(1, Math.max(0, (anchorRect.top - sr.top) / sr.height))
      : 0.5
  const lineText = cm.state.doc.line(Math.min(line + 1, cm.state.doc.lines)).text
  const needle = normalizeForMatch(lineText).slice(0, 24)
  return { line, needle, ratio, hasCursor, vpRatio }
}

/** 把光标放置到块内第一个文本节点开头 */
function setCaretToBlockStart(block: HTMLElement): void {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const node = walker.nextNode()
  if (!node) return
  const range = document.createRange()
  range.setStart(node, 0)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function applyAnchorToVditor(tab: Tab, anchor: ModeAnchor): void {
  const pre = tab.vdHost.querySelector<HTMLElement>('.vditor-ir pre.vditor-reset')
  if (!pre) return

  // 1) 内容锚 + 视口相对位置对齐（消除往返漂移的关键）
  if (anchor.needle.length >= 8) {
    let target: HTMLElement | null = null
    for (const child of Array.from(pre.children)) {
      if (child instanceof HTMLElement && normalizeForMatch(child.textContent ?? '').includes(anchor.needle)) {
        target = child
        break
      }
    }
    if (!target) {
      target =
        (Array.from(pre.querySelectorAll<HTMLElement>('li, p, h1, h2, h3, h4, h5, h6')).find(
          (el) => normalizeForMatch(el.textContent ?? '').startsWith(anchor.needle),
        ) as HTMLElement | undefined) ?? null
    }
    if (target) {
      const scroller = irScroller(tab, pre)
      // 先把锚块顶对齐视口顶
      target.scrollIntoView({ block: 'start' })
      // 再微调：让锚块回到捕获时在视口中的相对位置
      requestAnimationFrame(() => {
        const sRect = scroller.getBoundingClientRect()
        const tRect = target.getBoundingClientRect()
        const want = sRect.top + anchor.vpRatio * sRect.height
        scroller.scrollTop += tRect.top - want
        if (anchor.hasCursor) setCaretToBlockStart(target)
      })
      return
    }
  }
  // 2) 比例兜底
  const scroller = irScroller(tab, pre)
  const max = scroller.scrollHeight - scroller.clientHeight
  scroller.scrollTop = anchor.ratio * max
}

/** Ctrl+/ 切换模式：切换前把内容同步给目标编辑器，并按内容锚互相定位 */
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
        if (anchor) m.scrollCmTo(cm, anchor.line, anchor.ratio, anchor.vpRatio)
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
