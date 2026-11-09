import {
  activeTab,
  basename,
  ensureMdExt,
  findByPath,
  hasUnsavedChanges,
  markSaved,
  nextUntitledName,
  notify,
  registerTab,
  unregisterTab,
  type Tab,
} from './state'
import { attachTabDom, currentContent, destroyTabEditors } from './editors'
import { appAlert, isDialogOpen, showAppDialog } from './ui/dialog'
import { invoke, isTauri, openDialog, saveDialog } from './lib/tauri'
import { t } from './i18n'

const MD_FILTER = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }]

export const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i

interface ReadResult {
  content: string
  encoding: string
  modified: number
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
  diskMtime?: number | null
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
    diskMtime: init.diskMtime ?? null,
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
      diskMtime: result.modified,
    })
    attachAndRegister(tab)
  } catch (e) {
    await appAlert(String(e), t('dlg.openFail'))
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
    title: t('menu.open'),
  })
  if (!picked) return
  const list = Array.isArray(picked) ? picked : [picked]
  await openPaths(list)
}

/** 保存当前标签页；saveAs 为 true 或文件未命名时弹出另存为对话框。
 *  保存前拦截外部修改冲突：磁盘 mtime 与已知基准不一致时弹出覆盖确认。 */
export async function saveTab(tab: Tab, saveAs = false): Promise<boolean> {
  tab.content = currentContent(tab)
  let path = tab.path
  if (saveAs || !path) {
    const defaultName = path ? basename(path) : ensureMdExt(tab.name)
    path = await saveDialog({
      defaultPath: path ?? defaultName,
      filters: MD_FILTER,
      title: t('menu.saveAs'),
    })
    if (!path) return false
  }
  // 最后防线：磁盘上的文件在打开/上次保存之后又被外部改过 → 保存会覆盖外部内容，先确认
  const diskMtime = await invoke<number | null>('stat_file', { path }).catch(() => null)
  if (!saveAs && diskMtime != null && tab.diskMtime != null && diskMtime !== tab.diskMtime) {
    const action = await showAppDialog({
      title: t('dlg.extTitle'),
      message: t('dlg.extOverwrite', { name: tab.name }),
      buttons: [
        { label: t('dlg.extOverwriteOk'), value: 'overwrite', kind: 'danger' },
        { label: t('dlg.cancel'), value: 'cancel' },
      ],
      cancelValue: 'cancel',
    })
    if (action !== 'overwrite') return false
  }
  try {
    const mtime = await invoke<number>('write_file', { path, content: tab.content })
    markSaved(tab, path)
    tab.diskMtime = mtime
    return true
  } catch (e) {
    await appAlert(String(e), t('dlg.saveFail'))
    return false
  }
}

/**
 * 外部修改检测（窗口聚焦 / 标签激活时调用）：
 * - 无未保存修改：静默重载磁盘新内容（编辑器视图 + 滚动位置尽量保留）；
 * - 有未保存修改：对话框让用户选择「重新加载（放弃修改）」或「保留我的版本」。
 * 保留版本时把保存基准对齐到磁盘新内容，后续保存不再重复提示。
 */
export async function checkExternalChange(tab: Tab): Promise<void> {
  // 防重入：对话框等待用户选择期间，轮询/聚焦会反复进入，叠加出多层对话框
  if (isDialogOpen()) return
  if (!tab.path || !isTauri) return
  const diskMtime = await invoke<number | null>('stat_file', { path: tab.path }).catch(() => null)
  if (diskMtime == null || tab.diskMtime == null || diskMtime === tab.diskMtime) return

  const result = await invoke<ReadResult>('read_file', { path: tab.path }).catch(() => null)
  if (!result) return

  if (!hasUnsavedChanges(tab)) {
    reloadTab(tab, result.content, result.modified)
    return
  }

  const action = await showAppDialog({
    title: t('dlg.extTitle'),
    message: t('dlg.extBody', { name: tab.name }),
    buttons: [
      { label: t('dlg.extReload'), value: 'reload', kind: 'primary' },
      { label: t('dlg.extKeep'), value: 'keep' },
    ],
    cancelValue: 'keep',
  })
  if (action === 'reload') {
    reloadTab(tab, result.content, result.modified)
  } else {
    // 保留我的版本：以磁盘新内容为保存基准，之后保存覆盖不再重复提示
    tab.savedContent = result.content
    tab.diskMtime = result.modified
    notify()
  }
}

/** 用磁盘内容重置标签（内容/基准/mtime/编辑器视图），尽量保留滚动位置 */
function reloadTab(tab: Tab, content: string, mtime: number): void {
  const scrollTop = (tab.mode === 'source' ? tab.cm?.scrollDOM.scrollTop : tab.vdHost?.querySelector('.vditor-ir')?.scrollTop) ?? 0
  tab.content = content
  tab.savedContent = content
  tab.diskMtime = mtime
  if (tab.vditor) tab.vditor.setValue(content, true)
  if (tab.cm) {
    void import('./editors').then((m) => m.resetCmForReload(tab, content))
  }
  notify()
  requestAnimationFrame(() => {
    if (tab.mode === 'source' && tab.cm) tab.cm.scrollDOM.scrollTop = scrollTop
    else {
      const el = tab.vdHost?.querySelector('.vditor-ir') as HTMLElement | null
      if (el) el.scrollTop = scrollTop
    }
  })
}

/** 关闭标签页（有实质修改时弹应用内对话框确认）。返回是否真的关闭了。 */
export async function closeTabInteractive(tab: Tab): Promise<boolean> {
  tab.content = currentContent(tab)
  if (hasUnsavedChanges(tab)) {
    const action = await showAppDialog({
      title: t('dlg.unsavedTitle'),
      message: t('dlg.unsavedTab', { name: tab.name }),
      buttons: [
        { label: t('dlg.discard'), value: 'discard', kind: 'danger' },
        { label: t('dlg.cancel'), value: 'cancel' },
        { label: t('dlg.save'), value: 'save', kind: 'primary' },
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
