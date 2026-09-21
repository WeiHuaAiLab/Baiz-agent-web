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

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::oneshot;
use tokio::time::Duration;

/// 在途 RPC 的中止登记表（proxy_abort 取消面，裁1015②）。
///
/// **MSG-2998 修①（根因定谳在案）**：裁1015② 原径为单槽 `Option<Sender>`
/// ——任何第二次 `proxy_rpc` 调用开头的槽覆盖会 drop 前一 RPC 的 `tx`：
/// oneshot 接收端随之立即就绪（`RecvError`），`select!` 的 `_ = abort_rx`
/// 分支把【槽覆盖】误当【前端主动中止】——在途长 RPC（chat.send 阻塞至
/// 流终）被误报「RPC 已被前端中止」并 drop 连接（daemon 侧观测 10053）；
/// 且先完成者的 `*slot = None` 无条件清空会再杀后注册者（双杀）。
/// 勘实链：审批帧 → eventRouter.refreshRisk → permission.pending 并发 RPC
/// 即命中此径（daemon 日志 09:47:44.468 pending → .474994 10053 对卯）。
///
/// 本登记表改【每 RPC 独立 id 槽】：注册/注销按 id 甄别、互不干扰；
/// proxy_abort 语义保持「中止全部在途 RPC」（前端 abort() 清场义）。
pub(crate) struct RpcAbortRegistry {
    /// 在途 RPC 槽：RPC id → 中止发送端（并发 RPC 各自独立）
    slots: Mutex<HashMap<u64, oneshot::Sender<()>>>,
    seq: AtomicU64,
}

impl Default for RpcAbortRegistry {
    fn default() -> Self {
        Self {
            slots: Mutex::new(HashMap::new()),
            seq: AtomicU64::new(0),
        }
    }
}

impl RpcAbortRegistry {
    /// 注册在途 RPC——返回自 id 与中止接收端（只增自己的槽，不动他 RPC）。
    pub(crate) fn register(&self) -> Result<(u64, oneshot::Receiver<()>), String> {
        let id = self.seq.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel::<()>();
        let mut slots = self
            .slots
            .lock()
            .map_err(|e| format!("abort 锁中毒: {e}"))?;
        slots.insert(id, tx);
        Ok((id, rx))
    }

    /// 注销已结束的 RPC——只摘自己的槽（按 id 甄别，勿动他 RPC）。
    pub(crate) fn complete(&self, id: u64) {
        if let Ok(mut slots) = self.slots.lock() {
            let _ = slots.remove(&id);
        }
    }

    /// 中止全部在途 RPC（proxy_abort 语义——前端 abort() 清场）。
    pub(crate) fn abort_all(&self) {
        if let Ok(mut slots) = self.slots.lock() {
            for (_, tx) in slots.drain() {
                let _ = tx.send(());
            }
        }
    }

    /// 在途 RPC 数（红证面——MSG-3001 ⑦：超时径须摘槽勿泄漏）。
    /// cfg(test) 限定：生产面零消费者（免 --all-targets 口径 dead-code）。
    #[cfg(test)]
    pub(crate) fn inflight_len(&self) -> usize {
        self.slots.lock().map(|slots| slots.len()).unwrap_or(0)
    }
}

/// 单次 RPC 往返核心（可测：不依赖 tauri State）——短连接，发一行
/// JSON-RPC，读一行响应后关闭；600s 放宽超时＋abort 断连面。
pub(crate) async fn rpc_roundtrip(
    addr: &str,
    request: Value,
    registry: &RpcAbortRegistry,
) -> Result<Value, String> {
    rpc_roundtrip_with_timeout(
        addr,
        request,
        registry,
        Duration::from_secs(RPC_TIMEOUT_SECS),
    )
    .await
}

/// 往返核心（超时参数化——红证可注入短超时验「超时径摘槽」）。
pub(crate) async fn rpc_roundtrip_with_timeout(
    addr: &str,
    request: Value,
    registry: &RpcAbortRegistry,
    timeout: Duration,
) -> Result<Value, String> {
    let (id, abort_rx) = registry.register()?;
    let addr = addr.to_string();
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

    // 裁1015②：放宽超时＋abort 断连面（前端 abort() 即取消在途 RPC）
    // Ok(()) = proxy_abort 显式中止；Err(_) = 自身槽被摘（多槽下仅锁中毒
    // 兜底面）——两者俱 Fail-safe 报中止，勿挂起在途。
    // MSG-3001 ⑦：超时分支勿用 `?` 早退（旧径跳 complete → 每次超时永久
    // 漏槽·多槽 map 无他清理）——改为产生 Err 值，控制流必经下方摘槽。
    let result = tokio::select! {
        r = abort_rx => match r {
            Ok(()) => Err("RPC 已被前端中止".into()),
            Err(_) => Err("RPC 已被前端中止".into()),
        },
        r = tokio::time::timeout(timeout, io) => match r {
            Ok(v) => v,
            Err(_) => Err(format!("daemon 响应超时（{}s）", timeout.as_secs())),
        }
    };
    registry.complete(id);
    result
}

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
    rpc_abort: RpcAbortRegistry,
}

impl DaemonState {
    fn new() -> Self {
        Self {
            addr: daemon_addr(),
            sub: Mutex::new(SubState::default()),
            last_event_id: Arc::new(AtomicU64::new(0)),
            token: Mutex::new(None),
            rpc_abort: RpcAbortRegistry::default(),
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

    // 裁1015②：RPC 往返（600s 放宽超时＋abort 断连面）——核心逻辑提取至
    // rpc_roundtrip（可测——MSG-2998 红证：并发 RPC 覆盖槽误杀在途长 RPC）
    let result = rpc_roundtrip(&state.addr, request, &state.rpc_abort).await;
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
    state.rpc_abort.abort_all();
    Ok(())
}

// DEBT-540-F：Tauri 形态本地 FS proxy 命令（前端 bridge/tauri.ts 契约）
// 相对路径统一以 Tauri 进程当前工作目录为基；agent/daemon 与 GUI 同目录启动时
// 与 daemon 写盘路径对卯。

/// 将用户给的路径解析为绝对路径：
///   - 绝对路径直接用；
///   - 相对路径先以 current_dir 为基；若不存在再以 exe 目录为基（打包场景兜底）；
///   - 两者都不存在时仍返回 cwd 拼接结果，让后续 IO 报清晰错误。
fn resolve_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if p.is_absolute() {
        return Ok(p.to_path_buf());
    }
    let cwd = std::env::current_dir().map_err(|e| format!("获取当前目录失败: {e}"))?;
    let cwd_resolved = cwd.join(p);
    if cwd_resolved.exists() {
        return Ok(cwd_resolved);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let exe_resolved = exe_dir.join(p);
            if exe_resolved.exists() {
                return Ok(exe_resolved);
            }
        }
    }
    Ok(cwd_resolved)
}

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

#[tauri::command]
async fn proxy_fs_read_text(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let resolved = resolve_path(&path)?;
        std::fs::read_to_string(&resolved)
            .map_err(|e| format!("读取文件失败 ({}): {e}", resolved.display()))
    })
    .await
    .map_err(|e| format!("读取任务异常: {e}"))?
}

#[tauri::command]
async fn proxy_fs_list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let resolved = resolve_path(&path)?;
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(&resolved)
            .map_err(|e| format!("读取目录失败 ({}): {e}", resolved.display()))?
        {
            let entry = entry.map_err(|e| format!("目录项读取失败: {e}"))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            entries.push(FileEntry { name, path, is_dir });
        }
        Ok(entries)
    })
    .await
    .map_err(|e| format!("目录读取任务异常: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(DaemonState::new())
        .invoke_handler(tauri::generate_handler![
            proxy_rpc,
            proxy_subscribe,
            proxy_unsubscribe,
            proxy_abort,
            proxy_fs_read_text,
            proxy_fs_list_dir
        ]);
    // 轻红修向（裁1015④）：错误上达零 panic——expect 同族禁
    if let Err(e) = builder.run(tauri::generate_context!()) {
        eprintln!("baiz shell 运行失败: {e}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    /// MSG-2998 修① 红证（并发隔离）：在途 RPC 不得被并发第二个 RPC 的
    /// 注册误杀。现状（单槽覆盖 → 旧 tx drop → 旧 rx 立即就绪）必败；
    /// 修复（每 RPC 独立 id 槽）通过。
    #[tokio::test]
    async fn inflight_rpc_survives_concurrent_register() {
        let registry = RpcAbortRegistry::default();
        let (_id1, rx1) = registry.register().expect("注册 1");
        let (_id2, _rx2) = registry.register().expect("注册 2（并发第二 RPC）");
        // 40ms 窗内 rx1 不得被触发（被触发 = 在途长 RPC 被误报「RPC 已被前端中止」）
        assert!(
            tokio::time::timeout(Duration::from_millis(40), rx1).await.is_err(),
            "并发第二个 RPC 不得中止在途 RPC（单槽覆盖=误杀根因）"
        );
    }

    /// MSG-2998 修① 红证（注销隔离）：complete(id1) 不得清掉 id2 的槽——
    /// 现状无条件清空会把仍在下一条 RPC 的槽一并抹掉。
    #[tokio::test]
    async fn complete_removes_only_own_slot() {
        let registry = RpcAbortRegistry::default();
        let (id1, _rx1) = registry.register().expect("注册 1");
        let (_id2, rx2) = registry.register().expect("注册 2");
        registry.complete(id1);
        registry.abort_all();
        // id2 的在途中止面须完好：abort_all 应送达成 Ok(())（而非通道 Closed）
        // MSG-3001：E1 口径（--all-targets -D warnings）——单位型 await 直接
        // 断言式，勿 let 绑定（let_unit_value）
        rx2.await.expect("abort_all 应送达仍注册在途的 RPC");
    }

    /// MSG-3001 ⑦ 红证（超时径摘槽）：mock daemon 挂起不回 → 超时报错
    /// **且槽须摘除**——旧径 `r.map_err(..)?` 早退跳过 complete(id)：
    /// 每次超时永久漏槽（多槽 map 无他清理；future 被 drop 同漏）。
    #[tokio::test]
    async fn timeout_releases_own_slot() {
        // mock daemon：接受连接但**不回响应**（挂起 → 触发超时）
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock daemon bind");
        let addr = listener.local_addr().expect("mock addr").to_string();
        let server = tokio::spawn(async move {
            loop {
                let Ok((sock, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    let _hold = sock; // 持连接不回（挂起）
                    tokio::time::sleep(Duration::from_secs(5)).await;
                });
            }
        });

        let registry = RpcAbortRegistry::default();
        let r = rpc_roundtrip_with_timeout(
            &addr,
            json!({"jsonrpc": "2.0", "id": 1, "method": "slow.rpc"}),
            &registry,
            Duration::from_millis(120),
        )
        .await;
        assert!(r.is_err(), "应超时报错: {r:?}");
        assert!(r.unwrap_err().contains("超时"), "应为超时错");
        // 修前：`?` 早退跳过 complete → inflight==1（永久漏槽）；修后 ==0
        assert_eq!(registry.inflight_len(), 0, "超时后槽应摘除（勿泄漏）");
        server.abort();
    }

    /// MSG-2998 修①（proxy_abort 语义保留）：abort_all 中止全部在途 RPC。
    #[tokio::test]
    async fn abort_all_aborts_every_inflight() {
        let registry = RpcAbortRegistry::default();
        let (_id1, rx1) = registry.register().expect("注册 1");
        let (_id2, rx2) = registry.register().expect("注册 2");
        registry.abort_all();
        assert!(matches!(rx1.await, Ok(())), "在途 1 应被显式中止");
        assert!(matches!(rx2.await, Ok(())), "在途 2 应被显式中止");
    }

    /// MSG-2998 修① 红证（端到端）：mock daemon 上——长 RPC 在途 + 并发短
    /// RPC（等价审批帧触发的 refreshRisk→permission.pending）——长 RPC 必须
    /// 拿到自身真实响应，不得被误报「RPC 已被前端中止」（现状单槽必败）。
    #[tokio::test]
    async fn concurrent_short_rpc_does_not_kill_long_rpc() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock daemon bind");
        let addr = listener.local_addr().expect("mock addr").to_string();
        let server = tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    // 行帧读取（proxy_rpc 同构：一行 JSON-RPC）
                    let mut buf = Vec::new();
                    let mut byte = [0u8; 1];
                    loop {
                        match sock.read(&mut byte).await {
                            Ok(0) | Err(_) => return,
                            Ok(_) => {
                                if byte[0] == b'\n' {
                                    break;
                                }
                                buf.push(byte[0]);
                            }
                        }
                    }
                    let req: Value = serde_json::from_slice(&buf).unwrap_or(Value::Null);
                    let method = req
                        .get("method")
                        .and_then(|m| m.as_str())
                        .unwrap_or("")
                        .to_string();
                    // 长 RPC：250ms 后才回（模拟 chat.send 阻塞至流终）
                    if method == "long.rpc" {
                        tokio::time::sleep(Duration::from_millis(250)).await;
                    }
                    let resp = json!({
                        "jsonrpc": "2.0",
                        "id": req.get("id").cloned().unwrap_or(json!(0)),
                        "result": { "method": method }
                    });
                    let mut line = resp.to_string();
                    line.push('\n');
                    let _ = sock.write_all(line.as_bytes()).await;
                });
            }
        });

        let registry = Arc::new(RpcAbortRegistry::default());
        let long_task = tokio::spawn({
            let addr = addr.clone();
            let reg = Arc::clone(&registry);
            async move {
                rpc_roundtrip(
                    &addr,
                    json!({"jsonrpc": "2.0", "id": 1, "method": "long.rpc"}),
                    &reg,
                )
                .await
            }
        });
        // 长 RPC 在途 80ms 后：并发短 RPC（等价审批帧触发的 permission.pending）
        tokio::time::sleep(Duration::from_millis(80)).await;
        let short = rpc_roundtrip(
            &addr,
            json!({"jsonrpc": "2.0", "id": 2, "method": "short.rpc"}),
            &registry,
        )
        .await;
        assert!(short.is_ok(), "短 RPC 应正常完成: {short:?}");

        let long = long_task.await.expect("长 RPC 任务应结束");
        assert!(
            long.is_ok(),
            "长 RPC 不得被并发短 RPC 误杀（现状单槽=误报「RPC 已被前端中止」）: {long:?}"
        );
        assert_eq!(
            long.as_ref()
                .ok()
                .and_then(|v| v.pointer("/result/method"))
                .and_then(|m| m.as_str()),
            Some("long.rpc"),
            "长 RPC 应拿到自身真实响应"
        );
        server.abort();
    }
}
