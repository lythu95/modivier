import Vditor from 'vditor'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  highlightActiveLine,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'

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

const cmThemeComp = new Compartment()

const cmLightTheme = EditorView.theme({
  '&': {
    color: 'var(--fg)',
    backgroundColor: 'transparent',
    fontSize: '15px',
  },
  '.cm-content': {
    fontFamily: 'var(--mono-font)',
    padding: '18px 4px 30vh',
    caretColor: 'var(--accent)',
    lineHeight: '1.65',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--fg) 5%, transparent)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
  },
})

function buildCmExtensions(dark: boolean) {
  return [
    history(),
    EditorView.lineWrapping,
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    markdown(),
    syntaxHighlighting(defaultHighlightStyle),
    highlightSelectionMatches(),
    cmThemeComp.of(dark ? oneDark : cmLightTheme),
  ]
}

function cmUpdateListener(onInput: (v: string) => void) {
  return EditorView.updateListener.of((u) => {
    if (u.docChanged) onInput(u.state.doc.toString())
    if (u.docChanged || u.selectionSet) emitCursor()
  })
}

function makeCodeMirror(host: HTMLElement, value: string, onInput: (v: string) => void): EditorView {
  return new EditorView({
    parent: host,
    state: EditorState.create({
      doc: value,
      extensions: [...buildCmExtensions(getTheme() === 'dark'), cmUpdateListener(onInput)],
    }),
  })
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
  if (!tab.vditor) {
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
  }
  const wantSource = tab.mode === 'source'
  if (wantSource) {
    if (!tab.cm) {
      tab.cm = makeCodeMirror(tab.cmHost, tab.content, (v) => {
        tab.content = v
        notify()
      })
    } else {
      // 重新进入源码模式：用最新内容整体替换（顺带清空历史，避免跨模式撤销混乱）
      tab.cm.setState(
        EditorState.create({
          doc: tab.content,
          extensions: [
            ...buildCmExtensions(getTheme() === 'dark'),
            cmUpdateListener((v) => {
              tab.content = v
              notify()
            }),
          ],
        }),
      )
    }
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

/** Ctrl+/ 切换模式：切换前把内容同步给目标编辑器 */
export function toggleMode(tab: Tab): void {
  tab.content = currentContent(tab)
  tab.mode = tab.mode === 'ir' ? 'source' : 'ir'
  if (tab.id === activeId) activateEditor(tab)
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
    tab.cm?.dispatch({
      effects: cmThemeComp.reconfigure(dark ? oneDark : cmLightTheme),
    })
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
