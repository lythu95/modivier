// 将 vditor 的 dist 资源复制到 public/vditor，
// 使其懒加载的 highlight/katex/mermaid 等资源完全本地化，离线可用。
// 体积裁剪：未使用的重型渲染器（mathjax/graphviz/echarts/markmap 等，
// 约 11MB）不进入打包，缩小 exe、加快冷启动扫描。
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'node_modules/vditor/dist')
const dest = join(root, 'public/vditor/dist')

if (!existsSync(src)) {
  console.error('未找到 node_modules/vditor/dist，请先执行 npm install')
  process.exit(1)
}

cpSync(src, dest, { recursive: true, force: true })

const EXCLUDE = [
  'js/mathjax', // 数学渲染用的是 KaTeX
  'js/graphviz',
  'js/echarts',
  'js/markmap',
  'js/abcjs',
  'js/smiles-drawer',
]
for (const rel of EXCLUDE) {
  rmSync(join(dest, rel), { recursive: true, force: true })
}

console.log('已复制 vditor 静态资源到 public/vditor/dist（已裁剪未用渲染器）')
