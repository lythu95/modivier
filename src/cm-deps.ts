/**
 * CodeMirror 全量依赖集中在此模块，按需（懒）加载——
 * 860KB 级的编辑器大包不进入启动关键路径，窗口先行显示。
 */
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'

import { getTheme } from './theme'

export { EditorState, EditorView }

const cmThemeComp = new Compartment()

const cmLightTheme = EditorView.theme({
  '&': {
    color: 'var(--fg)',
    backgroundColor: 'transparent',
    fontSize: '15px',
  },
  '.cm-content': {
    fontFamily: 'var(--source-font)',
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

export function buildCmExtensions(dark: boolean) {
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

export function cmUpdateListener(onInput: (v: string) => void, onCursor?: () => void) {
  return EditorView.updateListener.of((u) => {
    if (u.docChanged) onInput(u.state.doc.toString())
    if (u.docChanged || u.selectionSet) onCursor?.()
  })
}

export function makeCodeMirror(
  host: HTMLElement,
  value: string,
  onInput: (v: string) => void,
  onCursor?: () => void,
): EditorView {
  return new EditorView({
    parent: host,
    state: EditorState.create({
      doc: value,
      extensions: [
        ...buildCmExtensions(getTheme() === 'dark'),
        cmUpdateListener(onInput, onCursor),
      ],
    }),
  })
}

/** 用最新内容整体替换（顺带清空历史，避免跨模式撤销混乱） */
export function resetCmDoc(
  view: EditorView,
  doc: string,
  onInput: (v: string) => void,
  onCursor?: () => void,
): void {
  view.setState(
    EditorState.create({
      doc,
      extensions: [...buildCmExtensions(getTheme() === 'dark'), cmUpdateListener(onInput, onCursor)],
    }),
  )
}

export function reconfigureCmTheme(view: EditorView, dark: boolean): void {
  view.dispatch({
    effects: cmThemeComp.reconfigure(dark ? oneDark : cmLightTheme),
  })
}
