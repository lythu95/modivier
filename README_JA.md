<div align="center">

<img src="src-tauri/icons/icon.png" width="88" alt="MoDiViEr" />

# MoDiViEr

**MarkDown Viewer and Editor — Typora を参考にした軽量 Markdown ビューア＆エディタ**

[![Release](https://img.shields.io/github/v/release/lythu95/modivier)](https://github.com/lythu95/modivier/releases)
[![License](https://img.shields.io/github/license/lythu95/modivier)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=000)](https://v2.tauri.app)
[![Platform](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows11&logoColor=fff)](https://www.microsoft.com/windows)
[![Installer](https://img.shields.io/badge/installer-%7E5MB-brightgreen)](../../releases)

[简体中文](./README.md) ｜ [繁體中文](./README_ZH-TW.md) ｜ [English](./README_EN.md) ｜ **日本語**

</div>

[Tauri 2](https://v2.tauri.app) ベース。「軽く・速く・シンプル」を主眼に置いています：コールドスタート約 0.5 秒、インストーラー約 5MB、メモリ使用量約 80MB。表示とごく基本的な編集だけを残しました。

<div align="center">
  <img src="docs/screenshot.png" width="720" alt="MoDiViEr のスクリーンショット" />
</div>

## なぜ作ったのか

- Typora は有料化しました。
- VSCode で単一の `.md` を開くには重すぎます。起動が遅く、この用途では使わない機能が大半です。
- 目標：メモ帳のようにシンプルで直接的な Markdown ツール。**見る・直す**だけ。それ以外は何も入れない（印刷なし、クラウド同期なし、プラグイン機構なし）。

## 機能

- **WYSIWYG 編集**（Vditor インスタントレンダリングモード。Typora に最も近い挙動：カーソル位置のブロックだけソース表示、其余は描画）
- **ソースモード**（CodeMirror 6。`Ctrl+/` で WYSIWYG と双方向切替、内容は自動同期）
- **アウトライン表示**（左側の見出しツリー、階層の折りたたみ/展開、クリックでジャンプ。デフォルトで展開、細幅に畳み可能、`Ctrl+Shift+O` で切替）
- **マルチタブ**（ファイルのドロップ、`Ctrl+O`、`Ctrl+N`、中クリック/`Ctrl+W` で閉じる、`Ctrl+Tab` で巡回、`Ctrl+1..9` で直接切替）
- **ステータスバー**（行列位置、選択文字数、全文文字数。右下に Markdown/Source と Light/Dark の切替）
- **多言語対応**（簡体字中国語 / 繁體中文 / English / 日本語。メニューから切替、初回はシステムに追従）
- **ローカル画像**：Markdown 内の相対パス画像を自動解決して表示
- **ライト / ダークテーマ**（初回はシステムに追従、手動切替後は記憶）
- **VSCode 式全幅スクロール**：本文は中央寄せですが、コンテンツ領域のどこでスクロール/ページ送りしても文書に作用
- **エンコーディング互換**：UTF-8 / UTF-8 BOM / GBK を読込。保存は UTF-8（BOM なし）で統一
- **起動性能**：エディターの大型モジュール（Vditor/CodeMirror）は必要時に分割読込、ウィンドウを先に表示、vditor の未使用レンダラー（mathjax/graphviz/echarts 等）はパッケージから除外。コールドスタート約 0.5〜0.7 秒、インストーラー約 5MB
- **単一インスタンス + ファイル関連付け**：エクスプローラーで `.md` をダブルクリック/「プログラムから開く」と、既存ウィンドウにフォーカスして新規タブを開きます。インストーラーは `.md` / `.markdown` の関連付けを登録済み。ポータブル版はメニューの「.md ファイルを関連付け」からシステムの「プログラムから開く」に一発登録できます（現在のユーザー単位、管理者権限不要）
- **ウィンドウ状態の記憶**：サイズ・位置・最大化状態を自動保存し、次回起動時に復元
- ウィンドウへのファイルドロップで直接開く。未保存のタブ/ウィンドウを閉じる際は確認します（読み込み時の正規化は変更とみなさないので、手を加えていないファイルはそのまま閉じます）

### ショートカット

| ショートカット | 機能 |
| --- | --- |
| `Ctrl+O` | ファイルを開く |
| `Ctrl+N` | 新規ファイル |
| `Ctrl+S` / `Ctrl+Shift+S` | 保存 / 名前を付けて保存 |
| `Ctrl+/` | Markdown / ソースモード切替 |
| `Ctrl+Shift+O` | アウトライン表示の開閉 |
| `Ctrl+W` | 現在のタブを閉じる |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 次 / 前のタブ |
| `Ctrl+1` … `Ctrl+9` | n 番目のタブへ切替 |

## ダウンロードとインストール

[Releases](../../releases) ページから `MoDiViEr_x.y.z_x64-setup.exe`（約 5MB の NSIS インストーラー）をダウンロードしてください。インストール時に `.md` / `.markdown` の関連付けが自動登録され、エクスプローラーでダブルクリックするだけで開けます。

ソースからビルドすることもできます：`npm run tauri build` の成果物 `src-tauri/target/release/modivier.exe` はインストール不要のポータブル単体ファイルで、メニューの「.md ファイルを関連付け」からシステムの「プログラムから開く」に登録できます（現在のユーザー単位、管理者権限不要）。

Windows 10 / 11 には WebView2 が内蔵されており、追加のランタイムは不要です。

## 開発

### 環境要件

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) stable（MSVC ツールチェーン）
- Windows 10/11（WebView2 同梱）

### よく使うコマンド

```bash
npm install         # 依存関係のインストール（postinstall で vditor の静的アセットを public/vditor にコピー）
npm run tauri dev   # 開発・デバッグ
npm run tauri build # NSIS インストーラーを src-tauri/target/release/bundle/ にビルド（MoDiViEr_x.y.z_x64-setup.exe）
```

`npm run dev` なら Tauri なしでブラウザだけでも UI をデバッグできます（ファイル関連機能は自動的に無効化）。

### アイコンの再生成

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icon.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-nsis-header.ps1
npx tauri icon src-tauri/icons-src/app-icon.png
```

## 技術選定

| レイヤー | 採用技術 | 理由 |
| --- | --- | --- |
| シェル | Tauri 2 | システムの WebView2 を使用し、パッケージサイズもメモリも Electron より大幅に小さい。Rust 側はファイル IO のみで攻撃面が小さい |
| WYSIWYG | [Vditor](https://github.com/Vanessa219/vditor)（IR モード） | インスタントレンダリングモードは Typora の操作感の再現を目的に設計。表/コードブロック/数式/フローチャートを標準サポート（アセットはローカル化済み、オフラインで動作） |
| ソースモード | CodeMirror 6 | モダンで軽量なコードエディター。Markdown シンタックスハイライトと検索 |
| フロントエンド | 素の TypeScript + Vite | UI はタイトルバー + タブバー + 編集領域のみ。フレームワーク不使用 |

実装メモ：

- **ファイルの読み書きはカスタム Rust コマンド経由**（`read_file`/`write_file`）。fs プラグインは使わず、フロントエンドに任意のファイルシステム権限を持たせません。読み込み時は UTF-8 → GBK の順でエンコーディングを判定
- **ローカル画像**は Tauri asset プロトコル（`convertFileSrc`）+ MutationObserver で相対パスを絶対パスに書き換え。編集対象のソーステキストは汚しません
- **Vditor アセットのローカル化**：`postinstall` で `node_modules/vditor/dist` を `public/vditor` にコピー。遅延読込される highlight/katex/mermaid もすべてローカルで動作し、ネットワーク不要
- **Vditor の初期化は非同期**（先に Lute の読込が必要）。`after` コールバック前はインスタンスメソッドが使えないため、コード全体で準備完了ガードを統一実装——連携時に実際にハマった落とし穴です

## ディレクトリ構成

```
├─ scripts/            # vditor アセットのコピーやアイコン生成スクリプト
├─ src/                # フロントエンド（素の TS）
│  ├─ lib/tauri.ts     # Tauri API ラッパー（ブラウザフォールバック付き）
│  ├─ ui/              # タイトルバー / タブバー / メニュー / ダイアログ / ステータスバー
│  ├─ state.ts         # タブ状態
│  ├─ editors.ts       # Vditor + CodeMirror デュアルエディターのラッパー
│  ├─ i18n.ts          # 多言語辞書（簡中/繁中/英/日）
│  ├─ files.ts         # 開く/保存/閉じるのフロー
│  ├─ images.ts        # 相対パス画像の解決
│  └─ main.ts          # エントリー：ショートカット、ドラッグ＆ドロップ、単一インスタンス、閉じる確認
└─ src-tauri/          # Rust バックエンド（ファイル IO、エンコーディング判定、単一インスタンス、ウィンドウ）
```

## やらないこと

印刷、PDF エクスポート、クラウド同期、画像アップロード、プラグインシステム、Vim モード……「メモ帳の哲学」に従い、必要になってから考えます。

## ライセンス

このプロジェクトは [MIT](./LICENSE) ライセンスの下で公開されています。

## フィードバック

不具合やご提案があれば、[GitHub Issues](https://github.com/lythu95/modivier/issues) または [Gitee Issues](https://gitee.com/lythu95/modivier/issues) でお知らせください。
