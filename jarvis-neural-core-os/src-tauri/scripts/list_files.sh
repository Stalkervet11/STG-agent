#!/usr/bin/env bash
# ============================================================
# JARVIS Local Handler: File System Browser
# ============================================================
# Аргументы:
#   --query    Текст запроса пользователя
#   --resource Имя ресурса
#
# Пример:
#   bash list_files.sh --query "покажи документы" --resource "локальные файлы"

QUERY=""
RESOURCE="локальные файлы"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --query)    QUERY="$2"; shift 2 ;;
        --resource) RESOURCE="$2"; shift 2 ;;
        *) shift ;;
    esac
done

QUERY_LOWER=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]')

# Определяем целевую директорию
TARGET_DIR="$HOME"

if echo "$QUERY_LOWER" | grep -qE "(документ|document|doc)"; then
    TARGET_DIR="$HOME/Документы"
elif echo "$QUERY_LOWER" | grep -qE "(загрузк|download)"; then
    TARGET_DIR="$HOME/Загрузки"
elif echo "$QUERY_LOWER" | grep -qE "(рабочий стол|desktop)"; then
    TARGET_DIR="$HOME/Рабочий стол"
elif echo "$QUERY_LOWER" | grep -qE "(музык|music|аудио)"; then
    TARGET_DIR="$HOME/Музыка"
elif echo "$QUERY_LOWER" | grep -qE "(изображен|картинк|photo|image|picture)"; then
    TARGET_DIR="$HOME/Изображения"
elif echo "$QUERY_LOWER" | grep -qE "(видео|video)"; then
    TARGET_DIR="$HOME/Видео"
elif echo "$QUERY_LOWER" | grep -qE "(конфиг|config|\.config|jarvis)"; then
    TARGET_DIR="$HOME/.config/jarvis"
fi

if [ ! -d "$TARGET_DIR" ]; then
    echo "{ \"status\": \"error\", \"message\": \"Директория не найдена: $TARGET_DIR\" }"
    exit 1
fi

# Безопасный ls с ограничением
FILE_COUNT=$(find "$TARGET_DIR" -maxdepth 1 -not -name '.*' | wc -l)
TOP_FILES=$(ls -1t "$TARGET_DIR" 2>/dev/null | grep -v '^\.' | head -15 | sed 's/"/\\"/g' | sed 's/^/  "/;s/$/",/' | sed '$ s/,$//')

cat << JSONOUT
{
  "status": "ok",
  "resource": "$RESOURCE",
  "target_dir": "$TARGET_DIR",
  "total_files": $((FILE_COUNT - 1)),
  "timestamp": "$(date -Iseconds)",
  "message": "📂 $TARGET_DIR: $((FILE_COUNT - 1)) файлов/папок.",
  "top_files": [
$TOP_FILES
  ]
}
JSONOUT
