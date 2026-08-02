# 🚀 Workspace Performance Control Panel & AI Event Daemon

Welcome to the **Workspace Performance Control Panel**—a full-stack, responsive, and performance-optimized application for tracking container performance telemetry, monitoring AI execution pipelines, executing profile-guided low-level compiles, and dispatching real-time event status alerts.

This workspace is fully modularized and optimized for high-performance and portability. You can run it locally as a standard Node.js server, run it as a standalone container via Docker, or compile it to a native desktop application using the included Go-based wrapper launcher.

---

## 📂 Project Structure Overview

```text
├── src/
│   ├── App.tsx             # Primary React view orchestrator & layout skin
│   ├── types.ts            # Common type-safe interface contracts
│   ├── index.css           # Global styled Tailwind base & customized themes
│   └── components/
│       └── Dashboard.tsx   # Dashboard, charts, telemetry meters, and configurations
├── server.ts               # Production-grade Express web server & mock telemetry stream
├── main.go                 # Native Go-based desktop companion app bootstrapper
├── go.mod                  # Go module definition
├── Dockerfile              # Ultra-slim production-ready multi-stage Docker build config
├── docker-compose.yml      # Orchestrated container runner with port routing
├── package.json            # Node.js workspace dependencies and bundled scripts
└── vite.config.ts          # Vite asset compiling engine configured with relative paths
```

---

## 🛠️ Step 1: Local Installation

Before deploying or running, ensure you have **Node.js (v18+)** and optionally **Go (1.21+)** installed on your workstation.

### 1. Install Node.js Dependencies
Install the front-end and back-end module tree:
```bash
npm install
```

### 2. Configure Environment Secrets
Create a `.env` file in the root folder (or copy from `.env.example`):
```bash
cp .env.example .env
```
Inside `.env`, define any custom tokens (such as your Gemini API token or Telegram configs):
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 💻 Step 2: Development and Run Commands

### 🚀 Launching Development Mode
This boots up the Express web server alongside Vite's middleware wrapper to hot-load the interface in development:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### ⚡ Compiling the Production Build
This compiling script transpiles the front-end static bundle and packs the server code into a self-contained, high-performance CommonJS file (`dist/server.cjs`):
```bash
npm run build
```

### ▶️ Running the Production Build
Boot up the pre-compiled server natively using node:
```bash
npm start
```

---

## 🖥️ Step 3: Native Desktop Companion (Go Launcher)

To make packaging, local execution, and launching easy in user environments, you can compile and execute the app through the Go native wrapper:

### 1. Run the Launcher directly
Ensure you run the Go launcher from the workspace root directory:
```bash
go run main.go
```
This launcher checks if Node.js is installed, auto-compiles assets if needed, boots the background full-stack process, and automatically launches your native default system browser.

### 2. Compile to a Native Executable
Compile to a platform-specific binary that users can run on click:
- **Windows**: `go build -o launcher.exe main.go`
- **macOS**: `go build -o launcher main.go`
- **Linux**: `go build -o launcher main.go`

---

## 🐳 Step 4: Containerized Deployment (Docker)

To deploy the entire environment inside a secure sandboxed container network, run:

```bash
docker-compose up --build
```

- This command handles compiling the frontend and server, optimizing packages, exposing port `3000`, and mounting variables from your local `.env` file.
- Access the container environment via `http://localhost:3000`.
- To shut down the daemon, run `docker-compose down`.

---

## 📣 Step 5: Telegram Bot Alerts Dispatcher

The application features an outgoing **Telegram Alert Dispatcher** that automatically pings your chat whenever asynchronous test runners complete, compilation logs finish, or critical heap exhaustion errors are raised.

### 1. Create a Bot and Get the Token
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Type `/newbot` and follow the guided instructions to name your bot.
3. Save the returned HTTP API Token (e.g., `7181908860:AAGv8HJ...`).

### 2. Retrieve Your Chat ID
1. Search for [@userinfobot](https://t.me/userinfobot) or [@RawDataBot](https://t.me/rawdatabot) on Telegram.
2. Send any message to the bot.
3. It will reply with your private `id` (e.g., `1718190886`).

### 3. Connect and Test
1. In the **Telegram Alert Dispatcher** card on the panel, paste your **Bot API Token** and **Chat ID**.
2. Click **Apply** to bind configuration variables.
3. Turn on the **Enable Outgoing Alerts** checkbox.
4. Click **Test Dispatch** to send an active event validation message to your Telegram channel!

---

## 🛡️ Desktop Packaging Checklist (Electron / Tauri)

To export the web assets as a 100% independent desktop application:

1. **Vite Relative Configuration**: We have pre-configured `base: './'` inside `vite.config.ts`. This ensures static asset references can be read using file protocols (`file://`).
2. **Electron Deployment**:
   - Run `npm install --save-dev electron`.
   - Point the Electron entry path to `dist/index.html`.
3. **Tauri Wrapper Deployment**:
   - Initialize Tauri in the directory: `cargo tauri init`.
   - Set the build configuration destination folder to `dist/`.
