// ============================================================
// SMART AI ROUTER
// ============================================================
//
// Маршрутизация запросов:
//   - Лёгкие/личные запросы → локальная Ollama
//   - Тяжёлые/инженерные → OpenRouter (облако)
//   - При недоступности Ollama → fallback на OpenRouter
//   - При недоступности обоих → информативная ошибка

use super::ollama;
use super::openrouter;
use super::personality::PromptMode;

/// Умный роутер: сначала Ollama, fallback → OpenRouter.
///
/// Это основной метод для получения ответа от AI.
pub async fn route(prompt: &str) -> Result<String, String> {
    // Пробуем локальную Ollama (быстрый таймаут 4с).
    let ollama_result = ollama::ask_quiet(prompt).await;

    match ollama_result {
        Ok(reply) => {
            eprintln!("[AI:router] ✅ Using Ollama (local)");
            return Ok(reply);
        }
        Err(e) => {
            eprintln!("[AI:router] Ollama N/A ({}), trying OpenRouter...", e);
        }
    }

    // Fallback на OpenRouter.
    match openrouter::ask(prompt, PromptMode::Default).await {
        Ok(reply) => {
            eprintln!("[AI:router] ✅ Using OpenRouter (cloud)");
            Ok(reply)
        }
        Err(or_err) => {
            let ollama_err = ollama::ask_quiet(prompt).await.err().unwrap_or_default();
            Err(format!(
                "Все AI-провайдеры недоступны.\n🖥️ Ollama: {}\n☁️ OpenRouter: {}",
                ollama_err, or_err
            ))
        }
    }
}

/// Форсирует локальный режим (только Ollama, без облака).
/// Для запросов, касающихся личных данных пользователя.
pub async fn route_local_only(prompt: &str) -> Result<String, String> {
    ollama::ask(prompt, PromptMode::LocalOnly, 120).await
}

/// Форсирует облачный режим (только OpenRouter, инженерный режим).
/// Для сложных архитектурных/кодовых задач.
pub async fn route_engineering(prompt: &str) -> Result<String, String> {
    openrouter::ask(prompt, PromptMode::Engineering).await
}
