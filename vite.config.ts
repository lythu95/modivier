import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 不监听 Rust 目录，交给 tauri dev 自己处理
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // WebView2 (Chromium) 现代内核，可放心使用较新的语法目标
    target: 'chrome110',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
