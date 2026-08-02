// ============================================================
// JARVIS NEURAL CORE OS — Tauri Command Backend
// ============================================================
//
// Все Tauri-команды делегируют в соответствующие модули:
//   - core/       : LLM (Ollama, OpenRouter, Router, Personality)
//   - voice/      : STT (whisper), TTS (Piper → RVC → aplay)
//   - memory/     : Obsidian Vault (CRUD, контекст, профиль)
//   - agent/      : Автономный агент (runner, browser, script_executor)
//   - resource_manager : Реестр локальных ресурсов

use std::env;
use std::fs;
use std::process::Command as StdCommand;
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;

mod agent;
mod browser;
mod core;
mod memory;
mod resource_manager;
mod script_executor;
mod voice;

use agent::runner::{self as agent_runner, AgentTask, AgentTaskMode, AgentTaskStatus, AgentStatus};
use core::personality::PromptMode;

// ═══════════════════════════════════════════════════════════
// HELPER: which
// ═══════════════════════════════════════════════════════════

fn which(bin: &str) -> bool {
    StdCommand::new("which")
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ═══════════════════════════════════════════════════════════
// HELPER: auto-start Ollama если не запущен
// ═══════════════════════════════════════════════════════════

async fn ensure_ollama_running() -> Result<(), String> {
    let base_url = env::var("OLLAMA_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:11434".to_string());
    let model = env::var("OLLAMA_MODEL")
        .unwrap_or_else(|_| "llama3.2".to_string());

    // Быстрая проверка — уже работает?
    if let Ok(()) = check_ollama_http(&base_url).await {
        // Проверяем, есть ли модель
        if !ollama_has_model(&base_url, &model).await {
            eprintln!("[JARVIS] Model '{}' not found — attempting pull...", model);
            let _ = StdCommand::new("ollama")
                .args(["pull", &model])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
            return Err(format!(
                "Модель '{}' не скачана. Запущен ollama pull {}. Подождите 2-5 минут и повторите.",
                model, model
            ));
        }
        return Ok(());
    }

    // Пробуем запустить
    eprintln!("[JARVIS] Ollama not running — attempting auto-start...");

    if which("ollama") {
        let _ = StdCommand::new("ollama")
            .arg("serve")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        // Ждём до 12 секунд (Ollama может долго стартовать с моделью)
        for i in 0..24 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if let Ok(()) = check_ollama_http(&base_url).await {
                eprintln!("[JARVIS] ✅ Ollama auto-started after {}ms", (i + 1) * 500);
                // Проверяем модель после старта
                if !ollama_has_model(&base_url, &model).await {
                    let _ = StdCommand::new("ollama")
                        .args(["pull", &model])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn();
                    return Err(format!(
                        "Модель '{}' не скачана. Запущен ollama pull {}. Подождите и повторите.",
                        model, model
                    ));
                }
                return Ok(());
            }
        }
        return Err(format!(
            "Ollama не отвечает после 12с. Проверьте терминал: ollama serve\nЕсли модель '{}' не скачана: ollama pull {}",
            model, model
        ));
    }

    Err("Ollama не установлен. Установите: curl -fsSL https://ollama.com/install.sh | sh".to_string())
}

async fn ollama_has_model(base_url: &str, model: &str) -> bool {
    if let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(3)).build() {
        if let Ok(resp) = client.get(format!("{}/api/tags", base_url)).send().await {
            if let Ok(body) = resp.text().await {
                return body.contains(model);
            }
        }
    }
    false
}

async fn check_ollama_http(base_url: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let resp = client
        .get(format!("{}/api/tags", base_url))
        .send()
        .await
        .map_err(|_| "Ollama not reachable".to_string())?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Ollama HTTP {}", resp.status()))
    }
}

// ═══════════════════════════════════════════════════════════
// HELPER: запись диалога в Obsidian Vault
// ═══════════════════════════════════════════════════════════

/// Сохраняет реплику пользователя и ответ ассистента в Obsidian Vault.
/// Best-effort — ошибки пишутся в stderr, но не ломают основной поток.
fn save_dialogue(user_msg: &str, assistant_msg: &str) {
    let vault_path = env::var("OBSIDIAN_VAULT_PATH")
        .unwrap_or_else(|_| "~/Documents/ObsidianVault".to_string());

    let vault = match memory::vault::ObsidianVault::new(&vault_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[DIALOGUE] Vault unavailable: {} — dialogue not saved", e);
            return;
        }
    };

    // Пишем в chat_log.md
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    let entry = format!(
        "### {}\n**User:** {}\n**JARVIS:** {}\n",
        timestamp,
        user_msg.trim(),
        assistant_msg.trim()
    );

    if let Err(e) = vault.append_note("context/chat_log.md", &entry) {
        eprintln!("[DIALOGUE] Failed to append to chat_log: {}", e);
    } else {
        eprintln!("[DIALOGUE] Saved to chat_log.md");
    }

    // Авто-извлечение фактов о пользователе
    let conversation = format!("User: {}\nJARVIS: {}", user_msg, assistant_msg);
    if let Err(e) = vault.extract_and_update_profile(&conversation) {
        eprintln!("[DIALOGUE] Profile extraction error: {}", e);
    }
}

/// Внедряет контекст Obsidian Vault в промпт перед отправкой AI.
fn enrich_with_memory(prompt: &str) -> String {
    memory::vault::inject_vault_context(prompt)
}

// ═══════════════════════════════════════════════════════════
// DIAGNOSTIC — полная проверка всех систем
// ═══════════════════════════════════════════════════════════

#[derive(Serialize)]
struct DiagnosticReport {
    timestamp: String,
    hostname: String,
    system: DiagnosticSystem,
    ollama: DiagnosticItem,
    openrouter: DiagnosticItem,
    whisper: DiagnosticItem,
    piper_tts: DiagnosticItem,
    obsidian_vault: DiagnosticItem,
    browser: DiagnosticItem,
    aider: DiagnosticItem,
    rust_modules: DiagnosticModules,
    total_score: String, // "OK" / "WARN" / "BROKEN"
}

#[derive(Serialize)]
struct DiagnosticSystem {
    os: String,
    cpu_cores: usize,
    ram_total_gb: String,
    uptime: String,
}

#[derive(Serialize)]
struct DiagnosticItem {
    available: bool,
    details: String,
    fix: String,
}

#[derive(Serialize)]
struct DiagnosticModules {
    core_router: bool,
    core_ollama: bool,
    core_openrouter: bool,
    core_personality: bool,
    voice_stt: bool,
    voice_tts: bool,
    memory_vault: bool,
    agent_runner: bool,
    agent_browser: bool,
    resource_manager: bool,
    script_executor: bool,
}

#[tauri::command]
async fn jarvis_diagnostic() -> Result<DiagnosticReport, String> {
    eprintln!("[DIAGNOSTIC] Running full system check...");

    // ── System ──
    let sys = DiagnosticSystem {
        os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        cpu_cores: num_cpus(),
        ram_total_gb: format!("{:.1}", ram_total_gb()),
        uptime: uptime_str(),
    };

    // ── Ollama ──
    let (ollama_ok, ollama_details, ollama_fix) = {
        match ensure_ollama_running().await {
            Ok(()) => (true, "Ollama running & reachable".into(), "—".into()),
            Err(e) => (
                false,
                format!("Ollama N/A: {}", e),
                "Установите: curl -fsSL https://ollama.com/install.sh | sh\nЗатем: ollama pull llama3.2".into(),
            ),
        }
    };

    // ── OpenRouter ──
    let (or_ok, or_details, or_fix) = {
        let key = env::var("OPENROUTER_API_KEY").unwrap_or_default();
        if key.is_empty() || key.starts_with("sk-or-v1-xxx") {
            (
                false,
                "API-ключ не настроен".into(),
                "Создайте .env: OPENROUTER_API_KEY=sk-or-v1-...\nПолучить: https://openrouter.ai/keys".into(),
            )
        } else {
            (true, format!("Ключ: {}...", &key[..20]), "—".into())
        }
    };

    // ── Whisper (STT) ──
    let (whisper_ok, whisper_details, whisper_fix) = {
        match voice::stt::find_whisper() {
            Ok(tool) => {
                let model = voice::stt::find_whisper_model_path().unwrap_or_else(|_| "?".into());
                (true, format!("{:?} / model: {}", tool.flavor, model), "—".into())
            }
            Err(e) => (
                false,
                format!("Whisper не найден: {}", e),
                "sudo dnf install whisper-cpp\nИЛИ: pip install openai-whisper".into(),
            ),
        }
    };

    // ── Piper TTS ──
    let (piper_ok, piper_details, piper_fix) = {
        if which("piper") {
            let home = env::var("HOME").unwrap_or_else(|_| "/tmp".into());
            let model = format!("{}/.local/share/jarvis/piper/ru_RU-denis-medium.onnx", home);
            let model_exists = std::path::Path::new(&model).exists();
            (
                model_exists,
                if model_exists {
                    format!("Piper found + model: {}", model)
                } else {
                    "Piper found, модель отсутствует".into()
                },
                "Скачайте модель: mkdir -p ~/.local/share/jarvis/piper && wget -O ~/.local/share/jarvis/piper/ru_RU-denis-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx".into(),
            )
        } else {
            (false, "Piper не установлен".into(), "sudo dnf install piper".into())
        }
    };

    // ── Obsidian Vault ──
    let (vault_ok, vault_details, vault_fix) = {
        let vault_path = env::var("OBSIDIAN_VAULT_PATH")
            .unwrap_or_else(|_| "~/Documents/ObsidianVault".to_string());
        let expanded = shellexpand::tilde(&vault_path).to_string();
        let path = std::path::Path::new(&expanded);
        if path.exists() && path.is_dir() {
            let context_dir = path.join("context");
            let context_ok = context_dir.exists();
            (
                context_ok,
                format!("Vault: {} (context: {})", expanded, if context_ok { "✓" } else { "✗" }),
                if !context_ok {
                    "JARVIS создаст context/ автоматически при первом диалоге".into()
                } else {
                    "—".into()
                },
            )
        } else {
            (
                false,
                format!("Vault не найден: {}", expanded),
                "Укажите путь к Obsidian Vault в .env: OBSIDIAN_VAULT_PATH=~/Documents/ObsidianVault".into(),
            )
        }
    };

    // ── Browser ──
    let (browser_ok, browser_details, browser_fix) = {
        if which("chromium-browser") || which("google-chrome") || which("chromium") {
            (true, "Chromium-based browser found".into(), "—".into())
        } else {
            (false, "Chromium не найден".into(), "sudo dnf install chromium".into())
        }
    };

    // ── Aider ──
    let (aider_ok, aider_details, aider_fix) = {
        if which("aider") {
            (true, "Aider installed".into(), "—".into())
        } else {
            (false, "Aider не установлен".into(), "pip install aider-chat".into())
        }
    };

    // ── Rust modules ──
    let modules = DiagnosticModules {
        core_router: true,
        core_ollama: true,
        core_openrouter: true,
        core_personality: true,
        voice_stt: true,
        voice_tts: true,
        memory_vault: true,
        agent_runner: true,
        agent_browser: true,
        resource_manager: true,
        script_executor: true,
    };

    let ok_count = [
        ollama_ok, or_ok, whisper_ok, piper_ok, vault_ok, browser_ok, aider_ok,
    ]
    .iter()
    .filter(|&&x| x)
    .count();

    let total_score = if ok_count >= 6 { "OK" } else if ok_count >= 3 { "WARN" } else { "BROKEN" };

    let report = DiagnosticReport {
        timestamp: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        hostname: hostname(),
        system: sys,
        ollama: DiagnosticItem { available: ollama_ok, details: ollama_details, fix: ollama_fix },
        openrouter: DiagnosticItem { available: or_ok, details: or_details, fix: or_fix },
        whisper: DiagnosticItem { available: whisper_ok, details: whisper_details, fix: whisper_fix },
        piper_tts: DiagnosticItem { available: piper_ok, details: piper_details, fix: piper_fix },
        obsidian_vault: DiagnosticItem { available: vault_ok, details: vault_details, fix: vault_fix },
        browser: DiagnosticItem { available: browser_ok, details: browser_details, fix: browser_fix },
        aider: DiagnosticItem { available: aider_ok, details: aider_details, fix: aider_fix },
        rust_modules: modules,
        total_score: total_score.to_string(),
    };

    eprintln!(
        "[DIAGNOSTIC] Complete: {} — {}/7 systems OK",
        total_score, ok_count
    );
    Ok(report)
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

fn ram_total_gb() -> f64 {
    if let Ok(output) = StdCommand::new("free").arg("-b").output() {
        let s = String::from_utf8_lossy(&output.stdout);
        for line in s.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(bytes) = parts[1].parse::<f64>() {
                    return (bytes / 1_073_741_824.0 * 10.0).round() / 10.0;
                }
            }
        }
    }
    0.0
}

fn uptime_str() -> String {
    if let Ok(output) = StdCommand::new("uptime").arg("-p").output() {
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !s.is_empty() {
            return s;
        }
    }
    "unknown".into()
}

fn hostname() -> String {
    StdCommand::new("hostname")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into())
}

// ═══════════════════════════════════════════════════════════
// SYSTEM COMMANDS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn execute_command(action: String, target: String) -> Result<String, String> {
    match action.as_str() {
        "search" => {
            let query = target.replace(' ', "+");
            let url = format!("https://www.google.com/search?q={}", query);
            StdCommand::new("xdg-open")
                .arg(&url)
                .spawn()
                .map_err(|e| format!("Не удалось открыть браузер: {}", e))?;
            Ok(format!("Поиск открыт: {}", target))
        }
        "launch" => {
            // Пробуем напрямую, затем lowercased, затем xdg-open
            let mut success = false;
            for cmd in &[target.as_str(), &target.to_lowercase()] {
                if StdCommand::new(cmd).spawn().is_ok() {
                    success = true;
                    break;
                }
            }
            if !success {
                StdCommand::new("xdg-open")
                    .arg(&target)
                    .spawn()
                    .map_err(|e| format!("Не удалось запустить '{}': {}", target, e))?;
            }
            Ok(format!("Запущено: {}", target))
        }
        "vpn_start" => {
            let service = if target.is_empty() { "openvpn".to_string() } else { target };
            let output = StdCommand::new("systemctl")
                .arg("start")
                .arg(&service)
                .output()
                .map_err(|e| format!("systemctl: {}", e))?;
            if output.status.success() {
                Ok(format!("VPN запущен: {}", service))
            } else {
                let err = String::from_utf8_lossy(&output.stderr);
                Err(format!("Ошибка запуска VPN ({}): {}", service, err.trim()))
            }
        }
        "vpn_restart" => {
            let service = if target.is_empty() { "openvpn".to_string() } else { target };
            let output = StdCommand::new("systemctl")
                .arg("restart")
                .arg(&service)
                .output()
                .map_err(|e| format!("systemctl: {}", e))?;
            if output.status.success() {
                Ok(format!("VPN перезапущен: {}", service))
            } else {
                let err = String::from_utf8_lossy(&output.stderr);
                Err(format!("Ошибка перезапуска VPN ({}): {}", service, err.trim()))
            }
        }
        "create_folder" => {
            let path = shellexpand::tilde(&target).to_string();
            fs::create_dir_all(&path)
                .map_err(|e| format!("Не могу создать папку '{}': {}", path, e))?;
            Ok(format!("Папка создана: {}", path))
        }
        "create_file" => {
            let path = shellexpand::tilde(&target).to_string();
            if let Some(parent) = std::path::Path::new(&path).parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Не могу создать директорию: {}", e))?;
            }
            fs::write(&path, "")
                .map_err(|e| format!("Не могу создать файл '{}': {}", path, e))?;
            Ok(format!("Файл создан: {}", path))
        }
        _ => Err(format!("Неизвестное действие: '{}'. Доступны: search, launch, vpn_start, vpn_restart, create_folder, create_file", action)),
    }
}

// ═══════════════════════════════════════════════════════════
// SYSTEM METRICS (sysinfo)
// ═══════════════════════════════════════════════════════════

#[derive(Serialize)]
struct SystemMetricsResponse {
    cpu: f32,
    ram: f64,
    gpu: Option<f32>,
    cpu_temp: Option<f32>,
    uptime: u64,
    processes: usize,
    load_avg: Vec<f64>,
}

#[tauri::command]
fn get_system_metrics() -> Result<SystemMetricsResponse, String> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_cpu_all();

    let cpu_usage = sys.global_cpu_usage();
    let total_mem = sys.total_memory() as f64;
    let used_mem = sys.used_memory() as f64;
    let ram_usage = if total_mem > 0.0 { (used_mem / total_mem) * 100.0 } else { 0.0 };

    let gpu_temp: Option<f32> = {
        let comps = sysinfo::Components::new_with_refreshed_list();
        comps
            .iter()
            .find(|c| {
                let label = c.label().to_lowercase();
                label.contains("gpu") || label.contains("nvidia") || label.contains("amdgpu")
            })
            .map(|c| c.temperature())
    };

    let cpu_temp: Option<f32> = {
        let comps = sysinfo::Components::new_with_refreshed_list();
        comps
            .iter()
            .find(|c| {
                let label = c.label().to_lowercase();
                label.contains("cpu") || label.contains("core") || label.contains("package")
                    || label.contains("tctl") || label.contains("tdie")
            })
            .map(|c| c.temperature())
    };

    let load_avg = System::load_average();
    let load_vec = vec![load_avg.one as f64, load_avg.five as f64, load_avg.fifteen as f64];

    Ok(SystemMetricsResponse {
        cpu: cpu_usage.round(),
        ram: (ram_usage * 10.0).round() / 10.0,
        gpu: gpu_temp.map(|_| 0.0),
        cpu_temp,
        uptime: System::uptime(),
        processes: sys.processes().len(),
        load_avg: load_vec,
    })
}

// ═══════════════════════════════════════════════════════════
// AI COMMANDS — используют core:: модули + сохраняют диалог
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn ask_openrouter(prompt: String) -> Result<String, String> {
    eprintln!("[AI:openrouter] Request ({} chars)", prompt.len());
    let enriched = enrich_with_memory(&prompt);
    let reply = core::openrouter::ask(&enriched, PromptMode::Default).await?;
    save_dialogue(&prompt, &reply);
    Ok(reply)
}

#[tauri::command]
async fn ask_ollama(prompt: String) -> Result<String, String> {
    eprintln!("[AI:ollama] Request ({} chars)", prompt.len());
    ensure_ollama_running().await?;
    let enriched = enrich_with_memory(&prompt);
    let reply = core::ollama::ask(&enriched, PromptMode::Default, 120).await?;
    save_dialogue(&prompt, &reply);
    Ok(reply)
}

#[tauri::command]
async fn ask_ai(prompt: String) -> Result<String, String> {
    eprintln!("[AI:smart] Request ({} chars)", prompt.len());

    // Попытка авто-запуска Ollama
    let _ = ensure_ollama_running().await;

    let enriched = enrich_with_memory(&prompt);
    let reply = core::router::route(&enriched).await?;
    save_dialogue(&prompt, &reply);
    Ok(reply)
}

#[tauri::command]
async fn ask_local_only(prompt: String) -> Result<String, String> {
    eprintln!("[AI:local_only] Request ({} chars)", prompt.len());
    ensure_ollama_running().await?;
    let enriched = enrich_with_memory(&prompt);
    let reply = core::router::route_local_only(&enriched).await?;
    save_dialogue(&prompt, &reply);
    Ok(reply)
}

#[tauri::command]
async fn ask_engineering(prompt: String) -> Result<String, String> {
    eprintln!("[AI:engineering] Request ({} chars)", prompt.len());
    let enriched = enrich_with_memory(&prompt);
    let reply = core::router::route_engineering(&enriched).await?;
    save_dialogue(&prompt, &reply);
    Ok(reply)
}

#[tauri::command]
async fn ask_research(prompt: String) -> Result<String, String> {
    eprintln!("[AI:research] Request ({} chars)", prompt.len());
    let enriched = enrich_with_memory(&prompt);
    let reply = core::openrouter::ask(&enriched, PromptMode::Research).await?;
    save_dialogue(&prompt, &reply);
    Ok(reply)
}

// ═══════════════════════════════════════════════════════════
// STT: пересылка web-аудио → voice::stt
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn transcribe_audio(audio_bytes: Vec<u8>) -> Result<String, String> {
    voice::stt::transcribe_web_blob(&audio_bytes)
}

// ═══════════════════════════════════════════════════════════
// STT: прямой захват с микрофона → whisper
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn start_voice_input(app: tauri::AppHandle) -> Result<String, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let tool = voice::stt::find_whisper()?;
    let model_ref = match tool.flavor {
        voice::stt::WhisperFlavor::Cpp => voice::stt::find_whisper_model_path()?,
        voice::stt::WhisperFlavor::Python => {
            voice::stt::model_name_from_path(&voice::stt::find_whisper_model_path()?)
        }
    };

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "Микрофон не найден".to_string())?;
    let device_name = device.name().unwrap_or_else(|_| "Unknown".into());
    eprintln!("[VOICE:start] Mic: {}", device_name);

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("Ошибка конфигурации микрофона: {}", e))?;
    let sample_rate = supported_config.sample_rate().0;
    eprintln!(
        "[VOICE:start] Config: {} Hz, {} ch, whisper={:?}",
        sample_rate,
        supported_config.channels(),
        tool.flavor
    );

    use tauri::Emitter;
    let _ = app.emit(
        "assistant-state",
        serde_json::json!({
            "state": "recording",
            "message": "Запись с микрофона..."
        }),
    );

    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = voice::stt::record_mic_and_transcribe(
            device,
            supported_config,
            sample_rate,
            tool,
            model_ref,
            |state, msg| {
                let _ = app_clone.emit(
                    "assistant-state",
                    serde_json::json!({ "state": state, "message": msg }),
                );
            },
        );

        // Эмитим распознанный текст
        if let Ok(ref text) = result {
            let _ = app_clone.emit("voice-command-detected", text);
        }
        let _ = app_clone.emit(
            "assistant-state",
            serde_json::json!({ "state": "idle", "message": "Готов к командам" }),
        );

        let _ = tx.send(result);
    });

    rx.await
        .unwrap_or_else(|_| Err("Внутренняя ошибка: поток записи упал".to_string()))
}

// ═══════════════════════════════════════════════════════════
// TTS: озвучка текста (Piper → RVC → aplay)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn speak_text(text: String) -> Result<String, String> {
    voice::tts::speak(&text).await
}

#[tauri::command]
async fn speak_response(text: String) -> Result<String, String> {
    voice::tts::speak(&text).await
}

// ═══════════════════════════════════════════════════════════
// RESOURCE MANAGER COMMANDS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn list_local_resources() -> Result<Vec<resource_manager::LocalResource>, String> {
    Ok(resource_manager::list_resources())
}

#[tauri::command]
fn find_local_resource(query: String) -> Result<Option<resource_manager::LocalResource>, String> {
    Ok(resource_manager::find_resource(&query))
}

#[tauri::command]
fn add_local_resource(
    name: String,
    aliases: Vec<String>,
    handler_script: Option<String>,
    resource_type: Option<String>,
    description: Option<String>,
) -> Result<resource_manager::LocalResource, String> {
    let resource = resource_manager::LocalResource {
        name,
        aliases,
        handler_script,
        r#type: resource_type.unwrap_or_else(|| "local_only".to_string()),
        description,
        added_at: None,
    };
    resource_manager::add_resource(resource)
}

#[tauri::command]
fn remove_local_resource(name: String) -> Result<String, String> {
    resource_manager::remove_resource(&name)?;
    Ok(format!("Ресурс '{}' удалён", name))
}

#[tauri::command]
fn export_resources() -> Result<String, String> {
    resource_manager::export_registry_json()
}

#[tauri::command]
fn import_resources(json: String) -> Result<String, String> {
    let count = resource_manager::import_registry_json(&json)?;
    Ok(format!("Импортировано {} новых ресурсов", count))
}

#[tauri::command]
fn check_is_local_resource(query: String) -> Result<bool, String> {
    Ok(resource_manager::is_local_resource_query(&query))
}

#[tauri::command]
fn get_resource_registry_path() -> Result<String, String> {
    let home = env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let path = std::path::PathBuf::from(home)
        .join(".config")
        .join("jarvis")
        .join("local_resources.json");
    Ok(path.to_string_lossy().to_string())
}

// ═══════════════════════════════════════════════════════════
// SCRIPT EXECUTOR COMMANDS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn execute_local_script(script_path: String, args: Vec<String>) -> Result<String, String> {
    script_executor::execute_script_simple(&script_path, &args)
}

#[tauri::command]
fn execute_resource_handler(resource_name: String, user_query: String) -> Result<String, String> {
    let resource = resource_manager::find_resource(&resource_name)
        .ok_or_else(|| format!("Ресурс не найден: {}", resource_name))?;

    let script_path = resource
        .handler_script
        .ok_or_else(|| format!("Для ресурса '{}' не настроен скрипт-обработчик", resource_name))?;

    eprintln!(
        "[RESOURCE:HANDLER] Executing handler for '{}': {} (query: {})",
        resource.name, script_path, user_query
    );

    let args = vec![
        "--query".to_string(),
        user_query,
        "--resource".to_string(),
        resource.name.clone(),
    ];

    script_executor::execute_script_simple(&script_path, &args)
}

#[tauri::command]
fn execute_shell(command: String) -> Result<String, String> {
    eprintln!("[SHELL:EXEC] {}", command);

    let output = StdCommand::new("bash")
        .arg("-c")
        .arg(&command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Ошибка запуска shell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit = output.status.code().unwrap_or(-1);

    let mut result = String::new();
    if !stdout.is_empty() {
        result.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str("[STDERR] ");
        result.push_str(&stderr);
    }
    if result.is_empty() {
        result = format!("Команда выполнена (выход: {})", exit);
    }

    eprintln!(
        "[SHELL:EXEC] exit={} stdout_len={} stderr_len={}",
        exit,
        stdout.len(),
        stderr.len()
    );
    Ok(result)
}

#[tauri::command]
fn create_file_with_content(path: String, content: String) -> Result<String, String> {
    let expanded = shellexpand::tilde(&path).to_string();
    if let Some(parent) = std::path::Path::new(&expanded).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Не могу создать родительскую папку: {}", e))?;
    }
    fs::write(&expanded, &content)
        .map_err(|e| format!("Не могу записать файл '{}': {}", expanded, e))?;
    Ok(format!("Файл записан: {} ({} байт)", expanded, content.len()))
}

// ═══════════════════════════════════════════════════════════
// AIDER INTEGRATION
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn run_aider_task(task_prompt: String) -> Result<String, String> {
    eprintln!("[AIDER] Task: {}", task_prompt);

    if !which("aider") {
        return Err(
            "Aider не установлен. Установите: pip install aider-chat".to_string(),
        );
    }

    // Определяем рабочую директорию — там где пользователь сейчас
    let cwd = env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

    let output = StdCommand::new("aider")
        .args(["--message", &task_prompt, "--no-git", "--yes"])
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Ошибка запуска Aider: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        return Err(format!(
            "Aider завершился с ошибкой (exit {}): {}",
            code,
            if stderr.is_empty() { &stdout } else { &stderr }
        ));
    }

    Ok(if stdout.is_empty() { stderr } else { stdout })
}

// ═══════════════════════════════════════════════════════════
// AGENT CONTROL COMMANDS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn agent_submit_task(prompt: String, mode: String) -> Result<String, String> {
    let task_mode = match mode.as_str() {
        "local_only" => AgentTaskMode::LocalOnly,
        "research" => AgentTaskMode::Research,
        "engineering" => AgentTaskMode::Engineering,
        "aider" => AgentTaskMode::Aider,
        _ => AgentTaskMode::Default,
    };

    let task = AgentTask {
        id: format!(
            "task_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ),
        prompt,
        mode: task_mode,
        priority: 1,
        created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        status: AgentTaskStatus::Pending,
        result: None,
    };

    agent_runner::get_agent_runner().submit(task).await?;
    Ok("Задача отправлена автономному агенту".to_string())
}

#[tauri::command]
async fn agent_get_status() -> Result<AgentStatus, String> {
    Ok(agent_runner::get_agent_runner().get_status().await)
}

#[tauri::command]
async fn agent_shutdown() -> Result<String, String> {
    agent_runner::get_agent_runner().shutdown().await;
    Ok("Сигнал завершения агенту отправлен".to_string())
}

// ═══════════════════════════════════════════════════════════
// OBSIDIAN VAULT COMMANDS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn vault_search(query: String) -> Result<String, String> {
    let vault_path = env::var("OBSIDIAN_VAULT_PATH")
        .unwrap_or_else(|_| "~/Documents/ObsidianVault".to_string());

    let vault = memory::vault::ObsidianVault::new(&vault_path)?;
    let results = vault.search_notes(&query)?;

    if results.is_empty() {
        return Ok("Ничего не найдено в Vault.".to_string());
    }

    let mut output = String::new();
    for (path, _content) in results.iter().take(10) {
        output.push_str(&format!("- {}\n", path));
    }
    if results.len() > 10 {
        output.push_str(&format!("\n... и ещё {} результатов.", results.len() - 10));
    }

    Ok(output)
}

#[tauri::command]
fn vault_context(query: String) -> Result<String, String> {
    let vault_path = env::var("OBSIDIAN_VAULT_PATH")
        .unwrap_or_else(|_| "~/Documents/ObsidianVault".to_string());

    let vault = memory::vault::ObsidianVault::new(&vault_path)?;
    let ctx = vault.get_optimized_context(&query);

    if ctx.is_empty() {
        Ok("Контекст не найден.".to_string())
    } else {
        Ok(ctx)
    }
}

// ═══════════════════════════════════════════════════════════
// TAURI ENTRY POINT
// ═══════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv::dotenv().ok();

    // Инициализируем BrowserManager (lazy)
    browser::init_browser_manager(None);

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            eprintln!("[JARVIS] ═══════════════════════════════════════");
            eprintln!("[JARVIS] Neural Core OS v0.2.0 — Backend Ready");
            eprintln!("[JARVIS] Modules: core, voice, memory, agent, browser");
            eprintln!("[JARVIS] Run 'jarvis_diagnostic' for system check");
            eprintln!("[JARVIS] ═══════════════════════════════════════");

            agent_runner::init_agent_runner();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Diagnostic
            jarvis_diagnostic,
            // System
            execute_command,
            get_system_metrics,
            // AI
            ask_openrouter,
            ask_ollama,
            ask_ai,
            ask_local_only,
            ask_engineering,
            ask_research,
            // STT
            transcribe_audio,
            start_voice_input,
            // TTS
            speak_text,
            speak_response,
            // Resource manager
            list_local_resources,
            find_local_resource,
            add_local_resource,
            remove_local_resource,
            export_resources,
            import_resources,
            check_is_local_resource,
            get_resource_registry_path,
            // Script executor
            execute_local_script,
            execute_resource_handler,
            execute_shell,
            create_file_with_content,
            run_aider_task,
            // Agent
            agent_submit_task,
            agent_get_status,
            agent_shutdown,
            // Obsidian Vault
            vault_search,
            vault_context,
            // Browser
            browser::browser_open,
            browser::browser_fetch,
            browser::browser_click,
            browser::browser_search,
            browser::browser_screenshot,
            browser::browser_shutdown,
            browser::browser_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
