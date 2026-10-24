import { EditorView } from '@codemirror/view'
import { activeTab, subscribe, tabs } from '../state'
import { t, onLocaleChange } from '../i18n'

export interface OutlineNode {
  level: number
  text: string
  /** 标题所在行号（0 起，源码模式跳转用） */
  lineNo: number
  /** 全文第几个标题（DOM 顺序，所见即所得跳转用） */
  order: number
  children: OutlineNode[]
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_RE = /^\s*(```|~~~)/

/** 解析 markdown 标题为层级树（跳过代码块内的伪标题） */
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  let inFence = false
  let order = 0
  text.split('\n').forEach((line, i) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const m = HEADING_RE.exec(line)
    if (!m) return
    const node: OutlineNode = {
      level: m[1].length,
      text: cleanHeadingText(m[2]),
      lineNo: i,
      order: order++,
      children: [],
    }
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length > 0) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  })
  return roots
}

function cleanHeadingText(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`_~]+/g, '')
    .trim()
}

/* ---------------- 侧栏开合 ---------------- */

const OPEN_KEY = 'modivier:outline'
let open = localStorage.getItem(OPEN_KEY) !== '0' // 默认展开

let sidebarEl: HTMLElement | null = null
let treeEl: HTMLElement | null = null

export function isOutlineOpen(): boolean {
  return open
}

export function setOutlineOpen(v: boolean): void {
  open = v
  localStorage.setItem(OPEN_KEY, v ? '1' : '0')
  applySidebar()
}

export function toggleOutline(): void {
  setOutlineOpen(!open)
}

function applySidebar(): void {
  if (!sidebarEl) return
  const hasTabs = tabs.length > 0
  sidebarEl.style.display = hasTabs ? '' : 'none'
  sidebarEl.classList.toggle('collapsed', !open)
  // 收起后只在整个内容区左缘悬浮一个半透明箭头
  const opener = document.getElementById('outline-opener')
  if (opener) opener.style.display = hasTabs && !open ? 'flex' : 'none'
}

/* ---------------- 树渲染 ---------------- */

/** 折叠状态按 "层级|标题" 记忆，内容变化重建树后仍保留 */
const collapsedKeys = new Set<string>()

let rebuildTimer: number | undefined

function scheduleRebuild(): void {
  window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(renderTree, 250)
}

function renderTree(): void {
  if (!treeEl) return
  treeEl.textContent = ''
  const tab = activeTab()
  if (!tab) return
  for (const node of parseOutline(tab.content)) {
    treeEl.appendChild(renderNode(node))
  }
}

function renderNode(node: OutlineNode): HTMLElement {
  const li = document.createElement('li')

  const row = document.createElement('div')
  row.className = 'outline-item'

  const key = `${node.level}|${node.text}`
  const hasChildren = node.children.length > 0
  const collapsed = collapsedKeys.has(key)

  const caret = document.createElement('button')
  caret.className =
    'outline-caret' + (hasChildren ? '' : ' leaf') + (collapsed ? '' : ' expanded')
  caret.innerHTML =
    '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 1.5l5 3.5-5 3.5z" fill="currentColor"/></svg>'
  caret.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!hasChildren) return
    if (collapsedKeys.has(key)) collapsedKeys.delete(key)
    else collapsedKeys.add(key)
    renderTree()
  })
  row.appendChild(caret)

  const text = document.createElement('span')
  text.className = 'outline-text'
  text.textContent = node.text
  text.title = node.text
  text.addEventListener('click', () => {
    const tab = activeTab()
    if (tab) jumpTo(tab, node)
  })
  row.appendChild(text)

  li.appendChild(row)

  if (hasChildren) {
    const ul = document.createElement('ul')
    ul.className = 'outline-children' + (collapsed ? ' hidden' : '')
    for (const child of node.children) {
      ul.appendChild(renderNode(child))
    }
    li.appendChild(ul)
  }
  return li
}

function jumpTo(tab: import('../state').Tab, node: OutlineNode): void {
  if (tab.mode === 'source' && tab.cm) {
    const doc = tab.cm.state.doc
    const line = doc.line(Math.min(node.lineNo + 1, doc.lines))
    tab.cm.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
    })
    tab.cm.focus()
  } else if (tab.vditor) {
    const pre = tab.vdHost.querySelector('.vditor-ir pre.vditor-reset')
    const headings = pre?.querySelectorAll('h1,h2,h3,h4,h5,h6')
    headings?.[node.order]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/* ---------------- 初始化 ---------------- */

export function setupOutline(sidebar: HTMLElement, tree: HTMLElement): void {
  sidebarEl = sidebar
  treeEl = tree

  sidebar.querySelector('#outline-collapse')?.addEventListener('click', () => setOutlineOpen(false))
  document.getElementById('outline-opener')?.addEventListener('click', () => setOutlineOpen(true))
  const applyTitle = () => {
    sidebar.querySelector('#outline-title')!.textContent = t('menu.outline')
    document.getElementById('outline-opener')?.setAttribute('title', t('menu.outline'))
  }
  applyTitle()
  onLocaleChange(() => {
    applyTitle()
    renderTree()
  })

  applySidebar()
  subscribe(() => {
    applySidebar()
    scheduleRebuild()
  })
  renderTree()
}
