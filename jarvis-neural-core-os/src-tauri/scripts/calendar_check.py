#!/usr/bin/env python3
"""
JARVIS Local Handler: Calendar Checker
========================================
Заглушка-обработчик для локального ресурса «календарь».
В реальной версии — интеграция с локальным CalDAV/Google Calendar (офлайн-кэш).

Аргументы:
  --query    Текст запроса пользователя
  --resource Имя ресурса
"""

import argparse
import json
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description="JARVIS Calendar Handler")
    parser.add_argument("--query", type=str, default="", help="User query text")
    parser.add_argument("--resource", type=str, default="календарь", help="Resource name")
    args = parser.parse_args()

    query_lower = args.query.lower()
    now = datetime.now()

    result = {
        "status": "ok",
        "resource": args.resource,
        "timestamp": now.isoformat(),
        "message": "",
        "data": None,
    }

    if any(w in query_lower for w in ["сегодня", "today", "на сегодня"]):
        result["message"] = (
            f"📅 Сегодня ({now.strftime('%d.%m.%Y')}): "
            "10:00 — Дейли-митинг, 13:00 — Обед с командой, "
            "16:00 — Code Review, 19:00 — Тренировка."
        )
        result["data"] = {
            "date": now.strftime("%Y-%m-%d"),
            "events": [
                {"time": "10:00", "title": "Дейли-митинг"},
                {"time": "13:00", "title": "Обед с командой"},
                {"time": "16:00", "title": "Code Review"},
                {"time": "19:00", "title": "Тренировка"},
            ],
        }
    elif any(w in query_lower for w in ["завтра", "tomorrow"]):
        result["message"] = (
            "📅 Завтра: 09:00 — Встреча с заказчиком, "
            "14:00 — Презентация JARVIS, 18:00 — Свободно."
        )
        result["data"] = {
            "events": [
                {"time": "09:00", "title": "Встреча с заказчиком"},
                {"time": "14:00", "title": "Презентация JARVIS"},
            ],
        }
    elif any(w in query_lower for w in ["недел", "week"]):
        result["message"] = (
            "📅 На этой неделе: 8 встреч, 2 дедлайна (пятница). "
            "Ближайшее: Дейли-митинг сегодня в 10:00."
        )
        result["data"] = {"total_events": 8, "deadlines": 2}
    elif any(w in query_lower for w in ["добав", "созда", "add", "create", "нов"]):
        result["message"] = (
            "📅 Календарь: Создание нового события. Назовите дату, время и описание. "
            "Данные будут сохранены локально."
        )
        result["data"] = {"action": "create"}
    else:
        result["message"] = (
            f"🔒 ЛОКАЛЬНЫЙ КОНТУР: Обработчик календаря получил запрос «{args.query}». "
            "Ближайшее событие: Дейли-митинг сегодня в 10:00."
        )

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
