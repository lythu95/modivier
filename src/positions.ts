import type { Tab } from './state'

/**
 * 跨会话文档位置记忆：
 * - localStorage 按 path 记录 { ir: 所见即所得滚动位置, src: 源码顶行行号, at: 时间 }
 * - 打开文件时（设置开启）恢复上次位置；标签关闭 / 窗口关闭 / 切换标签时写入
 * - 容量上限 300 条，超出丢弃最旧的
 */
const POS_KEY = 'modivier:positions'
const OPT_KEY = 'modivier:remember-pos'
const MAX_ENTRIES = 300

export function rememberPositions(): boolean {
  return localStorage.getItem(OPT_KEY) !== '0' // 默认开启
}

export function toggleRememberPositions(): boolean {
  const next = rememberPositions() ? '0' : '1'
  localStorage.setItem(OPT_KEY, next)
  return next === '1'
}

interface DocPos {
  ir: number
  src: number
  at: number
}

function loadAll(): Record<string, DocPos> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') as Record<string, DocPos>
  } catch {
    return {}
  }
}

function saveAll(all: Record<string, DocPos>): void {
  localStorage.setItem(POS_KEY, JSON.stringify(all))
}

/** 当前所见即所得模式的滚动位置（找不到实际滚动容器时 0） */
export function irScrollTop(tab: Tab): number {
  const pre = tab.vdHost?.querySelector('.vditor-ir pre.vditor-reset') as HTMLElement | null
  let el: HTMLElement | null = pre
  while (el && el !== tab.vdHost) {
    if (el.scrollHeight > el.clientHeight + 1) return el.scrollTop
    el = el.parentElement
  }
  return pre?.scrollTop ?? 0
}

/** 记录一个标签的位置（路径为键；仅已保存文件） */
export function savePosition(tab: Tab): void {
  if (!tab.path || !rememberPositions()) return
  const all = loadAll()
  // 容量控制
  const keys = Object.keys(all)
  if (keys.length >= MAX_ENTRIES && !all[tab.path]) {
    keys
      .sort((a, b) => (all[a].at ?? 0) - (all[b].at ?? 0))
      .slice(0, keys.length - MAX_ENTRIES + 1)
      .forEach((k) => delete all[k])
  }
  all[tab.path] = { ir: irScrollTop(tab), src: 0, at: Date.now() }
  saveAll(all)
}

/** 读取某个路径上次的位置（设置关闭时返回 null） */
export function loadPosition(path: string): { ir: number } | null {
  if (!rememberPositions()) return null
  const pos = loadAll()[path]
  return pos && pos.ir > 0 ? { ir: pos.ir } : null
}
