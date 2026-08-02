#!/usr/bin/env python3
"""
JARVIS Local Handler: Email Checker
=====================================
Заглушка-обработчик для локального ресурса «почта».
В реальной версии — IMAP-клиент с локально сохранёнными учётными данными.

Аргументы:
  --query    Текст запроса пользователя
  --resource Имя ресурса

Пример:
  python3 mail_check.py --query "проверь почту" --resource "почта"
"""

import argparse
import json
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description="JARVIS Email Handler")
    parser.add_argument("--query", type=str, default="", help="User query text")
    parser.add_argument("--resource", type=str, default="почта", help="Resource name")
    args = parser.parse_args()

    query_lower = args.query.lower()

    result = {
        "status": "ok",
        "resource": args.resource,
        "timestamp": datetime.now().isoformat(),
        "message": "",
        "data": None,
    }

    if any(w in query_lower for w in ["непрочитан", "unread", "новые", "входящие"]):
        result["message"] = (
            "📧 Почта: 5 непрочитанных писем во Входящих. "
            "Важные: «Счёт за интернет» от Ростелеком, «Приглашение на конференцию» от DevOpsConf."
        )
        result["data"] = {"unread": 5, "important": 2}
    elif any(w in query_lower for w in ["отправить", "написать", "send", "compose"]):
        result["message"] = (
            "✉️ Почта: Готов к отправке письма. Укажите адресата и текст. "
            "Письмо будет отправлено через локальный SMTP-клиент."
        )
        result["data"] = {"action": "compose"}
    elif any(w in query_lower for w in ["спам", "spam"]):
        result["message"] = (
            "📁 Спам: 12 писем в папке Спам. Ничего важного не обнаружено."
        )
        result["data"] = {"spam_count": 12}
    else:
        result["message"] = (
            f"🔒 ЛОКАЛЬНЫЙ КОНТУР: Обработчик почты получил запрос «{args.query}». "
            "Для полного доступа настройте IMAP-учётные данные в ~/.config/jarvis/mail_config.json"
        )

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
