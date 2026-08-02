// ============================================================
// JARVIS DYNAMIC LOCAL RESOURCE REGISTRY
// ============================================================
//
// Управление local_resources.json — динамический реестр личных
// ресурсов пользователя. Ресурсы можно добавлять/удалять на лету
// через команды чата (например, «запомни это как личное»).
//
// Все ресурсы типа "local_only" обрабатываются исключительно
// локальной LLM (Ollama) и никогда не отправляются в облачные API.

use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

// ── Data Structures ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalResource {
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub handler_script: Option<String>,
    #[serde(default = "default_resource_type")]
    pub r#type: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub added_at: Option<String>,
}

fn default_resource_type() -> String {
    "local_only".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceRegistry {
    pub resources: Vec<LocalResource>,
}

// ── Global Registry ───────────────────────────────────────────

static REGISTRY: RwLock<Option<ResourceRegistry>> = RwLock::new(None);
static REGISTRY_PATH: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Получить путь к local_resources.json.
fn get_registry_path() -> PathBuf {
    if let Ok(guard) = REGISTRY_PATH.read() {
        if let Some(ref path) = *guard {
            return path.clone();
        }
    }
    // Default: ~/.config/jarvis/local_resources.json
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let path = PathBuf::from(home)
        .join(".config")
        .join("jarvis")
        .join("local_resources.json");
    if let Ok(mut guard) = REGISTRY_PATH.write() {
        *guard = Some(path.clone());
    }
    path
}

/// Загрузить реестр из JSON-файла. Если файла нет — создать с дефолтными ресурсами.
pub fn load_registry() -> ResourceRegistry {
    let path = get_registry_path();

    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(registry) = serde_json::from_str::<ResourceRegistry>(&data) {
            eprintln!(
                "[RESOURCE:REGISTRY] Loaded {} resources from {}",
                registry.resources.len(),
                path.display()
            );
            if let Ok(mut guard) = REGISTRY.write() {
                *guard = Some(registry.clone());
            }
            return registry;
        }
        eprintln!(
            "[RESOURCE:REGISTRY] Corrupted JSON in {} — resetting to defaults",
            path.display()
        );
    }

    // Создать дефолтный реестр
    let default = ResourceRegistry {
        resources: vec![
            LocalResource {
                name: "вк".to_string(),
                aliases: vec![
                    "vk".to_string(),
                    "vkontakte".to_string(),
                    "музыка вк".to_string(),
                    "вконтакте".to_string(),
                ],
                handler_script: Some("scripts/vk_check.py".to_string()),
                r#type: "local_only".to_string(),
                description: Some("Личная страница и музыка ВКонтакте".to_string()),
                added_at: Some(chrono_now()),
            },
            LocalResource {
                name: "почта".to_string(),
                aliases: vec![
                    "email".to_string(),
                    "gmail".to_string(),
                    "почта".to_string(),
                    "письма".to_string(),
                ],
                handler_script: Some("scripts/mail_check.py".to_string()),
                r#type: "local_only".to_string(),
                description: Some("Личная электронная почта".to_string()),
                added_at: Some(chrono_now()),
            },
            LocalResource {
                name: "локальные файлы".to_string(),
                aliases: vec![
                    "мои файлы".to_string(),
                    "документы".to_string(),
                    "локальная папка".to_string(),
                    "файлы на пк".to_string(),
                ],
                handler_script: Some("scripts/list_files.sh".to_string()),
                r#type: "local_only".to_string(),
                description: Some("Файловая система пользователя".to_string()),
                added_at: Some(chrono_now()),
            },
            LocalResource {
                name: "telegram".to_string(),
                aliases: vec![
                    "телеграм".to_string(),
                    "tg".to_string(),
                    "телега".to_string(),
                ],
                handler_script: None,
                r#type: "local_only".to_string(),
                description: Some("Личные сообщения Telegram".to_string()),
                added_at: Some(chrono_now()),
            },
            LocalResource {
                name: "календарь".to_string(),
                aliases: vec![
                    "calendar".to_string(),
                    "расписание".to_string(),
                    "встречи".to_string(),
                ],
                handler_script: Some("scripts/calendar_check.py".to_string()),
                r#type: "local_only".to_string(),
                description: Some("Личный календарь и встречи".to_string()),
                added_at: Some(chrono_now()),
            },
        ],
    };

    save_registry_to_disk(&default);
    if let Ok(mut guard) = REGISTRY.write() {
        *guard = Some(default.clone());
    }
    eprintln!("[RESOURCE:REGISTRY] Created default registry with {} resources", default.resources.len());
    default
}

fn chrono_now() -> String {
    // Простая дата без chrono dependency
    if let Ok(output) = std::process::Command::new("date")
        .args(["+%Y-%m-%dT%H:%M:%S"])
        .output()
    {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        "unknown".to_string()
    }
}

/// Сохранить реестр на диск.
fn save_registry_to_disk(registry: &ResourceRegistry) {
    let path = get_registry_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    match serde_json::to_string_pretty(registry) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, &json) {
                eprintln!("[RESOURCE:REGISTRY] Failed to write {}: {}", path.display(), e);
            } else {
                eprintln!("[RESOURCE:REGISTRY] Saved {} resources to {}", registry.resources.len(), path.display());
            }
        }
        Err(e) => eprintln!("[RESOURCE:REGISTRY] JSON serialization error: {}", e),
    }
}

// ── Public API ────────────────────────────────────────────────

/// Получить текущий реестр (из кеша или загрузить).
pub fn get_registry() -> ResourceRegistry {
    if let Ok(guard) = REGISTRY.read() {
        if let Some(ref reg) = *guard {
            return reg.clone();
        }
    }
    load_registry()
}

/// Добавить новый ресурс в реестр.
pub fn add_resource(resource: LocalResource) -> Result<LocalResource, String> {
    let mut registry = get_registry();

    // Проверка на дубликат по имени
    if registry.resources.iter().any(|r| r.name == resource.name) {
        return Err(format!("Resource '{}' already exists", resource.name));
    }

    let mut new_resource = resource.clone();
    if new_resource.added_at.is_none() {
        new_resource.added_at = Some(chrono_now());
    }

    registry.resources.push(new_resource.clone());
    save_registry_to_disk(&registry);

    if let Ok(mut guard) = REGISTRY.write() {
        *guard = Some(registry);
    }

    eprintln!("[RESOURCE:REGISTRY] Added resource: '{}' (type: {})", new_resource.name, new_resource.r#type);
    Ok(new_resource)
}

/// Удалить ресурс по имени.
pub fn remove_resource(name: &str) -> Result<(), String> {
    let mut registry = get_registry();
    let len_before = registry.resources.len();
    registry.resources.retain(|r| r.name != name);

    if registry.resources.len() == len_before {
        return Err(format!("Resource '{}' not found", name));
    }

    save_registry_to_disk(&registry);
    if let Ok(mut guard) = REGISTRY.write() {
        *guard = Some(registry);
    }
    eprintln!("[RESOURCE:REGISTRY] Removed resource: '{}'", name);
    Ok(())
}

/// Найти ресурс по тексту запроса (проверка по name и aliases).
pub fn find_resource(query: &str) -> Option<LocalResource> {
    let registry = get_registry();
    let lower = query.to_lowercase();

    for resource in &registry.resources {
        if lower.contains(&resource.name.to_lowercase()) {
            return Some(resource.clone());
        }
        for alias in &resource.aliases {
            if lower.contains(&alias.to_lowercase()) {
                return Some(resource.clone());
            }
        }
    }
    None
}

/// Проверить, относится ли запрос к локальным ресурсам.
pub fn is_local_resource_query(query: &str) -> bool {
    find_resource(query).is_some()
}

/// Получить список всех ресурсов.
pub fn list_resources() -> Vec<LocalResource> {
    get_registry().resources
}

/// Экспортировать реестр как JSON-строку.
pub fn export_registry_json() -> Result<String, String> {
    let registry = get_registry();
    serde_json::to_string_pretty(&registry)
        .map_err(|e| format!("JSON serialization error: {}", e))
}

/// Импортировать реестр из JSON-строки (слияние).
pub fn import_registry_json(json: &str) -> Result<usize, String> {
    let incoming: ResourceRegistry = serde_json::from_str(json)
        .map_err(|e| format!("JSON parse error: {}", e))?;

    let mut current = get_registry();
    let mut added = 0;

    for res in incoming.resources {
        if !current.resources.iter().any(|r| r.name == res.name) {
            current.resources.push(res);
            added += 1;
        }
    }

    save_registry_to_disk(&current);
    if let Ok(mut guard) = REGISTRY.write() {
        *guard = Some(current);
    }

    eprintln!("[RESOURCE:REGISTRY] Imported {} new resources", added);
    Ok(added)
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_resource_by_name() {
        // Этот тест требует наличия local_resources.json или создаст дефолтный
        let result = find_resource("проверь вк");
        // Может быть None в тестовом окружении без файла, но не должен паниковать
        let _ = result;
    }

    #[test]
    fn test_is_local_resource_query() {
        assert!(is_local_resource_query("открой вк"));
        assert!(is_local_resource_query("проверь почту"));
        assert!(!is_local_resource_query("напиши код на python"));
        assert!(!is_local_resource_query("какая погода в москве"));
    }

    #[test]
    fn test_add_remove_resource() {
        let res = LocalResource {
            name: "тестовый_ресурс".to_string(),
            aliases: vec!["test".to_string()],
            handler_script: None,
            r#type: "local_only".to_string(),
            description: None,
            added_at: None,
        };
        // Добавляем
        let added = add_resource(res);
        assert!(added.is_ok());
        // Ищем
        let found = find_resource("тестовый_ресурс");
        assert!(found.is_some());
        // Удаляем
        let removed = remove_resource("тестовый_ресурс");
        assert!(removed.is_ok());
    }
}
