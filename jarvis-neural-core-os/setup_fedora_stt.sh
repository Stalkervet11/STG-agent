#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# JARVIS Neural Core OS — Offline STT Setup for Fedora Linux
# ───────────────────────────────────────────────────────────
# Это скрипт автоматической настройки офлайн-распознавания речи.
# Устанавливает whisper-cpp и скачивает модель whisper-tiny.
#
# Использование:
#   chmod +x setup_fedora_stt.sh
#   ./setup_fedora_stt.sh
# ───────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  JARVIS Offline STT Setup — Fedora Linux        ║${NC}"
echo -e "${CYAN}║  whisper.cpp + ggml-tiny модель                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

MODEL_DIR="$HOME/.cache/jarvis/whisper"
MODEL_PATH="$MODEL_DIR/ggml-tiny.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"

# ── Шаг 1: Установка whisper-cpp ──
echo -e "${YELLOW}[1/4] Установка whisper-cpp...${NC}"

if command -v whisper-cpp &>/dev/null; then
    echo -e "${GREEN}  ✓ whisper-cpp уже установлен: $(which whisper-cpp)${NC}"
elif command -v whisper &>/dev/null; then
    echo -e "${GREEN}  ✓ whisper уже установлен: $(which whisper)${NC}"
else
    echo -e "${YELLOW}  whisper-cpp не найден. Пробуем установить через dnf...${NC}"
    if command -v dnf &>/dev/null; then
        sudo dnf install -y whisper-cpp 2>/dev/null || {
            echo -e "${RED}  ✗ dnf install не удался. Собираем из исходников...${NC}"
            BUILD_DIR="/tmp/whisper-cpp-build-$$"
            mkdir -p "$BUILD_DIR"
            cd "$BUILD_DIR"
            git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git 2>/dev/null || {
                echo -e "${RED}  ✗ Не удалось клонировать whisper.cpp. Проверьте интернет.${NC}"
                exit 1
            }
            cd whisper.cpp
            make -j$(nproc) 2>/dev/null || {
                echo -e "${RED}  ✗ Сборка не удалась. Установите зависимости:${NC}"
                echo -e "${RED}    sudo dnf install gcc-c++ cmake make${NC}"
                exit 1
            }
            # Копируем бинарник в ~/.local/bin
            mkdir -p "$HOME/.local/bin"
            cp ./main "$HOME/.local/bin/whisper-cpp"
            echo -e "${GREEN}  ✓ whisper-cpp собран и установлен в ~/.local/bin/whisper-cpp${NC}"
            echo '  Добавьте ~/.local/bin в PATH если ещё не добавлен:'
            echo '  export PATH="$HOME/.local/bin:$PATH"'
            cd /
            rm -rf "$BUILD_DIR"
        }
    else
        echo -e "${RED}  ✗ dnf не найден. Это точно Fedora? Установите whisper-cpp вручную.${NC}"
        exit 1
    fi
fi

# ── Шаг 2: Скачивание модели ──
echo -e "${YELLOW}[2/4] Скачивание whisper-модели (ggml-tiny.bin, ~78 MB)...${NC}"

if [ -f "$MODEL_PATH" ]; then
    echo -e "${GREEN}  ✓ Модель уже существует: $MODEL_PATH${NC}"
else
    mkdir -p "$MODEL_DIR"
    if command -v wget &>/dev/null; then
        wget -q --show-progress -O "$MODEL_PATH" "$MODEL_URL" || {
            echo -e "${RED}  ✗ Не удалось скачать модель через wget${NC}"
            exit 1
        }
    elif command -v curl &>/dev/null; then
        curl -L --progress-bar -o "$MODEL_PATH" "$MODEL_URL" || {
            echo -e "${RED}  ✗ Не удалось скачать модель через curl${NC}"
            exit 1
        }
    else
        echo -e "${RED}  ✗ Не найден ни wget, ни curl. Установите один из них:${NC}"
        echo -e "${RED}    sudo dnf install wget${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Модель скачана: $MODEL_PATH${NC}"
fi

# ── Шаг 3: Проверка ffmpeg ──
echo -e "${YELLOW}[3/4] Проверка ffmpeg (для конвертации аудио)...${NC}"

if command -v ffmpeg &>/dev/null; then
    echo -e "${GREEN}  ✓ ffmpeg установлен: $(which ffmpeg)${NC}"
else
    echo -e "${YELLOW}  ffmpeg не найден. Устанавливаем...${NC}"
    sudo dnf install -y ffmpeg-free 2>/dev/null || {
        echo -e "${YELLOW}  ⚠ ffmpeg не установлен. whisper-cpp сможет принимать только WAV.${NC}"
        echo -e "${YELLOW}    Рекомендуем: sudo dnf install ffmpeg-free${NC}"
    }
fi

# ── Шаг 4: Проверка и вывод ──
echo -e "${YELLOW}[4/4] Финальная проверка...${NC}"

WHISPER_BIN=""
if command -v whisper-cpp &>/dev/null; then
    WHISPER_BIN="whisper-cpp"
elif command -v whisper &>/dev/null; then
    WHISPER_BIN="whisper"
elif [ -x "$HOME/.local/bin/whisper-cpp" ]; then
    WHISPER_BIN="$HOME/.local/bin/whisper-cpp"
fi

if [ -n "$WHISPER_BIN" ] && [ -f "$MODEL_PATH" ]; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ ВСЁ ГОТОВО! Офлайн STT настроен.            ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Whisper binary : ${CYAN}$WHISPER_BIN${NC}"
    echo -e "  Model path     : ${CYAN}$MODEL_PATH${NC}"
    echo ""
    echo -e "  Для теста выполните:"
    echo -e "  ${CYAN}$WHISPER_BIN -m $MODEL_PATH -f /tmp/test.wav -l ru${NC}"
    echo ""
    echo -e "  ${YELLOW}Важно: добавьте в ~/.bashrc если ~/.local/bin не в PATH:${NC}"
    echo -e "  ${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
    echo ""
else
    echo -e "${RED}  ✗ Что-то пошло не так. Проверьте вывод выше.${NC}"
    exit 1
fi
