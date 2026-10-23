/**
 * Tauri API 的统一封装。
 * 所有对 @tauri-apps/* 的调用都集中在这里，并在非 Tauri 环境（普通浏览器调试）
 * 下提供安全降级，方便用 vite dev 直接调试 UI。
 */
import type { OpenDialogOptions, SaveDialogOptions } from '@tauri-apps/plugin-dialog'

export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export async function openDialog(
  options: OpenDialogOptions,
): Promise<string | string[] | null> {
  if (!isTauri) return null
  const m = await import('@tauri-apps/plugin-dialog')
  return m.open(options)
}

export async function saveDialog(options: SaveDialogOptions): Promise<string | null> {
  if (!isTauri) return null
  const m = await import('@tauri-apps/plugin-dialog')
  return m.save(options)
}

export async function ask(message: string, title: string): Promise<boolean> {
  if (!isTauri) return window.confirm(message)
  const m = await import('@tauri-apps/plugin-dialog')
  return m.ask(message, { title, kind: 'warning' })
}

export async function alert(message: string, title: string): Promise<void> {
  if (!isTauri) {
    window.alert(message)
    return
  }
  const m = await import('@tauri-apps/plugin-dialog')
  await m.message(message, { title, kind: 'error' })
}

/** 本地文件路径 → webview 可访问的 asset 协议 URL */
export async function assetUrl(path: string): Promise<string> {
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  return convertFileSrc(path)
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener')
    return
  }
  const m = await import('@tauri-apps/plugin-opener')
  await m.openUrl(url)
}

export async function revealInDir(path: string): Promise<void> {
  const m = await import('@tauri-apps/plugin-opener')
  await m.revealItemInDir(path)
}

/** 监听单实例插件转发的“再次打开文件”事件 */
export async function onOpenFiles(cb: (paths: string[]) => void): Promise<void> {
  if (!isTauri) return
  const { listen } = await import('@tauri-apps/api/event')
  await listen<string[]>('open-files', (e) => cb(e.payload))
}

/** 监听原生拖放到窗口的文件 */
export async function onDragDrop(cb: (paths: string[]) => void): Promise<void> {
  if (!isTauri) return
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const win = getCurrentWebviewWindow()
  await win.onDragDropEvent((e) => {
    if (e.payload.type === 'drop') cb(e.payload.paths)
  })
}

export interface NativeWindow {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  isMaximized(): Promise<boolean>
  close(): Promise<void>
  destroy(): Promise<void>
  setTitle(title: string): Promise<void>
  onCloseRequested(handler: () => Promise<void>): Promise<() => void>
  onResized(handler: () => void): Promise<() => void>
}

export async function nativeWindow(): Promise<NativeWindow | null> {
  if (!isTauri) return null
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}
