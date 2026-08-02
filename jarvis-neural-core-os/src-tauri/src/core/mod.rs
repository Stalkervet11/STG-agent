// ============================================================
// JARVIS INTELLIGENCE PIPELINE (LLM Core)
// ============================================================
// Модули:
//   - personality.rs : системные промпты («Сухой технарь»)
//   - openrouter.rs  : клиент OpenRouter API
//   - ollama.rs      : клиент локальной Ollama
//   - router.rs      : умный роутер (Ollama → OpenRouter)

pub mod personality;
pub mod openrouter;
pub mod ollama;
pub mod router;
