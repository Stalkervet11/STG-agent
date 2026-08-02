// ============================================================
// JARVIS MEMORY MODULE — Obsidian Vault Integration
// ============================================================
// Персистентная долгосрочная память на базе локального
// хранилища Obsidian Vault:
//   - vault.rs    : ObsidianVault (CRUD, поиск, оптимизированный контекст)
//   - analyzer.rs : HeuristicAnalyzer (авто-извлечение фактов)

pub mod vault;
pub mod analyzer;
