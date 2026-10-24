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

/// 把应用注册到 .md / .markdown 的系统“打开方式”列表（当前用户级，免管理员）。
/// 便携单文件场景下用户可在文件右键菜单中选择本应用打开。
#[tauri::command]
fn register_file_association() -> Result<(), String> {
    register_file_association_impl()
}

#[cfg(windows)]
fn register_file_association_impl() -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let exe = std::env::current_exe().map_err(|e| format!("无法定位程序：{e}"))?;
    let exe = exe.to_string_lossy().to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu
        .open_subkey_with_flags("Software\\Classes", KEY_WRITE)
        .map_err(|e| format!("打开注册表失败：{e}"))?;

    const PROGID: &str = "modivier.md";

    let write = |key: winreg::RegKey, value: &str| -> Result<(), String> {
        key.set_value("", &value).map_err(|e| format!("写入注册表失败：{e}"))
    };

    let (progid, _) = classes
        .create_subkey(PROGID)
        .map_err(|e| format!("写入注册表失败：{e}"))?;
    write(progid, "MoDiViEr Markdown Document")?;

    let (icon, _) = classes
        .create_subkey(format!("{PROGID}\\DefaultIcon"))
        .map_err(|e| format!("写入注册表失败：{e}"))?;
    write(icon, &format!("\"{exe}\",0"))?;

    let (open_cmd, _) = classes
        .create_subkey(format!("{PROGID}\\shell\\open\\command"))
        .map_err(|e| format!("写入注册表失败：{e}"))?;
    write(open_cmd, &format!("\"{exe}\" \"%1\""))?;

    for ext in [".md", ".markdown"] {
        let (ext_key, _) = classes
            .create_subkey(format!("{ext}\\OpenWithProgids"))
            .map_err(|e| format!("写入注册表失败：{e}"))?;
        ext_key
            .set_value(PROGID, &"")
            .map_err(|e| format!("写入注册表失败：{e}"))?;
    }

    // 通知 Shell 关联变化，“打开方式”列表立即刷新
    shell_notify::assoc_changed();
    Ok(())
}

#[cfg(windows)]
mod shell_notify {
    #[link(name = "shell32")]
    extern "system" {
        fn SHChangeNotify(
            w_event_id: u32,
            u_flags: u32,
            dw_item1: *const core::ffi::c_void,
            dw_item2: *const core::ffi::c_void,
        );
    }

    const SHCNE_ASSOCCHANGED: u32 = 0x0800_0000;
    const SHCNF_IDLIST: u32 = 0x0000;

    pub fn assoc_changed() {
        unsafe {
            SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, std::ptr::null(), std::ptr::null());
        }
    }
}

#[cfg(not(windows))]
fn register_file_association_impl() -> Result<(), String> {
    Err("当前平台不支持".into())
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
        // 窗口尺寸/位置/最大化状态记忆，启动时自动恢复
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
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
        // 窗口在配置里以隐藏状态创建（避免先按默认尺寸闪现再恢复），
        // 前端就绪后由 JS 显示；这里兜底：前端异常未显示时 3 秒后强制显示
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    if !win.is_visible().unwrap_or(true) {
                        let _ = win.show();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_launch_args,
            register_file_association
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS 上"双击文件 / 右键打开方式"经 LaunchServices 以 Apple Event (odoc)
            // 投递，不走 argv（RunEvent::Opened 仅在 Apple 平台编译）。
            // 事件可能早于 webview 就绪：除转发事件外并入启动参数缓存，
            // 前端启动时会经 get_launch_args 再拉取一次（前端按路径去重，不会重复开标签）。
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    app.state::<LaunchArgs>()
                        .0
                        .lock()
                        .unwrap()
                        .extend(paths.iter().cloned());
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.set_focus();
                    }
                    let _ = app.emit("open-files", paths);
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
            {
                let _ = (app, event);
            }
        });
}
