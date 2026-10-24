import { activeTab, subscribe, type Tab } from '../state'
import { getTheme, onThemeChange, toggleTheme } from '../theme'
import { onCursorActivity, toggleMode } from '../editors'
import { t, onLocaleChange } from '../i18n'

interface CursorInfo {
  line: number
  col: number
  sel: number
}

/** 底部状态栏：左侧 行列/选中/字数，右下角 Markdown-Source 与 Light-Dark 切换 */
export function setupStatusbar(bar: HTMLElement): void {
  bar.innerHTML = `
    <div class="sb-left">
      <span id="sb-pos"></span>
      <span id="sb-sel"></span>
      <span id="sb-count"></span>
    </div>
    <div class="sb-right">
      <button id="sb-mode"></button>
      <button id="sb-theme"></button>
    </div>`

  const posEl = bar.querySelector('#sb-pos') as HTMLElement
  const selEl = bar.querySelector('#sb-sel') as HTMLElement
  const countEl = bar.querySelector('#sb-count') as HTMLElement
  const modeBtn = bar.querySelector('#sb-mode') as HTMLButtonElement
  const themeBtn = bar.querySelector('#sb-theme') as HTMLButtonElement

  modeBtn.addEventListener('click', () => {
    const tab = activeTab()
    if (tab) toggleMode(tab)
  })
  themeBtn.addEventListener('click', () => toggleTheme())

  const refreshInfo = () => {
    const tab = activeTab()
    if (!tab) {
      posEl.textContent = selEl.textContent = countEl.textContent = ''
      return
    }
    countEl.textContent = t('status.chars', { n: Array.from(tab.content).length })
    const info = cursorInfo(tab)
    posEl.textContent = info ? t('status.pos', { ln: info.line, col: info.col }) : ''
    selEl.textContent = info && info.sel > 0 ? t('status.selected', { n: info.sel }) : ''
  }

  const render = () => {
    themeBtn.textContent = getTheme() === 'dark' ? t('sb.dark') : t('sb.light')
    const tab = activeTab()
    modeBtn.style.display = tab ? '' : 'none'
    if (tab) modeBtn.textContent = t(tab.mode === 'ir' ? 'sb.markdown' : 'sb.source')
    refreshInfo()
  }

  subscribe(render)
  onThemeChange(render)
  onLocaleChange(render)
  // Vditor 是 contenteditable，光标变化走 DOM selectionchange
  document.addEventListener('selectionchange', () => requestAnimationFrame(refreshInfo))
  // CodeMirror 自己管理选区，通过编辑器侧回调驱动
  onCursorActivity(refreshInfo)
  render()
}

function cursorInfo(tab: Tab): CursorInfo | null {
  try {
    if (tab.mode === 'source' && tab.cm) {
      const sel = tab.cm.state.selection.main
      const line = tab.cm.state.doc.lineAt(sel.head)
      let n = 0
      for (const r of tab.cm.state.selection.ranges) n += r.to - r.from
      return { line: line.number, col: sel.head - line.from + 1, sel: n }
    }
    // IR 模式基于 DOM 选区近似计算（块级换行会被视作换行）
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const node = sel.focusNode
    if (!node || !tab.vdHost.contains(node)) return null
    // host 内含多个模式的 reset 节点（隐藏的为空），只取 IR 区当前生效的
    const pre = tab.vdHost.querySelector('.vditor-ir pre.vditor-reset')
    if (!pre || !pre.contains(node)) return null
    const range = document.createRange()
    range.selectNodeContents(pre)
    range.setEnd(node, sel.focusOffset)
    const text = range.toString()
    const line = (text.match(/\n/g)?.length ?? 0) + 1
    const lastLine = text.slice(text.lastIndexOf('\n') + 1)
    const col = Array.from(lastLine).length + 1
    const selLen = sel.isCollapsed ? 0 : Array.from(sel.toString()).length
    return { line, col, sel: selLen }
  } catch {
    return null
  }
}
