# 发布指南（维护者向）

> 发布全流程已由 [.github/workflows/release.yml](../.github/workflows/release.yml) 自动化：
> **推 tag 即完成「三平台编译 + GitHub / Gitee 双平台 Release」**，约 10~20 分钟。
> 本文记录操作步骤、踩坑记录与排查方法。首次跑通 v0.1.0 用了 10 次运行迭代，坑都在这里。

## 快速发版（Happy Path）

1. **同步版本号（三处 + tag，必须一致）**：
   - `package.json`
   - `src-tauri/tauri.conf.json` ← **产物文件名由此决定**
   - `src-tauri/Cargo.toml`（改完可跑 `cargo check --manifest-path src-tauri/Cargo.toml` 顺带刷新 Cargo.lock）
2. commit 并推送 main 到两个远程：`git push github main && git push gitee main`
3. 打 tag 并**同时推两个远程**：

   ```bash
   git tag vX.y.z
   git push github vX.y.z
   git push gitee vX.y.z
   ```

4. 到 GitHub → Actions 看运行，全绿即发布完成，用下面的命令验证双平台资产。
5. 如产物命名/组合有变化，同步更新四份 README 的「下载与安装」章节。

**两条铁律**：

- tag 里带 `-`（如 `v0.2.0-rc.1`）会自动标记为 prerelease（GitHub 与 Gitee 都会）；正式版 tag 不要带 `-`。
- tag 必须同时推 Gitee：Gitee Release 需要 tag 关联 commit。CI 里有兜底推 tag（见踩坑 #3），但不要依赖它。

## 产物对照表

| 平台 | 文件名 | 体积参考 | 版本号来源 |
| --- | --- | --- | --- |
| Windows 安装包 | `modivier_<版本>_x64-setup.exe` | ~5MB | tauri.conf.json |
| Windows 便携单文件 | `modivier_<tag>_x64_portable.exe` | ~10MB | **tag**（workflow 里改名） |
| macOS 通用 | `modivier_<版本>_universal.dmg` | ~10.6MB | tauri.conf.json |
| Linux | `modivier_<版本>_amd64.deb` | ~5.7MB | tauri.conf.json |
| Linux | `modivier-<版本>-1.x86_64.rpm` | ~5.8MB | tauri.conf.json |

便携 exe 的名字取自 tag、其余取自 tauri.conf.json——**tag 与配置版本号不一致时文件名会对不上**，发布前务必核对。

平台打包行为由 `src-tauri/tauri.{windows,macos,linux}.conf.json` 控制（按平台自动合并，主配置 `bundle.targets` 留空）：
Windows=nsis、macOS=dmg（universal 双架构）、Linux=deb+rpm。

## 自动化流程（release.yml 做了什么）

1. **build 矩阵**（三平台并行）：Rust 缓存 + npm ci（postinstall 重建 vditor 资源）→ `npm run tauri build` → 产物 upload-artifact
   - Windows 额外一步：把 `src-tauri/target/release/modivier.exe` 复制为 `bundles/modivier_<tag>_x64_portable.exe`
2. **release 任务**（仅 tag 触发）：
   - 下载全部 artifact 并**摊平到 `dist/` 根目录**（见踩坑 #5）
   - GitHub Release：`softprops/action-gh-release@v3`（按 tag 复用/更新，重跑幂等；tag 带 `-` 自动 prerelease）
   - Gitee Release：自研 bash 步骤——删同 tag 旧 Release → 兜底 git push tag → 建 Release → 逐个 `attach_files` 上传 `dist/*`（删旧建新，天然幂等）
   - 未配置 `GITEE_TOKEN` secret 时自动跳过 Gitee 同步并输出告警
3. Gitee Release 页面自动附带的源码 `zip` / `tar.gz` 是 Gitee 官方行为，不是错误。

## 踩坑记录（现象 → 根因 → 解决）

### 1. Gitee 附件上传 400：multipart 字段名必须是 `file`

- **现象**：Release 创建成功但安装包全部缺失，`attach_files` 返回 400。
- **根因**：字段名写成 `attachment`；Gitee 要求 multipart 字段名必须是 `file`（从 release-sync 的可用实现里核实）。
- **解决**：`curl -F "access_token=$GITEE_TOKEN" -F "file=@dist/xxx"`。注意 token 放 form 字段即可，不需要 query。

### 2. Gitee 建 Release 400：`target_commitish` 必传

- **现象**：tag 已存在，创建 Release 仍失败。
- **根因**：Gitee 的 `POST /releases` 要求 `target_commitish`（commit/分支）必传，缺失即 400。
- **解决**：payload 里带 `target_commitish: <tag 指向的 commit sha>`。

### 3. Gitee tags REST API 不可信

- **现象**：tag 实际存在（`git ls-remote` / `git push` 可见），但 `GET /repos/{o}/{r}/tags/{tag}` 返回 404。
- **教训**：不要用这个接口判断 tag 是否存在。CI 里不依赖它，直接 `git push "https://oauth2:$TOKEN@gitee.com/..." HEAD:refs/tags/<tag> --force` 兜底（失败仅告警，不阻断）。

### 4. YuZhiYuanOrg/release-sync 不幂等，已弃用

- **现象**：同一 tag 重跑发布时，GitHub 侧报 422 already_exists。
- **根因**：其 README 声称"复用已有 Release、覆盖同名资产"，实现却是裸 `createRelease`，没有查重逻辑。
- **解决**：GitHub 发布改用 `softprops/action-gh-release@v3`（按 tag 复用、同名资产自动覆盖）；Gitee 同步用 workflow 里的自研步骤。第三方"同步双平台"类 action 引用前先读源码。

### 5. upload-artifact 目录层级导致通配失配

- **现象**：`dist/*.deb`、`dist/*.rpm` 匹配不到文件，Linux 资产没进 Release。
- **根因**：artifact 含多个文件时，upload-artifact 以公共祖先目录为根保留层级（`dist/deb/…`、`dist/rpm/…`），单文件 artifact 则平铺——通配 `dist/*.deb` 只对后者有效。
- **解决**：release 任务下载后统一摊平：`find dist -mindepth 2 -type f -exec mv {} dist/ \;` 再删空目录。

### 6. `git rebase` 解冲突时 `--theirs` 指自己（反直觉）

- **现象**：rebase 保冲突文件时"取远程版本"，结果远程配置被自己的旧版本覆盖，CI 缺 rpm。
- **根因**：rebase 语义与 merge 相反——`ours` = 变基onto的上游，`theirs` = 自己被重放的提交。
- **解决**：rebase 解冲突前先 `git show <remote>/<branch>:<file>` 看双方内容再动手；拿不准就 cat 出来对比。

### 7. actions 的 Node 20 弃用告警

- **现象**：每次运行刷一排 `Node.js 20 is deprecated … forced to run on Node.js 24` 警告。
- **解决**：升级 action 大版本（均为 2026-10 时点的 Node24 版本）：`actions/checkout@v7`、`actions/setup-node@v7`、`actions/upload-artifact@v7`、`actions/download-artifact@v8`、`softprops/action-gh-release@v3`。大版本升级后跑一次全流程验证输入参数兼容。

### 8. 中文路径参数导致应用"读取失败"

- **现象**（与 CI 无关，本地测试时发现）：向 `modivier.exe` 传含中文用户名的文件路径，报 `读取失败：系统找不到指定的路径。(os error 3)`。
- **根因**：命令行参数的编码处理在某处按窄字符截断/转码。
- **状态**：待修复（不影响发布流程，影响"打开方式"传含中文路径的场景）。

## 失败排查手册

**定位**：GitHub → Actions → 看红掉的 job/step。三平台 build 失败多为代码/依赖问题；release 任务失败多为双平台 API 问题。日志需登录网页查看（API 拉日志要 admin token，匿名 403）。

**重跑**：修完代码提交后强制移 tag 即可重跑（GitHub 会复用 Release 更新资产；Gitee 会删旧建新）：

```bash
git tag -f vX.y.z
git push -f github vX.y.z
git push -f gitee vX.y.z
```

**发布状态检查**（匿名可用的验证命令）：

```bash
# GitHub Release 及资产
curl -s https://api.github.com/repos/lythu95/modivier/releases/tags/vX.y.z | jq '.name, .prerelease, .assets[].name'

# Gitee Release 及资产
curl -s https://gitee.com/api/v5/repos/lythu/modivier/releases/tags/vX.y.z | jq '.name, .assets[].name'

# workflow 运行状态
curl -s "https://api.github.com/repos/lythu95/modivier/actions/runs?per_page=3" | jq '.workflow_runs[] | {id, head_branch, status, conclusion}'
```

**配置速查**：

| 项 | 值 |
| --- | --- |
| GitHub 仓库 | `lythu95/modivier`（默认分支 main） |
| Gitee 仓库 | `lythu/modivier`（默认分支 main，注意 owner 与 GitHub 不同） |
| Gitee token secret | 仓库 Settings → Secrets → `GITEE_TOKEN`（需 repo 权限） |
| 手动测试 | workflow 支持 `workflow_dispatch`（只编译不发布） |
| 测试标签惯例 | `vX.Y.Z-test.N`（自动 prerelease，验证后删除） |
