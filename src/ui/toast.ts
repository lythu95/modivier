/**
 * 轻量提示条：状态栏上方浮层，自动消失。多条并存纵向堆叠。
 */
const CONTAINER_ID = 'toast-container'

function ensureContainer(): HTMLElement {
  let c = document.getElementById(CONTAINER_ID)
  if (!c) {
    c = document.createElement('div')
    c.id = CONTAINER_ID
    document.body.appendChild(c)
  }
  return c
}

export function showToast(message: string, duration = 4200): void {
  const container = ensureContainer()
  const el = document.createElement('div')
  el.className = 'toast-item'
  el.textContent = message
  container.appendChild(el)
  // 下一帧再入场，保证过渡动画生效
  requestAnimationFrame(() => el.classList.add('show'))
  window.setTimeout(() => {
    el.classList.remove('show')
    window.setTimeout(() => el.remove(), 300)
  }, duration)
}
