import { assetUrl, isTauri } from './lib/tauri'

/** 将相对路径拼到基准目录上，处理 ./ ../ 和正斜杠/反斜杠 */
export function joinPath(baseDir: string, rel: string): string {
  const parts = rel.replace(/\\/g, '/').split('/')
  const cur = baseDir.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') {
      if (cur.length > 1) cur.pop()
    } else {
      cur.push(p)
    }
  }
  return cur.join('/')
}

const SKIP_SRC = /^(https?:|data:|blob:|\/\/|asset\.localhost|tauri:|about:)/i

/**
 * 监听编辑器容器内新增的 <img>，把相对于文档的图片地址改写为
 * asset 协议绝对地址，使本地图片能在所见即所得视图中直接显示。
 * Vditor 每次重渲染会重建节点，因此用 MutationObserver 持续处理。
 */
export function installImageResolver(root: HTMLElement, getBaseDir: () => string | null): void {
  if (!isTauri) return

  const rewrite = (img: HTMLImageElement) => {
    const src = img.getAttribute('src')
    if (!src || img.dataset.localResolved === '1') return
    if (SKIP_SRC.test(src) || src.startsWith('/')) return
    const base = getBaseDir()
    if (!base) return
    img.dataset.localResolved = '1'
    void assetUrl(joinPath(base, src)).then((url) => {
      img.src = url
    })
  }

  const scan = (el: ParentNode) => {
    el.querySelectorAll?.('img').forEach(rewrite)
  }
  scan(root)

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLImageElement) rewrite(node)
        else if (node instanceof HTMLElement) scan(node)
      }
    }
  })
  observer.observe(root, { childList: true, subtree: true })

  // 兜底：图片加载失败且未被处理过时再试一次（处理 Vditor 渲染时序问题）
  root.addEventListener(
    'error',
    (e) => {
      const target = e.target
      if (target instanceof HTMLImageElement && target.dataset.localResolved !== '1') {
        rewrite(target)
      }
    },
    true,
  )
}
