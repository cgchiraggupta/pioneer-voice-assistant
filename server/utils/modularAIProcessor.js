const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

// API Configuration
const SARVAM_API_KEY = "sk_vdjmhd4o_cJhjgkayGjnGPgn8dpQMMFt6";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

// ─── CHANGE VOICE HERE ───────────────────────────────────────────────────────
// All available bulbul:v3 voices — just swap the value below:
//
// MALE:   "abhilash" | "karun"   | "hitesh"  | "aditya"  | "rahul"
//         "rohan"    | "amit"    | "dev"     | "ratan"   | "varun"
//         "manan"    | "sumit"   | "kabir"   | "aayan"   | "shubh"
//         "ashutosh" | "advait"  | "anand"   | "tarun"   | "sunny"
//         "mani"     | "gokul"   | "vijay"   | "mohit"   | "rehan"
//         "soham"
//
// FEMALE: "pooja"    | "anushka" | "manisha" | "vidya"   | "arya"
//         "ritu"     | "priya"   | "neha"    | "simran"  | "kavya"
//         "ishita"   | "shreya"  | "roopa"   | "amelia"  | "sophia"
//         "tanya"    | "shruti"  | "suhani"  | "kavitha" | "rupali"
//
// SPEED:  TTS_PACE — 0.5 (slow) to 2.0 (fast), default is 1.0
// ─────────────────────────────────────────────────────────────────────────────
const TTS_SPEAKER = "pooja";
const TTS_PACE = 1.0;

// Wrap raw PCM16 mono data in a proper WAV header so Sarvam STT accepts it
function wrapPCM16InWavHeader(
  pcmBuffer,
  sampleRate = 16000,
  numChannels = 1,
  bitsPerSample = 16,
) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.byteLength;
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + dataSize);

  // RIFF chunk
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + dataSize, 4);
  wavBuffer.write("WAVE", 8);

  // fmt sub-chunk
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  wavBuffer.writeUInt16LE(1, 20); // AudioFormat = PCM
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wavBuffer, headerSize);

  return wavBuffer;
}
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TEMP_DIR = path.join(__dirname, "../temp");

class ModularAIProcessor {
  constructor() {
    this.isReady = false;
    this.ollamaUrl = "http://localhost:11434";
  }

  // Initialize

  async initialize() {
    try {
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      // Active pipeline checks
      await this.testSarvamSTT();
      await this.testSarvamTTS();
      await this.testGroq();

      // Old pipeline checks - commented out (Whisper + Kimi)
      // await this.testOllamaConnection();

      this.isReady = true;
      console.log(
        "Modular AI Processor initialized (Sarvam STT -> Groq -> Sarvam TTS)",
      );
      return true;
    } catch (error) {
      console.error(
        "Failed to initialize Modular AI Processor:",
        error.message,
      );
      return false;
    }
  }

  // Health checks

  // Active: Test Sarvam STT
  async testSarvamSTT() {
    try {
      if (!SARVAM_API_KEY) {
        throw new Error("SARVAM_API_KEY is not set");
      }
      console.log("Sarvam STT configured (key present)");
      return true;
    } catch (error) {
      throw new Error("Sarvam STT check failed: " + error.message);
    }
  }

  // Active: Test Sarvam TTS
  async testSarvamTTS() {
    try {
      const response = await axios.post(
        SARVAM_TTS_URL,
        {
          target_language_code: "en-IN",
          text: "Hello world",
          speaker: TTS_SPEAKER,
          pace: TTS_PACE,
          model: "bulbul:v3",
        },
        {
          headers: {
            "api-subscription-key": SARVAM_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.data || !response.data.audios || !response.data.audios[0]) {
        throw new Error("Unexpected Sarvam TTS response - no audios field");
      }

      console.log("Sarvam TTS connected successfully");
      return true;
    } catch (error) {
      const detail = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      console.error("Sarvam TTS raw error:", detail);
      throw new Error("Sarvam TTS check failed: " + detail);
    }
  }

  // Active: Test Groq API
  async testGroq() {
    const key = process.env.GROQ_KEY;
    if (!key) {
      throw new Error(
        "GROQ_KEY not found in environment. Add it to your .env file: GROQ_KEY=your_key_here",
      );
    }
    console.log("Groq API key present");
    return true;
  }

  // Old: Test Ollama / Kimi connection - commented out, kept for reference
  /*
  async testOllamaConnection() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      const models = response.data.models || [];
      const kimiModel = models.find((m) => m.name.includes("kimi-k2.5"));

      if (!kimiModel) {
        throw new Error("kimi-k2.5 model not found in Ollama - run: ollama pull kimi-k2.5:cloud");
      }

      console.log("Kimi K2.5 model found:", kimiModel.name);
      return true;
    } catch (error) {
      throw new Error("Ollama connection failed: " + error.message);
    }
  }
  */

  // Step 1: Speech to Text

  // Active: Sarvam STT - cloud, no local dependencies
  async speechToText(audioBuffer) {
    const FormData = require("form-data");

    // Detect format from magic bytes so we use the right extension + mime type
    const header = audioBuffer.slice(0, 4).toString("ascii");
    const isWav = header === "RIFF";
    const isWebM = audioBuffer.slice(0, 4).toString("hex") === "1a45dfa3";
    const isOgg = audioBuffer.slice(0, 4).toString("ascii") === "OggS";

    let ext, mimeType;
    if (isWav) {
      ext = "wav";
      mimeType = "audio/wav";
    } else if (isWebM) {
      ext = "webm";
      mimeType = "audio/webm";
    } else if (isOgg) {
      ext = "ogg";
      mimeType = "audio/ogg";
    } else {
      // Unknown — wrap as PCM WAV so Sarvam at least gets a valid container
      console.warn(
        "Unknown audio format, wrapping as PCM WAV. Header hex:",
        audioBuffer.slice(0, 4).toString("hex"),
      );
      audioBuffer = wrapPCM16InWavHeader(audioBuffer);
      ext = "wav";
      mimeType = "audio/wav";
    }

    const tempInput = path.join(TEMP_DIR, `input_${Date.now()}.${ext}`);

    try {
      fs.writeFileSync(tempInput, audioBuffer);
      console.log(
        `Running Sarvam STT on ${ext} file (${audioBuffer.byteLength} bytes)...`,
      );

      const formData = new FormData();
      formData.append("file", fs.createReadStream(tempInput), {
        filename: `audio.${ext}`,
        contentType: mimeType,
      });
      formData.append("language_code", "en-IN");
      formData.append("model", "saarika:v2.5");

      const response = await axios.post(SARVAM_STT_URL, formData, {
        headers: {
          "api-subscription-key": SARVAM_API_KEY,
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });

      const transcript = response.data.transcript;
      if (!transcript) {
        throw new Error("Sarvam STT returned empty transcript");
      }

      console.log("Transcript:", transcript);
      return transcript;
    } catch (error) {
      console.error(
        "Sarvam STT failed:",
        error.response?.data || error.message,
      );
      throw error;
    } finally {
      if (fs.existsSync(tempInput)) {
        try {
          fs.unlinkSync(tempInput);
        } catch (_) {}
      }
    }
  }

  // Old: Whisper STT - local CLI, slow, requires Whisper installed - commented out
  /*
  async speechToTextWhisper(audioBuffer) {
    const tempInput = path.join(TEMP_DIR, `input_${Date.now()}.wav`);

    try {
      fs.writeFileSync(tempInput, audioBuffer);

      // Uses Apple Silicon MPS GPU for speed
      const whisperCmd = `whisper "${tempInput}" --model tiny --language en --output_format txt --output_dir "${TEMP_DIR}" --device mps --fp16 False`;

      console.log("Running Whisper STT (MPS GPU)...");
      const { stdout, stderr } = await execAsync(whisperCmd, {
        timeout: 120000,
      });

      if (stderr) console.warn("Whisper stderr:", stderr);

      const baseName = path.basename(tempInput, path.extname(tempInput));
      const transcriptFile = path.join(TEMP_DIR, `${baseName}.txt`);

      let transcript = "";
      if (fs.existsSync(transcriptFile)) {
        transcript = fs.readFileSync(transcriptFile, "utf8").trim();
        fs.unlinkSync(transcriptFile);
      } else {
        transcript = stdout.trim();
      }

      console.log("Transcript:", transcript);
      return transcript;
    } catch (error) {
      if (
        error.code === 127 ||
        error.message.includes("command not found") ||
        error.message.includes("not found")
      ) {
        throw new Error("Whisper CLI not found. Install it with: pipx install openai-whisper");
      }
      console.error("Whisper STT failed:", error.message);
      throw error;
    } finally {
      if (fs.existsSync(tempInput)) {
        try {
          fs.unlinkSync(tempInput);
        } catch (_) {}
      }
    }
  }
  */

  // Step 2: Text to AI Response

  // Active: Groq - cloud, fast, free tier, Llama 3.3 70B
  async processWithAI(text) {
    const key = process.env.GROQ_KEY;
    if (!key) {
      throw new Error("GROQ_KEY not set in .env");
    }

    try {
      console.log("Sending to Groq (Llama 3.3 70B)...");
      const response = await axios.post(
        GROQ_API_URL,
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful voice assistant. Always reply in plain spoken English with no markdown, no bullet points, no special characters. Keep every response under 300 characters - short, direct and conversational.",
            },
            {
              role: "user",
              content: text,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      const aiResponse = response.data.choices[0].message.content;
      console.log("Groq response:", aiResponse);
      return aiResponse;
    } catch (error) {
      console.error("Groq failed:", error.response?.data || error.message);
      throw error;
    }
  }

  // Old: Kimi K2.5 via Ollama - cloud-routed, slow - commented out
  /*
  async processWithKimi(text) {
    try {
      console.log("Sending to Kimi K2.5...");
      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: "kimi-k2.5:cloud",
          system:
            "You are a helpful voice assistant. Always reply in plain spoken English with no markdown, no bullet points, no special characters. Keep every response under 300 characters - short, direct and conversational.",
          prompt: text,
          stream: false,
        },
        { timeout: 60000 },
      );

      const aiResponse = response.data.response;
      console.log("Kimi response:", aiResponse);
      return aiResponse;
    } catch (error) {
      console.error("Kimi processing failed:", error.message);
      throw error;
    }
  }
  */

  // Step 3: Text to Speech

  // Truncate text to Sarvam's 500-char limit at a clean word boundary
  truncateForTTS(text, limit = 499) {
    if (text.length <= limit) return text;
    const cut = text.lastIndexOf(" ", limit);
    const truncated = cut > 0 ? text.slice(0, cut) : text.slice(0, limit);
    console.warn(
      "AI response truncated from",
      text.length,
      "to",
      truncated.length,
      "chars for Sarvam TTS",
    );
    return truncated;
  }

  // Active: Sarvam TTS
  async textToSpeech(text) {
    try {
      const safeText = this.truncateForTTS(text);
      console.log("Calling Sarvam TTS (" + safeText.length + " chars)...");

      const response = await axios.post(
        SARVAM_TTS_URL,
        {
          target_language_code: "en-IN",
          text: safeText,
          speaker: TTS_SPEAKER,
          pace: TTS_PACE,
          model: "bulbul:v3",
        },
        {
          headers: {
            "api-subscription-key": SARVAM_API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      // Sarvam returns JSON: { "audios": ["<base64_wav>"] }
      const base64Audio = response.data.audios[0];
      if (!base64Audio) {
        throw new Error("Sarvam TTS returned empty audios array");
      }

      // Decode base64 to Buffer - already a complete WAV file, no extra header needed
      const audioBuffer = Buffer.from(base64Audio, "base64");
      console.log("TTS complete -", audioBuffer.byteLength, "bytes");
      return audioBuffer;
    } catch (error) {
      console.error(
        "Text-to-speech failed:",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  // Full pipeline

  async processAudio(audioBuffer) {
    if (!this.isReady) {
      throw new Error("Modular AI Processor is not initialized");
    }

    console.log("Starting pipeline: Sarvam STT -> Groq -> Sarvam TTS");

    // Step 1 - Speech to Text (Sarvam STT)
    const transcript = await this.speechToText(audioBuffer);

    // Step 2 - AI Response (Groq)
    const aiResponse = await this.processWithAI(transcript);

    // Step 3 - Text to Speech (Sarvam TTS)
    // Returns a complete WAV buffer - no extra header wrapping needed
    const audioResponse = await this.textToSpeech(aiResponse);

    console.log("Pipeline complete");
    return { transcript, aiResponse, audioResponse };

    // Old pipelines - commented out for reference
    //
    // Whisper -> Kimi -> Sarvam (original feature branch):
    // const transcript = await this.speechToTextWhisper(audioBuffer);
    // const aiResponse = await this.processWithKimi(transcript);
    // const audioResponse = await this.textToSpeech(aiResponse);
    // return { transcript, aiResponse, audioResponse };
    //
    // Sarvam STT -> Perplexity -> Sarvam TTS (needs PERPLEXITY_KEY with credits at perplexity.ai/settings/api):
    // const transcript = await this.speechToText(audioBuffer);
    // const aiResponse = await this.processWithAI(transcript); // swap GROQ_KEY logic for PERPLEXITY_KEY
    // const audioResponse = await this.textToSpeech(aiResponse);
    // return { transcript, aiResponse, audioResponse };
  }
}

module.exports = ModularAIProcessor;
