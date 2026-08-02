// ============================================================
// JARVIS AUTONOMOUS AGENT RUNNER
// ============================================================
//
// Фоновый агент с автономным циклом:
//   - Мониторит очередь задач (TaskQueue)
//   - Самостоятельно запускает LLM через core::router
//   - Может инициировать Aider-сессии
//   - Выполняет веб-сёрфинг через browser manager
//   - Поддерживает режимы: Idle, Research, Engineering

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, RwLock};
use tokio::time::interval;

use crate::core::personality::PromptMode;
use crate::core::router;

// ── Agent Task ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub prompt: String,
    pub mode: AgentTaskMode,
    pub priority: u8, // 0=low, 1=normal, 2=high
    pub created_at: String,
    pub status: AgentTaskStatus,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentTaskMode {
    /// Обычный запрос (Ollama → OpenRouter)
    Default,
    /// Только локально (Ollama, личные данные)
    LocalOnly,
    /// Исследовательский (веб-сёрфинг + LLM)
    Research,
    /// Инженерный (OpenRouter, сложный код)
    Engineering,
    /// Aider-задача (автоматическое редактирование кода)
    Aider,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentTaskStatus {
    Pending,
    Running,
    Completed,
    Failed(String),
}

// ── Agent State ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentState {
    Idle,
    Working,
    Researching,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub state: AgentState,
    pub tasks_completed: u64,
    pub tasks_failed: u64,
    pub current_task: Option<AgentTask>,
    pub queue_size: usize,
    pub uptime_secs: u64,
}

// ── Agent Runner ──────────────────────────────────────────────

pub struct AgentRunner {
    task_tx: mpsc::Sender<AgentTask>,
    status: Arc<RwLock<AgentStatus>>,
    running: Arc<RwLock<bool>>,
    start_time: std::time::Instant,
}

impl AgentRunner {
    /// Создать новый раннер и запустить фоновый цикл.
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AgentTask>(128);

        let status = Arc::new(RwLock::new(AgentStatus {
            state: AgentState::Idle,
            tasks_completed: 0,
            tasks_failed: 0,
            current_task: None,
            queue_size: 0,
            uptime_secs: 0,
        }));

        let running = Arc::new(RwLock::new(true));
        let start_time = std::time::Instant::now();

        let runner = Self {
            task_tx: tx,
            status: status.clone(),
            running: running.clone(),
            start_time,
        };

        // Запускаем фоновый цикл
        let status_clone = status.clone();
        let running_clone = running.clone();
        let start = start_time;

        tokio::spawn(async move {
            agent_loop(rx, status_clone, running_clone, start).await;
        });

        eprintln!("[AGENT:runner] ✅ Autonomous agent loop started");
        runner
    }

    /// Отправить задачу агенту.
    pub async fn submit(&self, task: AgentTask) -> Result<(), String> {
        let mut status = self.status.write().await;
        status.queue_size += 1;

        self.task_tx
            .send(task)
            .await
            .map_err(|e| format!("Agent queue full: {}", e))?;

        eprintln!("[AGENT:runner] Task submitted (queue: {})", status.queue_size);
        Ok(())
    }

    /// Получить текущий статус агента.
    pub async fn get_status(&self) -> AgentStatus {
        let mut s = self.status.read().await.clone();
        s.uptime_secs = self.start_time.elapsed().as_secs();
        s
    }

    /// Остановить агента.
    pub async fn shutdown(&self) {
        *self.running.write().await = false;
        eprintln!("[AGENT:runner] Shutdown signal sent");
    }
}

// ── Background Agent Loop ─────────────────────────────────────

async fn agent_loop(
    mut rx: mpsc::Receiver<AgentTask>,
    status: Arc<RwLock<AgentStatus>>,
    running: Arc<RwLock<bool>>,
    start_time: std::time::Instant,
) {
    let mut tick = interval(Duration::from_secs(1));

    loop {
        tokio::select! {
            // Проверяем, не пора ли завершиться
            _ = tick.tick() => {
                if !*running.read().await {
                    eprintln!("[AGENT:loop] Shutting down...");
                    break;
                }
                // Обновляем uptime
                let mut s = status.write().await;
                s.uptime_secs = start_time.elapsed().as_secs();
            }

            // Обрабатываем входящие задачи
            maybe_task = rx.recv() => {
                match maybe_task {
                    Some(task) => {
                        eprintln!(
                            "[AGENT:loop] Processing task: id={} mode={:?} priority={}",
                            task.id, task.mode, task.priority
                        );
                        process_single_task(task, &status).await;
                    }
                    None => {
                        // Канал закрыт
                        eprintln!("[AGENT:loop] Task channel closed — exiting");
                        break;
                    }
                }
            }
        }
    }

    eprintln!("[AGENT:loop] Agent loop terminated");
}

/// Обработать одну задачу.
async fn process_single_task(mut task: AgentTask, status: &Arc<RwLock<AgentStatus>>) {
    // Помечаем как выполняющуюся
    task.status = AgentTaskStatus::Running;
    {
        let mut s = status.write().await;
        s.state = match task.mode {
            AgentTaskMode::Research => AgentState::Researching,
            _ => AgentState::Working,
        };
        s.current_task = Some(task.clone());
    }

    let result = execute_task(&task).await;

    match &result {
        Ok(reply) => {
            task.status = AgentTaskStatus::Completed;
            task.result = Some(reply.clone());
            let mut s = status.write().await;
            s.tasks_completed += 1;
            s.state = AgentState::Idle;
            s.current_task = None;
            s.queue_size = s.queue_size.saturating_sub(1);
            eprintln!("[AGENT:loop] ✅ Task {} completed", task.id);
        }
        Err(err) => {
            task.status = AgentTaskStatus::Failed(err.clone());
            task.result = Some(format!("Error: {}", err));
            let mut s = status.write().await;
            s.tasks_failed += 1;
            s.state = AgentState::Error(err.clone());
            s.current_task = None;
            s.queue_size = s.queue_size.saturating_sub(1);
            eprintln!("[AGENT:loop] ❌ Task {} failed: {}", task.id, err);
        }
    }
}

/// Выполнить задачу в зависимости от режима.
async fn execute_task(task: &AgentTask) -> Result<String, String> {
    match task.mode {
        AgentTaskMode::Default => {
            // Стандартный роутинг: Ollama → OpenRouter
            router::route(&task.prompt).await
        }
        AgentTaskMode::LocalOnly => {
            // Только локальная Ollama
            router::route_local_only(&task.prompt).await
        }
        AgentTaskMode::Engineering => {
            // Инженерный режим: OpenRouter с мощной моделью
            router::route_engineering(&task.prompt).await
        }
        AgentTaskMode::Research => {
            // Исследовательский режим:
            // 1. Сначала веб-сёрфинг (если браузер доступен)
            // 2. Затем LLM с режимом Research
            execute_research_task(&task.prompt).await
        }
        AgentTaskMode::Aider => {
            // Запуск Aider для редактирования кода
            execute_aider_task(&task.prompt).await
        }
    }
}

/// Исследовательская задача: веб-сёрфинг + LLM анализ.
async fn execute_research_task(prompt: &str) -> Result<String, String> {
    eprintln!("[AGENT:research] Starting research: {}", prompt);

    // Попытка веб-поиска через встроенный браузер
    let web_context = if let Ok(manager) =
        crate::agent::browser::get_browser_manager_opt()
    {
        if manager.is_started().await {
            match perform_web_search(manager, prompt).await {
                Ok(context) => {
                    eprintln!("[AGENT:research] Web search: {} chars", context.len());
                    context
                }
                Err(e) => {
                    eprintln!("[AGENT:research] Web search failed: {}", e);
                    String::new()
                }
            }
        } else {
            eprintln!("[AGENT:research] Browser not started — skipping web search");
            String::new()
        }
    } else {
        eprintln!("[AGENT:research] Browser manager not initialized");
        String::new()
    };

    // Комбинированный промпт: результаты поиска + запрос
    let combined_prompt = if web_context.is_empty() {
        format!("[RESEARCH MODE — no web results]\nQuery: {}", prompt)
    } else {
        format!(
            "[RESEARCH MODE]\nWeb search results:\n{}\n\nUser query: {}",
            &web_context[..web_context.len().min(3000)],
            prompt
        )
    };

    // Используем OpenRouter в Research-режиме
    crate::core::openrouter::ask(&combined_prompt, PromptMode::Research).await
}

/// Веб-поиск для исследовательского режима.
async fn perform_web_search(
    manager: &crate::agent::browser::BrowserManager,
    query: &str,
) -> Result<String, String> {
    let encoded = urlencoding(query);
    let search_url = format!("https://www.google.com/search?q={}", encoded);

    let page = manager.open_tab(&search_url).await?;

    // Ждём загрузки результатов
    tokio::time::sleep(Duration::from_secs(2)).await;

    // Извлекаем текст результатов поиска
    let body_text = manager.get_page_text(&page).await?;

    let _ = manager.close_page(page).await;

    Ok(body_text)
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

/// Запуск Aider для автономного редактирования кода.
async fn execute_aider_task(prompt: &str) -> Result<String, String> {
    eprintln!("[AGENT:aider] Executing: {}", prompt);

    let output = std::process::Command::new("aider")
        .args(["--message", prompt, "--no-git", "--yes"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Aider spawn error: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Aider exit {}: {}", output.status.code().unwrap_or(-1), stderr));
    }

    Ok(if stdout.is_empty() { stderr } else { stdout })
}

// ── Глобальный синглтон ───────────────────────────────────────

use std::sync::OnceLock;
static AGENT_RUNNER: OnceLock<AgentRunner> = OnceLock::new();

pub fn init_agent_runner() -> &'static AgentRunner {
    AGENT_RUNNER.get_or_init(|| {
        eprintln!("[AGENT] Initializing autonomous agent runner...");
        AgentRunner::new()
    })
}

pub fn get_agent_runner() -> &'static AgentRunner {
    AGENT_RUNNER
        .get()
        .expect("AgentRunner not initialized. Call init_agent_runner() at startup.")
}
