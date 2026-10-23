import { focusActiveEditor } from '../editors'

export interface DialogButton {
  label: string
  value: string
  /** primary = 主操作（蓝色），danger = 破坏性操作（红色） */
  kind?: 'primary' | 'danger'
}

let openCount = 0

/** 有对话框打开时抑制全局快捷键等应用层输入 */
export function isDialogOpen(): boolean {
  return openCount > 0
}

/**
 * 应用内模态对话框，替代系统原生弹窗。
 * Esc / 关闭 = cancelValue；Enter 触发聚焦按钮；Tab 在按钮间循环。
 */
export function showAppDialog(opts: {
  title: string
  message: string
  buttons: DialogButton[]
  cancelValue?: string
}): Promise<string> {
  return new Promise((resolve) => {
    const cancelValue =
      opts.cancelValue ?? opts.buttons[opts.buttons.length - 1]?.value ?? 'cancel'

    const overlay = document.createElement('div')
    overlay.className = 'dialog-overlay'
    const card = document.createElement('div')
    card.className = 'dialog-card'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')

    const title = document.createElement('div')
    title.className = 'dialog-title'
    title.textContent = opts.title
    const message = document.createElement('div')
    message.className = 'dialog-message'
    message.textContent = opts.message
    const actions = document.createElement('div')
    actions.className = 'dialog-actions'

    let done = false
    const finish = (value: string) => {
      if (done) return
      done = true
      window.removeEventListener('keydown', onKey, true)
      overlay.remove()
      openCount -= 1
      resolve(value)
      focusActiveEditor()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish(cancelValue)
      } else if (e.key === 'Tab') {
        // 焦点圈定在按钮组内
        e.preventDefault()
        e.stopPropagation()
        const btns = [...actions.querySelectorAll('button')]
        if (btns.length > 0) {
          const idx = btns.indexOf(document.activeElement as HTMLButtonElement)
          const next = e.shiftKey ? (idx - 1 + btns.length) % btns.length : (idx + 1) % btns.length
          btns[next].focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)

    let defaultBtn: HTMLButtonElement | undefined
    for (const b of opts.buttons) {
      const btn = document.createElement('button')
      btn.className = 'btn' + (b.kind === 'primary' ? ' primary' : b.kind === 'danger' ? ' danger' : '')
      btn.textContent = b.label
      btn.addEventListener('click', () => finish(b.value))
      actions.appendChild(btn)
      if (b.kind === 'primary') defaultBtn = btn
    }

    card.append(title, message, actions)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    openCount += 1
    ;(defaultBtn ?? (actions.firstElementChild as HTMLButtonElement | null))?.focus()
  })
}

/** 错误/信息提示（单按钮） */
export function appAlert(message: string, title: string): Promise<void> {
  return showAppDialog({
    title,
    message,
    buttons: [{ label: '确定', value: 'ok', kind: 'primary' }],
    cancelValue: 'ok',
  }).then(() => undefined)
}
