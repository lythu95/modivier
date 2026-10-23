import { nativeWindow, isTauri } from '../lib/tauri'
import { showAppMenu } from './menu'

/** 自定义标题栏：菜单按钮 + 窗口控制按钮 + 最大化状态图标 */
export async function setupTitlebar(root: HTMLElement): Promise<void> {
  const menuBtn = root.querySelector<HTMLButtonElement>('#menu-btn')!
  const minBtn = root.querySelector<HTMLButtonElement>('#win-min')!
  const maxBtn = root.querySelector<HTMLButtonElement>('#win-max')!
  const closeBtn = root.querySelector<HTMLButtonElement>('#win-close')!

  menuBtn.addEventListener('click', () => showAppMenu(menuBtn))

  if (!isTauri) {
    // 浏览器调试模式下隐藏窗口控制按钮
    root.querySelector('#win-controls')?.setAttribute('style', 'display:none')
    return
  }

  const win = (await nativeWindow())!
  minBtn.addEventListener('click', () => void win.minimize())
  maxBtn.addEventListener('click', () => void win.toggleMaximize())
  closeBtn.addEventListener('click', () => void win.close())

  const refreshMaxIcon = async () => {
    const maximized = await win.isMaximized()
    maxBtn.innerHTML = maximized ? SVG_RESTORE : SVG_MAXIMIZE
    maxBtn.title = maximized ? '向下还原' : '最大化'
  }
  await win.onResized(() => void refreshMaxIcon())
  await refreshMaxIcon()
}

const SVG_MAXIMIZE =
  '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>'

const SVG_RESTORE =
  '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor"/><path d="M2.5 2.5v-2h7v7h-2" fill="none" stroke="currentColor"/></svg>'
