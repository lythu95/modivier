import {
  activeTab,
  basename,
  ensureMdExt,
  findByPath,
  hasUnsavedChanges,
  markSaved,
  nextUntitledName,
  registerTab,
  unregisterTab,
  type Tab,
} from './state'
import { attachTabDom, currentContent, destroyTabEditors } from './editors'
import { appAlert, showAppDialog } from './ui/dialog'
import { invoke, openDialog, saveDialog } from './lib/tauri'

const MD_FILTER = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }]

const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i

interface ReadResult {
  content: string
  encoding: string
}

let editorsRoot: HTMLElement | null = null

/** main.ts 启动时注入编辑器容器，用于挂载新标签页 */
export function initFileActions(root: HTMLElement): void {
  editorsRoot = root
}

function newTabObject(init: {
  path: string | null
  name: string
  content: string
  encoding?: string
  baseDir: string | null
}): Tab {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    path: init.path,
    name: init.name,
    mode: 'ir',
    savedContent: init.content,
    content: init.content,
    encoding: init.encoding ?? 'utf-8',
    baseDir: init.baseDir,
    root: null as unknown as HTMLElement,
    vdHost: null as unknown as HTMLElement,
    cmHost: null as unknown as HTMLElement,
    vditor: null,
    cm: null,
  }
}

/** 新建未命名空白标签页 */
export function newUntitledTab(): Tab {
  const tab = newTabObject({
    path: null,
    name: nextUntitledName(),
    content: '',
    baseDir: null,
  })
  attachAndRegister(tab)
  return tab
}

function attachAndRegister(tab: Tab): void {
  if (!editorsRoot) throw new Error('编辑器容器尚未初始化')
  attachTabDom(tab, editorsRoot)
  registerTab(tab)
}

/** 打开一个文件：已打开则聚焦，否则读取并新建标签页 */
export async function openPath(path: string): Promise<void> {
  const existing = findByPath(path)
  if (existing) {
    const { setActive } = await import('./state')
    setActive(existing.id)
    return
  }
  try {
    const result = await invoke<ReadResult>('read_file', { path })
    const tab = newTabObject({
      path,
      name: basename(path),
      content: result.content,
      encoding: result.encoding,
      baseDir: dirnameOf(path),
    })
    attachAndRegister(tab)
  } catch (e) {
    await appAlert(String(e), '打开失败')
  }
}

function dirnameOf(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i < 0 ? '' : path.slice(0, i)
}

/** 批量打开（拖放/命令行），自动过滤非 Markdown 文件 */
export async function openPaths(paths: string[]): Promise<void> {
  const files = paths.filter((p) => MD_EXT.test(p))
  for (const f of files) await openPath(f)
}

export async function openViaDialog(): Promise<void> {
  const picked = await openDialog({
    multiple: true,
    filters: MD_FILTER,
    title: '打开 Markdown 文件',
  })
  if (!picked) return
  const list = Array.isArray(picked) ? picked : [picked]
  await openPaths(list)
}

/** 保存当前标签页；saveAs 为 true 或文件未命名时弹出另存为对话框 */
export async function saveTab(tab: Tab, saveAs = false): Promise<boolean> {
  tab.content = currentContent(tab)
  let path = tab.path
  if (saveAs || !path) {
    const defaultName = path ? basename(path) : ensureMdExt(tab.name)
    path = await saveDialog({
      defaultPath: path ?? defaultName,
      filters: MD_FILTER,
      title: '保存 Markdown 文件',
    })
    if (!path) return false
  }
  try {
    await invoke<void>('write_file', { path, content: tab.content })
    markSaved(tab, path)
    return true
  } catch (e) {
    await appAlert(String(e), '保存失败')
    return false
  }
}

/** 关闭标签页（有实质修改时弹应用内对话框确认）。返回是否真的关闭了。 */
export async function closeTabInteractive(tab: Tab): Promise<boolean> {
  tab.content = currentContent(tab)
  if (hasUnsavedChanges(tab)) {
    const action = await showAppDialog({
      title: '未保存的修改',
      message: `“${tab.name}”尚未保存，关闭后将丢失修改。`,
      buttons: [
        { label: '不保存', value: 'discard', kind: 'danger' },
        { label: '取消', value: 'cancel' },
        { label: '保存', value: 'save', kind: 'primary' },
      ],
      cancelValue: 'cancel',
    })
    if (action === 'cancel') return false
    if (action === 'save') {
      const saved = await saveTab(tab)
      // 保存被取消（如另存为对话框直接关闭）时留在当前标签
      if (!saved) return false
    }
  }
  destroyTabEditors(tab)
  tab.root.remove()
  unregisterTab(tab.id)
  return true
}

export async function closeActiveTab(): Promise<void> {
  const tab = activeTab()
  if (tab) await closeTabInteractive(tab)
}

/** 关闭除指定标签页外的其他标签页（脏的逐个确认） */
export async function closeOtherTabs(keep: Tab): Promise<void> {
  for (const t of [...(await import('./state')).tabs]) {
    if (t.id === keep.id) continue
    const closed = await closeTabInteractive(t)
    if (!closed) return
  }
}
