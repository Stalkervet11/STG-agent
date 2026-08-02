// ============================================================
// OPENROUTER API CLIENT
// ============================================================
// Облачный AI-провайдер для сложных инженерных задач.
// Используется как fallback при недоступности локальной Ollama
// и как основной бэкенд для тяжёлых запросов.

use std::env;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::personality::{self, PromptMode};

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: u32,
    temperature: f32,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Option<Vec<Choice>>,
    error: Option<ApiError>,
}

#[derive(Deserialize)]
struct Choice {
    message: Option<MessageContent>,
}

#[derive(Deserialize)]
struct MessageContent {
    content: Option<String>,
}

#[derive(Deserialize)]
struct ApiError {
    message: Option<String>,
}

/// Отправляет промпт в OpenRouter.
///
/// # Аргументы
/// * `prompt` — текст запроса пользователя.
/// * `mode` — режим промпта (Default, Engineering, Research).
pub async fn ask(prompt: &str, mode: PromptMode) -> Result<String, String> {
    let api_key = env::var("OPENROUTER_API_KEY")
        .map_err(|_| "OPENROUTER_API_KEY not found".to_string())?;
    if api_key.is_empty() || api_key.starts_with("sk-or-v1-xxx") {
        return Err("OPENROUTER_API_KEY is invalid".to_string());
    }

    let model = env::var("OPENROUTER_MODEL")
        .unwrap_or_else(|_| "deepseek/deepseek-chat".to_string());

    let system_prompt = personality::get_prompt(mode);

    let request_body = ChatRequest {
        model: model.clone(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            },
        ],
        max_tokens: 500,
        temperature: 0.7,
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .post(OPENROUTER_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://jarvis-neural-core-os.local")
        .header("X-Title", "JARVIS Neural Core OS")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "OpenRouter timeout (30s)".to_string()
            } else if e.is_connect() {
                "Cannot connect to OpenRouter".to_string()
            } else {
                format!("Network error: {}", e)
            }
        })?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Auth error (401)".to_string());
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("Rate limit (429)".to_string());
    }

    let body: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    if let Some(api_err) = body.error {
        return Err(format!(
            "API error: {}",
            api_err.message.unwrap_or_default()
        ));
    }

    let choices = body.choices.ok_or("No choices in response")?;
    let content = choices
        .first()
        .and_then(|c| c.message.as_ref())
        .and_then(|m| m.content.as_ref())
        .cloned()
        .ok_or("OpenRouter returned empty response")?;

    if content.trim().is_empty() {
        return Err("Empty response from model".to_string());
    }

    Ok(content)
}
