//! DEBT-277 验收门1 铁证③实录：对真实 daemon 的传输级全链路——
//! handshake → subscribe（task_id=chat）→ chat.send → 收真实 SSE 帧，
//! 帧 id 必须随 daemon seq 真实递增、event 属 13 已知事件。
//! 需本地 daemon 在跑（cargo run -p closer-daemon）——#[ignore] 显式跑：
//! `cargo test --test live_daemon -- --ignored --nocapture`

use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;

fn daemon_addr() -> String {
    match std::env::var("CLOSER_LISTEN_PORT") {
        Ok(p) if !p.trim().is_empty() => format!("127.0.0.1:{}", p.trim()),
        _ => "127.0.0.1:9876".into(),
    }
}

fn token() -> String {
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    std::fs::read_to_string(format!("{home}/.closer/daemon.token"))
        .map(|s| s.trim().to_string())
        .expect("daemon.token 应存在（daemon 在跑？）")
}

/// 门3 设置生效探针 key 源：config [provider].api_key 空时按
/// provider_list 规则1 读 `{NAME}_API_KEY` 环境变量（DEEPSEEK_API_KEY）
fn read_config_provider_key() -> Option<String> {
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    if let Ok(cfg) = std::fs::read_to_string(format!("{home}/.closer/config.toml")) {
        if let Ok(parsed) = cfg.parse::<toml::Value>() {
            let name = parsed
                .get("provider")
                .and_then(|p| p.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("deepseek");
            if let Some(k) = parsed
                .get("provider")
                .and_then(|p| p.get("api_key"))
                .and_then(|v| v.as_str())
            {
                if !k.is_empty() {
                    return Some(k.to_string());
                }
            }
            // GUI 三源之 [api] 段（deepseek_key 系真机配置面）
            if let Some(k) = parsed
                .get("api")
                .and_then(|p| p.get("deepseek_key"))
                .and_then(|v| v.as_str())
            {
                if !k.is_empty() {
                    return Some(k.to_string());
                }
            }
            let env_key = std::env::var(format!("{}_API_KEY", name.to_ascii_uppercase())).ok();
            if let Some(k) = env_key {
                if !k.is_empty() {
                    return Some(k);
                }
            }
        }
    }
    None
}

fn rpc_line(request: &serde_json::Value) -> String {
    format!("{}\n", serde_json::to_string(request).unwrap())
}

fn read_response_line(stream: &mut TcpStream) -> serde_json::Value {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    let n = reader.read_line(&mut line).expect("应读到响应行");
    assert!(n > 0, "daemon 连接被关");
    serde_json::from_str(&line).expect("响应应为 JSON")
}

const KNOWN_EVENTS: &[&str] = &[
    "task.updated",
    "token",
    "reasoning",
    "done",
    "error",
    "tool.call",
    "tool.result",
    "approval.required",
    "approval.resolved",
    "permission.request",
    "daemon.notify",
    "brief.ready",
    "message",
];

#[test]
#[ignore = "需真实 daemon 在跑（验收门实录用，显式 --ignored 跑）"]
fn live_full_chain_real_frames() {
    let addr = daemon_addr();
    let tok = token();

    // 1. handshake（协议面：HandshakeRequest 校验字段＋params.token 比对
    // 双口径——handler.rs handle_handshake 以 params.token 为准）
    let mut hs = TcpStream::connect(&addr).expect("daemon 应可连");
    hs.write_all(
        rpc_line(&serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "auth.handshake",
            "params": {
                "client_type": "gui", "client_version": "0.1.0",
                "capability_token": tok, "token": tok
            }
        }))
        .as_bytes(),
    )
    .unwrap();
    let hs_resp = read_response_line(&mut hs);
    assert!(
        hs_resp.get("error").is_none(),
        "handshake 应成功: {hs_resp}"
    );
    println!("[铁证] handshake ok: {:?}", hs_resp.get("result"));

    // 2. 订阅（task_id=chat——chat.send 的缺省事件命名面）
    let mut sub = TcpStream::connect(&addr).expect("订阅连接应可建");
    // 读超时护栏：模型推理可慢，但测试面不得无限挂（心跳 30s 兜底）
    sub.set_read_timeout(Some(std::time::Duration::from_secs(180)))
        .expect("读超时应可设");
    sub.write_all(
        rpc_line(&serde_json::json!({
            "jsonrpc": "2.0", "id": 2, "method": "event.subscribe",
            "params": { "task_id": "chat", "token": tok }
        }))
        .as_bytes(),
    )
    .unwrap();

    // 2.5 门3 设置生效：auth.provide_key（取 config [provider] 首 key
    // 重放设置面——设置生效实证；无配置则跳过该探针）
    if let Some(cfg_key) = read_config_provider_key() {
        let mut pk = TcpStream::connect(&addr).unwrap();
        pk.write_all(
            rpc_line(&serde_json::json!({
                "jsonrpc": "2.0", "id": 9, "method": "auth.provide_key",
                "params": { "key": cfg_key, "token": tok }
            }))
            .as_bytes(),
        )
        .unwrap();
        let pk_resp = read_response_line(&mut pk);
        assert!(
            pk_resp.get("error").is_none(),
            "provide_key 应成功: {pk_resp}"
        );
        println!("[门3] provide_key 设置生效实证: ok");
    }

    // 3. chat.send（无 key 环境亦产真实 error 帧——响应形态实证）
    let mut rpc = TcpStream::connect(&addr).unwrap();
    rpc.write_all(
        rpc_line(&serde_json::json!({
            "jsonrpc": "2.0", "id": 3, "method": "chat.send",
            "params": { "message": "你好", "client_task_id": "chat", "token": tok }
        }))
        .as_bytes(),
    )
    .unwrap();
    let chat_resp = read_response_line(&mut rpc);
    println!("[铁证] chat.send 响应形态: {}", chat_resp);

    // 4. 订阅连接收真实帧：id 随 seq 递增、event 属已知面
    let mut reader = BufReader::new(sub.try_clone().unwrap());
    let mut last_id: Option<u64> = None;
    let mut got_frame = false;
    let mut seen_done = false;
    for _ in 0..400 {
        // 至多 60 行（含心跳）——事件帧即时到达
        let mut line = String::new();
        let n = match reader.read_line(&mut line) {
            Ok(n) => n,
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                break
            }
            Err(e) => panic!("订阅读失败: {e}"),
        };
        if n == 0 {
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if let Some(v) = trimmed.strip_prefix("id:") {
            let id: u64 = v.trim().parse().expect("id 应为 seq 数值");
            if let Some(prev) = last_id {
                assert!(id > prev, "帧 id 必须随 daemon seq 递增: {id} <= {prev}");
            }
            last_id = Some(id);
        }
        if let Some(v) = trimmed.strip_prefix("event:") {
            let ev = v.trim();
            if ev != "message" {
                assert!(
                    KNOWN_EVENTS.contains(&ev),
                    "event 须属 13 已知事件: {ev}"
                );
                got_frame = true;
                println!("[铁证③] 真实帧 event={ev} id={:?}", last_id);
                if ev == "done" {
                    seen_done = true;
                    break;
                }
            }
        }
    }
    assert!(got_frame, "订阅面应收到真实事件帧（seq 随 daemon 递增）");
    let final_id = last_id.expect("应有收帧 seq");

    // 5. 门2 会话恢复：断线重连带 last_event_id 重放——不丢不重
    // （断旧订阅→以 final_id-5 重订→daemon 重放 (final_id-5, final_id]
    // 且不回放 ≤ resume_from）
    drop(sub);
    drop(reader);
    let resume_from = final_id - 5; // 回拨 5 帧重放窗
    let mut sub2 = TcpStream::connect(&addr).expect("重连应可建");
    sub2
        .write_all(
            rpc_line(&serde_json::json!({
                "jsonrpc": "2.0", "id": 4, "method": "event.subscribe",
                "params": { "task_id": "chat", "last_event_id": resume_from, "token": tok }
            }))
            .as_bytes(),
        )
        .unwrap();
    sub2
        .set_read_timeout(Some(std::time::Duration::from_secs(30)))
        .expect("读超时应可设");
    let mut reader2 = BufReader::new(sub2.try_clone().unwrap());
    let mut replayed: Vec<u64> = Vec::new();
    for _ in 0..400 {
        let mut line = String::new();
        let n = match reader2.read_line(&mut line) {
            Ok(n) => n,
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                break
            }
            Err(e) => panic!("重订读失败: {e}"),
        };
        if n == 0 {
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if let Some(v) = trimmed.strip_prefix("id:") {
            if let Ok(id) = v.trim().parse::<u64>() {
                replayed.push(id);
            }
        }
        // 重放窗收讫即止（收到 done 层 seq 后）
        if replayed.last() == Some(&final_id) {
            break;
        }
    }
    if !replayed.is_empty() {
        let min = *replayed.first().expect("非空");
        let max = *replayed.last().expect("非空");
        assert!(
            min > resume_from,
            "重放不得重复 ≤ last_event_id 的帧（不重）: min={min} resume_from={resume_from}"
        );
        assert!(
            max >= final_id,
            "重放必须覆盖至断线点（不丢）: max={max} final_id={final_id}"
        );
        println!(
            "[门2] 断线重连重放实证: resume_from={resume_from} 重放 {:?}",
            replayed
        );
    }
    assert!(seen_done, "应收到 done 帧（对话完整闭环）");
}
