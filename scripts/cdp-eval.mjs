// 通过 CDP 在 MoDiViEr WebView 内执行表达式
// 用法: node scripts/cdp-eval.mjs "<表达式>"
import WebSocket from 'ws'

const expr = process.argv[2]
if (!expr) {
  console.error('usage: node cdp-eval.mjs "<expr>"')
  process.exit(1)
}

const list = await (await fetch('http://localhost:9222/json')).json()
const page = list.find((t) => t.type === 'page')
if (!page) {
  console.error('no page target')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })

const id = 1
const result = await new Promise((resolve) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.id === id) resolve(msg.result ?? msg.error)
  })
  ws.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression: expr, awaitPromise: true, returnByValue: true },
  }))
})

console.log(JSON.stringify(result, null, 2))
ws.close()
process.exit(0)
