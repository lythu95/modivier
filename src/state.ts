import type Vditor from 'vditor'
import type { EditorView } from '@codemirror/view'
import { t } from './i18n'

export type Mode = 'ir' | 'source'

export interface Tab {
  id: string
  /** 文件绝对路径；null 表示未命名的新标签页 */
  path: string | null
  name: string
  mode: Mode
  /** 最近一次保存（或刚打开）时的内容 */
  savedContent: string
  /** 编辑器当前内容（由 input 回调实时同步） */
  content: string
  /** 打开文件时使用的编码，仅用于展示 */
  encoding: string
  /** 所在目录，用于解析相对图片路径 */
  baseDir: string | null
  root: HTMLElement
  vdHost: HTMLElement
  cmHost: HTMLElement
  vditor: Vditor | null
  cm: EditorView | null
}

const listeners = new Set<() => void>()

export const tabs: Tab[] = []
export let activeId: string | null = null

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function notify(): void {
  for (const fn of listeners) fn()
}

export function activeTab(): Tab | null {
  return tabs.find((t) => t.id === activeId) ?? null
}

export function findByPath(path: string): Tab | null {
  const p = path.toLowerCase()
  return tabs.find((t) => t.path && t.path.toLowerCase() === p) ?? null
}

let untitledSeq = 0

export function nextUntitledName(): string {
  untitledSeq += 1
  return t('untitled', { n: untitledSeq })
}

export function registerTab(tab: Tab, activate = true): void {
  tabs.push(tab)
  if (activate) activeId = tab.id
  notify()
}

export function setActive(id: string): void {
  if (activeId === id) return
  activeId = id
  notify()
}

/** 移除标签页（不处理脏确认与编辑器销毁，由调用方负责） */
export function unregisterTab(id: string): void {
  const idx = tabs.findIndex((t) => t.id === id)
  if (idx < 0) return
  tabs.splice(idx, 1)
  if (activeId === id) {
    activeId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
  }
  notify()
}

/**
 * 是否有未保存的修改：
 * - 文件标签：内容与最近一次保存不一致即视为有修改；
 * - 未命名标签：只有写了实质内容才算（编辑器自动插入的空白不算，
 *   因此“新建后什么都没写就关闭”不会弹确认，直接关闭）。
 */
export function hasUnsavedChanges(tab: Tab): boolean {
  if (tab.path) return tab.content !== tab.savedContent
  return tab.content.trim() !== ''
}

export function anyUnsavedChanges(): boolean {
  return tabs.some(hasUnsavedChanges)
}

export function markSaved(tab: Tab, path: string | null): void {
  tab.path = path
  if (path) {
    tab.name = basename(path)
    tab.baseDir = dirname(path)
  }
  tab.savedContent = tab.content
  notify()
}

export function basename(path: string): string {
  const p = path.replace(/[\\/]+$/, '')
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i < 0 ? p : p.slice(i + 1)
}

export function dirname(path: string): string {
  const p = path.replace(/[\\/]+$/, '')
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i < 0 ? '' : p.slice(0, i)
}

/** 首次保存未命名文件时补全默认文件名 */
export function ensureMdExt(name: string): string {
  return /\.(md|markdown|mdown|mkd|txt)$/i.test(name) ? name : `${name}.md`
}
