import { focusActiveEditor } from '../editors'
import { t } from '../i18n'

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
    buttons: [{ label: t('dlg.ok'), value: 'ok', kind: 'primary' }],
    cancelValue: 'ok',
  }).then(() => undefined)
}

/* ---------------- 列表选择对话框（字体选择等） ---------------- */

export interface ChoiceOption {
  label: string
  value: string
  /** 预览用的 css font-family */
  fontFamily?: string
  selected?: boolean
}

/**
 * 应用内列表选择对话框：每行可带字体预览，点击选中返回 value，
 * Esc / 取消返回 null。样式与 showAppDialog 同一体系。
 */
export function showChoiceDialog(opts: {
  title: string
  options: ChoiceOption[]
}): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'dialog-overlay'
    const card = document.createElement('div')
    card.className = 'dialog-card'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')

    const title = document.createElement('div')
    title.className = 'dialog-title'
    title.textContent = opts.title
    card.appendChild(title)

    const list = document.createElement('div')
    list.className = 'dialog-list'

    let done = false
    const finish = (value: string | null) => {
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
        finish(null)
      }
    }
    window.addEventListener('keydown', onKey, true)

    for (const opt of opts.options) {
      const row = document.createElement('div')
      row.className = 'choice-row'
      if (opt.fontFamily) row.style.fontFamily = opt.fontFamily

      const check = document.createElement('span')
      check.className = 'choice-check'
      check.textContent = opt.selected ? '✓' : ''
      row.appendChild(check)

      const label = document.createElement('span')
      label.className = 'choice-label'
      label.textContent = opt.label
      row.appendChild(label)

      const sample = document.createElement('span')
      sample.className = 'choice-sample'
      sample.textContent = 'Ag 01 中文'
      row.appendChild(sample)

      row.addEventListener('click', () => finish(opt.value))
      list.appendChild(row)
    }
    card.appendChild(list)

    const actions = document.createElement('div')
    actions.className = 'dialog-actions'
    const cancel = document.createElement('button')
    cancel.className = 'btn'
    cancel.textContent = t('dlg.cancel')
    cancel.addEventListener('click', () => finish(null))
    actions.appendChild(cancel)
    card.appendChild(actions)

    overlay.appendChild(card)
    document.body.appendChild(overlay)
    openCount += 1
    cancel.focus()
  })
}
