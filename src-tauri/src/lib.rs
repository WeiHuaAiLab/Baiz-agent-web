use serde_json::Value;

/// 骨架桩：正式实现由 Rust 侧 proxy 直连 daemon 命名管道
/// （Windows: \\.\pipe\closer-daemon；Unix: $XDG_RUNTIME_DIR/closer-daemon.sock）。
#[tauri::command]
fn proxy_rpc(_request: Value) -> Result<Value, String> {
    Err("proxy_rpc not implemented yet (skeleton)".into())
}

#[tauri::command]
async fn proxy_subscribe() -> Result<(), String> {
    Err("proxy_subscribe not implemented yet (skeleton)".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![proxy_rpc, proxy_subscribe])
        .run(tauri::generate_context!())
        .expect("error while running baiz shell");
}
