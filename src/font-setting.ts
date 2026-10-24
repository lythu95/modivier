import { showChoiceDialog } from './ui/dialog'
import { t } from './i18n'

/** 源码模式字体设置：候选里只显示本机已安装的字体，选择持久化 */

const KEY = 'modivier:source-font'

export const DEFAULT_STACK = `Consolas, 'Courier New', 'Microsoft YaHei', monospace`

const CANDIDATES = [
  'Cascadia Code',
  'Cascadia Mono',
  'Consolas',
  'Courier New',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Sarasa Mono SC',
  'Sarasa Fixed SC',
  'Microsoft YaHei',
]

function storedFont(): string | null {
  return localStorage.getItem(KEY)
}

export function sourceFontStack(): string {
  const font = storedFont()
  return font ? `"${font}", ${DEFAULT_STACK}` : DEFAULT_STACK
}

export function applySourceFont(): void {
  document.documentElement.style.setProperty('--source-font', sourceFontStack())
}

function fontInstalled(name: string): boolean {
  try {
    return document.fonts.check(`12px "${name}"`)
  } catch {
    return false
  }
}

export async function pickSourceFont(): Promise<void> {
  const current = storedFont()
  const options = [
    {
      label: t('font.default'),
      value: '',
      selected: current === null,
      fontFamily: DEFAULT_STACK,
    },
    ...CANDIDATES.filter(fontInstalled).map((f) => ({
      label: f,
      value: f,
      selected: current === f,
      fontFamily: `"${f}", ${DEFAULT_STACK}`,
    })),
  ]
  const picked = await showChoiceDialog({ title: t('dlg.fontTitle'), options })
  if (picked === null) return
  if (picked === '') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, picked)
  applySourceFont()
}
