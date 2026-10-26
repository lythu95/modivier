<div align="center">

<img src="src-tauri/icons/icon.png" width="88" alt="MoDiViEr" />

# MoDiViEr

**MarkDown Viewer and Editor — a lightweight Markdown viewer & editor inspired by Typora**

[![Release](https://img.shields.io/github/v/release/lythu95/modivier)](https://github.com/lythu95/modivier/releases)
[![License](https://img.shields.io/github/license/lythu95/modivier)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=000)](https://v2.tauri.app)
[![Platform](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows11&logoColor=fff)](https://www.microsoft.com/windows)
[![Platform](https://img.shields.io/badge/macOS-10.13%2B-000000?logo=apple&logoColor=fff)](https://www.apple.com/macos)
[![Installer](https://img.shields.io/badge/installer-%7E5MB-brightgreen)](../../releases)

[简体中文](./README.md) ｜ [繁體中文](./README_ZH-TW.md) ｜ **English** ｜ [日本語](./README_JA.md)

</div>

Built with [Tauri 2](https://v2.tauri.app). The design goal is *"light, fast, simple"*: cold start ≈ 0.5 s, installer ≈ 5 MB, memory ≈ 80 MB — it keeps only viewing and the most essential editing.

<div align="center">
  <table><tr>
    <td align="center"><img src="docs/homepage.png" width="420" alt="Home" /><br/><sub>Home</sub></td>
    <td align="center"><img src="docs/screenshot.png" width="420" alt="Editor" /><br/><sub>Editor</sub></td>
  </tr></table>
</div>

## Why

- Typora went paid;
- VSCode is overkill for opening a single `.md` file: slow startup, and most of its features go unused in this scenario;
- The goal is a Markdown tool as straightforward as Notepad — **view and edit**, nothing else (no printing, no cloud sync, no plugin system).

## Features

- **WYSIWYG editing** (Vditor instant-rendering mode, the closest to Typora: the block under the cursor shows its source while everything else renders)
- **Source mode** (CodeMirror 6, `Ctrl+/` toggles both ways, content stays in sync)
- **Outline view** (heading tree on the left, hierarchical collapse/expand, click to jump; expanded by default, collapsible to a slim bar, `Ctrl+Shift+O`)
- **Multiple tabs** (drag files in, `Ctrl+O`, `Ctrl+N`, middle-click / `Ctrl+W` to close, `Ctrl+Tab` to cycle, `Ctrl+1..9` to jump directly)
- **Status bar** (line/column, selected & total character count; Markdown/Source and Light/Dark toggles at bottom right)
- **UI languages** (简体中文 / 繁體中文 / English / 日本語, switched in the menu, follows the system on first run)
- **Local images**: relative-path images inside the Markdown are resolved and displayed
- **Light / dark theme** (follows the system initially, remembered after manual toggle)
- **VSCode-style full-width scrolling**: content is centered, but scrolling anywhere in the content area scrolls the document
- **Encoding tolerant**: reads UTF-8 / UTF-8 BOM / GBK; always saves UTF-8 (no BOM)
- **Startup performance**: the large editor modules (Vditor/CodeMirror) are code-split and loaded on demand, the window shows first, and unused vditor renderers (mathjax/graphviz/echarts…) are trimmed from the bundle; cold start ≈ 0.5–0.7 s, installer ≈ 5 MB
- **Single instance + file association**: double-clicking `.md` (or "Open with") focuses the running window and opens a new tab. Windows: the installer registers `.md` / `.markdown` associations, and the portable build can register itself from the menu ("Associate .md files", per-user, no admin needed); macOS: drag the app into Applications, then pick it in Finder's "Open With" — double-click just works; Linux: deb/rpm packages ship the MIME associations
- **Window state memory**: size, position and maximized state are saved automatically and restored on next launch
- Drop files onto the window to open them; closing unsaved tabs/windows asks for confirmation (normalization during load doesn't count as a modification, so untouched files close silently)

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open file |
| `Ctrl+N` | New file |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save as |
| `Ctrl+/` | Toggle Markdown / source mode |
| `Ctrl+Shift+O` | Toggle outline view |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1` … `Ctrl+9` | Go to tab n |

## Download & install

Installers for all platforms are available on the [Releases](../../releases) page.

**Windows**: grab `modivier_x.y.z_x64-setup.exe` (a ~5 MB NSIS installer) — it registers `.md` / `.markdown` associations, so double-clicking a Markdown file opens it right away. For a portable setup, download `modivier_x.y.z_x64_portable.exe` (single file, no install) and use the menu item "Associate .md files" to register it with the system's "Open with" list (per-user, no admin needed). Windows 10 / 11 ships WebView2 — no extra runtime required.

**macOS** (Intel & Apple Silicon universal): download `modivier_x.y.z_universal.dmg`, drag MoDiViEr.app into Applications and launch it once; then right-click a `.md` file → Open With → MoDiViEr, or set it as the default via Get Info (⌘I) → "Open with" → "Change All…". Double-clicking now opens the file directly (a second file opens as a new tab in the running window). The bundle is unsigned: if Gatekeeper blocks the first launch, right-click → Open.

**Linux**: `npm run tauri build` produces deb / rpm packages (Markdown MIME associations included); build an AppImage on demand with `npx tauri build --bundles appimage`.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) stable (MSVC toolchain on Windows)
- Windows 10/11 (WebView2 included), macOS 10.13+, or Linux (WebKitGTK 4.1 and friends)

### Common commands

```bash
npm install         # install dependencies (postinstall copies vditor static assets to public/vditor)
npm run tauri dev   # develop with Tauri
npm run tauri build # bundle into src-tauri/target/release/bundle/: NSIS on Windows, DMG on macOS, deb/rpm on Linux
```

`npm run dev` debugs the UI in a plain browser without Tauri (file-related features degrade gracefully).

### Regenerating icons

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icon.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-nsis-header.ps1
npx tauri icon src-tauri/icons-src/app-icon.png
```

## Tech choices

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Tauri 2 | System WebView (WebView2 / WKWebView / WebKitGTK); package size and memory far below Electron; the Rust side only does file IO, keeping the attack surface small |
| WYSIWYG | [Vditor](https://github.com/Vanessa219/vditor) (IR mode) | Instant-rendering mode was designed to reproduce Typora's interaction; tables/code blocks/math/flowcharts out of the box (assets localized, works offline) |
| Source mode | CodeMirror 6 | Modern lightweight code editor with Markdown highlighting and search |
| Frontend | Vanilla TypeScript + Vite | The UI is just a title bar + tab strip + editor area; no framework |

Implementation notes:

- **File IO goes through custom Rust commands** (`read_file`/`write_file`); the fs plugin is not enabled, so the frontend never gets arbitrary filesystem access; encoding is probed as UTF-8 → GBK on read.
- **Local images** are resolved via the Tauri asset protocol (`convertFileSrc`) plus a MutationObserver that rewrites relative paths to absolute; the edited source text stays untouched.
- **Vditor assets are localized**: `postinstall` copies `node_modules/vditor/dist` into `public/vditor`, so its lazily loaded highlight/katex/mermaid all run locally with no network dependency.
- **Vditor initialization is async** (Lute must load first); instance methods are unavailable before the `after` callback — the code guards for readiness uniformly. A pitfall worth knowing if you integrate it.
- **Cross-platform bundling**: bundle targets are split per platform into `tauri.{windows,macos,linux}.conf.json`, merged automatically by Tauri for the current OS; on macOS double-clicked files arrive via Apple Events (`RunEvent::Opened`) instead of argv, which the Rust side forwards to the frontend, with a launch-args cache as a fallback when the webview isn't ready yet.

## Project layout

```
├─ scripts/            # asset-copy & icon generation scripts
├─ src/                # frontend (vanilla TS)
│  ├─ lib/tauri.ts     # Tauri API wrapper (with browser fallback)
│  ├─ ui/              # title bar / tab strip / menu / dialogs / status bar
│  ├─ state.ts         # tab state
│  ├─ editors.ts       # Vditor + CodeMirror dual-editor wrapper
│  ├─ i18n.ts          # UI dictionaries (zh-CN / zh-TW / en / ja)
│  ├─ files.ts         # open/save/close flows
│  ├─ images.ts        # relative-path image resolution
│  └─ main.ts          # entry: shortcuts, drag & drop, single instance, close confirmation
└─ src-tauri/          # Rust backend + per-platform bundling (tauri.{windows,macos,linux}.conf.json)
```

## Non-goals

Printing, PDF export, cloud sync, image upload, plugin system, Vim mode… Following the "Notepad philosophy" — revisit only when truly needed.

## License

This project is released under the [MIT License](./LICENSE).

## Feedback

Found a bug or have a suggestion? Open an issue on [GitHub](https://github.com/lythu95/modivier/issues) or [Gitee](https://gitee.com/lythu/modivier/issues).
