// ============================================================
// JARVIS TEXT-TO-SPEECH (TTS)
// ============================================================
//
// Гибридный TTS-пайплайн:
//   1. ElevenLabs API (если настроен) → Base64 MP3
//   2. Локальный: Piper TTS → Applio RVC (voice conversion) → aplay

use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command as StdCommand, Stdio};
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

fn which(bin: &str) -> bool {
    StdCommand::new("which")
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ── Public API ─────────────────────────────────────────────

/// Основной метод: синтезирует речь и возвращает статус.
///
/// Возвращает:
/// - `"ELEVENLABS"` — использован облачный TTS (base64 MP3).
/// - `"LOCAL_RVC_USED"` — Piper + RVC + aplay.
/// - `"LOCAL_PIPER_ONLY"` — Piper + aplay (RVC недоступен).
///
/// В случае ElevenLabs: вызывающая сторона должна декодировать base64
/// и воспроизвести аудио на фронтенде. При локальном пайплайне звук
/// воспроизводится сразу через aplay/paplay.
pub async fn speak(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Empty text for TTS".to_string());
    }

    // ── Попытка ElevenLabs ──
    let api_key = env::var("ELEVENLABS_API_KEY").unwrap_or_default();
    let voice_id = env::var("ELEVENLABS_VOICE_ID").unwrap_or_default();

    if !api_key.is_empty() && !voice_id.is_empty() {
        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}",
            voice_id
        );
        let payload = serde_json::json!({
            "text": text,
            "model_id": "eleven_multilingual_v2"
        });
        if let Ok(client) =
            reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
        {
            if let Ok(resp) = client
                .post(&url)
                .header("xi-api-key", &api_key)
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        if !bytes.is_empty() {
                            eprintln!("[TTS] ElevenLabs: {} bytes", bytes.len());
                            return Ok(BASE64.encode(&bytes));
                        }
                    }
                }
            }
        }
        eprintln!("[TTS] ElevenLabs unavailable, falling back to local TTS...");
    }

    run_local_tts_pipeline(text).await
}

// ── Local TTS Pipeline ─────────────────────────────────────

async fn run_local_tts_pipeline(text: &str) -> Result<String, String> {
    if !which("piper") {
        return Err("piper not found. Install: sudo dnf install piper".to_string());
    }

    let raw_wav = "/tmp/jarvis_raw.wav";
    let speech_wav = "/tmp/jarvis_speech.wav";

    let _ = fs::remove_file(raw_wav);
    let _ = fs::remove_file(speech_wav);

    // ═══ Step 1: Piper TTS ═══
    let piper_model = find_piper_model()?;

    eprintln!(
        "[TTS:1/3] Piper: model={} output={}",
        piper_model.display(),
        raw_wav
    );

    let mut child = StdCommand::new("piper")
        .args([
            "--model",
            piper_model.to_str().unwrap_or(""),
            "--output_file",
            raw_wav,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Piper spawn error: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("Piper write error: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Piper wait error: {}", e))?;
    let p_stdout = String::from_utf8_lossy(&output.stdout);
    let p_stderr = String::from_utf8_lossy(&output.stderr);
    eprintln!("[TTS:1/3] Piper stdout: {}", p_stdout.trim());
    eprintln!("[TTS:1/3] Piper stderr: {}", p_stderr.trim());

    if !output.status.success() {
        return Err(format!(
            "Piper error ({}): {} {}",
            output.status.code().unwrap_or(-1),
            p_stdout.trim(),
            p_stderr.trim()
        ));
    }

    match validate_wav(raw_wav) {
        Ok(size) => eprintln!("[TTS:1/3] Piper OK — {} bytes", size),
        Err(e) => return Err(format!("Piper produced invalid WAV: {}", e)),
    }

    // ═══ Step 2: RVC voice conversion (best-effort) ═══
    let rvc_used = try_rvc_convert(raw_wav, speech_wav).unwrap_or(false);

    // ═══ Step 3: Playback ═══
    let play_file = if rvc_used { speech_wav } else { raw_wav };
    eprintln!("[TTS:3/3] Playing: {} (rvc_used={})", play_file, rvc_used);

    play_audio(play_file)?;

    let _ = fs::remove_file(raw_wav);
    let _ = fs::remove_file(speech_wav);

    let result = if rvc_used {
        "LOCAL_RVC_USED"
    } else {
        "LOCAL_PIPER_ONLY"
    };
    eprintln!("[TTS] Done: {}", result);
    Ok(result.to_string())
}

// ── Helpers ────────────────────────────────────────────────

fn find_piper_model() -> Result<PathBuf, String> {
    // Проверяем переменную окружения
    if let Ok(path) = env::var("PIPER_MODEL_PATH") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
    }

    let home = env::var("HOME").map_err(|e| format!("HOME: {}", e))?;
    let default_path = PathBuf::from(&home)
        .join(".local/share/jarvis/piper/ru_RU-denis-medium.onnx");
    if default_path.exists() {
        return Ok(default_path);
    }

    // Поиск в системных путях
    for sp in &[
        "/usr/share/piper-tts/ru_RU-denis-medium.onnx",
        "/usr/local/share/piper/ru_RU-denis-medium.onnx",
    ] {
        let p = PathBuf::from(sp);
        if p.exists() {
            return Ok(p);
        }
    }

    Err(format!(
        "Piper model not found at {}. Set PIPER_MODEL_PATH env var or download from huggingface.",
        default_path.display()
    ))
}

fn find_audio_player() -> Result<String, String> {
    for player in &["paplay", "aplay", "pw-play"] {
        if which(player) {
            return Ok(player.to_string());
        }
    }
    Err("No audio player found. Install: sudo dnf install alsa-utils pulseaudio-utils".to_string())
}

fn validate_wav(path: &str) -> Result<u64, String> {
    let meta =
        fs::metadata(path).map_err(|e| format!("Cannot stat {}: {}", path, e))?;
    let size = meta.len();
    if size < 44 {
        return Err(format!("WAV file too small ({} bytes): {}", size, path));
    }
    if let Ok(data) = fs::read(path) {
        if data.len() < 44 || &data[0..4] != b"RIFF" || &data[8..12] != b"WAVE" {
            return Err(format!("Invalid WAV header in {}", path));
        }
    }
    Ok(size)
}

fn play_audio(wav_path: &str) -> Result<(), String> {
    let player = find_audio_player()?;
    validate_wav(wav_path)?;

    eprintln!("[TTS:play] {} {}", player, wav_path);

    let output = match player.as_str() {
        "paplay" => StdCommand::new("paplay").arg(wav_path).output(),
        "pw-play" => StdCommand::new("pw-play").arg(wav_path).output(),
        _ => StdCommand::new("aplay").arg(wav_path).output(),
    };

    match output {
        Ok(out) => {
            if out.status.success() {
                eprintln!("[TTS:play] OK via {}", player);
                Ok(())
            } else {
                let err_msg = String::from_utf8_lossy(&out.stderr)
                    .trim()
                    .to_string();
                if player == "paplay" && which("aplay") {
                    eprintln!(
                        "[TTS:play] paplay failed ({}), trying aplay...",
                        err_msg
                    );
                    let aplay_out = StdCommand::new("aplay")
                        .arg(wav_path)
                        .output()
                        .map_err(|e| format!("aplay fallback error: {}", e))?;
                    if aplay_out.status.success() {
                        eprintln!("[TTS:play] OK via aplay fallback");
                        return Ok(());
                    }
                    return Err(format!(
                        "Playback failed: paplay='{}', aplay='{}'",
                        err_msg,
                        String::from_utf8_lossy(&aplay_out.stderr).trim()
                    ));
                }
                Err(format!("{} error: {}", player, err_msg))
            }
        }
        Err(e) => Err(format!("{} spawn error: {}", player, e)),
    }
}

// ── RVC conversion (best-effort, non-fatal) ────────────────

/// Пытается применить RVC voice conversion.
/// Возвращает `Ok(true)` если RVC отработал, `Ok(false)` если
/// недоступен (не фатально, продолжаем с Piper-only).
fn try_rvc_convert(raw_wav: &str, speech_wav: &str) -> Result<bool, String> {
    // Ищем Applio RVC относительно CWD и нескольких известных путей.
    let applio_dir = find_applio_dir()?;
    if applio_dir.is_none() {
        eprintln!("[TTS:2/3] Applio RVC not found — skipping RVC");
        return Ok(false);
    }
    let applio_dir = applio_dir.unwrap();

    // Ищем RVC модель и индекс
    let jarvis_dir = find_jarvis_models_dir();
    let rvc_model = jarvis_dir.join("Jarvis_90e_270s.pth");
    let rvc_index = jarvis_dir.join("Jarvis.index");

    if !rvc_model.exists() {
        eprintln!(
            "[TTS:2/3] RVC model not found: {} — skipping RVC",
            rvc_model.display()
        );
        return Ok(false);
    }
    if !rvc_index.exists() {
        eprintln!(
            "[TTS:2/3] RVC index not found: {} — skipping RVC",
            rvc_index.display()
        );
        return Ok(false);
    }

    // Pre-flight check: импорт VoiceConverter
    match check_rvc_available(&applio_dir) {
        Ok(()) => {}
        Err(reason) => {
            eprintln!(
                "[TTS:2/3] RVC pre-flight check failed: {} — falling back to Piper-only",
                reason
            );
            return Ok(false);
        }
    }

    let infer_script = applio_dir.join("infer_standalone.py");
    eprintln!(
        "[TTS:2/3] RVC: python3 {} --input_path={} --output_path={} --pth_path={} --index_path={}",
        infer_script.display(),
        raw_wav,
        speech_wav,
        rvc_model.display(),
        rvc_index.display()
    );

    let rvc_output = StdCommand::new("python3")
        .arg(infer_script.to_str().unwrap_or("infer_standalone.py"))
        .arg("--input_path")
        .arg(raw_wav)
        .arg("--output_path")
        .arg(speech_wav)
        .arg("--pth_path")
        .arg(rvc_model.to_str().unwrap_or(""))
        .arg("--index_path")
        .arg(rvc_index.to_str().unwrap_or(""))
        .current_dir(&applio_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("RVC spawn error: {}", e))?;

    let rvc_stdout = String::from_utf8_lossy(&rvc_output.stdout);
    let rvc_stderr = String::from_utf8_lossy(&rvc_output.stderr);
    eprintln!("[TTS:2/3] RVC stdout: {}", rvc_stdout.trim());
    eprintln!("[TTS:2/3] RVC stderr: {}", rvc_stderr.trim());

    if !rvc_output.status.success() {
        eprintln!(
            "[TTS:2/3] RVC failed (exit {}) — falling back to Piper-only",
            rvc_output.status.code().unwrap_or(-1)
        );
        return Ok(false);
    }

    match validate_wav(speech_wav) {
        Ok(size) => {
            eprintln!("[TTS:2/3] RVC OK — {} bytes", size);
            Ok(true)
        }
        Err(e) => {
            eprintln!(
                "[TTS:2/3] RVC produced invalid WAV: {} — falling back to Piper-only",
                e
            );
            let _ = fs::remove_file(speech_wav);
            Ok(false)
        }
    }
}

fn find_applio_dir() -> Result<Option<PathBuf>, String> {
    // Проверяем переменную окружения
    if let Ok(path) = env::var("APPLIO_RVC_PATH") {
        let p = PathBuf::from(&path);
        if p.exists() && p.join("infer_standalone.py").exists() {
            return Ok(Some(p));
        }
    }

    // Ищем относительно текущего exe
    if let Ok(exe) = env::current_exe() {
        // Поднимаемся от target/release/ или target/debug/
        let mut candidate = exe.clone();
        for _ in 0..5 {
            candidate.pop();
        }
        let rel = candidate.join("assets/applio_rvc");
        if rel.exists() && rel.join("infer_standalone.py").exists() {
            return Ok(Some(rel));
        }
    }

    // Ищем относительно CWD
    if let Ok(cwd) = env::current_dir() {
        let rel = cwd.join("assets/applio_rvc");
        if rel.exists() && rel.join("infer_standalone.py").exists() {
            return Ok(Some(rel));
        }
    }

    Ok(None)
}

fn find_jarvis_models_dir() -> PathBuf {
    if let Ok(path) = env::var("JARVIS_MODELS_DIR") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return p;
        }
    }
    if let Ok(home) = env::var("HOME") {
        PathBuf::from(home).join(".local/share/jarvis/models")
    } else {
        PathBuf::from("/tmp/jarvis/models")
    }
}

fn check_rvc_available(applio_dir: &std::path::Path) -> Result<(), String> {
    let output = StdCommand::new("python3")
        .args([
            "-c",
            "import sys; sys.path.insert(0, '.'); from rvc.infer.infer import VoiceConverter; print('OK')",
        ])
        .current_dir(applio_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .unwrap_or_else(|_| std::process::Output {
            status: Default::default(),
            stdout: vec![],
            stderr: vec![],
        });

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() && stdout.contains("OK") {
        eprintln!("[TTS:RVC] VoiceConverter available");
        Ok(())
    } else {
        let reason = if stderr.contains("Illegal") || stdout.contains("Illegal") {
            "CPU lacks AVX2 (Sandy Bridge or older Xeon)"
        } else if stderr.contains("ModuleNotFoundError") {
            "Missing Python dependencies"
        } else if !output.status.success() {
            "Import crashed (signal or missing lib)"
        } else {
            "Unknown"
        };
        eprintln!(
            "[TTS:RVC] NOT available: {} | stderr: {}",
            reason,
            stderr.trim()
        );
        Err(format!("RVC unavailable: {}", reason))
    }
}
