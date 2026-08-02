// ============================================================
// JARVIS VOICE PIPELINE (TTS / STT)
// ============================================================
// Независимый голосовой контур:
//   - stt.rs : Speech-to-Text (Whisper C++ / Python)
//   - tts.rs : Text-to-Speech (Piper → RVC → aplay)

pub mod stt;
pub mod tts;
