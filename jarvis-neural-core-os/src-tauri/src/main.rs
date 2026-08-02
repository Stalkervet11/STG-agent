// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // ── Загружаем .env ДО всего остального ──
  // dotenv ищет .env в текущей рабочей директории.
  // При запуске через `cargo tauri dev` CWD = корень проекта,
  // при запуске бинарника — там же где бинарник.
  match dotenv::dotenv() {
      Ok(path) => eprintln!("[JARVIS] .env loaded from: {:?}", path),
      Err(e) => eprintln!("[JARVIS] WARNING: .env not found (cwd={:?}): {}",
          std::env::current_dir().unwrap_or_default(), e),
  }

  app_lib::run();
}
