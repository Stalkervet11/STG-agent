// ============================================================
// HEURISTIC ANALYZER — легковесный анализ текста без LLM
// ============================================================
//
// Извлекает из диалога:
//   - Факты о пользователе (предпочтения, контекст, интересы).
//   - Записи о проектах/задачах.
//
// Экономит токены и время — не требует вызова LLM.

/// Результат эвристического анализа фрагмента диалога.
#[derive(Debug, Default)]
pub struct AnalysisResult {
    /// Короткие факты о пользователе.
    pub user_facts: Vec<String>,
    /// Записи о проектах/задачах.
    pub project_entries: Vec<String>,
}

pub struct HeuristicAnalyzer;

impl HeuristicAnalyzer {
    /// Анализирует сырой текст диалога, возвращает структурированный результат.
    pub fn analyze(text: &str) -> AnalysisResult {
        let mut result = AnalysisResult::default();

        // Вырезаем реплики JARVIS/Assistant.
        let user_only: String = text
            .lines()
            .filter(|line| {
                let lower = line.to_lowercase();
                !lower.contains("jarvis:")
                    && !lower.contains("assistant:")
                    && !lower.contains("бот:")
            })
            .collect::<Vec<_>>()
            .join("\n");

        let analysis_text = if user_only.trim().is_empty() {
            text
        } else {
            &user_only
        };

        let sentences: Vec<&str> = analysis_text
            .split(|c: char| c == '.' || c == '!' || c == '?' || c == '\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && s.len() > 10)
            .collect();

        for sentence in &sentences {
            let lower = sentence.to_lowercase();

            // ── Факты о пользователе ──
            let user_markers = [
                "я ", "мой ", "моя ", "моё ", "мои ", "мне ", "меня ",
                "i ", "i'm ", "i am ", "my ", "i like ", "i prefer ",
                "i use ", "i work ", "i live ", "i have ",
                "user ", "пользователь ",
            ];

            let is_user_statement = user_markers.iter().any(|marker| {
                lower.starts_with(marker)
                    || lower.contains(&format!(" {}", marker))
            });

            if is_user_statement {
                let cleaned = clean_sentence(sentence);
                if cleaned.len() >= 15 && cleaned.len() <= 250 {
                    result.user_facts.push(cleaned);
                }
            }

            // ── Проекты/задачи ──
            let project_markers = [
                "проект", "задача", "надо сделать", "нужно сделать",
                "нужно реализовать", "требуется", "работаю над",
                "разрабатываю", "пишу", "чиню", "фикшу", "деплою",
                "todo", "task", "project", "working on", "developing",
                "building", "fixing", "deploying", "implement",
                "настроить", "установить", "обновить",
            ];

            let is_project_statement = project_markers
                .iter()
                .any(|marker| lower.contains(marker));

            if is_project_statement {
                let cleaned = clean_sentence(sentence);
                if cleaned.len() >= 10 && cleaned.len() <= 300 {
                    result.project_entries.push(cleaned);
                }
            }
        }

        result
    }
}

fn clean_sentence(s: &str) -> String {
    s.trim()
        .trim_start_matches('-')
        .trim_start_matches('*')
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_fact_detection() {
        let text = "Я живу в Москве. Мой любимый язык программирования — Rust. Сегодня хорошая погода.";
        let analysis = HeuristicAnalyzer::analyze(text);
        assert!(analysis.user_facts.len() >= 1);
    }

    #[test]
    fn test_project_detection() {
        let text = "Работаю над модулем памяти для Jarvis. Нужно реализовать поиск по заметкам.";
        let analysis = HeuristicAnalyzer::analyze(text);
        assert!(analysis.project_entries.len() >= 1);
    }

    #[test]
    fn test_clean_sentence() {
        assert_eq!(
            clean_sentence("- Я работаю над проектом"),
            "Я работаю над проектом"
        );
        assert_eq!(clean_sentence("  привет мир  "), "привет мир");
    }
}
