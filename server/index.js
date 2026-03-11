// ============================================================
//  Unified WebSocket Server — Mode-switchable via .env
// ============================================================
//
//  MODE=openai   → GPT-4o Realtime (OpenAI WebSocket passthrough)
//                  Browser sends PCM16 base64 JSON events
//                  OpenAI streams back audio chunks in real time
//
//  MODE=modular  → Sarvam STT → Groq LLM → Sarvam TTS
//                  Browser sends raw WebM/Opus binary blob
//                  Server returns a complete WAV + JSON transcript
//
//  To switch:  edit MODE= in server/.env and restart the server.
//
//  Both handlers listen on ws://localhost:4000/Assistant
// ============================================================

const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

const MODE = (process.env.MODE || "modular").toLowerCase();

console.log("=".repeat(60));
console.log(`  Assistant Server starting in MODE="${MODE}"`);
console.log("=".repeat(60));

if (MODE !== "openai" && MODE !== "modular") {
  console.error(
    `[ERROR] Unknown MODE="${MODE}". Set MODE=openai or MODE=modular in your .env file.`,
  );
  process.exit(1);
}

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

// ─────────────────────────────────────────────────────────────
//  HANDLER A — OpenAI GPT-4o Realtime
//  Original file: index.openai.backup.js
//
//  Flow:
//    Browser → PCM16 base64 JSON events
//    → Node (forward as-is) → OpenAI Realtime WebSocket
//    ← OpenAI streams response.audio.delta chunks
//    ← Node wraps each PCM chunk in a WAV header → Browser
//
//  Required .env keys:
//    KEY=<your OpenAI API key>
// ─────────────────────────────────────────────────────────────
function handleOpenAI(ws) {
  console.log("[OpenAI] Client connected");

  const helper = require("./utils/audiofunctions.js");
  const gptKey = process.env.KEY;

  if (!gptKey) {
    console.error("[OpenAI] ERROR: KEY not found in .env");
    ws.send(
      JSON.stringify({
        type: "error",
        error: { message: "OpenAI API key (KEY) missing from .env" },
      }),
    );
    ws.close();
    return;
  }

  // Message queue for messages received before gptClient is ready
  const messageQueue = [];
  let gptClientReady = false;

  // Open a WebSocket connection directly to OpenAI Realtime API
  const url =
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
  const gptClient = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${gptKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  // ── OpenAI connection open ──
  gptClient.on("open", () => {
    console.log("[OpenAI] Connected to OpenAI Realtime WebSocket");
    gptClientReady = true;

    // Flush any messages that arrived before the connection was ready
    while (messageQueue.length > 0) {
      gptClient.send(messageQueue.shift());
    }

    ws.send("your gpt client is ready for u to use");
  });

  // ── Messages from OpenAI → forward to browser ──
  gptClient.on("message", (data) => {
    const parsedData = JSON.parse(data);
    console.log("[OpenAI] event:", parsedData.type);

    if (parsedData.type === "response.audio.delta") {
      // PCM16 chunk → wrap in WAV header → send binary to browser
      const pcmData = helper.base64ToArrayBuffer(parsedData.delta);
      const sampleRate = 24000;
      const header = helper.createWavHeader(sampleRate, pcmData.byteLength);
      const finalAudioBuffer = helper.concatenateWavHeaderAndData(
        header,
        pcmData,
      );
      ws.send(finalAudioBuffer);
    } else {
      // All other events forwarded as JSON text
      ws.send(JSON.stringify(parsedData));
    }
  });

  // ── OpenAI errors ──
  gptClient.on("error", (error) => {
    console.error("[OpenAI] GPT WebSocket error:", error.message);
    ws.send(
      JSON.stringify({
        type: "error",
        error: {
          message: "Connection to OpenAI failed",
          details: error.message,
        },
      }),
    );
  });

  // ── OpenAI connection closed → close browser connection too ──
  gptClient.on("close", () => {
    console.log("[OpenAI] GPT WebSocket closed");
    ws.close();
  });

  // ── Messages from browser → forward to OpenAI ──
  ws.on("message", (message) => {
    try {
      const event = JSON.parse(message);
      if (gptClientReady && gptClient.readyState === WebSocket.OPEN) {
        gptClient.send(JSON.stringify(event));
      } else {
        console.log("[OpenAI] Queueing message — GPT client not ready yet");
        messageQueue.push(JSON.stringify(event));
      }
    } catch (e) {
      console.error("[OpenAI] Error parsing message from browser:", e.message);
      ws.send(
        JSON.stringify({
          type: "error",
          error: {
            message: "Invalid JSON format sent to server.",
            details: e.message,
          },
        }),
      );
    }
  });

  // ── Browser disconnected ──
  ws.on("close", () => {
    console.log("[OpenAI] Client disconnected");
    if (gptClient.readyState === WebSocket.OPEN) {
      gptClient.close();
    }
  });

  ws.on("error", (err) => {
    console.error("[OpenAI] Browser WebSocket error:", err.message);
  });
}

// ─────────────────────────────────────────────────────────────
//  HANDLER B — Sarvam STT → Groq LLM → Sarvam TTS  (Modular)
//  Original file: index.modular.backup.js
//
//  Flow:
//    Browser → raw WebM/Opus binary blob
//    → Sarvam STT (saarika:v2.5) → plain text transcript
//    → Groq API (llama-3.3-70b-versatile) → AI response text
//    → Sarvam TTS (bulbul:v3) → base64 WAV → binary buffer
//    ← Node sends binary WAV first, then JSON transcript
//
//  Required .env keys:
//    GROQ_KEY=<your Groq API key>
//    (Sarvam key is currently hardcoded in modularAIProcessor.js)
// ─────────────────────────────────────────────────────────────
function handleModular(ws) {
  console.log("[Modular] Client connected");

  const ModularAIProcessor = require("./utils/modularAIProcessor.js");

  // One processor instance per connection
  const modularProcessor = new ModularAIProcessor();

  let isProcessorReady = false;
  const audioQueue = [];

  // ── Process raw audio through the full pipeline ──
  const processAudioData = async (audioBuffer) => {
    try {
      console.log("[Modular] Running pipeline: STT → Groq → TTS ...");
      const result = await modularProcessor.processAudio(audioBuffer);

      console.log("[Modular] Pipeline complete");
      console.log("[Modular] Transcript:", result.transcript);
      console.log("[Modular] AI response:", result.aiResponse);

      // Send binary WAV first so browser queues it, then send JSON signal
      ws.send(result.audioResponse);
      ws.send(
        JSON.stringify({
          type: "response.transcript",
          transcript: result.transcript,
          aiResponse: result.aiResponse,
        }),
      );

      console.log("[Modular] Audio and transcript sent to client");
    } catch (error) {
      console.error("[Modular] Pipeline failed:", error.message);
      ws.send(
        JSON.stringify({
          type: "error",
          error: {
            message: "Audio processing failed",
            details: error.message,
          },
        }),
      );
    }
  };

  // ── Initialise processor, then drain any early queued audio ──
  (async () => {
    try {
      const initialised = await modularProcessor.initialize();
      if (!initialised) throw new Error("initialize() returned false");

      isProcessorReady = true;
      ws.send("modular AI processor is ready for use");
      console.log("[Modular] Processor initialised successfully");

      // Drain messages that arrived before init finished
      while (audioQueue.length > 0) {
        const queued = audioQueue.shift();
        await processAudioData(queued).catch((e) =>
          console.error("[Modular] Error processing queued audio:", e.message),
        );
      }
    } catch (error) {
      console.error("[Modular] Failed to initialise processor:", error.message);
      ws.send(
        JSON.stringify({
          type: "error",
          error: {
            message: "Failed to initialise modular AI processor",
            details: error.message,
          },
        }),
      );
    }
  })();

  // ── Inbound messages from browser ──
  ws.on("message", async (message) => {
    try {
      // ── Binary frame — raw audio blob from browser ──
      if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message);
        console.log(
          "[Modular] Binary audio received —",
          buf.byteLength,
          "bytes",
        );

        if (isProcessorReady) {
          await processAudioData(buf);
        } else {
          console.log("[Modular] Processor not ready, queueing audio");
          audioQueue.push(buf);
        }
        return;
      }

      // ── Text frame — JSON control event ──
      const raw = message.toString();
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        console.warn("[Modular] Received non-JSON text frame, ignoring");
        return;
      }

      console.log("[Modular] JSON event:", event.type);

      switch (event.type) {
        // OpenAI-compatible envelope: browser sends base64 PCM inside this
        case "conversation.item.create": {
          const content = event.item?.content?.[0];
          const base64Audio = content?.audio;

          if (!base64Audio) {
            console.warn(
              "[Modular] conversation.item.create has no audio content",
            );
            break;
          }

          const audioBuf = Buffer.from(base64Audio, "base64");
          console.log(
            "[Modular] Decoded audio from conversation.item.create —",
            audioBuf.byteLength,
            "bytes",
          );

          if (isProcessorReady) {
            await processAudioData(audioBuf);
          } else {
            console.log("[Modular] Processor not ready, queueing audio");
            audioQueue.push(audioBuf);
          }
          break;
        }

        case "response.create":
          // Triggered automatically by conversation.item.create — no-op here
          console.log(
            "[Modular] response.create received — already processing",
          );
          break;

        case "audio.config":
          console.log(
            "[Modular] Audio config received:",
            JSON.stringify(event),
          );
          break;

        case "test.connection":
          ws.send(
            JSON.stringify({
              type: "test.response",
              status: isProcessorReady ? "ready" : "not_ready",
              architecture: "modular",
            }),
          );
          break;

        default:
          console.log("[Modular] Unknown event type:", event.type);
      }
    } catch (err) {
      console.error("[Modular] Error handling inbound message:", err.message);
      ws.send(
        JSON.stringify({
          type: "error",
          error: {
            message: "Failed to process message",
            details: err.message,
          },
        }),
      );
    }
  });

  // ── Browser disconnected ──
  ws.on("close", () => {
    console.log("[Modular] Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[Modular] WebSocket error:", err.message);
  });
}

// ─────────────────────────────────────────────────────────────
//  Route incoming WebSocket connections to the active handler
// ─────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  if (MODE === "openai") {
    handleOpenAI(ws);
  } else {
    handleModular(ws);
  }
});

// HTTP → WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/Assistant") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ─────────────────────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────────────────────
server.listen(4000, () => {
  console.log("WebSocket server listening on ws://localhost:4000/Assistant");

  if (MODE === "openai") {
    console.log(
      "Pipeline: Browser PCM16 → OpenAI GPT-4o Realtime → Browser WAV chunks",
    );
    console.log("Requires .env: KEY=<OpenAI API key>");
  } else {
    console.log(
      "Pipeline: Browser WebM/Opus → Sarvam STT → Groq → Sarvam TTS → Browser WAV",
    );
    console.log("Requires .env: GROQ_KEY=<Groq API key>");
  }

  console.log(
    `\n  ✅ To switch mode, set MODE=openai or MODE=modular in server/.env\n`,
  );
});
