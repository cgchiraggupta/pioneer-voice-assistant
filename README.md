# Pioneer Voice Assistant

Real-time conversational voice AI using OpenAI's Realtime API over WebSocket. Record speech — get spoken responses with live audio visualisation — zero cloud speech-to-text dependencies, all audio pipeline runs on-device before hitting the GPT-4o Realtime endpoint.

## System Architecture

```
┌──────────────┐     WebSocket      ┌──────────────┐     WebSocket      ┌─────────────────────┐
│              │   ws://localhost   │              │   wss://api.oai   │                     │
│  Next.js UI  │ ◄──────────────► │  Node Proxy  │ ◄──────────────► │  GPT-4o Realtime   │
│  (Client)    │    :4000/Assistant │  (Server)    │    /v1/realtime   │  (OpenAI)           │
│              │                    │              │                    │                     │
└──────┬───────┘                    └──────────────┘                    └─────────────────────┘
       │
       ├─ getUserMedia() ──► PCM16 mono 24kHz ──► Base64 ──► WS
       │
       └─ WS ◄── WAV chunks ──► decodeAudioData ──► AnalyserNode ──► Canvas
```

The client proxies **no media streams to intermediate services**. Audio bytes hit exactly two machines: the user's browser and OpenAI.

## Data Flow

### Upstream (User → GPT-4o)

1. `getUserMedia` captures mic audio → `MediaRecorder` emits blobs
2. `AudioContext.decodeAudioData` resamples to **24kHz PCM16 mono**
3. PCM16 buffer Base64-encoded → wrapped in `conversation.item.create` event
4. `response.create` event triggers GPT-4o inference
5. Both events sent over WebSocket to the Node proxy on `ws://localhost:4000/Assistant`

### Downstream (GPT-4o → User)

1. Server receives `response.audio.delta` chunks (raw PCM16 24kHz mono)
2. Each chunk wrapped in a **44-byte WAV header** → `ArrayBuffer` sent to client
3. Client collects WAV chunks in `audioDataRef` until `response.done` fires
4. `AudioContext.decodeAudioData` → `BufferSource` → `AnalyserNode` → speakers
5. `AnalyserNode` drives a **real-time frequency bar graph** on `<canvas>`

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS | SSR-capable, zero-config Webpack, fast iteration |
| Audio Pipeline | Web Audio API (`AudioContext`, `AnalyserNode`) | On-device resampling, no cloud dependency |
| Visualisation | `react-audio-visualize` + custom Canvas 2D | Dual visualisation — input waveform + output spectrum |
| Transport | `ws` (client + server) | Native WebSocket, no HTTP polling overhead |
| AI Backend | OpenAI GPT-4o Realtime (`gpt-4o-realtime-preview-2024-10-01`) | Native audio-in/audio-out, <500ms first-token latency |
| Server Runtime | Node.js, `dotenv`, `nodemon` | Minimal proxy — no Express, no frameworks |

## Prerequisites

- Node.js >= 18
- OpenAI API key with access to the Realtime API (gpt-4o-realtime-preview model)
- Browser with `getUserMedia` support (Chrome, Firefox, Edge, Safari 16.4+)

## Setup

### 1. Server

```bash
cd server
npm install
echo "KEY=sk-proj-your-openai-key-here" > .env
npm run dev
```

The server listens on `ws://localhost:4000/Assistant`.

### 2. Client

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:3000`.

## Usage

1. Click **Connect to Assistant** — establishes WebSocket to server (client → proxy → OpenAI)
2. Click **Start Recording** — mic capture begins, audio chunks queued
3. Click **Stop Recording** — audio resampled, sent to GPT-4o
4. Wait for **Assistant is Thinking...** indicator to clear
5. Spoken response plays through speakers with live frequency visualisation
6. Click **Close Connection** (bottom-left) to disconnect

## WebSocket Protocol

### Client → Server

| Event Type | Purpose |
|-----------|---------|
| `conversation.item.create` | Injects user audio (Base64 PCM16) into conversation context |
| `response.create` | Triggers GPT-4o response generation with `modalities: ["text", "audio"]` |

Both events follow the [OpenAI Realtime API event schema](https://platform.openai.com/docs/guides/realtime).

### Server → Client

| Message Type | Format | Handling |
|-------------|--------|----------|
| `response.audio.delta` | Raw `ArrayBuffer` (WAV-header-wrapped PCM16) | Collected in `audioDataRef` |
| `response.done` | JSON | Triggers sequential playback of all buffered audio, displays transcript |
| `error` | JSON | Logged to console, shown in UI |
| `your gpt client is ready for u to use` | Text | Confirms OpenAI WebSocket connected |

## Audio Pipeline Details

### Recording (Client-side)

```
getUserMedia → MediaRecorder → Blob → AudioContext (24kHz) → decodeAudioData
    → averageChannels (stereo→mono) → float32ToPCM16 → Base64
```

### Playback (Client-side)

```
WAV ArrayBuffer → AudioContext.decodeAudioData → BufferSource → AnalyserNode → speakers
                                                                     ↓
                                                              Canvas 2D bar graph
```

### Proxy (Server-side)

```
response.audio.delta (Base64 PCM16) → base64ToArrayBuffer
    → createWavHeader(24000, len) → concatenateHeader+Data → send ArrayBuffer
```

## Key Design Decisions

- **No audio stored on disk.** All buffers live in memory (`audioDataRef`, `audioChunksRef`) and are garbage-collected after playback.
- **Explicit `response.create` after `conversation.item.create`.** OpenAI Realtime does not auto-respond to user messages — the client must fire both events sequentially.
- **Sequential playback queue.** Audio chunks are buffered during streaming, then replayed in order once `response.done` arrives. This avoids gaps from interleaved delta processing.
- **Message queuing on server.** If OpenAI's WebSocket hasn't opened yet, client messages are queued (`messageQueue`) and flushed on connection ready.

## Development

```bash
# Server with auto-reload
cd server && npm run dev

# Client dev server
cd client && npm run dev
```

## Deployment Considerations

- **CORS / WSS:** The WebSocket runs on a different port (4000) than the Next.js dev server (3000). For production, either reverse-proxy both behind the same origin or use `wss://` with TLS.
- **API Key:** Stored in `server/.env`. Never commit this file. For production, use environment variables via your hosting platform (Fly.io, Railway, Render, etc.).
- **Concurrent Sessions:** This is a single-connection proxy. For multi-user, add session management and per-user `gptClient` instances.
- **Rate Limits:** OpenAI Realtime API has concurrent connection limits per API key. Monitor 429 responses.

## Security

- OpenAI API key must be scoped appropriately. Consider project-level keys if available.
- The server currently trusts all WebSocket clients. For production, add origin validation or ephemeral token authentication.
- No user data is persisted — all audio is processed in memory and discarded.
