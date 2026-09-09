use std::{
  io::{Read, Write},
  net::TcpListener,
  sync::atomic::{AtomicBool, Ordering},
  thread,
};
use tauri::{AppHandle, Emitter};

const CALLBACK_ADDRESS: &str = "127.0.0.1:53682";
const CALLBACK_PATH: &str = "/callback/ptracedesk";
const CALLBACK_URL: &str = "http://127.0.0.1:53682/callback/ptracedesk";
static LISTENER_ACTIVE: AtomicBool = AtomicBool::new(false);

fn response_page(success: bool) -> &'static str {
  if success {
    "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>Ptrace 授权完成</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:#f7f5fc;color:#25242a;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#fff;border:1px solid #e5e0f2;border-radius:16px;padding:42px 48px;box-shadow:0 24px 70px rgba(38,28,72,.14);text-align:center}h1{font-size:24px;margin:0 0 10px}p{color:#77727f;margin:0}</style><body><div class=\"card\"><h1>授权完成</h1><p>可以关闭此页面并返回 PtraceDesk。</p></div></body></html>"
  } else {
    "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>Ptrace 授权失败</title><body><h1>授权回调无效</h1><p>请返回 PtraceDesk 后重试。</p></body></html>"
  }
}

#[tauri::command]
pub fn start_oauth_callback_listener(app: AppHandle) -> Result<String, String> {
  if LISTENER_ACTIVE.swap(true, Ordering::SeqCst) {
    return Ok(CALLBACK_URL.to_string());
  }

  let listener = TcpListener::bind(CALLBACK_ADDRESS).map_err(|error| {
    LISTENER_ACTIVE.store(false, Ordering::SeqCst);
    format!("无法启动 ptrace 授权回调：{error}")
  })?;

  thread::spawn(move || {
    let result = listener.accept().and_then(|(mut stream, _)| {
      let mut buffer = [0_u8; 16_384];
      let bytes = stream.read(&mut buffer)?;
      let request = String::from_utf8_lossy(&buffer[..bytes]);
      let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
      let valid = target.starts_with(CALLBACK_PATH);
      let body = response_page(valid);
      let status = if valid { "200 OK" } else { "400 Bad Request" };
      let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
      );
      stream.write_all(response.as_bytes())?;
      if valid {
        let callback = format!("http://{CALLBACK_ADDRESS}{target}");
        let _ = app.emit("ptrace-oauth-callback", callback);
      }
      Ok(())
    });
    if let Err(error) = result {
      let _ = app.emit("ptrace-oauth-callback-error", error.to_string());
    }
    LISTENER_ACTIVE.store(false, Ordering::SeqCst);
  });

  Ok(CALLBACK_URL.to_string())
}
