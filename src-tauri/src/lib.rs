//! baiz Tauri 壳 proxy 层——直连 closer-daemon（TCP 127.0.0.1:9876）。
//!
//! 契约依据（DEBT-277 勘盘对卯）：
//! - daemon/src/main.rs `listen_addr()`：CLOSER_LISTEN_PORT 或 127.0.0.1:9876；
//! - JSON-RPC 2.0 每行一请求；订阅后同连接 SSE 推送
//!   （帧格式 `id: {seq}\nevent: {type}\ndata: {json}\n\n`，心跳 `: ping`）；
//! - 认证：token 存 `~/.closer/daemon.token`（daemon 启动生成），请求级
//!   `params.token` 注入（authorize 系 SHA-256 摘要比较）。
//!
//! 裁1015 修向四目内嵌：
//! ①订阅先行口径——前端自报 client_task_id（裁212）→ proxy_subscribe
//!   带 task_id → chat.send 同 id；空 task_id 订阅 fail-fast 报错（红1：
//!   空订阅败相静默杜绝）；
//! ②RPC 超时对长任务放宽 600s（红2：30s 短超时长任务必炸）＋
//!   proxy_abort 断连面（前端 abort() 取消在途 RPC）；
//! ③订阅环收帧即回写 last_event_id（红3：重连带真值，与 daemon
//!   环形缓冲重放对卯——不丢不重）；
//! ④run() 错误上达零 panic（轻红：expect 同族禁）。
//!
//! 设计纪律：proxy 不感知业务语义（透传）；失败降级 Err(String)
//! 不 panic；无 unwrap / 无 unsafe（baiz lint 铁律）。

use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::oneshot;
use tokio::time::Duration;

/// RPC 响应超时——长任务面放宽（裁1015②：chat.send 阻塞至流终，
/// 600s 覆盖长任务；快速方法亦同限无害）
const RPC_TIMEOUT_SECS: u64 = 600;
/// 单帧上限（对齐 daemon MAX_PENDING_BYTES）
const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;

/// daemon 地址（与 daemon listen_addr() 同口径）
fn daemon_addr() -> String {
    match std::env::var("CLOSER_LISTEN_PORT") {
        Ok(p) if !p.trim().is_empty() => format!("127.0.0.1:{}", p.trim()),
        _ => "127.0.0.1:9876".into(),
    }
}

/// daemon 认证 token 盘址（daemon 启动生成持久面——main/token_lock.rs）
fn token_path() -> std::path::PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(home).join(".closer").join("daemon.token")
}

/// 订阅单例状态
#[derive(Default)]
struct SubState {
    task: Option<tokio::task::JoinHandle<()>>,
}

struct DaemonState {
    addr: String,
    sub: Mutex<SubState>,
    /// 红3：订阅环逐帧回写的最后事件 seq（重连/重订阅带真值）
    last_event_id: Arc<AtomicU64>,
    /// 认证 token 缓存（daemon 重启换 token——授权败即刷新重读盘面）
    token: Mutex<Option<String>>,
    /// 在途 RPC 断连面（proxy_abort 取消面，裁1015②）
    rpc_abort: Mutex<Option<oneshot::Sender<()>>>,
}

impl DaemonState {
    fn new() -> Self {
        Self {
            addr: daemon_addr(),
            sub: Mutex::new(SubState::default()),
            last_event_id: Arc::new(AtomicU64::new(0)),
            token: Mutex::new(None),
            rpc_abort: Mutex::new(None),
        }
    }

    /// 取 token（缓存优先，盘面兜底——daemon 重启换 token 面）
    fn read_token(&self) -> Result<String, String> {
        {
            let cached = self.token.lock().map_err(|e| format!("token 锁中毒: {e}"))?;
            if let Some(t) = cached.as_ref() {
                return Ok(t.clone());
            }
        }
        let t = std::fs::read_to_string(token_path())
            .map(|s| s.trim().to_string())
            .map_err(|e| format!("daemon token 读取失败（{}）: {e}", token_path().display()))?;
        if t.is_empty() {
            return Err("daemon token 为空（daemon 未启动？）".into());
        }
        let mut cached = self.token.lock().map_err(|e| format!("token 锁中毒: {e}"))?;
        *cached = Some(t.clone());
        Ok(t)
    }

    /// 授权败（UNAUTHORIZED）→ 清缓存（下次重读盘面——daemon 重启换 token）
    fn invalidate_token(&self) {
        if let Ok(mut t) = self.token.lock() {
            *t = None;
        }
    }
}

/// 单次 RPC：短连接，发一行 JSON-RPC，读一行响应后关闭。
#[tauri::command]
async fn proxy_rpc(state: State<'_, DaemonState>, request: Value) -> Result<Value, String> {
    let method = request
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    // 业务透传前注入认证 token（auth.handshake 免授权不注入）
    let mut request = request;
    if method != "auth.handshake" {
        let token = state.read_token()?;
        let params = request
            .as_object_mut()
            .ok_or_else(|| "请求体非法（非对象）".to_string())?;
        let entry = params
            .entry("params")
            .or_insert_with(|| serde_json::Map::new().into());
        if let Some(p) = entry.as_object_mut() {
            p.insert("token".into(), json!(token));
        }
    }

    let (abort_tx, abort_rx) = oneshot::channel::<()>();
    {
        let mut slot = state.rpc_abort.lock().map_err(|e| format!("abort 锁中毒: {e}"))?;
        *slot = Some(abort_tx);
    }

    let addr = state.addr.clone();
    let io = async move {
        let mut stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("daemon 连接失败（{addr}）: {e}"))?;
        let mut line =
            serde_json::to_string(&request).map_err(|e| format!("请求序列化失败: {e}"))?;
        line.push('\n');
        stream
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("写入失败: {e}"))?;
        let mut reader = BufReader::new(stream);
        let mut resp = String::new();
        let n = reader
            .read_line(&mut resp)
            .await
            .map_err(|e| format!("读取失败: {e}"))?;
        if n == 0 {
            return Err("daemon 连接被关闭（空响应）".into());
        }
        serde_json::from_str::<Value>(&resp).map_err(|e| {
            format!(
                "响应解析失败: {e} | raw: {}",
                resp.chars().take(200).collect::<String>()
            )
        })
    };

    // 裁1015②：600s 放宽超时＋abort 断连面（前端 abort() 即取消在途 RPC）
    let result = tokio::select! {
        _ = abort_rx => Err("RPC 已被前端中止".into()),
        r = tokio::time::timeout(Duration::from_secs(RPC_TIMEOUT_SECS), io) => {
            r.map_err(|_| format!("daemon 响应超时（{RPC_TIMEOUT_SECS}s）"))?
        }
    };
    {
        let mut slot = state.rpc_abort.lock().map_err(|e| format!("abort 锁中毒: {e}"))?;
        *slot = None;
    }
    // UNAUTHORIZED → token 失效（daemon 重启换 token）→ 清缓存待重读
    if let Ok(v) = &result {
        if v.get("error")
            .and_then(|e| e.get("code"))
            .and_then(|c| c.as_i64())
            == Some(-32002)
        {
            state.invalidate_token();
        }
    }
    // 前端自调 auth.handshake 成功面——缓存其 token（若有）
    if method == "auth.handshake" {
        if let Ok(v) = &result {
            if let Some(t) = v
                .get("result")
                .and_then(|r| r.get("auth_token"))
                .and_then(|t| t.as_str())
            {
                if !t.is_empty() {
                    if let Ok(mut slot) = state.token.lock() {
                        *slot = Some(t.to_string());
                    }
                }
            }
        }
    }
    result
}

/// SSE 帧 → 前端 SseFrame JSON（透传 id/event/data）
fn frame_to_json(id: Option<u64>, event: &str, data: &str) -> Value {
    let data_val = serde_json::from_str(data).unwrap_or(Value::String(data.to_string()));
    let mut obj = serde_json::Map::new();
    if let Some(v) = id {
        obj.insert("id".into(), json!(v));
    }
    obj.insert("event".into(), json!(event));
    obj.insert("data".into(), data_val);
    Value::Object(obj)
}

/// 订阅循环：event.subscribe 后持续读 SSE 帧，转发前端 daemon://frame；
/// 红3：收帧即回写 last_event_id（重连带真值，不丢不重）。
#[allow(clippy::too_many_arguments)]
async fn subscribe_loop(
    app: AppHandle,
    addr: String,
    token: String,
    task_id: String,
    initial_seq: Option<u64>,
    last_event_id: Arc<AtomicU64>,
) -> Result<(), String> {
    let mut stream = TcpStream::connect(&addr).await.map_err(|e| format!("订阅连接失败: {e}"))?;
    // daemon 三分支口径：缺省（不送 last_event_id）＝从最新；送 0 会
    // 误入出窗 resync 分支——仅前端显式传值（>0 重放窗）时才送
    let mut params = serde_json::Map::new();
    params.insert("task_id".into(), json!(task_id));
    if let Some(seq) = initial_seq {
        params.insert("last_event_id".into(), json!(seq));
    }
    params.insert("token".into(), json!(token));
    let req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "event.subscribe",
        "params": params,
    });
    let mut line = serde_json::to_string(&req).map_err(|e| format!("订阅请求序列化失败: {e}"))?;
    line.push('\n');
    stream
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("订阅请求写入失败: {e}"))?;

    let mut reader = BufReader::new(stream);
    loop {
        // 读一个 SSE 块（空行分隔）
        let mut block = String::new();
        loop {
            let mut line_buf = String::new();
            let n = reader
                .read_line(&mut line_buf)
                .await
                .map_err(|e| format!("订阅读取失败: {e}"))?;
            if n == 0 {
                return Err("daemon 订阅连接关闭".into());
            }
            block.push_str(&line_buf);
            if line_buf == "\n" || line_buf == "\r\n" {
                break;
            }
            if block.len() > MAX_FRAME_BYTES {
                return Err("SSE 帧超限".into());
            }
        }
        // 解析 id/event/data
        let mut id = None;
        let mut event = "message".to_string();
        let mut data = String::new();
        for l in block.lines() {
            if let Some(v) = l.strip_prefix("id:") {
                id = v.trim().parse().ok();
            } else if let Some(v) = l.strip_prefix("event:") {
                event = v.trim().to_string();
            } else if let Some(v) = l.strip_prefix("data:") {
                data = v.trim().to_string();
            }
        }
        // 红3：收帧即回写（心跳无 id 不回写）
        if let Some(seq) = id {
            last_event_id.store(seq, Ordering::Relaxed);
        }
        // 心跳/注释帧（`:` 开头）→ heartbeat 透传，供前端看门狗
        if event == "message" && data.is_empty() {
            let _ = app.emit("daemon://frame", frame_to_json(id, "heartbeat", ""));
            continue;
        }
        let _ = app.emit("daemon://frame", frame_to_json(id, &event, &data));
    }
}

/// 建立/重置订阅（单例）。裁1015①：前端自报 client_task_id——
/// task_id 为空 fail-fast 报错（红1：空订阅败相静默杜绝）。
#[tauri::command]
async fn proxy_subscribe(
    app: AppHandle,
    state: State<'_, DaemonState>,
    task_id: Option<String>,
    last_event_id: Option<u64>,
) -> Result<(), String> {
    let task_id = match task_id.filter(|t| !t.trim().is_empty()) {
        Some(t) => t,
        None => {
            return Err(
                "订阅须携带 task_id（裁1015①：前端自报 client_task_id，空订阅一律拒）".into(),
            )
        }
    };
    let mut sub = state.sub.lock().map_err(|e| format!("订阅锁中毒: {e}"))?;
    if let Some(t) = sub.task.take() {
        t.abort();
    }
    let addr = state.addr.clone();
    let token = state.read_token()?;
    // 前端未传 last_event_id → 不送（daemon 三分支：缺省＝从最新，
    // 送 0 会误入出窗 resync 分支——红3 对卯面）
    let initial_seq = last_event_id;
    let app_loop = app.clone();
    let last_event_id = Arc::clone(&state.last_event_id);
    sub.task = Some(tokio::spawn(async move {
        let outcome = subscribe_loop(app_loop.clone(), addr, token, task_id, initial_seq, last_event_id).await;
        // P2 断线面（2026-08-22）：订阅循环退出（连接关闭/读错误/被服务端断开）
        // 一律 emit daemon://disconnect——前端即时触发重连，不再等 90s 看门狗
        let _ = app_loop.emit("daemon://disconnect", json!({}));
        if let Err(e) = outcome {
            let _ = app_loop.emit(
                "daemon://frame",
                json!({ "event": "error", "data": { "message": e } }),
            );
        }
    }));
    Ok(())
}

/// 取消订阅
#[tauri::command]
async fn proxy_unsubscribe(state: State<'_, DaemonState>) -> Result<(), String> {
    let mut sub = state.sub.lock().map_err(|e| format!("订阅锁中毒: {e}"))?;
    if let Some(t) = sub.task.take() {
        t.abort();
    }
    Ok(())
}

/// 中止在途 RPC（裁1015② 断连面——前端 abort() 接线）
#[tauri::command]
async fn proxy_abort(state: State<'_, DaemonState>) -> Result<(), String> {
    let mut slot = state.rpc_abort.lock().map_err(|e| format!("abort 锁中毒: {e}"))?;
    if let Some(tx) = slot.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(DaemonState::new())
        .invoke_handler(tauri::generate_handler![
            proxy_rpc,
            proxy_subscribe,
            proxy_unsubscribe,
            proxy_abort
        ]);
    // 轻红修向（裁1015④）：错误上达零 panic——expect 同族禁
    if let Err(e) = builder.run(tauri::generate_context!()) {
        eprintln!("baiz shell 运行失败: {e}");
        std::process::exit(1);
    }
}
