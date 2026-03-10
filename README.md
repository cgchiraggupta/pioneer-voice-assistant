# 🎙️ Pioneer Voice Assistant

A real-time voice conversation AI assistant. You speak — it listens, thinks, and talks back. Built with a modular architecture that supports multiple AI pipeline variations.

> 🎛️ **Want to change the voice, speed, or personality?** → See **[VOICE_CONFIG.md](./VOICE_CONFIG.md)**

---

## 📁 Branch Structure

```
main                          → This README. Project overview & documentation
feature/modular-ai-architecture → Full working codebase (both variations inside)
PJ                            → Merged into feature branch (working voice pipeline)
```

---

## 🔀 Two Pipeline Variations

This project has been built in **two distinct variations**, both living inside the `feature/modular-ai-architecture` branch. You can switch between them by commenting/uncommenting the relevant code in `server/utils/modularAIProcessor.js` and `server/index.js`.

---

### Variation 1 — Local Stack (Whisper + Kimi K2.5 via Ollama)

Everything runs **locally on your machine**. No cloud AI API needed.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│   🎤 Mic → MediaRecorder → WebM/Opus blob                       │
│                              │                                  │
│              WebSocket send (binary)                            │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NODE.JS SERVER (Port 4000)                  │
│                                                                 │
│   Receives binary audio                                         │
│              │                                                  │
│              ▼                                                  │
│   ┌─────────────────────┐                                       │
│   │  Whisper STT (local) │  ← runs on Apple MPS GPU            │
│   │  model: tiny         │  ← requires: pip install whisper     │
│   └─────────┬───────────┘                                       │
│             │  transcript text                                  │
│             ▼                                                   │
│   ┌─────────────────────┐                                       │
│   │  Kimi K2.5 via       │  ← runs via Ollama locally          │
│   │  Ollama (cloud route)│  ← requires: ollama pull kimi-k2.5  │
│   └─────────┬───────────┘                                       │
│             │  AI response text                                 │
│             ▼                                                   │
│   ┌─────────────────────┐                                       │
│   │  Sarvam TTS          │  ← cloud API (bulbul:v3)            │
│   │  (text → WAV)        │                                      │
│   └─────────┬───────────┘                                       │
│             │  WAV binary                                       │
│             ▼                                                   │
│   WebSocket send (binary WAV → client)                          │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│   Receives WAV → Audio element plays it 🔊                      │
└─────────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Whisper CLI installed: `pipx install openai-whisper`
- Ollama running locally: `ollama pull kimi-k2.5:cloud`
- Sarvam API key (for TTS only)

**Pros:** AI runs fully offline, no Groq/OpenAI costs
**Cons:** Slower (Whisper transcription takes time), needs local setup

---

### Variation 2 — Cloud Stack (Sarvam STT + Groq + Sarvam TTS) ✅ Active

Everything runs via **cloud APIs**. Fast, no local model setup needed. This is the currently active variation.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│   🎤 Mic → MediaRecorder → WebM/Opus blob                       │
│                              │                                  │
│              WebSocket send (raw binary)                        │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NODE.JS SERVER (Port 4000)                  │
│                                                                 │
│   Receives binary audio                                         │
│   Detects format via magic bytes (WebM / OGG / WAV)             │
│              │                                                  │
│              ▼                                                  │
│   ┌─────────────────────┐                                       │
│   │  Sarvam STT          │  ← api.sarvam.ai/speech-to-text     │
│   │  model: saarika:v2.5 │  ← supports WebM, OGG, WAV, MP3     │
│   └─────────┬───────────┘                                       │
│             │  transcript text                                  │
│             ▼                                                   │
│   ┌─────────────────────┐                                       │
│   │  Groq API            │  ← api.groq.com                     │
│   │  Llama 3.3 70B       │  ← ~300ms response time             │
│   └─────────┬───────────┘                                       │
│             │  AI response text                                 │
│             ▼                                                   │
│   ┌─────────────────────┐                                       │
│   │  Sarvam TTS          │  ← api.sarvam.ai/text-to-speech     │
│   │  model: bulbul:v3    │  ← 30+ voices, speed control        │
│   └─────────┬───────────┘                                       │
│             │  WAV binary (base64 decoded)                      │
│             ▼                                                   │
│   WebSocket send → binary WAV first → JSON transcript second    │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│   Binary WAV queued → waits for JSON signal → plays audio 🔊    │
│   Text response displayed on screen                             │
└─────────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Sarvam API key → [sarvam.ai](https://sarvam.ai)
- Groq API key → [console.groq.com](https://console.groq.com)

**Pros:** Fast (~2-3s total), no local setup, 30+ voice options
**Cons:** Requires internet + API keys

---

### Variation 0 — Original (OpenAI GPT-4o Realtime) — `main` / `index.js`

The original implementation using OpenAI's realtime WebSocket API directly.

```
┌──────────────┐     WebSocket      ┌──────────────┐     WebSocket WSS    ┌─────────────────────┐
│   Browser    │ ─────────────────► │  Node Server │ ──────────────────► │  OpenAI GPT-4o       │
│  (client)    │                    │  (proxy)     │                      │  Realtime API        │
│              │ ◄───────────────── │              │ ◄────────────────── │  wss://api.openai..  │
│  plays audio │   WAV audio chunks │              │   audio.delta events │                      │
└──────────────┘                    └──────────────┘                      └─────────────────────┘
```

**Requirements:**
- OpenAI API key with Realtime API access

**Pros:** Single API, lowest latency, most natural conversation
**Cons:** Expensive, requires OpenAI Realtime API access (waitlist/paid)

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone git@github.com:cgchiraggupta/pioneer-voice-assistant.git
cd pioneer-voice-assistant
git checkout feature/modular-ai-architecture
```

### 2. Install dependencies

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 3. Set up environment variables

```bash
# Inside /server directory, create .env
GROQ_KEY=your_groq_api_key_here
```

> Sarvam API key is hardcoded in `server/utils/modularAIProcessor.js` — replace `SARVAM_API_KEY` value with your own key.

### 4. Run the server

```bash
# In /server directory
npm run dev
# → WebSocket server running on ws://localhost:4000/Assistant
```

### 5. Run the client

```bash
# In /client directory
npm run dev
# → Next.js running on http://localhost:3000
```

### 6. Use it

1. Open `http://localhost:3000`
2. Click **Connect to Assistant**
3. Click **Start Recording** → speak
4. Click **Stop Recording** → wait 2-3 seconds
5. Hear the response 🔊 and see the text on screen

---

## 🎙️ Changing the Voice

In `server/utils/modularAIProcessor.js`, find these two lines at the top:

```js
const TTS_SPEAKER = "pooja";   // ← change voice here
const TTS_PACE    = 1.0;       // ← change speed (0.5 slow → 2.0 fast)
```

**Available voices (bulbul:v3):**

| Gender | Voices |
|--------|--------|
| Male | `abhilash` `karun` `hitesh` `aditya` `rahul` `rohan` `amit` `dev` `ratan` `varun` `manan` `sumit` `kabir` `aayan` `shubh` `ashutosh` `advait` `anand` `tarun` `sunny` `mani` `gokul` `vijay` `mohit` `rehan` `soham` |
| Female | `pooja` `anushka` `manisha` `vidya` `arya` `ritu` `priya` `neha` `simran` `kavya` `ishita` `shreya` `roopa` `amelia` `sophia` `tanya` `shruti` `suhani` `kavitha` `rupali` |

---

## 🔁 Switching Between Variations

To switch from **Variation 2 (cloud)** back to **Variation 1 (local Whisper + Kimi)**:

In `server/utils/modularAIProcessor.js`:

1. Comment out the active pipeline calls (`testSarvamSTT`, `testSarvamTTS`, `testGroq`, `speechToText`, `processWithAI`, `textToSpeech`)
2. Uncomment the old pipeline calls (`testOllamaConnection`, `speechToTextWhisper`, `processWithKimi`)
3. In `processAudio()` at the bottom, uncomment the Whisper → Kimi pipeline block

All the old code is preserved in comments — nothing was deleted.

---

## 🗂️ Project Structure

```
pioneer-voice-assistant/
├── client/                        # Next.js frontend
│   └── src/pages/
│       └── index.js               # UI, recording, WebSocket, audio playback
├── server/
│   ├── index.js                   # Variation 0: OpenAI GPT-4o Realtime proxy
│   ├── index-modular.js           # Variation 1 & 2: Modular pipeline server
│   └── utils/
│       ├── modularAIProcessor.js  # STT → AI → TTS pipeline logic
│       └── audiofunctions.js      # WAV header helpers
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Variation 1 (Local) | Variation 2 (Cloud) |
|-------|--------------------|--------------------|
| **Frontend** | Next.js + React + Tailwind | Same |
| **Backend** | Node.js + WebSocket | Same |
| **STT** | Whisper (local CLI, MPS GPU) | Sarvam `saarika:v2.5` |
| **AI Model** | Kimi K2.5 via Ollama | Groq `llama-3.3-70b-versatile` |
| **TTS** | Sarvam `bulbul:v3` | Sarvam `bulbul:v3` |
| **Audio Format** | WebM/Opus → WAV | WebM/Opus → WAV |

---

## 📜 License

MIT License

---

> Built ahead of the mainstream voice AI trend — November 2024.