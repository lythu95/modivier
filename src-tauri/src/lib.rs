use std::sync::Mutex;

use tauri::{Emitter, Manager};

#[derive(serde::Serialize)]
pub struct ReadResult {
    pub content: String,
    /// utf-8 / utf-8-bom / gbk
    pub encoding: &'static str,
}

/// 读取文件内容。编码策略：UTF-8（含 BOM）优先，失败时回退 GBK 解码，
/// 两者都失败才报错，以兼容中文 Windows 环境下的老文档。
#[tauri::command]
fn read_file(path: String) -> Result<ReadResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("读取失败：{e}"))?;

    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let text = String::from_utf8_lossy(&bytes[3..]).into_owned();
        return Ok(ReadResult { content: text, encoding: "utf-8-bom" });
    }
    if let Ok(text) = std::str::from_utf8(&bytes) {
        return Ok(ReadResult { content: text.to_string(), encoding: "utf-8" });
    }
    let (text, _, had_errors) = encoding_rs::GBK.decode(&bytes);
    if had_errors {
        Err("无法识别文件编码（支持 UTF-8 / GBK）".into())
    } else {
        Ok(ReadResult { content: text.into_owned(), encoding: "gbk" })
    }
}

/// 保存文件，统一写出为 UTF-8（无 BOM）。
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("保存失败：{e}"))
}

struct LaunchArgs(Mutex<Vec<String>>);

/// 本次进程启动时携带的命令行参数（用于“打开方式”/双击 .md 启动）。
#[tauri::command]
fn get_launch_args(state: tauri::State<LaunchArgs>) -> Vec<String> {
    state.0.lock().unwrap().clone()
}

/// 过滤掉可执行文件路径与开关参数，只保留可能是文件的参数。
fn extract_file_args(args: &[String]) -> Vec<String> {
    args.iter()
        .filter(|a| !a.starts_with('-'))
        .skip(1)
        .cloned()
        .collect()
}

pub fn run() {
    let launch_args = extract_file_args(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        // 单实例：资源管理器中再次打开文件时，把路径转发给已运行的窗口而不是启动第二个进程
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files = extract_file_args(&args);
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
                if !files.is_empty() {
                    let _ = app.emit("open-files", files);
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(LaunchArgs(Mutex::new(launch_args)))
        .invoke_handler(tauri::generate_handler![read_file, write_file, get_launch_args])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
