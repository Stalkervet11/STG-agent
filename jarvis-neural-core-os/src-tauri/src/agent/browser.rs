// ============================================================
// JARVIS ISOLATED BROWSER MODULE (chromiumoxide / Chrome DevTools Protocol)
// ============================================================
//
// Headless по умолчанию, изолирован от пользовательской мыши/клавиатуры.
// Переключатель: JARVIS_BROWSER_HEADFUL=true для GUI-отладки.

use std::env;
use std::sync::Arc;
use std::time::Duration;

use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::target::CreateTargetParams;
use chromiumoxide::cdp::browser_protocol::input::{DispatchKeyEventParams, DispatchKeyEventType};
use chromiumoxide::page::{Page, ScreenshotParams};
use chromiumoxide::element::Element;
use chromiumoxide::cdp::browser_protocol::page::CaptureScreenshotFormat;
use futures::StreamExt;
use tokio::sync::{Mutex, RwLock};

// ── Configuration ─────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct JarvisBrowserConfig {
    pub headful: bool,
    pub executable_path: Option<String>,
    pub navigation_timeout: u64,
    pub user_agent: Option<String>,
    pub window_width: u32,
    pub window_height: u32,
}

impl Default for JarvisBrowserConfig {
    fn default() -> Self {
        Self {
            headful: env::var("JARVIS_BROWSER_HEADFUL")
                .map(|v| v == "1" || v.to_lowercase() == "true")
                .unwrap_or(false),
            executable_path: env::var("JARVIS_CHROMIUM_PATH").ok(),
            navigation_timeout: env::var("JARVIS_BROWSER_TIMEOUT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
            user_agent: env::var("JARVIS_BROWSER_USER_AGENT").ok(),
            window_width: env::var("JARVIS_BROWSER_WIDTH")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1280),
            window_height: env::var("JARVIS_BROWSER_HEIGHT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(900),
        }
    }
}

impl JarvisBrowserConfig {
    fn to_browser_config(&self) -> BrowserConfig {
        let args: Vec<String> = vec![
            "--disable-gpu".into(),
            "--disable-dev-shm-usage".into(),
            "--disable-extensions".into(),
            "--disable-background-networking".into(),
            "--disable-sync".into(),
            "--no-first-run".into(),
            "--disable-default-apps".into(),
            "--disable-translate".into(),
            "--disable-features=TranslateUI".into(),
            "--disable-web-security".into(),
            "--lang=ru".into(),
        ];

        let mut cfg = BrowserConfig::builder()
            .no_sandbox()
            .disable_default_args()
            .args(args);

        if self.headful {
            cfg = cfg
                .window_size(self.window_width, self.window_height)
                .with_head();
        } else {
            cfg = cfg.arg("--headless=new");
        }

        if let Some(ref ua) = self.user_agent {
            cfg = cfg.arg(format!("--user-agent={}", ua));
        }

        if let Some(ref path) = self.executable_path {
            cfg = cfg.chrome_executable(path);
        }

        cfg.build().expect("Failed to build BrowserConfig")
    }
}

// ── Captcha placeholder ───────────────────────────────────────

#[derive(Debug, Clone)]
pub enum CaptchaSolution {
    Text(String),
    Click { x: f64, y: f64 },
    None,
    Failed(String),
}

/// Placeholder для vision-модуля / внешних решателей капч.
pub async fn solve_captcha(_page: &Page) -> CaptchaSolution {
    // TODO: vision-модуль (YOLO/OCR) или сервис 2captcha
    CaptchaSolution::None
}

// ── Browser Manager ───────────────────────────────────────────

pub struct BrowserManager {
    browser: Arc<Mutex<Option<Browser>>>,
    config: JarvisBrowserConfig,
    started: RwLock<bool>,
}

impl BrowserManager {
    pub fn new(config: JarvisBrowserConfig) -> Self {
        Self {
            browser: Arc::new(Mutex::new(None)),
            config,
            started: RwLock::new(false),
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(JarvisBrowserConfig::default())
    }

    pub async fn is_started(&self) -> bool {
        *self.started.read().await
    }

    /// Запустить браузер (если ещё не запущен).
    pub async fn start(&self) -> Result<(), String> {
        if self.is_started().await {
            return Ok(());
        }

        eprintln!("[BROWSER] Launching Chromium (headful={})...", self.config.headful);

        let browser_config = self.config.to_browser_config();
        let (browser, mut handler) = Browser::launch(browser_config)
            .await
            .map_err(|e| format!("Failed to launch browser: {}", e))?;

        // Фоновый поток для событий CDP
        let browser_arc = self.browser.clone();
        tokio::spawn(async move {
            while let Some(event) = handler.next().await {
                if let Err(e) = event {
                    eprintln!("[BROWSER:cdp] Event error: {}", e);
                }
            }
            let mut guard = browser_arc.lock().await;
            *guard = None;
            eprintln!("[BROWSER] CDP handler closed — browser instance dropped");
        });

        *self.browser.lock().await = Some(browser);
        *self.started.write().await = true;

        eprintln!("[BROWSER] ✅ Browser launched successfully");
        Ok(())
    }

    /// Остановить браузер.
    pub async fn shutdown(&self) -> Result<(), String> {
        let mut guard = self.browser.lock().await;
        if let Some(mut browser) = guard.take() {
            eprintln!("[BROWSER] Shutting down...");
            if let Ok(pages) = browser.pages().await {
                for page in pages {
                    let _ = page.close().await;
                }
            }
            let _ = browser.close().await;
            let _ = browser.wait().await;
            eprintln!("[BROWSER] ✅ Browser closed");
        }
        *self.started.write().await = false;
        Ok(())
    }

    // ── High-level API (каждый метод блокирует browser на время операции) ──

    /// Открыть новую вкладку и перейти по URL.
    pub async fn open_tab(&self, url: &str) -> Result<Page, String> {
        self.ensure_started().await?;
        let guard = self.browser.lock().await;
        let browser = guard.as_ref().ok_or("Browser not started")?;

        eprintln!("[BROWSER:tab] Opening: {}", url);

        let params = CreateTargetParams::builder()
            .url(url)
            .build()
            .map_err(|e| format!("CreateTargetParams error: {}", e))?;

        let page = browser
            .new_page(params)
            .await
            .map_err(|e| format!("Failed to create page: {}", e))?;

        // Ждём загрузки
        page.wait_for_navigation()
            .await
            .map_err(|e| format!("Navigation timeout for '{}': {}", url, e))?;

        eprintln!("[BROWSER:tab] Page loaded: {}", url);
        Ok(page)
    }

    /// Перейти на URL в уже открытой странице.
    pub async fn navigate(&self, page: &Page, url: &str) -> Result<(), String> {
        eprintln!("[BROWSER:nav] Navigating to: {}", url);
        page.goto(url)
            .await
            .map_err(|e| format!("Navigation error: {}", e))?;
        Ok(())
    }

    /// Кликнуть по CSS-селектору.
    pub async fn click(&self, page: &Page, selector: &str) -> Result<(), String> {
        let element = self.find_element(page, selector).await?;
        element
            .click()
            .await
            .map_err(|e| format!("Click error on '{}': {}", selector, e))?;
        eprintln!("[BROWSER:click] Clicked: {}", selector);
        Ok(())
    }

    /// Ввести текст в поле ввода.
    pub async fn type_text(&self, page: &Page, selector: &str, text: &str) -> Result<(), String> {
        let element = self.find_element(page, selector).await?;
        element
            .click()
            .await
            .map_err(|e| format!("Focus error on '{}': {}", selector, e))?;
        element
            .type_str(text)
            .await
            .map_err(|e| format!("Type error on '{}': {}", selector, e))?;
        eprintln!("[BROWSER:type] Typed {} chars into '{}'", text.len(), selector);
        Ok(())
    }

    /// Нажать клавишу (Enter, Escape, Tab...) через CDP Input.dispatchKeyEvent.
    pub async fn press_key(&self, page: &Page, key: &str) -> Result<(), String> {
        let down = DispatchKeyEventParams::builder()
            .r#type(DispatchKeyEventType::KeyDown)
            .key(key.to_string())
            .build()
            .map_err(|e| format!("KeyDown params error: {}", e))?;

        page.execute(down)
            .await
            .map_err(|e| format!("KeyDown '{}' error: {}", key, e))?;

        let up = DispatchKeyEventParams::builder()
            .r#type(DispatchKeyEventType::KeyUp)
            .key(key.to_string())
            .build()
            .map_err(|e| format!("KeyUp params error: {}", e))?;

        page.execute(up)
            .await
            .map_err(|e| format!("KeyUp '{}' error: {}", key, e))?;

        eprintln!("[BROWSER:key] Pressed: {}", key);
        Ok(())
    }

    /// Извлечь текст элемента.
    pub async fn extract_text(&self, page: &Page, selector: &str) -> Result<String, String> {
        let element = self.find_element(page, selector).await?;
        let text = element
            .inner_text()
            .await
            .map_err(|e| format!("Extract text error on '{}': {}", selector, e))?
            .unwrap_or_default();
        Ok(text)
    }

    /// Извлечь атрибут элемента.
    pub async fn extract_attr(&self, page: &Page, selector: &str, attr: &str) -> Result<String, String> {
        let element = self.find_element(page, selector).await?;
        let value = element
            .attribute(attr)
            .await
            .map_err(|e| format!("Extract attr '{}' error on '{}': {}", attr, selector, e))?
            .unwrap_or_default();
        Ok(value)
    }

    /// Получить весь HTML страницы.
    pub async fn get_page_content(&self, page: &Page) -> Result<String, String> {
        page.content()
            .await
            .map_err(|e| format!("Content extraction error: {}", e))
    }

    /// Извлечь видимый текст всей страницы.
    pub async fn get_page_text(&self, page: &Page) -> Result<String, String> {
        self.extract_text(page, "body").await
    }

    /// Сделать скриншот всей страницы (PNG).
    pub async fn screenshot(&self, page: &Page) -> Result<Vec<u8>, String> {
        let params = ScreenshotParams::builder()
            .format(CaptureScreenshotFormat::Png)
            .full_page(true)
            .build();

        let bytes = page
            .screenshot(params)
            .await
            .map_err(|e| format!("Screenshot error: {}", e))?;

        eprintln!("[BROWSER:screenshot] {} bytes captured", bytes.len());
        Ok(bytes)
    }

    /// Скриншот конкретного элемента.
    pub async fn screenshot_element(&self, page: &Page, selector: &str) -> Result<Vec<u8>, String> {
        let element = self.find_element(page, selector).await?;
        let bytes = element
            .screenshot(CaptureScreenshotFormat::Png)
            .await
            .map_err(|e| format!("Element screenshot error on '{}': {}", selector, e))?;
        Ok(bytes)
    }

    /// Выполнить JavaScript на странице.
    pub async fn evaluate_js(&self, page: &Page, script: &str) -> Result<String, String> {
        let result = page
            .evaluate(script)
            .await
            .map_err(|e| format!("JS eval error: {}", e))?;
        Ok(format!("{:?}", result))
    }

    /// Закрыть страницу.
    pub async fn close_page(&self, page: Page) -> Result<(), String> {
        page.close()
            .await
            .map_err(|e| format!("Close page error: {}", e))
    }

    /// Обход капчи (заглушка).
    pub async fn try_bypass_captcha(&self, page: &Page) -> Result<CaptchaSolution, String> {
        eprintln!("[BROWSER:captcha] Checking for captcha...");
        Ok(solve_captcha(page).await)
    }

    // ── Helpers ───────────────────────────────────────────────

    async fn ensure_started(&self) -> Result<(), String> {
        if !self.is_started().await {
            self.start().await?;
        }
        Ok(())
    }

    async fn find_element(&self, page: &Page, selector: &str) -> Result<Element, String> {
        page.find_element(selector)
            .await
            .map_err(|e| format!("Element not found '{}': {}", selector, e))
    }
}

// ── Глобальный синглтон ───────────────────────────────────────

use std::sync::OnceLock;
static BROWSER_MANAGER: OnceLock<BrowserManager> = OnceLock::new();

pub fn init_browser_manager(config: Option<JarvisBrowserConfig>) -> &'static BrowserManager {
    BROWSER_MANAGER.get_or_init(|| {
        let cfg = config.unwrap_or_default();
        eprintln!(
            "[BROWSER:init] headful={} path={:?} timeout={}s",
            cfg.headful, cfg.executable_path, cfg.navigation_timeout
        );
        BrowserManager::new(cfg)
    })
}

pub fn get_browser_manager() -> &'static BrowserManager {
    BROWSER_MANAGER
        .get()
        .expect("BrowserManager not initialized. Call init_browser_manager() at startup.")
}

/// Опциональный доступ к менеджеру (не паникует, если не инициализирован).
pub fn get_browser_manager_opt() -> Result<&'static BrowserManager, String> {
    BROWSER_MANAGER
        .get()
        .ok_or_else(|| "BrowserManager not initialized".to_string())
}

// ── Tauri Commands ────────────────────────────────────────────

#[tauri::command]
pub async fn browser_open(url: String) -> Result<String, String> {
    let manager = get_browser_manager();
    let page = manager.open_tab(&url).await?;
    manager.get_page_text(&page).await
}

#[tauri::command]
pub async fn browser_fetch(url: String, selector: Option<String>) -> Result<String, String> {
    let manager = get_browser_manager();
    let page = manager.open_tab(&url).await?;
    let result = if let Some(ref sel) = selector {
        manager.extract_text(&page, sel).await?
    } else {
        manager.get_page_text(&page).await?
    };
    manager.close_page(page).await?;
    Ok(result)
}

#[tauri::command]
pub async fn browser_click(url: String, selector: String) -> Result<String, String> {
    let manager = get_browser_manager();
    let page = manager.open_tab(&url).await?;
    manager.click(&page, &selector).await?;
    tokio::time::sleep(Duration::from_millis(500)).await;
    manager.get_page_text(&page).await
}

#[tauri::command]
pub async fn browser_search(url: String, input_selector: String, query: String) -> Result<String, String> {
    let manager = get_browser_manager();
    let page = manager.open_tab(&url).await?;
    manager.type_text(&page, &input_selector, &query).await?;
    manager.press_key(&page, "Enter").await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    manager.get_page_text(&page).await
}

#[tauri::command]
pub async fn browser_screenshot(url: String) -> Result<String, String> {
    let manager = get_browser_manager();
    let page = manager.open_tab(&url).await?;
    let bytes = manager.screenshot(&page).await?;
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD as BASE64;
    Ok(BASE64.encode(&bytes))
}

#[tauri::command]
pub async fn browser_shutdown() -> Result<String, String> {
    get_browser_manager().shutdown().await?;
    Ok("Browser shutdown complete".to_string())
}

#[tauri::command]
pub async fn browser_status() -> Result<bool, String> {
    Ok(get_browser_manager().is_started().await)
}

// ── Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_config_defaults() {
        let cfg = JarvisBrowserConfig {
            headful: false,
            executable_path: None,
            navigation_timeout: 30,
            user_agent: None,
            window_width: 1280,
            window_height: 900,
        };
        assert!(!cfg.headful);
        assert_eq!(cfg.navigation_timeout, 30);
    }

    #[test]
    fn test_captcha_solution_none() {
        assert!(matches!(CaptchaSolution::None, CaptchaSolution::None));
    }
}
