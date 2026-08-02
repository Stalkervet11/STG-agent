// ============================================================
// OLLAMA LOCAL LLM CLIENT
// ============================================================
// Локальный инференс через Ollama API.
// Основной бэкенд для быстрых диалогов и операций с личными данными.

use std::env;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::personality::{self, PromptMode};

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: Option<OllamaResponseMessage>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct OllamaResponseMessage {
    content: String,
}

/// Проверяет, доступен ли сервер Ollama.
pub async fn check_available(base_url: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get(format!("{}/api/tags", base_url))
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "Ollama not running. Start: ollama serve".to_string()
            } else {
                format!("Ollama check error: {}", e)
            }
        })?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Ollama returned status {}", resp.status()))
    }
}

/// Отправляет промпт в локальную Ollama.
///
/// # Аргументы
/// * `prompt` — текст запроса.
/// * `mode` — режим промпта (Default, LocalOnly).
/// * `timeout_secs` — таймаут в секундах (по умолчанию 120).
pub async fn ask(
    prompt: &str,
    mode: PromptMode,
    timeout_secs: u64,
) -> Result<String, String> {
    let base_url =
        env::var("OLLAMA_BASE_URL").unwrap_or_else(|_| "http://localhost:11434".to_string());
    let model =
        env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2".to_string());

    check_available(&base_url).await?;

    let system_prompt = personality::get_prompt(mode);

    let request_body = OllamaChatRequest {
        model: model.clone(),
        messages: vec![
            OllamaMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            OllamaMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            },
        ],
        stream: false,
    };

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Ollama HTTP error: {}", e))?;

    let response = client
        .post(format!("{}/api/chat", base_url))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!(
                    "Ollama timeout ({}s) — модель может быть слишком большой для вашего CPU",
                    timeout_secs
                )
            } else if e.is_connect() {
                "Cannot connect to Ollama. Run: ollama serve".to_string()
            } else {
                format!("Ollama network error: {}", e)
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Ollama returned HTTP {}", status));
    }

    let body: OllamaChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Ollama parse error: {}", e))?;

    if let Some(err) = body.error {
        return Err(format!("Ollama error: {}", err));
    }

    let content = body.message.map(|m| m.content).unwrap_or_default();

    if content.trim().is_empty() {
        return Err("Ollama returned empty response".to_string());
    }

    eprintln!(
        "[OLLAMA] OK: {} chars from model {}",
        content.len(),
        model
    );
    Ok(content)
}

/// Быстрый запрос с коротким таймаутом (для роутера).
pub async fn ask_quiet(prompt: &str) -> Result<String, String> {
    ask(prompt, PromptMode::Default, 4).await
}
