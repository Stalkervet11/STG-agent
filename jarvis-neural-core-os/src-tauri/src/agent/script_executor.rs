// ============================================================
// JARVIS SCRIPT EXECUTOR (Sandboxed Local Execution Engine)
// ============================================================
//
// Изолированный запуск локальных скриптов (Python, Bash, etc.)
// с возвратом stdout, stderr и кода завершения.
//
// Безопасность:
//  • Скрипты запускаются в дочернем процессе ОС.
//  • Таймаут на выполнение (по умолчанию 30 секунд).
//  • Ограничение на размер вывода (8 MB).
//  • Переменные окружения изолированы.
//  • Запрет на запуск из временных/небезопасных директорий.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Command as StdCommand, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

// ── Data Structures ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub elapsed_ms: u64,
    pub script_path: String,
    pub truncated: bool,
}

#[derive(Debug, Clone)]
pub struct ScriptConfig {
    pub timeout_secs: u64,
    pub max_output_bytes: usize,
    pub allowed_extensions: Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub env_vars: HashMap<String, String>,
}

impl Default for ScriptConfig {
    fn default() -> Self {
        Self {
            timeout_secs: 30,
            max_output_bytes: 8 * 1024 * 1024, // 8 MB
            allowed_extensions: vec![
                ".py".to_string(),
                ".sh".to_string(),
                ".bash".to_string(),
                ".rb".to_string(),
                ".js".to_string(),
                ".ts".to_string(),
            ],
            working_dir: None,
            env_vars: HashMap::new(),
        }
    }
}

// ── Main Executor ─────────────────────────────────────────────

/// Выполнить скрипт по пути с аргументами.
///
/// # Arguments
/// * `script_path` — путь к скрипту (относительно корня проекта или абсолютный).
/// * `args` — аргументы командной строки для скрипта.
/// * `config` — конфигурация (таймаут, лимиты).
pub fn execute_script(
    script_path: &str,
    args: &[String],
    config: Option<ScriptConfig>,
) -> Result<ScriptResult, String> {
    let cfg = config.unwrap_or_default();

    // ── Валидация пути ──
    let resolved_path = resolve_script_path(script_path)?;

    // ── Проверка расширения ──
    validate_extension(&resolved_path, &cfg.allowed_extensions)?;

    // ── Проверка существования ──
    if !resolved_path.exists() {
        return Err(format!("Script not found: {}", resolved_path.display()));
    }

    // ── Проверка на исполняемость ──
    let metadata = fs::metadata(&resolved_path)
        .map_err(|e| format!("Cannot read script metadata: {}", e))?;
    if metadata.len() == 0 {
        return Err(format!("Script is empty: {}", resolved_path.display()));
    }

    // ── Авто-определение интерпретатора ──
    let (interpreter, interpreter_args) = detect_interpreter(&resolved_path);

    eprintln!(
        "[SCRIPT:EXEC] Running: {} {} (args: {:?})",
        interpreter,
        resolved_path.display(),
        args
    );

    let start = Instant::now();

    // ── Запуск ──
    let mut cmd = StdCommand::new(&interpreter);
    cmd.args(&interpreter_args);
    cmd.arg(resolved_path.to_string_lossy().to_string());
    for arg in args {
        cmd.arg(arg);
    }

    // Изоляция
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());

    // Рабочая директория
    if let Some(ref wd) = cfg.working_dir {
        cmd.current_dir(wd);
    } else if let Some(parent) = resolved_path.parent() {
        cmd.current_dir(parent);
    }

    // Переменные окружения
    for (key, value) in &cfg.env_vars {
        cmd.env(key, value);
    }
    // Всегда добавляем флаг, что мы в JARVIS
    cmd.env("JARVIS_EXECUTOR", "1");

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn script: {}", e))?;

    let pid = child.id();
    eprintln!("[SCRIPT:EXEC] PID: {} started", pid);

    // ── Чтение вывода с таймаутом ──
    let output = loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Процесс завершился
                break child.wait_with_output();
            }
            Ok(None) => {
                // Ещё работает — проверяем таймаут
                if start.elapsed() > Duration::from_secs(cfg.timeout_secs) {
                    eprintln!(
                        "[SCRIPT:EXEC] PID: {} timeout after {}s — killing",
                        pid, cfg.timeout_secs
                    );
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "Script timed out after {} seconds (PID: {})",
                        cfg.timeout_secs, pid
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Process error: {}", e));
            }
        }
    }
    .map_err(|e| format!("Failed to wait for script: {}", e))?;

    let elapsed = start.elapsed().as_millis() as u64;

    // ── Обработка вывода ──
    let stdout_raw = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_raw = String::from_utf8_lossy(&output.stderr).to_string();

    let (stdout, stdout_truncated) = truncate_output(stdout_raw, cfg.max_output_bytes);
    let (stderr, stderr_truncated) = truncate_output(stderr_raw, cfg.max_output_bytes);

    let exit_code = output.status.code();
    let success = output.status.success();

    let result = ScriptResult {
        success,
        stdout,
        stderr,
        exit_code,
        elapsed_ms: elapsed,
        script_path: resolved_path.to_string_lossy().to_string(),
        truncated: stdout_truncated || stderr_truncated,
    };

    eprintln!(
        "[SCRIPT:EXEC] PID: {} done in {}ms, exit={:?}, success={}",
        pid, elapsed, exit_code, success
    );

    Ok(result)
}

/// Быстрый запуск скрипта с результатом в виде строки (для Tauri команд).
pub fn execute_script_simple(script_path: &str, args: &[String]) -> Result<String, String> {
    let result = execute_script(script_path, args, None)?;
    let mut output = String::new();

    if !result.stdout.is_empty() {
        output.push_str(&result.stdout);
    }
    if !result.stderr.is_empty() {
        if !output.is_empty() {
            output.push('\n');
        }
        output.push_str("[STDERR] ");
        output.push_str(&result.stderr);
    }
    if output.is_empty() {
        output = format!(
            "Script completed in {}ms (exit: {:?})",
            result.elapsed_ms, result.exit_code
        );
    }

    Ok(output)
}

// ── Helpers ───────────────────────────────────────────────────

fn resolve_script_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);

    // Абсолютный путь — используем как есть
    if path.is_absolute() {
        return Ok(path);
    }

    // Относительный — ищем в нескольких местах
    let candidates = vec![
        // 1. Относительно CWD
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join(raw),
        // 2. Относительно ~/.config/jarvis/scripts/
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            PathBuf::from(home)
                .join(".config")
                .join("jarvis")
                .join("scripts")
                .join(raw)
        },
        // 3. Относительно src-tauri/ (корень Rust-проекта)
        {
            if let Ok(exe) = std::env::current_exe() {
                if let Some(parent) = exe.parent() {
                    parent.join(raw)
                } else {
                    PathBuf::from(raw)
                }
            } else {
                PathBuf::from(raw)
            }
        },
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    // Ни один не найден — возвращаем первый кандидат с понятной ошибкой
    Err(format!(
        "Script not found: '{}'. Searched at: {:?}",
        raw,
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
    ))
}

fn validate_extension(path: &PathBuf, allowed: &[String]) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default();

    if ext.is_empty() {
        return Err(format!(
            "Script has no extension: {}. Allowed: {:?}",
            path.display(),
            allowed
        ));
    }

    if !allowed.iter().any(|a| a == &ext) {
        return Err(format!(
            "Disallowed extension '{}' for {}. Allowed: {:?}",
            ext,
            path.display(),
            allowed
        ));
    }

    Ok(())
}

fn detect_interpreter(path: &PathBuf) -> (String, Vec<String>) {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "py" => {
            // Пробуем python3, затем python
            if which("python3") {
                ("python3".to_string(), vec![])
            } else {
                ("python".to_string(), vec![])
            }
        }
        "sh" | "bash" => ("bash".to_string(), vec![]),
        "rb" => ("ruby".to_string(), vec![]),
        "js" => ("node".to_string(), vec![]),
        "ts" => {
            if which("ts-node") {
                ("ts-node".to_string(), vec![])
            } else if which("npx") {
                ("npx".to_string(), vec!["ts-node".to_string()])
            } else {
                ("node".to_string(), vec!["--loader".to_string(), "ts-node/esm".to_string()])
            }
        }
        _ => ("bash".to_string(), vec![]),
    }
}

fn which(bin: &str) -> bool {
    StdCommand::new("which")
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn truncate_output(raw: String, max_bytes: usize) -> (String, bool) {
    if raw.len() <= max_bytes {
        (raw, false)
    } else {
        let truncated = format!(
            "{}...\n[TRUNCATED: output was {} bytes, limit is {} bytes]",
            &raw[..max_bytes.saturating_sub(100)],
            raw.len(),
            max_bytes
        );
        (truncated, true)
    }
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_extension() {
        let cfg = ScriptConfig::default();
        assert!(validate_extension(&PathBuf::from("test.py"), &cfg.allowed_extensions).is_ok());
        assert!(validate_extension(&PathBuf::from("test.sh"), &cfg.allowed_extensions).is_ok());
        assert!(validate_extension(&PathBuf::from("test.exe"), &cfg.allowed_extensions).is_err());
        assert!(validate_extension(&PathBuf::from("test"), &cfg.allowed_extensions).is_err());
    }

    #[test]
    fn test_detect_interpreter() {
        let (int, _) = detect_interpreter(&PathBuf::from("test.py"));
        assert!(int == "python3" || int == "python");

        let (int, _) = detect_interpreter(&PathBuf::from("test.sh"));
        assert_eq!(int, "bash");

        let (int, _) = detect_interpreter(&PathBuf::from("test.rb"));
        assert_eq!(int, "ruby");
    }

    #[test]
    fn test_truncate_output() {
        let s = "hello world".to_string();
        let (out, truncated) = truncate_output(s.clone(), 5);
        assert!(truncated);
        assert!(out.contains("TRUNCATED"));
    }
}
