// 将 vditor 的 dist 资源复制到 public/vditor，
// 使其懒加载的 highlight/katex/mermaid 等资源完全本地化，离线可用。
import { cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../node_modules/vditor/dist', import.meta.url))
const dest = fileURLToPath(new URL('../public/vditor/dist', import.meta.url))

if (!existsSync(src)) {
  console.error('未找到 node_modules/vditor/dist，请先执行 npm install')
  process.exit(1)
}

cpSync(src, dest, { recursive: true, force: true })
console.log('已复制 vditor 静态资源到 public/vditor/dist')
