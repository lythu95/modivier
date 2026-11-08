#!/usr/bin/env node
/**
 * Gitee Release 本地同步脚本（替代 CI 中的同步步骤）：
 *
 *   node scripts/sync-gitee.mjs v0.2.2
 *
 * 为什么不用 GitHub Actions 同步：托管 runner 在海外，到 Gitee 的上传路由
 * 只有十几 KB/s，~60MB 产物实测要 1h15m（见 RELEASE.md 踩坑 #5）。
 * 本机（国内网络）到 Gitee 上传很快，整个同步通常 1~3 分钟。
 *
 * 行为：
 *   1. 读取 GitHub Release 的产物清单（须先由 CI 或本地发布好 GitHub Release）；
 *   2. 产物下载到系统临时目录（已有同名同大小文件则跳过，支持中断续跑）；
 *   3. Gitee 侧 Release 存在则只补传缺失附件（幂等），不存在则先推 tag 再创建；
 *   4. 上传并发 3、失败自动重试 2 次，结束核对两侧附件清单。
 *
 * Token 来源（按优先级）：--token 参数 → GITEE_TOKEN 环境变量 → git credential fill。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── 参数与凭据 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--'));
const tokenArgIdx = args.indexOf('--token');
const GITHUB_REPO = 'lythu95/modivier';
const GITEE_REPO = 'lythu/modivier';

if (!tag || !/^v/.test(tag)) {
  console.error('用法: node scripts/sync-gitee.mjs <tag>   例: node scripts/sync-gitee.mjs v0.2.2');
  process.exit(1);
}

function resolveToken() {
  if (tokenArgIdx !== -1 && args[tokenArgIdx + 1]) return args[tokenArgIdx + 1];
  if (process.env.GITEE_TOKEN) return process.env.GITEE_TOKEN;
  console.error(
    '未找到 Gitee Token（PAT）。注意：git push 用的账号密码不能调 Gitee API（401 Access token does not exist）。\n' +
    '提供方式任选其一：\n' +
    '  1. 环境变量：set GITEE_TOKEN=<PAT>（与 GitHub 仓库 Secrets 里那份相同即可，gitee.com → 设置 → 私人令牌 生成，需 projects 权限）\n' +
    '  2. 参数：node scripts/sync-gitee.mjs ' + tag + ' --token <PAT>'
  );
  process.exit(1);
}
const TOKEN = resolveToken();

// ── Release 说明（与 CI 的 GitHub Release 保持一致） ─────────────────────────
const RELEASE_BODY = `**MoDiViEr —— MarkDown Viewer and Editor**

| 平台 | 安装包 |
| --- | --- |
| Windows | \`modivier_*_x64-setup.exe\`（安装包）/ \`modivier_*_x64_portable.exe\`（便携单文件，免安装） |
| macOS | \`modivier_*.dmg\`（Intel / Apple Silicon 通用）/ \`modivier_*_macos_universal_portable\`（便携单文件） |
| Linux | \`modivier_*.deb\`（Debian/Ubuntu）、\`modivier-*.rpm\`（Fedora/openSUSE）/ \`modivier_*_linux_x64_portable\`（便携单文件，免安装） |

> macOS 安装包未签名，首次打开需右键 → 打开。便携单文件下载后需 \`chmod +x\`（Linux 可直接运行；macOS 另需去除 quarantine 标记）。运行便携版仍需系统 WebView 运行时（详见 README）。`;

const GH_API = `https://api.github.com/repos/${GITHUB_REPO}`;
const GT_API = `https://gitee.com/api/v5/repos/${GITEE_REPO}`;
const gt = (path) => `${GT_API}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;

async function jfetch(url, opts = {}, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: res.status, ok: res.ok, body };
    } catch (e) {
      if (i === tries) throw e;
      console.log(`  请求失败（${e.message}），${i * 5}s 后重试 ${i}/${tries - 1}...`);
      await new Promise((r) => setTimeout(r, i * 5000));
    }
  }
}

// ── 1. GitHub Release 产物清单 ───────────────────────────────────────────────
console.log(`[1/4] 读取 GitHub Release ${tag} ...`);
const gh = await jfetch(`${GH_API}/releases/tags/${tag}`, { headers: { 'User-Agent': 'gitee-sync' } });
if (gh.status === 404) {
  console.error(`GitHub 上不存在 ${tag} 的 Release。请先推 tag 触发 CI（或等 CI 完成）再执行同步。`);
  process.exit(1);
}
if (!gh.ok) {
  console.error(`读取 GitHub Release 失败（${gh.status}）: ${JSON.stringify(gh.body).slice(0, 300)}`);
  process.exit(1);
}
// 记录 asset id：下载走 API octet-stream（github.com 网页域在国内网络经常 504，
// api.github.com 的 octet-stream 直连可用；两者最终指向同一 CDN 文件）
const ghAssets = gh.body.assets.map((a) => ({ name: a.name, id: a.id, size: a.size, url: a.browser_download_url }));
if (ghAssets.length === 0) {
  console.error('GitHub Release 下没有产物，异常退出。');
  process.exit(1);
}
console.log(`  GitHub 产物 ${ghAssets.length} 个：${ghAssets.map((a) => a.name).join('、')}`);

// ── 2. 下载产物到临时目录（同名同大小则跳过；curl 断点续传 + 自动重试） ───────
console.log('[2/4] 下载产物（国内到 GitHub 可能较慢，中断后重跑会跳过已完成的）...');
const dlDir = join(tmpdir(), 'gitee-sync', tag);
mkdirSync(dlDir, { recursive: true });
for (const a of ghAssets) {
  const dest = join(dlDir, a.name);
  if (existsSync(dest) && statSync(dest).size === a.size) {
    console.log(`  已有，跳过下载: ${a.name}`);
    continue;
  }
  process.stdout.write(`  下载 ${a.name} (${(a.size / 1024 / 1024).toFixed(1)}MB) ... `);
  // octet-stream 直连 api.github.com（绕开 github.com 网页域的 504）；
  // curl：-C - 断点续传，--retry 自动重试（含 504 等瞬断），-f 对 HTTP 错误返回非零。
  // 注意：该路线计入 GitHub API 匿名限额（60/小时），配置 GITHUB_TOKEN 环境变量可提升到 5000。
  const auth = process.env.GITHUB_TOKEN ? ['-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`] : [];
  const r = spawnSync('curl', [
    '-L', '-f', '-C', '-', '--retry', '5', '--retry-delay', '5', '--retry-all-errors',
    '--connect-timeout', '20', '--max-time', '900',
    '-H', 'Accept: application/octet-stream',
    '-H', 'User-Agent: gitee-sync',
    ...auth,
    '-o', dest,
    `${GH_API}/releases/assets/${a.id}`,
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const size = existsSync(dest) ? statSync(dest).size : 0;
  if (r.status !== 0 || size !== a.size) {
    console.log(`失败（curl exit=${r.status}, size=${size}/${a.size}），请重跑本脚本续传`);
    process.exit(1);
  }
  console.log('完成');
}

// ── 3. Gitee Release：存在则补传缺失，不存在则创建 ────────────────────────────
console.log('[3/4] 同步到 Gitee ...');
const existing = await jfetch(gt(`/releases/tags/${tag}`));
let rid = '';
if (existing.ok && existing.body?.id) {
  rid = existing.body.id;
  console.log(`  Gitee Release 已存在（id=${rid}），只补传缺失附件`);
} else {
  // 确保Gitee 侧 tag 存在（正常发版时 tag 已随 push 到 gitee，这里兜底）
  const sha = spawnSync('git', ['rev-list', '-1', tag], { encoding: 'utf8' }).stdout?.trim();
  if (sha) {
    const push = spawnSync('git', ['push', `https://oauth2:${TOKEN}@gitee.com/${GITEE_REPO}.git`, `${sha}:refs/tags/${tag}`, '--force'], { encoding: 'utf8' });
    if (push.status !== 0) console.log('  ::warning::tag 推送到 Gitee 失败，Release 将不关联 tag');
  }
  const payload = {
    access_token: TOKEN,
    tag_name: tag,
    name: `MoDiViEr ${tag}`,
    body: RELEASE_BODY,
    prerelease: tag.includes('-'),
    target_commitish: sha || undefined,
  };
  const created = await jfetch(`${GT_API}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!created.ok || !created.body?.id) {
    console.error(`创建 Gitee Release 失败（${created.status}）: ${JSON.stringify(created.body).slice(0, 300)}`);
    process.exit(1);
  }
  rid = created.body.id;
  console.log(`  Gitee Release 已创建（id=${rid}）`);
}

// 现有附件清单：Gitee 附件 API 的 size 字段恒为 null，只能按文件名判断是否需要补传
const cur = await jfetch(gt(`/releases/${rid}`));
const assets = cur.body.assets ?? [];

// 同名附件去重：attach_files 不覆盖同名文件，历史残留（如 CI 时代重复上传）会累积。
// 保留每个文件名最早的一个，删除其余（删除接口对 404/405 容错，不影响后续流程）
const seenNames = new Set();
const dupIds = [];
for (const a of assets) {
  if (seenNames.has(a.name)) dupIds.push(a.id);
  else seenNames.add(a.name);
}
if (dupIds.length) {
  console.log(`  发现 ${dupIds.length} 个重复同名附件，清理（同名保留一份）...`);
  for (const id of dupIds) {
    const del = await jfetch(`/releases/${rid}/attach_files/${id}`, { method: 'DELETE' });
    console.log(`    删除附件 ${id}: HTTP ${del.status}${del.ok ? '' : '（如 404/405 表示接口不可用，请到 Gitee 网页手动删除同名附件）'}`);
  }
}

// 有删除动作时重新拉取最新附件清单
const cur2 = dupIds.length ? await jfetch(gt(`/releases/${rid}`)) : cur;
const giteeNames2 = new Set((cur2.body.assets ?? []).map((a) => a.name));
const toUpload = ghAssets.filter((a) => !giteeNames2.has(a.name));
if (toUpload.length === 0) {
  console.log('  Gitee 附件已齐全，无需上传');
} else {
  console.log(`  待上传 ${toUpload.length} 个: ${toUpload.map((a) => a.name).join('、')}`);
  let ok = 0;
  const upload = async (asset) => {
    const form = new FormData();
    form.append('access_token', TOKEN);
    const buf = await import('node:fs').then((fs) => fs.readFileSync(join(dlDir, asset.name)));
    form.append('file', new Blob([buf]), asset.name);
    for (let i = 1; i <= 3; i++) {
      try {
        const res = await fetch(`${GT_API}/releases/${rid}/attach_files`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(600_000),
        });
        if (res.ok) { console.log(`  Uploaded ${asset.name} (${res.status})`); ok++; return; }
        const t = await res.text();
        if (i < 3) { console.log(`  ${asset.name} 上传失败（${res.status}），重试 ${i}/2...`); await new Promise((r) => setTimeout(r, 5000)); continue; }
        console.log(`  Upload FAILED ${asset.name} (${res.status}): ${t.slice(0, 200)}`);
      } catch (e) {
        if (i < 3) { console.log(`  ${asset.name} 上传异常（${e.message}），重试 ${i}/2...`); await new Promise((r) => setTimeout(r, 5000)); continue; }
        console.log(`  Upload FAILED ${asset.name}: ${e.message}`);
      }
    }
  };
  // 并发 3：Gitee 对单连接限速，多路并发能显著缩短总时长
  const queue = [...toUpload];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await upload(queue.shift());
  }));
  if (ok !== toUpload.length) {
    console.error('部分附件上传失败，请重跑本脚本续传（已成功的会自动跳过）。');
    process.exit(1);
  }
}

// ── 4. 核对：逐个 HEAD 下载链接取真实文件大小（Gitee 列表 API 无 size） ────────
console.log('[4/4] 核对 Gitee 附件清单 ...');
let allOk = true;
for (const a of ghAssets) {
  let ok = false;
  try {
    const res = await fetch(
      `https://gitee.com/${GITEE_REPO}/releases/download/${tag}/${encodeURIComponent(a.name)}`,
      { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) },
    );
    ok = res.ok && Number(res.headers.get('content-length')) === a.size;
  } catch { /* fallthrough */ }
  if (!ok) allOk = false;
  console.log(`  ${ok ? '✓' : '✗'} ${a.name} (${(a.size / 1024 / 1024).toFixed(1)}MB)`);
}
console.log(allOk
  ? `Gitee Release 同步完成: https://gitee.com/lythu/modivier/releases/tag/${tag}`
  : '⚠️ 附件仍有缺失或大小不符，请检查上方 ✗ 项后重跑本脚本');
process.exit(allOk ? 0 : 1);
