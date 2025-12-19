use crate::storage::{simple_decrypt, simple_encrypt, ChatMessage};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(target_os = "android")]
use std::os::unix::io::AsRawFd;

/// 获取数据目录
fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("source directory missing: {}", src.display()));
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct MediaBundleInfo {
    pub ready: bool,
    pub copied: bool,
    pub base_dir: String,
    pub manifest: Option<Value>,
    pub warning: Option<String>,
}

/// Ensure bundled media assets exist in app data dir.
#[tauri::command]
pub async fn ensure_media_bundle(app: AppHandle) -> Result<MediaBundleInfo, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let target_dir = data_dir.join("media");
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let manifest_path = target_dir.join("manifest.json");

    let mut copied = false;
    let mut warning = None;

    if !manifest_path.exists() {
        match app.path().resource_dir() {
            Ok(resource_dir) => {
                let candidates = [
                    resource_dir.join("media"),
                    resource_dir.join("resources").join("media"),
                    resource_dir.join("src-tauri").join("resources").join("media"),
                ];
                let mut picked = None;
                for dir in candidates {
                    if dir.exists() {
                        picked = Some(dir);
                        break;
                    }
                }
                if let Some(src_dir) = picked {
                    if let Err(err) = copy_dir_recursive(&src_dir, &target_dir) {
                        warning = Some(format!("copy media bundle failed: {}", err));
                    } else {
                        copied = true;
                    }
                } else {
                    warning = Some("media bundle not found in resources".to_string());
                }
            }
            Err(err) => {
                warning = Some(format!("resource_dir unavailable: {}", err));
            }
        }
    }

    let manifest = if manifest_path.exists() {
        match fs::read_to_string(&manifest_path) {
            Ok(json) => serde_json::from_str::<Value>(&json).ok(),
            Err(err) => {
                warning = Some(format!("read media manifest failed: {}", err));
                None
            }
        }
    } else {
        None
    };

    Ok(MediaBundleInfo {
        ready: manifest.is_some(),
        copied,
        base_dir: target_dir.to_string_lossy().to_string(),
        manifest,
        warning,
    })
}

/// 保存配置
#[tauri::command]
pub async fn save_config(app: AppHandle, config: Value) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let config_path = data_dir.join("config.json");

    // 加密敏感字段
    let mut config_to_save = config.clone();
    if let Some(api_key) = config_to_save.get("apiKey").and_then(|v| v.as_str()) {
        let encrypted = simple_encrypt(api_key);
        if let Some(obj) = config_to_save.as_object_mut() {
            obj.insert("apiKey".to_string(), Value::String(encrypted));
            obj.insert("_encrypted".to_string(), Value::Bool(true));
        }
    }

    let json = serde_json::to_string_pretty(&config_to_save).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 加载配置
#[tauri::command]
pub async fn load_config(app: AppHandle) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let config_path = data_dir.join("config.json");

    if !config_path.exists() {
        // 返回默认配置
        return Ok(serde_json::json!({
            "provider": "openai",
            "baseUrl": "https://api.openai.com/v1",
            "model": "gpt-3.5-turbo",
            "stream": true,
            "apiKey": ""
        }));
    }

    let json = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let mut config: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    // 解密 API Key
    if let Some(obj) = config.as_object_mut() {
        if obj.get("_encrypted").and_then(|v| v.as_bool()).unwrap_or(false) {
            if let Some(api_key) = obj.get("apiKey").and_then(|v| v.as_str()) {
                match simple_decrypt(api_key) {
                    Ok(decrypted) => {
                        obj.insert("apiKey".to_string(), Value::String(decrypted));
                    }
                    Err(_) => {}
                }
            }
            obj.remove("_encrypted");
        }
    }

    Ok(config)
}

/// 保存聊天历史
#[tauri::command]
pub async fn save_chat_history(
    app: AppHandle,
    character_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let chat_dir = data_dir.join("chats");
    fs::create_dir_all(&chat_dir).map_err(|e| e.to_string())?;

    let chat_file = chat_dir.join(format!("{}.json", character_id));

    // 读取现有记录
    let mut all_messages: Vec<ChatMessage> = if chat_file.exists() {
        let json = fs::read_to_string(&chat_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        Vec::new()
    };

    // 添加新消息
    all_messages.extend(messages);

    // 保存
    let json = serde_json::to_string_pretty(&all_messages).map_err(|e| e.to_string())?;
    fs::write(chat_file, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取聊天历史
#[tauri::command]
pub async fn get_chat_history(
    app: AppHandle,
    character_id: String,
    limit: Option<i64>,
) -> Result<Vec<ChatMessage>, String> {
    let data_dir = get_data_dir(&app)?;
    let chat_file = data_dir.join("chats").join(format!("{}.json", character_id));

    if !chat_file.exists() {
        return Ok(Vec::new());
    }

    let json = fs::read_to_string(chat_file).map_err(|e| e.to_string())?;
    let mut messages: Vec<ChatMessage> = serde_json::from_str(&json).unwrap_or_default();

    // 限制数量
    if let Some(limit) = limit {
        let start = messages.len().saturating_sub(limit as usize);
        messages = messages[start..].to_vec();
    }

    Ok(messages)
}

/// 清除聊天历史
#[tauri::command]
pub async fn clear_chat_history(
    app: AppHandle,
    character_id: String,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let chat_file = data_dir.join("chats").join(format!("{}.json", character_id));

    if chat_file.exists() {
        fs::remove_file(chat_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 保存世界书数据
#[tauri::command]
pub async fn save_world_info(
    app: AppHandle,
    character_id: String,
    data: Value,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let world_dir = data_dir.join("worldinfo");
    fs::create_dir_all(&world_dir).map_err(|e| e.to_string())?;

    let world_file = world_dir.join(format!("{}.json", character_id));
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(world_file, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取世界书数据
#[tauri::command]
pub async fn get_world_info(
    app: AppHandle,
    character_id: String,
) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let world_file = data_dir.join("worldinfo").join(format!("{}.json", character_id));

    if !world_file.exists() {
        return Ok(serde_json::json!({}));
    }

    let json = fs::read_to_string(world_file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&json).unwrap_or(serde_json::json!({}));

    Ok(data)
}

/// 保存角色信息
#[tauri::command]
pub async fn save_character(
    app: AppHandle,
    id: String,
    name: String,
    description: Option<String>,
    avatar_url: Option<String>,
    system_prompt: Option<String>,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let char_dir = data_dir.join("characters");
    fs::create_dir_all(&char_dir).map_err(|e| e.to_string())?;

    let char_file = char_dir.join(format!("{}.json", id));
    let character = serde_json::json!({
        "id": id,
        "name": name,
        "description": description,
        "avatarUrl": avatar_url,
        "systemPrompt": system_prompt
    });

    let json = serde_json::to_string_pretty(&character).map_err(|e| e.to_string())?;
    fs::write(char_file, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取所有角色
#[tauri::command]
pub async fn get_characters(app: AppHandle) -> Result<Vec<Value>, String> {
    let data_dir = get_data_dir(&app)?;
    let char_dir = data_dir.join("characters");

    if !char_dir.exists() {
        return Ok(Vec::new());
    }

    let mut characters = Vec::new();

    for entry in fs::read_dir(char_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
            if let Ok(character) = serde_json::from_str::<Value>(&json) {
                characters.push(character);
            }
        }
    }

    Ok(characters)
}

/// 通用 KV 持久化（前端清缓存后仍可讀）
#[tauri::command]
pub async fn save_kv(app: AppHandle, name: String, data: Value) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let file = data_dir.join(format!("{name}.json"));
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    // 写入文件并强制刷新到磁盘
    fs::write(&file, &json).map_err(|e| e.to_string())?;

    // Android 上强制同步到磁盘
    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(&file) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }

    // 记录保存的文件路径和数据摘要（用于调试）
    eprintln!("[save_kv] 文件: {:?}, 大小: {} bytes", file, json.len());
    if name == "llm_profiles_v1" {
        if let Some(obj) = data.as_object() {
            if let Some(active_id) = obj.get("activeProfileId") {
                eprintln!("[save_kv] activeProfileId: {}", active_id);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn load_kv(app: AppHandle, name: String) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let file = data_dir.join(format!("{name}.json"));

    if !file.exists() {
        eprintln!("[load_kv] 文件不存在: {:?}", file);
        return Ok(serde_json::json!({}));
    }

    let max_len: u64 = 10 * 1024 * 1024; // 10 MiB
    if let Ok(meta) = fs::metadata(&file) {
        let len = meta.len();
        if len > max_len {
            eprintln!("[load_kv] 文件过大，跳过加载: {:?}, {} bytes", file, len);
            return Ok(serde_json::json!({ "_tooLarge": true, "size": len }));
        }
    }

    let json = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    // 记录加载的文件路径和数据摘要（用于调试）
    eprintln!("[load_kv] 文件: {:?}, 大小: {} bytes", file, json.len());
    if name == "llm_profiles_v1" {
        if let Some(obj) = data.as_object() {
            if let Some(active_id) = obj.get("activeProfileId") {
                eprintln!("[load_kv] activeProfileId: {}", active_id);
            }
            if let Some(profiles) = obj.get("profiles") {
                if let Some(profiles_obj) = profiles.as_object() {
                    eprintln!("[load_kv] profiles数量: {}", profiles_obj.len());
                }
            }
        }
    }

    Ok(data)
}

#[derive(serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub ok: bool,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Native HTTP request to bypass WebView CORS (used by OpenAI-compatible providers like DeepSeek).
#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpResponse, String> {
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;

    let mut header_map = reqwest::header::HeaderMap::new();
    for (k, v) in headers {
        let name = reqwest::header::HeaderName::from_bytes(k.as_bytes()).map_err(|e| e.to_string())?;
        let value = reqwest::header::HeaderValue::from_str(&v).map_err(|e| e.to_string())?;
        header_map.insert(name, value);
    }

    let mut builder = reqwest::Client::builder();
    if let Some(ms) = timeout_ms {
        builder = builder.timeout(std::time::Duration::from_millis(ms));
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let mut req = client.request(method, url).headers(header_map);
    if let Some(body) = body {
        req = req.body(body);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let mut out_headers: HashMap<String, String> = HashMap::new();
    for (k, v) in resp.headers().iter() {
        if let Ok(vs) = v.to_str() {
            out_headers.insert(k.as_str().to_string(), vs.to_string());
        }
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        headers: out_headers,
        body,
    })
}

/// JS -> Rust log bridge (prints to logcat via stderr on Android)
#[tauri::command]
pub async fn log_js(tag: String, level: Option<String>, message: String, data: Option<Value>) -> Result<(), String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Ok(());
    }
    let lvl = level.unwrap_or_else(|| "info".to_string());
    let mut msg = message;
    // Avoid huge logcat entries (e.g. prompt blobs)
    const MAX_LEN: usize = 2000;
    if msg.len() > MAX_LEN {
        msg.truncate(MAX_LEN);
        msg.push_str("…");
    }
    if let Some(d) = data {
        let dv = serde_json::to_string(&d).unwrap_or_else(|_| "\"<unserializable>\"".to_string());
        let mut ds = dv;
        if ds.len() > MAX_LEN {
            ds.truncate(MAX_LEN);
            ds.push_str("…");
        }
        eprintln!("[js][{}][{}] {} {}", tag, lvl, msg, ds);
    } else {
        eprintln!("[js][{}][{}] {}", tag, lvl, msg);
    }
    Ok(())
}
