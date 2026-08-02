#!/bin/bash
# Aider Cockpit GUI Automated Installer for Fedora Linux
set -e

# ANSI Color Codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}     ⚙️  Aider Cockpit GUI Installer (Fedora Linux)  ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. Check for Go
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Error: Go language compiler not found! Please install it with: sudo dnf install golang${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Go is installed: $(go version | cut -d' ' -f3)${NC}"
fi

# 2. Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js runtime not found! Please install it with: sudo dnf install nodejs${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Node.js is installed: $(node -v)${NC}"
fi

# 3. Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm package manager not found! Please install it with: sudo dnf install npm${NC}"
    exit 1
else
    echo -e "${GREEN}✓ npm is installed: $(npm -v)${NC}"
fi

echo -e "\n${YELLOW}📦 Step 1: Installing Node.js dependencies...${NC}"
npm install

echo -e "\n${YELLOW}🏗️  Step 2: Bundling frontend assets & Node production server...${NC}"
npm run build

echo -e "\n${YELLOW}🐹 Step 3: Compiling Go native companion wrapper...${NC}"
go build -o aider-cockpit main.go
chmod +x aider-cockpit
echo -e "${GREEN}✓ Compiled binary successfully: $(pwd)/aider-cockpit${NC}"

echo -e "\n${YELLOW}🖥️  Step 4: Integrating into Fedora GNOME/XDG environment...${NC}"

# Define absolute integration target paths
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
DESKTOP_DIR="$HOME/.local/share/applications"
PROJECT_DIR=$(pwd)

mkdir -p "$USER_SYSTEMD_DIR"
mkdir -p "$DESKTOP_DIR"

# Generate systemd user unit with resolved absolute paths
if [ -f "aider-cockpit.service" ]; then
    sed "s|__PROJECT_DIR__|${PROJECT_DIR}|g" aider-cockpit.service > "$USER_SYSTEMD_DIR/aider-cockpit.service"
    echo -e "${GREEN}✓ Placed systemd user service: $USER_SYSTEMD_DIR/aider-cockpit.service${NC}"
else
    echo -e "${RED}❌ Error: aider-cockpit.service template not found in current directory!${NC}"
    exit 1
fi

# Generate XDG desktop launcher with resolved absolute paths
if [ -f "aider.desktop" ]; then
    sed "s|__PROJECT_DIR__|${PROJECT_DIR}|g" aider.desktop > "$DESKTOP_DIR/aider.desktop"
    chmod +x "$DESKTOP_DIR/aider.desktop"
    # Update Gnome desktop database to index the new shortcut
    update-desktop-database "$DESKTOP_DIR" &> /dev/null || true
    echo -e "${GREEN}✓ Placed desktop launcher: $DESKTOP_DIR/aider.desktop${NC}"
else
    echo -e "${RED}❌ Error: aider.desktop template not found in current directory!${NC}"
    exit 1
fi

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}🎉 INSTALLATION COMPLETED SUCCESSFULLY!              ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Your Aider Cockpit is now fully prepared. Choose how to run it:"
echo -e ""
echo -e "1. ${CYAN}As an automatic background service (Systemd User Service):${NC}"
echo -e "   - Reload systemd config:   ${CYAN}systemctl --user daemon-reload${NC}"
echo -e "   - Start service now:       ${CYAN}systemctl --user start aider-cockpit.service${NC}"
echo -e "   - Enable launch on login:  ${CYAN}systemctl --user enable aider-cockpit.service${NC}"
echo -e "   - Check service status:    ${CYAN}systemctl --user status aider-cockpit.service${NC}"
echo -e ""
echo -e "2. ${CYAN}Via the Fedora/GNOME Applications Grid:${NC}"
echo -e "   - Press Super (Windows) key, type ${CYAN}\"Aider Cockpit\"${NC}, and launch it!"
echo -e "   - Runs securely in the background, listening on ${CYAN}0.0.0.0:3000${NC}."
echo -e ""
echo -e "3. ${CYAN}Manually running the portable binary in your shell:${NC}"
echo -e "   - Run: ${CYAN}./aider-cockpit${NC}"
echo -e "===================================================="
