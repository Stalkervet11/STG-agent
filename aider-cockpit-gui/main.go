package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

func main() {
	fmt.Println("==================================================")
	fmt.Println("    🚀 AIDER COCKPIT GUI DESKTOP COMPANION        ")
	fmt.Println("        Fedora Linux Hybrid Service Wrapper       ")
	fmt.Println("==================================================")

	// 1. Check for command-line arguments and environment variables to skip auto-browser launch
	skipBrowser := false
	for _, arg := range os.Args {
		if arg == "--no-browser" || arg == "--headless" {
			skipBrowser = true
		}
	}
	if os.Getenv("AIDER_NO_BROWSER") == "true" || os.Getenv("AIDER_NO_BROWSER") == "1" {
		skipBrowser = true
	}

	// 2. Pre-flight check: is port 3000 already occupied?
	conn, err := net.DialTimeout("tcp", "127.0.0.1:3000", 200*time.Millisecond)
	if err == nil {
		conn.Close()
		fmt.Println("⚠️ Alert: Port 3000 is already in use by another process.")
		if skipBrowser {
			fmt.Println("ℹ️ Aider Cockpit is already listening on port 3000. Under --no-browser, we will stay active to keep systemd happy.")
			// Block forever to prevent systemd from restarting us in an active CPU spin loop
			select {}
		} else {
			url := "http://localhost:3000"
			fmt.Printf("🌐 Aider Cockpit appears to be already running. Auto-opening browser to: %s\n", url)
			openBrowser(url)
			os.Exit(0)
		}
	}

	// 3. Verify Node.js runtime exists
	_, err = exec.LookPath("node")
	if err != nil {
		log.Fatalf("❌ Error: Node.js runtime not found in system PATH. Please install Node.js (v18+) to run this application.")
	}

	// 4. Automatically locate the project root relative to the executable path
	execPath, err := os.Executable()
	if err != nil {
		log.Fatalf("❌ Error: Failed to determine executable location: %v", err)
	}

	execDir := filepath.Dir(execPath)
	serverPath := filepath.Join(execDir, "dist", "server.cjs")

	// Fallback to local directory if dist/server.cjs is not in the executable folder
	if _, err := os.Stat(serverPath); os.IsNotExist(err) {
		serverPath = "./dist/server.cjs"
		if _, err := os.Stat(serverPath); os.IsNotExist(err) {
			log.Fatalf("❌ Error: Could not locate 'dist/server.cjs'. Executable dir: %s, Current dir: ./dist/server.cjs", execDir)
		}
		fmt.Println("ℹ️ Running in development/local directory context.")
	} else {
		// Found relative to executable path. Change working directory to ensure
		// server.cjs loads .env and local modules correctly from that folder
		if err := os.Chdir(execDir); err != nil {
			log.Fatalf("❌ Error: Failed to change working directory to project root (%s): %v", execDir, err)
		}
		fmt.Printf("📂 Project context directory updated to: %s\n", execDir)
	}

	// Double-check the absolute server target path
	absServerPath, _ := filepath.Abs(serverPath)
	fmt.Printf("🎯 Located production target: %s\n", absServerPath)

	// 5. Spawning the Node backend server
	fmt.Println("🔌 Starting Aider Cockpit Express server on 0.0.0.0:3000...")
	cmd := exec.Command("node", absServerPath)
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Fatalf("❌ Error: Failed to start server process: %v", err)
	}

	// 6. Handle clean termination on SIGINT/SIGTERM
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\n🛑 Termination signal received. Shutting down Aider server...")
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		os.Exit(0)
	}()

	// 7. Smart polling for port 3000 binding (Max 5s)
	portBound := false
	for i := 0; i < 25; i++ {
		conn, err := net.DialTimeout("tcp", "127.0.0.1:3000", 200*time.Millisecond)
		if err == nil {
			conn.Close()
			portBound = true
			break
		}
		time.Sleep(200 * time.Millisecond)
	}

	if !portBound {
		fmt.Println("⚠️ Warning: Server is taking longer than expected to bind to port 3000.")
	} else {
		fmt.Println("✅ Aider Cockpit network server is online and listening!")
	}

	// 8. Launch default system web browser (only if not requested to skip)
	if !skipBrowser {
		url := "http://localhost:3000"
		fmt.Printf("🌐 Auto-launching standard system browser to: %s\n", url)
		openBrowser(url)
	} else {
		fmt.Println("ℹ️ Running in headless/no-browser mode. Browser auto-launch bypassed.")
	}

	fmt.Println("🎉 Cockpit Companion Active! Control via browser or network. Close this process to terminate.")

	// Block until child process exits
	if err := cmd.Wait(); err != nil {
		fmt.Printf("ℹ️ Server process closed: %v\n", err)
	}
}

// openBrowser opens the specified URL in the default browser path across systems
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}
	if err != nil {
		fmt.Printf("⚠️ Note: Could not auto-open browser: %v. Please open %s manually.\n", err, url)
	}
}
