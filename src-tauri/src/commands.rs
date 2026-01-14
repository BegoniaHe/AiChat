use crate::memory_db::{
    MemoryCreateInput,
    MemoryDb,
    MemoryQuery,
    MemoryRecord,
    MemoryUpdateInput,
    TemplateInput,
    TemplateQuery,
    TemplateRecord,
};
use crate::storage::{simple_decrypt, simple_encrypt, ChatMessage};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;

#[cfg(target_os = "android")]
use std::os::unix::io::AsRawFd;

/// 获取数据目录
fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn sanitize_segment(input: &str) -> String {
    let raw = input.trim();
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_');
    let mut cleaned = if trimmed.is_empty() { "default".to_string() } else { out };
    const MAX_LEN: usize = 80;
    if cleaned.len() > MAX_LEN {
        cleaned.truncate(MAX_LEN);
    }
    cleaned
}

fn decode_data_url(data_url: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let raw = data_url.trim();
    if !raw.starts_with("data:") {
        return Err("invalid data url".to_string());
    }
    let mut parts = raw.splitn(2, ',');
    let meta = parts.next().unwrap_or("");
    let payload = parts.next().unwrap_or("");
    if payload.is_empty() {
        return Err("empty data payload".to_string());
    }
    let mime = meta.strip_prefix("data:").unwrap_or("");
    let mut mime_parts = mime.split(';');
    let mime_type = mime_parts.next().unwrap_or("");
    let ext = match mime_type {
        "image/png" => Some("png".to_string()),
        "image/jpeg" => Some("jpg".to_string()),
        "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    };
    let bytes = BASE64_ENGINE.decode(payload).map_err(|e| e.to_string())?;
    Ok((bytes, ext))
}

fn extension_from_name(name: &str) -> Option<String> {
    let raw = name.trim();
    if raw.is_empty() {
        return None;
    }
    let ext = Path::new(raw).extension()?.to_string_lossy().to_string();
    if ext.is_empty() {
        None
    } else {
        Some(ext)
    }
}

fn raw_reply_path(app: &AppHandle, session_id: &str, message_id: &str) -> Result<PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    let sid = sanitize_segment(session_id);
    let mid = sanitize_segment(message_id);
    Ok(data_dir.join("raw_replies").join(sid).join(format!("{mid}.txt")))
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

#[derive(serde::Serialize)]
pub struct WallpaperSaveResult {
    pub path: String,
    pub bytes: usize,
}

#[derive(Default)]
pub struct WallpaperStreamState {
    inner: Mutex<HashMap<String, WallpaperStreamEntry>>,
}

struct WallpaperStreamEntry {
    path: PathBuf,
    previous_path: Option<String>,
}

#[derive(serde::Serialize)]
pub struct WallpaperStreamStartResult {
    pub upload_id: String,
    pub path: String,
}

#[derive(serde::Serialize)]
pub struct WallpaperCleanupResult {
    pub removed: usize,
    pub kept: usize,
}

fn decode_base64_payload(payload: &str) -> Result<Vec<u8>, String> {
    let raw = payload.trim();
    if raw.is_empty() {
        return Err("empty base64 payload".to_string());
    }
    let data = if raw.starts_with("data:") {
        let mut parts = raw.splitn(2, ',');
        let _meta = parts.next().unwrap_or("");
        parts.next().unwrap_or("")
    } else {
        raw
    };
    if data.is_empty() {
        return Err("empty base64 payload".to_string());
    }
    BASE64_ENGINE.decode(data).map_err(|e| e.to_string())
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

/// 保存聊天壁纸到本地（AppData）
#[tauri::command]
pub async fn save_wallpaper(
    app: AppHandle,
    session_id: String,
    data_url: String,
    file_name: Option<String>,
    previous_path: Option<String>,
) -> Result<WallpaperSaveResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    fs::create_dir_all(&wallpaper_root).map_err(|e| e.to_string())?;

    let (bytes, ext_from_mime) = decode_data_url(&data_url)?;
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime.or(ext_from_name).unwrap_or_else(|| "png".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("wallpaper"));
    let ts = chrono::Utc::now().timestamp();
    let file = wallpaper_root.join(format!("wallpaper_{safe_sid}_{stem}_{ts}.{ext}"));
    fs::write(&file, &bytes).map_err(|e| e.to_string())?;

    if let Some(prev) = previous_path {
        let prev_path = PathBuf::from(prev);
        if prev_path.starts_with(&wallpaper_root) && prev_path.exists() {
            let _ = fs::remove_file(prev_path);
        }
    }

    Ok(WallpaperSaveResult {
        path: file.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

/// 保存聊天壁纸（分块传输，支持原图无损保存）
#[tauri::command]
pub async fn save_wallpaper_chunked(
    app: AppHandle,
    session_id: String,
    chunks: Vec<String>,
    file_name: Option<String>,
    mime_type: Option<String>,
    previous_path: Option<String>,
) -> Result<WallpaperSaveResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    fs::create_dir_all(&wallpaper_root).map_err(|e| e.to_string())?;

    // 合并所有Base64块并解码
    let combined = chunks.join("");
    let bytes = BASE64_ENGINE.decode(&combined)
        .map_err(|e| format!("Base64解码失败: {}", e))?;

    // 确定扩展名
    let ext_from_mime = mime_type.as_deref().and_then(|m| match m {
        "image/png" => Some("png".to_string()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    });
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime.or(ext_from_name).unwrap_or_else(|| "png".to_string());

    let stem = sanitize_segment(file_name.as_deref().unwrap_or("wallpaper"));
    let ts = chrono::Utc::now().timestamp();
    let file = wallpaper_root.join(format!("wallpaper_{safe_sid}_{stem}_{ts}.{ext}"));

    fs::write(&file, &bytes).map_err(|e| e.to_string())?;

    // 删除旧壁纸
    if let Some(prev) = previous_path {
        let prev_path = PathBuf::from(prev);
        if prev_path.starts_with(&wallpaper_root) && prev_path.exists() {
            let _ = fs::remove_file(prev_path);
        }
    }

    Ok(WallpaperSaveResult {
        path: file.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

/// 保存聊天壁纸（流式分块，避免大 payload）
#[tauri::command]
pub async fn save_wallpaper_stream_start(
    app: AppHandle,
    session_id: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    previous_path: Option<String>,
    state: State<'_, WallpaperStreamState>,
) -> Result<WallpaperStreamStartResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    fs::create_dir_all(&wallpaper_root).map_err(|e| e.to_string())?;

    let ext_from_mime = mime_type.as_deref().and_then(|m| match m {
        "image/png" => Some("png".to_string()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    });
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime.or(ext_from_name).unwrap_or_else(|| "png".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("wallpaper"));
    let ts = chrono::Utc::now().timestamp_millis();
    let file = wallpaper_root.join(format!("wallpaper_{safe_sid}_{stem}_{ts}.{ext}"));

    fs::write(&file, &[]).map_err(|e| e.to_string())?;

    let upload_id = format!("{safe_sid}_{ts}");
    let entry = WallpaperStreamEntry {
        path: file.clone(),
        previous_path,
    };
    let mut map = state.inner.lock().map_err(|_| "stream state lock poisoned".to_string())?;
    map.insert(upload_id.clone(), entry);

    Ok(WallpaperStreamStartResult {
        upload_id,
        path: file.to_string_lossy().to_string(),
    })
}

/// 追加壁纸分块
#[tauri::command]
pub async fn save_wallpaper_stream_chunk(
    upload_id: String,
    chunk: String,
    state: State<'_, WallpaperStreamState>,
) -> Result<(), String> {
    let (path, _) = {
        let map = state.inner.lock().map_err(|_| "stream state lock poisoned".to_string())?;
        let entry = map.get(upload_id.trim()).ok_or("invalid upload id".to_string())?;
        (entry.path.clone(), entry.previous_path.clone())
    };

    let bytes = decode_base64_payload(&chunk)?;
    let mut file = OpenOptions::new().append(true).open(&path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// 完成保存壁纸
#[tauri::command]
pub async fn save_wallpaper_stream_finish(
    upload_id: String,
    state: State<'_, WallpaperStreamState>,
) -> Result<WallpaperSaveResult, String> {
    let entry = {
        let mut map = state.inner.lock().map_err(|_| "stream state lock poisoned".to_string())?;
        map.remove(upload_id.trim()).ok_or("invalid upload id".to_string())?
    };

    if let Some(prev) = entry.previous_path.clone() {
        let prev_path = PathBuf::from(prev);
        if prev_path.starts_with(entry.path.parent().unwrap_or(Path::new(""))) && prev_path.exists() {
            let _ = fs::remove_file(prev_path);
        }
    }

    let bytes = fs::metadata(&entry.path)
        .map_err(|e| e.to_string())?
        .len() as usize;

    Ok(WallpaperSaveResult {
        path: entry.path.to_string_lossy().to_string(),
        bytes,
    })
}

/// 删除聊天壁纸文件
#[tauri::command]
pub async fn delete_wallpaper(
    app: AppHandle,
    session_id: String,
    path: Option<String>,
) -> Result<bool, String> {
    let raw = path.unwrap_or_default();
    if raw.trim().is_empty() {
        return Ok(false);
    }
    let data_dir = get_data_dir(&app)?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    let target = PathBuf::from(raw);
    if !target.starts_with(&wallpaper_root) {
        return Err("invalid wallpaper path".to_string());
    }
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

/// 清理未引用的壁纸文件
#[tauri::command]
pub async fn cleanup_wallpapers(
    app: AppHandle,
    referenced_paths: Vec<String>,
) -> Result<WallpaperCleanupResult, String> {
    let data_dir = get_data_dir(&app)?;
    let wallpaper_root = data_dir.join("wallpapers");
    if !wallpaper_root.exists() {
        return Ok(WallpaperCleanupResult { removed: 0, kept: 0 });
    }

    let mut referenced = std::collections::HashSet::new();
    for raw in referenced_paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        referenced.insert(trimmed.to_string());
        if let Ok(canon) = PathBuf::from(trimmed).canonicalize() {
            referenced.insert(canon.to_string_lossy().to_string());
        }
    }

    let mut removed = 0usize;
    let mut kept = 0usize;
    let mut stack = vec![wallpaper_root.clone()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let raw_path = path.to_string_lossy().to_string();
            let mut in_use = referenced.contains(&raw_path);
            if !in_use {
                if let Ok(canon) = path.canonicalize() {
                    let canon_str = canon.to_string_lossy().to_string();
                    if referenced.contains(&canon_str) {
                        in_use = true;
                    }
                }
            }
            if in_use {
                kept += 1;
            } else {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }

    Ok(WallpaperCleanupResult { removed, kept })
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

/// 保存原始回复（用于富文本/创意写作回溯）
#[tauri::command]
pub async fn save_raw_reply(
    app: AppHandle,
    session_id: String,
    message_id: String,
    text: String,
) -> Result<(), String> {
    let file = raw_reply_path(&app, &session_id, &message_id)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file, text).map_err(|e| e.to_string())?;

    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(&file) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }

    Ok(())
}

/// 读取原始回复
#[tauri::command]
pub async fn load_raw_reply(
    app: AppHandle,
    session_id: String,
    message_id: String,
) -> Result<Option<String>, String> {
    let file = raw_reply_path(&app, &session_id, &message_id)?;
    if !file.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(file).map_err(|e| e.to_string())?;
    Ok(Some(text))
}

/// 删除原始回复
#[tauri::command]
pub async fn delete_raw_reply(
    app: AppHandle,
    session_id: String,
    message_id: String,
) -> Result<(), String> {
    let file = raw_reply_path(&app, &session_id, &message_id)?;
    if file.exists() {
        fs::remove_file(file).map_err(|e| e.to_string())?;
    }
    Ok(())
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

#[tauri::command]
pub async fn init_database(db: State<'_, MemoryDb>, scope_id: Option<String>) -> Result<(), String> {
    db.init_database(scope_id)
}

#[tauri::command]
pub async fn create_memory(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    input: MemoryCreateInput,
) -> Result<String, String> {
    db.create_memory(scope_id, input)
}

#[tauri::command]
pub async fn update_memory(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    input: MemoryUpdateInput,
) -> Result<(), String> {
    db.update_memory(scope_id, input)
}

#[tauri::command]
pub async fn delete_memory(db: State<'_, MemoryDb>, scope_id: Option<String>, id: String) -> Result<(), String> {
    db.delete_memory(scope_id, id)
}

#[tauri::command]
pub async fn get_memories(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    query: MemoryQuery,
) -> Result<Vec<MemoryRecord>, String> {
    db.get_memories(scope_id, query)
}

#[tauri::command]
pub async fn batch_create_memories(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    memories: Vec<MemoryCreateInput>,
) -> Result<usize, String> {
    db.batch_create_memories(scope_id, memories)
}

#[tauri::command]
pub async fn batch_delete_memories(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    ids: Vec<String>,
) -> Result<usize, String> {
    db.batch_delete_memories(scope_id, ids)
}

#[tauri::command]
pub async fn save_template(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    input: TemplateInput,
) -> Result<(), String> {
    db.save_template(scope_id, input)
}

#[tauri::command]
pub async fn get_templates(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    query: TemplateQuery,
) -> Result<Vec<TemplateRecord>, String> {
    db.get_templates(scope_id, query)
}

#[tauri::command]
pub async fn delete_template(db: State<'_, MemoryDb>, scope_id: Option<String>, id: String) -> Result<(), String> {
    db.delete_template(scope_id, id)
}
