// ============================================================
// OBSIDIAN VAULT — хранилище персистентной памяти JARVIS
// ============================================================
//
// Ключевые возможности:
//   1. Инициализация Vault с поддержкой `~` через shellexpand.
//   2. CRUD: чтение, точечная запись (append), рекурсивный поиск.
//   3. «Умный контекст» (Token Economy) — извлечение релевантных
//      абзацев с жёстким лимитом ~800 токенов.
//   4. Автоматический анализ и компрессия памяти.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::analyzer::HeuristicAnalyzer;

const MAX_CONTEXT_TOKENS: usize = 800;
const CHARS_PER_TOKEN: usize = 4;
const IGNORED_DIRS: &[&str] = &[
    ".obsidian", ".git", ".trash", ".DS_Store", "__pycache__",
];
const CONTEXT_DIR: &str = "context";

// ── ObsidianVault ──────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ObsidianVault {
    vault_root: PathBuf,
    context_dir: PathBuf,
}

impl ObsidianVault {
    // ── Инициализация ───────────────────────────────────

    pub fn new(vault_path: &str) -> Result<Self, String> {
        let expanded = shellexpand::tilde(vault_path).to_string();
        let vault_root = PathBuf::from(&expanded)
            .canonicalize()
            .map_err(|e| {
                format!("Cannot resolve vault path '{}': {}", expanded, e)
            })?;

        if !vault_root.is_dir() {
            return Err(format!(
                "Path exists but is not a directory: {}",
                vault_root.display()
            ));
        }

        let context_dir = vault_root.join(CONTEXT_DIR);
        fs::create_dir_all(&context_dir).map_err(|e| {
            format!(
                "Cannot create context directory {}: {}",
                context_dir.display(),
                e
            )
        })?;

        eprintln!(
            "[OBSIDIAN] Vault ready: root={} context={}",
            vault_root.display(),
            context_dir.display()
        );

        Ok(Self {
            vault_root,
            context_dir,
        })
    }

    // ── Геттеры ─────────────────────────────────────────

    pub fn vault_root(&self) -> &Path {
        &self.vault_root
    }

    pub fn context_dir(&self) -> &Path {
        &self.context_dir
    }

    // ── CRUD: чтение ───────────────────────────────────

    pub fn read_note(&self, relative_path: &str) -> Result<String, String> {
        let full_path = self.resolve_safe(relative_path)?;
        fs::read_to_string(&full_path)
            .map_err(|e| format!("Cannot read {}: {}", full_path.display(), e))
    }

    // ── CRUD: append ───────────────────────────────────

    pub fn append_note(
        &self,
        relative_path: &str,
        content: &str,
    ) -> Result<(), String> {
        let full_path = self.resolve_safe(relative_path)?;

        if let Some(parent) = full_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!(
                        "Cannot create parent dirs for {}: {}",
                        full_path.display(),
                        e
                    )
                })?;
            }
        }

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&full_path)
            .map_err(|e| {
                format!("Cannot open {} for append: {}", full_path.display(), e)
            })?;

        let meta = file.metadata().map_err(|e| {
            format!("Cannot stat {}: {}", full_path.display(), e)
        })?;

        if meta.len() > 0 {
            use std::io::Write;
            writeln!(file).map_err(|e| format!("Write newline error: {}", e))?;
        }
        use std::io::Write;
        write!(file, "{}", content)
            .map_err(|e| format!("Write error to {}: {}", full_path.display(), e))?;

        eprintln!(
            "[OBSIDIAN] Appended to {} ({} chars)",
            relative_path,
            content.len()
        );
        Ok(())
    }

    // ── Рекурсивный список .md ─────────────────────────

    pub fn list_all_notes(&self) -> Result<Vec<PathBuf>, String> {
        let mut result = Vec::new();
        self.walk_dir(&self.vault_root, &mut result)?;
        Ok(result)
    }

    fn walk_dir(&self, dir: &Path, acc: &mut Vec<PathBuf>) -> Result<(), String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Cannot read dir {}: {}", dir.display(), e))?;

        for entry in entries {
            let entry =
                entry.map_err(|e| format!("Dir entry error: {}", e))?;
            let path = entry.path();
            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            if path.is_dir() {
                if IGNORED_DIRS.contains(&file_name) || file_name.starts_with('.') {
                    continue;
                }
                self.walk_dir(&path, acc)?;
            } else if path.is_file() {
                if path.extension().and_then(|e| e.to_str()) == Some("md") {
                    acc.push(path);
                }
            }
        }
        Ok(())
    }

    // ── Поиск по содержимому ───────────────────────────

    pub fn search_notes(
        &self,
        query: &str,
    ) -> Result<Vec<(String, String)>, String> {
        let all_notes = self.list_all_notes()?;
        let keywords: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        if keywords.is_empty() {
            return Ok(Vec::new());
        }

        let mut matches = Vec::new();
        for full_path in all_notes {
            let content = match fs::read_to_string(&full_path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let lower_content = content.to_lowercase();
            if keywords
                .iter()
                .all(|kw| lower_content.contains(kw.as_str()))
            {
                let relative = full_path
                    .strip_prefix(&self.vault_root)
                    .unwrap_or(&full_path)
                    .to_string_lossy()
                    .to_string();
                matches.push((relative, content));
            }
        }

        eprintln!(
            "[OBSIDIAN] Search '{}' → {} hit(s)",
            query,
            matches.len()
        );
        Ok(matches)
    }

    // ── «УМНЫЙ КОНТЕКСТ» (Token Economy) ─────────────

    pub fn get_optimized_context(&self, query: &str) -> String {
        if query.trim().is_empty() {
            return String::new();
        }

        let keywords: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .filter(|w| w.len() >= 2)
            .map(|s| s.to_string())
            .collect();

        if keywords.is_empty() {
            return String::new();
        }

        let all_notes = match self.list_all_notes() {
            Ok(notes) => notes,
            Err(e) => {
                eprintln!("[OBSIDIAN] list_all_notes error: {}", e);
                return String::new();
            }
        };

        #[derive(Debug, Clone)]
        struct ParagraphHit {
            score: usize,
            text: String,
            source: String,
        }

        let mut paragraphs: Vec<ParagraphHit> = Vec::new();

        for full_path in all_notes {
            let content = match fs::read_to_string(&full_path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let source = full_path
                .strip_prefix(&self.vault_root)
                .unwrap_or(&full_path)
                .to_string_lossy()
                .to_string();

            for para in content.split("\n\n") {
                let trimmed = para.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let lower_para = trimmed.to_lowercase();
                let mut score = 0usize;
                for kw in &keywords {
                    if lower_para.contains(kw.as_str()) {
                        score += 1;
                        continue;
                    }
                    let fuzzy_hit = lower_para.split_whitespace().any(|word| {
                        word.len() >= 3 && trigram_overlap(word, kw) >= 0.5
                    });
                    if fuzzy_hit {
                        score += 1;
                    }
                }

                if score > 0 {
                    if trimmed.starts_with('#') {
                        score += 2;
                    }
                    paragraphs.push(ParagraphHit {
                        score,
                        text: trimmed.to_string(),
                        source: source.clone(),
                    });
                }
            }
        }

        if paragraphs.is_empty() {
            eprintln!("[OBSIDIAN] No relevant paragraphs for: {}", query);
            return String::new();
        }

        paragraphs.sort_by(|a, b| b.score.cmp(&a.score));

        let max_chars = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;
        let mut result = String::with_capacity(max_chars);
        let mut used_sources: HashSet<String> = HashSet::new();

        result.push_str("[RELEVANT MEMORY CONTEXT]\n");

        for ph in &paragraphs {
            let mut block = String::new();
            if used_sources.insert(ph.source.clone()) {
                block.push_str(&format!("## Source: {}\n", ph.source));
            }
            block.push_str(&format!("- {}\n", ph.text));

            if result.len() + block.len() > max_chars {
                let remaining = max_chars.saturating_sub(result.len());
                if remaining > block.len() * 4 / 5 {
                    result.push_str(&block);
                }
                break;
            }
            result.push_str(&block);
        }

        let estimated_tokens = result.len() / CHARS_PER_TOKEN;
        eprintln!(
            "[OBSIDIAN] Optimized context: {} chars (~{} tokens) from {} paragraphs across {} source(s)",
            result.len(),
            estimated_tokens,
            paragraphs.len(),
            used_sources.len()
        );

        result
    }

    // ── Авто-анализ и компрессия памяти ───────────────

    pub fn extract_and_update_profile(
        &self,
        conversation_text: &str,
    ) -> Result<(), String> {
        if conversation_text.trim().is_empty() {
            return Ok(());
        }

        let profile_path = self.context_dir.join("user_profile.md");
        let projects_path = self.context_dir.join("active_projects.md");

        let existing_profile = if profile_path.exists() {
            fs::read_to_string(&profile_path).unwrap_or_default()
        } else {
            String::from(
                "# User Profile\n\n_Automatically maintained by JARVIS._\n",
            )
        };

        let existing_projects = if projects_path.exists() {
            fs::read_to_string(&projects_path).unwrap_or_default()
        } else {
            String::from(
                "# Active Projects\n\n_Automatically maintained by JARVIS._\n",
            )
        };

        let analysis = HeuristicAnalyzer::analyze(conversation_text);

        let updated_profile =
            Self::merge_profile_facts(&existing_profile, &analysis.user_facts);
        fs::write(&profile_path, &updated_profile).map_err(|e| {
            format!(
                "Cannot write {}: {}",
                profile_path.display(),
                e
            )
        })?;

        let updated_projects =
            Self::merge_project_entries(&existing_projects, &analysis.project_entries);
        fs::write(&projects_path, &updated_projects).map_err(|e| {
            format!(
                "Cannot write {}: {}",
                projects_path.display(),
                e
            )
        })?;

        eprintln!(
            "[OBSIDIAN] Profile updated: {} user facts, {} project entries",
            analysis.user_facts.len(),
            analysis.project_entries.len()
        );

        Ok(())
    }

    // ── Helpers ─────────────────────────────────────────

    fn merge_profile_facts(existing_md: &str, new_facts: &[String]) -> String {
        let lines: Vec<String> = existing_md.lines().map(|l| l.to_string()).collect();
        let header_end = lines
            .iter()
            .position(|l| l.starts_with("_Automatically maintained"))
            .map(|i| i + 1)
            .unwrap_or(0);

        let header: Vec<String> = lines.iter().take(header_end).cloned().collect();
        let old_facts: Vec<String> = lines
            .iter()
            .skip(header_end)
            .filter(|l| l.starts_with("- "))
            .cloned()
            .collect();

        let mut all_facts: Vec<String> = old_facts;
        for fact in new_facts {
            let normalized = fact.trim().to_string();
            if normalized.is_empty() {
                continue;
            }
            let entry = format!("- {}", normalized);
            let is_dup = all_facts
                .iter()
                .any(|existing| similarity(existing, &entry) > 0.8);
            if !is_dup {
                all_facts.push(entry);
            }
        }

        let max_facts = 40;
        if all_facts.len() > max_facts {
            let len = all_facts.len();
            all_facts = all_facts.into_iter().skip(len - max_facts).collect();
        }

        let mut result = header.join("\n");
        if !result.is_empty() && !all_facts.is_empty() {
            result.push('\n');
        }
        result.push_str(&all_facts.join("\n"));
        result.push('\n');
        result
    }

    fn merge_project_entries(
        existing_md: &str,
        new_entries: &[String],
    ) -> String {
        let lines: Vec<String> = existing_md.lines().map(|l| l.to_string()).collect();
        let header_end = lines
            .iter()
            .position(|l| l.starts_with("_Automatically maintained"))
            .map(|i| i + 1)
            .unwrap_or(0);

        let header: Vec<String> = lines.iter().take(header_end).cloned().collect();
        let old_entries: Vec<String> = lines
            .iter()
            .skip(header_end)
            .filter(|l| l.starts_with("- ") || l.starts_with("  - "))
            .cloned()
            .collect();

        let mut all_entries: Vec<String> = old_entries;
        for entry in new_entries {
            let normalized = entry.trim().to_string();
            if normalized.is_empty() {
                continue;
            }
            let formatted = format!("- {}", normalized);
            let is_dup = all_entries
                .iter()
                .any(|existing| similarity(existing, &formatted) > 0.75);
            if !is_dup {
                all_entries.push(formatted);
            }
        }

        let max_entries = 30;
        if all_entries.len() > max_entries {
            let len = all_entries.len();
            all_entries = all_entries.into_iter().skip(len - max_entries).collect();
        }

        let mut result = header.join("\n");
        if !result.is_empty() && !all_entries.is_empty() {
            result.push('\n');
        }
        result.push_str(&all_entries.join("\n"));
        result.push('\n');
        result
    }

    fn resolve_safe(&self, relative_path: &str) -> Result<PathBuf, String> {
        if relative_path.contains("..") {
            return Err(format!(
                "Path traversal attempt detected: {}",
                relative_path
            ));
        }

        let full_path = self.vault_root.join(relative_path);

        if full_path.exists() {
            let canonical = full_path.canonicalize().map_err(|e| {
                format!("Cannot canonicalize {}: {}", full_path.display(), e)
            })?;
            if !canonical.starts_with(&self.vault_root) {
                return Err(format!(
                    "Resolved path escapes vault: {}",
                    canonical.display()
                ));
            }
            return Ok(canonical);
        }

        let normalized = self.vault_root.join(relative_path);
        let vault_str = self.vault_root.to_string_lossy().to_string();
        let norm_str = normalized.to_string_lossy().to_string();
        if !norm_str.starts_with(&vault_str) {
            return Err(format!(
                "Resolved path escapes vault: {}",
                normalized.display()
            ));
        }
        Ok(normalized)
    }
}

// ── Public convenience API (для core::router) ────────────────────

/// Внедряет контекст Obsidian Vault в промпт пользователя перед AI-запросом.
/// Если Vault недоступен или контекст пуст — возвращает оригинальный промпт.
pub fn inject_vault_context(user_prompt: &str) -> String {
    let vault_path = std::env::var("OBSIDIAN_VAULT_PATH")
        .unwrap_or_else(|_| "~/Documents/ObsidianVault".to_string());

    let vault = match ObsidianVault::new(&vault_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[VAULT:CTX] Vault unavailable: {} — using bare prompt", e);
            return user_prompt.to_string();
        }
    };

    let ctx = vault.get_optimized_context(user_prompt);
    if ctx.is_empty() {
        eprintln!("[VAULT:CTX] No relevant context found — using bare prompt");
        return user_prompt.to_string();
    }

    let enriched = format!(
        "[LONG-TERM MEMORY CONTEXT (Obsidian Vault)]
{}
[END LONG-TERM MEMORY]

{}",
        ctx, user_prompt
    );

    eprintln!("[VAULT:CTX] Injected {} chars of vault context into prompt", ctx.len());
    enriched
}

// ── String similarity helpers ────────────────────────────────

fn trigram_overlap(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let ca: Vec<char> = a.chars().collect();
    let cb: Vec<char> = b.chars().collect();
    if ca.len() < 3 || cb.len() < 3 {
        return 0.0;
    }
    let ta: HashSet<String> = ca.windows(3).map(|w| w.iter().collect()).collect();
    let tb: HashSet<String> = cb.windows(3).map(|w| w.iter().collect()).collect();
    let intersection = ta.intersection(&tb).count();
    let min_len = ta.len().min(tb.len());
    if min_len == 0 {
        return 0.0;
    }
    intersection as f64 / min_len as f64
}

fn similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let a_lower = a.to_lowercase();
    let b_lower = b.to_lowercase();

    let chars_a: Vec<char> = a_lower.chars().collect();
    let chars_b: Vec<char> = b_lower.chars().collect();

    let trigrams_a: HashSet<String> = chars_a
        .windows(3)
        .map(|w| w.iter().collect::<String>())
        .collect();
    let trigrams_b: HashSet<String> = chars_b
        .windows(3)
        .map(|w| w.iter().collect::<String>())
        .collect();

    if trigrams_a.is_empty() && trigrams_b.is_empty() {
        return 1.0;
    }

    let intersection = trigrams_a.intersection(&trigrams_b).count();
    let union = trigrams_a.union(&trigrams_b).count();

    if union == 0 {
        return 0.0;
    }

    intersection as f64 / union as f64
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_similarity_identical() {
        assert!((similarity("hello world", "hello world") - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_similarity_different() {
        let sim = similarity("hello world", "rust programming");
        assert!(sim < 0.3);
    }

    #[test]
    fn test_similarity_partial() {
        let sim = similarity("проект Jarvis", "проект JARVIS нейросеть");
        assert!(sim > 0.3);
    }

    #[test]
    fn test_get_optimized_context_empty_query() {
        let tmp = std::env::temp_dir().join("jarvis_test_vault");
        let _ = fs::create_dir_all(&tmp);
        let vault = ObsidianVault::new(&tmp.to_string_lossy()).unwrap();
        let ctx = vault.get_optimized_context("");
        assert!(ctx.is_empty());
        let _ = fs::remove_dir_all(&tmp);
    }
}
