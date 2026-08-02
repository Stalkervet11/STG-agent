// ============================================================
// JARVIS AGENT TOOLS — Active Tooling & Research
// ============================================================
//
// Активный инструментарий агента-исследователя:
//   - browser.rs           : изолированный Chromium (headless)
//   - script_executor.rs   : песочница для локальных скриптов
//   - resource_manager.rs  : реестр личных ресурсов пользователя

pub mod browser;
pub mod resource_manager;
pub mod script_executor;
pub mod runner;
