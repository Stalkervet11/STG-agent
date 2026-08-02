// ============================================================
// JARVIS SPEECH-TO-TEXT (STT)
// ============================================================
//
// Распознавание речи через Whisper (C++ whisper-cpp или Python openai-whisper).
//
// Поддерживает два источника аудио:
//   1. Веб-микрофон (web blob через фронтенд) → WAV → whisper.
//   2. Прямой захват с микрофона через cpal → WAV → whisper.

use std::env;
use std::fs;
use std::process::{Command as StdCommand, Stdio};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, StreamTrait};

// ── Whisper detection ──────────────────────────────────────

#[derive(Clone, Debug)]
pub enum WhisperFlavor {
    /// C++ whisper.cpp  —  `whisper-cpp -m MODEL -f AUDIO -l ru -nt --no-prints`
    Cpp,
    /// Python openai-whisper  —  `whisper AUDIO --model tiny --output_format txt`
    Python,
}

pub struct WhisperTool {
    pub binary: String,
    pub flavor: WhisperFlavor,
}

fn which(bin: &str) -> bool {
    StdCommand::new("which")
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn find_whisper() -> Result<WhisperTool, String> {
    if which("whisper-cpp") {
        return Ok(WhisperTool {
            binary: "whisper-cpp".into(),
            flavor: WhisperFlavor::Cpp,
        });
    }
    if which("whisper") {
        return Ok(WhisperTool {
            binary: "whisper".into(),
            flavor: WhisperFlavor::Python,
        });
    }
    Err("whisper-cpp not found. Install: sudo dnf install whisper-cpp".to_string())
}

pub fn find_whisper_model_path() -> Result<String, String> {
    if let Ok(path) = env::var("WHISPER_MODEL_PATH") {
        if std::path::Path::new(&path).exists() {
            return Ok(path);
        }
        return Err(format!(
            "WHISPER_MODEL_PATH set but file not found: {}",
            path
        ));
    }
    if let Ok(home) = env::var("HOME") {
        let cache = format!("{}/.cache/jarvis/whisper/ggml-tiny.bin", home);
        if std::path::Path::new(&cache).exists() {
            return Ok(cache);
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let rel = parent.join("models").join("ggml-tiny.bin");
            if rel.exists() {
                return Ok(rel.to_string_lossy().to_string());
            }
        }
    }
    for sp in &[
        "/usr/share/whisper-models/ggml-tiny.bin",
        "/usr/local/share/whisper-models/ggml-tiny.bin",
        "/opt/whisper-models/ggml-tiny.bin",
    ] {
        if std::path::Path::new(sp).exists() {
            return Ok(sp.to_string());
        }
    }
    Err("Whisper model not found. Download: mkdir -p ~/.cache/jarvis/whisper && wget -O ~/.cache/jarvis/whisper/ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin".to_string())
}

pub fn model_name_from_path(path: &str) -> String {
    let stem = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("tiny");
    stem.trim_start_matches("ggml-").to_string()
}

// ── Transcription ──────────────────────────────────────────

pub fn transcribe_with_whisper(
    wav_path: &str,
    tool: &WhisperTool,
    model_ref: &str,
) -> Result<String, String> {
    match tool.flavor {
        WhisperFlavor::Cpp => {
            eprintln!(
                "[STT:cpp] {} -m {} -f {} -l ru -nt --no-prints",
                tool.binary, model_ref, wav_path
            );
            let output = StdCommand::new(&tool.binary)
                .arg("-m")
                .arg(model_ref)
                .arg("-f")
                .arg(wav_path)
                .arg("-l")
                .arg("ru")
                .arg("-nt")
                .arg("--no-prints")
                .output()
                .map_err(|e| format!("whisper-cpp spawn error: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string();
            let stderr = String::from_utf8_lossy(&output.stderr)
                .trim()
                .to_string();

            if !output.status.success() {
                return Err(format!(
                    "whisper-cpp exit {}: stdout='{}' stderr='{}'",
                    output.status.code().unwrap_or(-1),
                    stdout,
                    stderr
                ));
            }
            let text = if stdout.is_empty() { stderr } else { stdout };
            if text.is_empty() {
                return Err("No speech recognized (whisper-cpp)".to_string());
            }
            Ok(text)
        }
        WhisperFlavor::Python => {
            eprintln!(
                "[STT:py] {} {} --model {} --output_format txt",
                tool.binary, wav_path, model_ref
            );
            let output = StdCommand::new(&tool.binary)
                .arg(wav_path)
                .arg("--model")
                .arg(model_ref)
                .arg("--output_format")
                .arg("txt")
                .output()
                .map_err(|e| format!("whisper (python) spawn error: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string();
            let stderr = String::from_utf8_lossy(&output.stderr)
                .trim()
                .to_string();

            if !output.status.success() {
                return Err(format!(
                    "whisper (py) exit {}: stdout='{}' stderr='{}'",
                    output.status.code().unwrap_or(-1),
                    stdout,
                    stderr
                ));
            }
            let text = extract_python_whisper_text(&stdout, &stderr);
            if text.is_empty() {
                return Err("No speech recognized (python whisper)".to_string());
            }
            Ok(text)
        }
    }
}

fn extract_python_whisper_text(stdout: &str, stderr: &str) -> String {
    for line in stdout.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('[') {
            continue;
        }
        if trimmed.contains("Whisper") && trimmed.contains("Processing") {
            continue;
        }
        return trimmed.to_string();
    }
    for line in stderr.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('[') {
            continue;
        }
        return trimmed.to_string();
    }
    String::new()
}

// ── WAV encoding ───────────────────────────────────────────

pub fn samples_to_wav(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = std::io::Cursor::new(Vec::new());
    let mut writer = hound::WavWriter::new(&mut cursor, spec)
        .map_err(|e| format!("WAV writer error: {}", e))?;
    let amplitude = i16::MAX as f32;
    for &sample in samples {
        writer
            .write_sample(
                (sample * amplitude).clamp(i16::MIN as f32, i16::MAX as f32) as i16,
            )
            .map_err(|e| format!("Sample write error: {}", e))?;
    }
    writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {}", e))?;
    Ok(cursor.into_inner())
}

// ── Transcribe from web blob ───────────────────────────────

pub fn transcribe_web_blob(audio_bytes: &[u8]) -> Result<String, String> {
    if audio_bytes.is_empty() {
        return Err("Empty audio data".to_string());
    }

    let tool = find_whisper()?;
    let model_ref = match tool.flavor {
        WhisperFlavor::Cpp => find_whisper_model_path()?,
        WhisperFlavor::Python => model_name_from_path(&find_whisper_model_path()?),
    };

    let pid = std::process::id();
    let tmp = env::temp_dir();
    let raw_path = tmp.join(format!("jarvis_web_in_{}.wav", pid));
    let converted_path = tmp.join(format!("jarvis_web_conv_{}.wav", pid));

    eprintln!(
        "[STT:web] {} bytes -> {}",
        audio_bytes.len(),
        raw_path.display()
    );
    fs::write(&raw_path, audio_bytes).map_err(|e| format!("Write error: {}", e))?;

    let final_path = if which("ffmpeg") {
        let status = StdCommand::new("ffmpeg")
            .args([
                "-y",
                "-i",
                raw_path.to_str().unwrap_or("/tmp/x.wav"),
                "-ar",
                "16000",
                "-ac",
                "1",
                "-sample_fmt",
                "s16",
                converted_path.to_str().unwrap_or("/tmp/y.wav"),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        match status {
            Ok(s) if s.success() => {
                let _ = fs::remove_file(&raw_path);
                converted_path
            }
            _ => {
                let _ = fs::remove_file(&converted_path);
                raw_path
            }
        }
    } else {
        raw_path
    };

    let final_str = final_path.to_string_lossy().to_string();
    let text = transcribe_with_whisper(&final_str, &tool, &model_ref)?;

    let _ = fs::remove_file(&final_str);
    let _ = fs::remove_file(&tmp.join(format!("jarvis_web_in_{}.wav", pid)));
    let _ = fs::remove_file(&tmp.join(format!("jarvis_web_conv_{}.wav", pid)));

    eprintln!("[STT:web] OK: {}", text);
    Ok(text)
}

// ── Direct mic capture ─────────────────────────────────────

const SILENCE_TIMEOUT_SECS: f32 = 2.0;
const MAX_RECORD_SECS: f32 = 12.0;
const ENERGY_THRESHOLD: f32 = 0.01;

pub fn record_mic_and_transcribe(
    device: cpal::Device,
    supported_config: cpal::SupportedStreamConfig,
    sample_rate: u32,
    tool: WhisperTool,
    model_ref: String,
    on_state: impl Fn(&str, &str),
) -> Result<String, String> {
    let recorded_samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let recording_active = Arc::new(AtomicBool::new(true));
    let last_energy_time = Arc::new(Mutex::new(Instant::now()));

    let rec_samples = Arc::clone(&recorded_samples);
    let rec_active = Arc::clone(&recording_active);
    let rec_last_energy = Arc::clone(&last_energy_time);
    let rec_start = Instant::now();

    let config: cpal::StreamConfig = supported_config.into();

    let stream = device
        .build_input_stream(
            &config,
            move |data: &[f32], _: &_| {
                if !rec_active.load(Ordering::Relaxed) {
                    return;
                }
                let sum_sq: f32 = data.iter().map(|s| s * s).sum();
                let energy = (sum_sq / data.len() as f32).sqrt();
                if let Ok(mut buf) = rec_samples.lock() {
                    buf.extend_from_slice(data);
                }
                if energy > ENERGY_THRESHOLD {
                    if let Ok(mut t) = rec_last_energy.lock() {
                        *t = Instant::now();
                    }
                }
                let elapsed_total = rec_start.elapsed().as_secs_f32();
                let silent_for = rec_last_energy
                    .lock()
                    .map(|t| t.elapsed().as_secs_f32())
                    .unwrap_or(0.0);
                if elapsed_total > MAX_RECORD_SECS || silent_for > SILENCE_TIMEOUT_SECS {
                    rec_active.store(false, Ordering::Relaxed);
                }
            },
            |err| eprintln!("[VOICE:start] stream error: {}", err),
            None,
        )
        .map_err(|e| format!("Stream error: {}", e))?;

    stream.play().map_err(|e| format!("Stream play error: {}", e))?;
    eprintln!(
        "[VOICE:start] Recording... (max {}s, silence {}s)",
        MAX_RECORD_SECS, SILENCE_TIMEOUT_SECS
    );

    on_state("recording", "Recording from microphone...");

    let mut last_hb = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(200));
        if !recording_active.load(Ordering::Relaxed) {
            break;
        }
        if last_hb.elapsed().as_secs_f32() > 2.0 {
            let elapsed = rec_start.elapsed().as_secs_f32();
            on_state("recording", &format!("Recording... {:.0}s", elapsed));
            last_hb = Instant::now();
        }
    }

    drop(stream);
    std::thread::sleep(Duration::from_millis(300));

    let samples = recorded_samples
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .clone();
    let total_secs = samples.len() as f32 / sample_rate as f32;
    eprintln!(
        "[VOICE:start] Done: {} samples ({:.2}s)",
        samples.len(),
        total_secs
    );

    if samples.len() < sample_rate as usize / 2 {
        return Err("Recording too short - no speech detected".to_string());
    }

    let wav_bytes = samples_to_wav(&samples, sample_rate)?;
    let pid = std::process::id();
    let wav_path = env::temp_dir().join(format!("jarvis_mic_{}.wav", pid));
    fs::write(&wav_path, &wav_bytes).map_err(|e| format!("WAV write error: {}", e))?;
    eprintln!(
        "[VOICE:start] WAV: {} ({} bytes)",
        wav_path.display(),
        wav_bytes.len()
    );

    on_state("processing", "Transcribing speech...");

    let wav_str = wav_path.to_string_lossy().to_string();
    let text = transcribe_with_whisper(&wav_str, &tool, &model_ref)
        .map_err(|e| {
            let _ = fs::remove_file(&wav_path);
            e
        })?;

    let _ = fs::remove_file(&wav_path);

    eprintln!("[VOICE:start] Recognized: {}", text);
    Ok(text)
}
