/** 应用内多语言。语种刻意收敛到最常用的几种，需要时再加字典即可。 */
export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja'

type Dict = Record<string, string>

const zhCN: Dict = {
  'menu.open': '打开文件…',
  'menu.newFile': '新建文件',
  'menu.save': '保存',
  'menu.saveAs': '另存为…',
  'menu.toggleMode': '切换 Markdown / 源码模式',
  'menu.themeDark': '深色主题',
  'menu.themeLight': '浅色主题',
  'menu.closeTab': '关闭标签页',
  'menu.language': '语言',
  'menu.about': '关于 {name}',
  'dlg.unsavedTitle': '未保存的修改',
  'dlg.unsavedTab': '“{name}”尚未保存，关闭后将丢失修改。',
  'dlg.unsavedExit': '有标签页尚未保存，退出将丢失这些修改。确定退出吗？',
  'dlg.discard': '不保存',
  'dlg.cancel': '取消',
  'dlg.save': '保存',
  'dlg.discardExit': '退出并丢弃',
  'dlg.ok': '确定',
  'dlg.openFail': '打开失败',
  'dlg.saveFail': '保存失败',
  'dlg.aboutTitle': '关于',
  'dlg.version': '版本 {v}',
  'common.open': '打开文件',
  'common.newFile': '新建文件',
  'untitled': '未命名-{n}',
  'welcome.dropHint': '拖入 .md 文件打开',
  'welcome.modeHint': '在 Markdown 与源码模式之间切换',
  'welcome.newHint': '新建文件',
  'ctx.closeTab': '关闭标签页',
  'ctx.closeOthers': '关闭其他标签页',
  'ctx.copyPath': '复制文件路径',
  'ctx.reveal': '在资源管理器中显示',
  'status.chars': '{n} 字',
  'status.pos': '行 {ln}，列 {col}',
  'status.selected': '已选 {n} 字',
  'sb.markdown': 'Markdown',
  'sb.source': 'Source',
  'tt.menu': '菜单',
  'tt.newFile': '新建文件 (Ctrl+N)',
  'tt.closeTab': '关闭 (Ctrl+W)',
  'tt.min': '最小化',
  'tt.max': '最大化',
  'tt.restore': '向下还原',
  'tt.close': '关闭',
}

const zhTW: Dict = {
  'menu.open': '開啟檔案…',
  'menu.newFile': '新增檔案',
  'menu.save': '儲存',
  'menu.saveAs': '另存新檔…',
  'menu.toggleMode': '切換 Markdown / 原始碼模式',
  'menu.themeDark': '深色主題',
  'menu.themeLight': '淺色主題',
  'menu.closeTab': '關閉分頁',
  'menu.language': '語言',
  'menu.about': '關於 {name}',
  'dlg.unsavedTitle': '未儲存的變更',
  'dlg.unsavedTab': '「{name}」尚未儲存，關閉後將遺失修改。',
  'dlg.unsavedExit': '有分頁尚未儲存，離開將遺失這些修改。確定離開嗎？',
  'dlg.discard': '不儲存',
  'dlg.cancel': '取消',
  'dlg.save': '儲存',
  'dlg.discardExit': '丟棄並離開',
  'dlg.ok': '確定',
  'dlg.openFail': '開啟失敗',
  'dlg.saveFail': '儲存失敗',
  'dlg.aboutTitle': '關於',
  'dlg.version': '版本 {v}',
  'common.open': '開啟檔案',
  'common.newFile': '新增檔案',
  'untitled': '未命名-{n}',
  'welcome.dropHint': '拖入 .md 檔案即可開啟',
  'welcome.modeHint': '在 Markdown 與原始碼模式之間切換',
  'welcome.newHint': '新增檔案',
  'ctx.closeTab': '關閉分頁',
  'ctx.closeOthers': '關閉其他分頁',
  'ctx.copyPath': '複製檔案路徑',
  'ctx.reveal': '在檔案總管中顯示',
  'status.chars': '{n} 字',
  'status.pos': '行 {ln}，列 {col}',
  'status.selected': '已選取 {n} 字',
  'sb.markdown': 'Markdown',
  'sb.source': 'Source',
  'tt.menu': '選單',
  'tt.newFile': '新增檔案 (Ctrl+N)',
  'tt.closeTab': '關閉 (Ctrl+W)',
  'tt.min': '最小化',
  'tt.max': '最大化',
  'tt.restore': '還原',
  'tt.close': '關閉',
}

const en: Dict = {
  'menu.open': 'Open File…',
  'menu.newFile': 'New File',
  'menu.save': 'Save',
  'menu.saveAs': 'Save As…',
  'menu.toggleMode': 'Toggle Markdown / Source Mode',
  'menu.themeDark': 'Dark Theme',
  'menu.themeLight': 'Light Theme',
  'menu.closeTab': 'Close Tab',
  'menu.language': 'Language',
  'menu.about': 'About {name}',
  'dlg.unsavedTitle': 'Unsaved Changes',
  'dlg.unsavedTab': '"{name}" has unsaved changes that will be lost if closed.',
  'dlg.unsavedExit': 'Some tabs have unsaved changes. Discard them and exit?',
  'dlg.discard': 'Discard',
  'dlg.cancel': 'Cancel',
  'dlg.save': 'Save',
  'dlg.discardExit': 'Discard & Exit',
  'dlg.ok': 'OK',
  'dlg.openFail': 'Failed to Open',
  'dlg.saveFail': 'Failed to Save',
  'dlg.aboutTitle': 'About',
  'dlg.version': 'Version {v}',
  'common.open': 'Open File',
  'common.newFile': 'New File',
  'untitled': 'Untitled-{n}',
  'welcome.dropHint': 'Drag & drop a .md file to open',
  'welcome.modeHint': 'Switch between Markdown and Source mode',
  'welcome.newHint': 'New file',
  'ctx.closeTab': 'Close Tab',
  'ctx.closeOthers': 'Close Other Tabs',
  'ctx.copyPath': 'Copy File Path',
  'ctx.reveal': 'Reveal in Explorer',
  'status.chars': '{n} chars',
  'status.pos': 'Ln {ln}, Col {col}',
  'status.selected': '{n} selected',
  'sb.markdown': 'Markdown',
  'sb.source': 'Source',
  'tt.menu': 'Menu',
  'tt.newFile': 'New File (Ctrl+N)',
  'tt.closeTab': 'Close (Ctrl+W)',
  'tt.min': 'Minimize',
  'tt.max': 'Maximize',
  'tt.restore': 'Restore',
  'tt.close': 'Close',
}

const ja: Dict = {
  'menu.open': 'ファイルを開く…',
  'menu.newFile': '新規ファイル',
  'menu.save': '保存',
  'menu.saveAs': '名前を付けて保存…',
  'menu.toggleMode': 'Markdown / ソースモード切替',
  'menu.themeDark': 'ダークテーマ',
  'menu.themeLight': 'ライトテーマ',
  'menu.closeTab': 'タブを閉じる',
  'menu.language': '言語',
  'menu.about': '{name} について',
  'dlg.unsavedTitle': '未保存の変更',
  'dlg.unsavedTab': '「{name}」に未保存の変更があります。閉じると失われます。',
  'dlg.unsavedExit': '未保存のタブがあります。破棄して終了しますか？',
  'dlg.discard': '保存しない',
  'dlg.cancel': 'キャンセル',
  'dlg.save': '保存',
  'dlg.discardExit': '破棄して終了',
  'dlg.ok': 'OK',
  'dlg.openFail': '開けませんでした',
  'dlg.saveFail': '保存できませんでした',
  'dlg.aboutTitle': '情報',
  'dlg.version': 'バージョン {v}',
  'common.open': 'ファイルを開く',
  'common.newFile': '新規ファイル',
  'untitled': '無題-{n}',
  'welcome.dropHint': '.md ファイルをドラッグして開く',
  'welcome.modeHint': 'Markdown とソースモードを切り替える',
  'welcome.newHint': '新規ファイル',
  'ctx.closeTab': 'タブを閉じる',
  'ctx.closeOthers': '他のタブを閉じる',
  'ctx.copyPath': 'ファイルパスをコピー',
  'ctx.reveal': 'エクスプローラーで表示',
  'status.chars': '{n} 文字',
  'status.pos': '行 {ln}、列 {col}',
  'status.selected': '{n} 文字選択',
  'sb.markdown': 'Markdown',
  'sb.source': 'Source',
  'tt.menu': 'メニュー',
  'tt.newFile': '新規ファイル (Ctrl+N)',
  'tt.closeTab': '閉じる (Ctrl+W)',
  'tt.min': '最小化',
  'tt.max': '最大化',
  'tt.restore': '元に戻す',
  'tt.close': '閉じる',
}

const messages: Record<Locale, Dict> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  ja,
}

/** 语言选择菜单；名称始终用各自语言原文显示 */
export const LANGUAGES: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

/** 应用语言 → Vditor 编辑器语言 */
export function vditorLang(): string {
  switch (current) {
    case 'zh-TW':
      return 'zh_TW'
    case 'en':
      return 'en_US'
    case 'ja':
      return 'jp'
    default:
      return 'zh_CN'
  }
}

const KEY = 'modivier:locale'
const listeners = new Set<() => void>()

function detect(): Locale {
  const saved = localStorage.getItem(KEY)
  if (saved && saved in messages) return saved as Locale
  const nav = navigator.language
  if (nav.startsWith('zh')) return /TW|HK|MO/i.test(nav) ? 'zh-TW' : 'zh-CN'
  if (nav.startsWith('ja')) return 'ja'
  return 'en'
}

let current: Locale = detect()

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale): void {
  if (locale === current) return
  current = locale
  localStorage.setItem(KEY, locale)
  document.documentElement.lang = locale
  for (const fn of listeners) fn()
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = messages[current][key] ?? messages['zh-CN'][key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

export function initLocale(): void {
  document.documentElement.lang = current
}
